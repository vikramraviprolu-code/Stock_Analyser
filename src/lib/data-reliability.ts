import { DATA_UNAVAILABLE } from "./format";
import { summarizeSourceQuality } from "./source-quality";
import type {
  DataReliabilityGate,
  DataReliabilitySummary,
  FilterResult,
  FundamentalData,
  HistoryMetrics,
  SourceRecord,
  SourceStatus
} from "./types";

function gateScore(status: SourceStatus["status"]): number {
  if (status === "ok") return 100;
  if (status === "warning") return 55;
  if (status === "unavailable") return 25;
  return 0;
}

function reliabilityLabel(score: number): DataReliabilitySummary["label"] {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

function requiredFundamentalCoverage(fundamentals: FundamentalData): number {
  const required = [
    fundamentals.companyName,
    fundamentals.exchange,
    fundamentals.country,
    fundamentals.currency,
    fundamentals.sector,
    fundamentals.industry,
    fundamentals.marketCapUsd,
    fundamentals.trailingPe,
    fundamentals.averageVolume
  ];
  const available = required.filter((item) => item !== null && item !== DATA_UNAVAILABLE).length;
  return Math.round((available / required.length) * 100);
}

function historyGate(metrics: HistoryMetrics | null, rowCount: number): DataReliabilityGate {
  if (!metrics?.latestClose || rowCount === 0) {
    return {
      label: "Price history",
      status: "error",
      detail: "No verified historical close was available."
    };
  }

  if (rowCount < 200 || metrics.ma200 === null) {
    return {
      label: "Price history",
      status: "warning",
      detail: "History is usable, but fewer than 200 rows or no 200D moving average were available."
    };
  }

  return {
    label: "Price history",
    status: "ok",
    detail: `${rowCount} historical rows support 52-week range and moving-average checks.`
  };
}

function fundamentalsGate(fundamentals: FundamentalData): DataReliabilityGate {
  const coverage = requiredFundamentalCoverage(fundamentals);
  if (coverage >= 75) {
    return {
      label: "Fundamentals",
      status: "ok",
      detail: `${coverage}% of required identity, valuation, and volume fields are verified.`
    };
  }

  return {
    label: "Fundamentals",
    status: coverage >= 45 ? "warning" : "unavailable",
    detail: `${coverage}% of required identity, valuation, and volume fields are verified.`
  };
}

function regionalFilterGate(filters: FilterResult): DataReliabilityGate {
  const unavailable = filters.criteria.filter((criterion) => criterion.passed === null).length;
  if (unavailable > 0) {
    return {
      label: "Regional filters",
      status: "warning",
      detail: `${unavailable} regional filter criterion could not be verified.`
    };
  }

  return {
    label: "Regional filters",
    status: filters.passed ? "ok" : "warning",
    detail: filters.passed
      ? "All regional liquidity and size checks are verifiable and passed."
      : "Regional filters are verifiable, but one or more checks failed."
  };
}

function warningGate(warnings: string[]): DataReliabilityGate {
  if (warnings.length === 0) {
    return {
      label: "Warnings",
      status: "ok",
      detail: "No data-quality warnings were generated."
    };
  }

  return {
    label: "Warnings",
    status: warnings.length <= 3 ? "warning" : "error",
    detail: `${warnings.length} warning${warnings.length === 1 ? "" : "s"} should be reviewed before relying on the output.`
  };
}

export function buildDataReliability(input: {
  records: SourceRecord[];
  warnings: string[];
  fundamentals: FundamentalData;
  filters: FilterResult;
  metrics: HistoryMetrics | null;
  historyRowCount: number;
}): DataReliabilitySummary {
  const sourceQuality = summarizeSourceQuality(input.records, input.warnings);
  const coveragePercent = input.records.length === 0
    ? 0
    : Math.round((sourceQuality.verified / input.records.length) * 100);
  const gates = [
    historyGate(input.metrics, input.historyRowCount),
    fundamentalsGate(input.fundamentals),
    regionalFilterGate(input.filters),
    warningGate(input.warnings)
  ];
  const gateAverage = Math.round(gates.reduce((sum, gate) => sum + gateScore(gate.status), 0) / gates.length);
  const warningPenalty = Math.min(30, input.warnings.length * 4);
  const score = Math.max(
    0,
    Math.min(100, Math.round(sourceQuality.confidence * 0.45 + coveragePercent * 0.25 + gateAverage * 0.3 - warningPenalty))
  );

  return {
    score,
    label: reliabilityLabel(score),
    coveragePercent,
    warningPenalty,
    gates,
    sourceMix: {
      primary: sourceQuality.primary,
      recognized: sourceQuality.recognized,
      computed: sourceQuality.computed,
      fallback: sourceQuality.fallback,
      unavailable: sourceQuality.unavailable
    }
  };
}
