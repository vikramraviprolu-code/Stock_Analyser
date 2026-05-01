import type { FilterResult, HistoryMetrics, Recommendation, SourceRecord } from "./types";
import { summarizeSourceQuality } from "./source-quality";

export function rsiLabel(value: number | null): string {
  if (value === null) return "Data unavailable";
  if (value >= 70) return "Overbought";
  if (value <= 30) return "Oversold";
  if (value >= 55) return "Positive";
  if (value <= 45) return "Weak";
  return "Neutral";
}

export function priceVsMovingAverage(price: number | null, movingAverage: number | null): string {
  if (price === null || movingAverage === null) {
    return "Data unavailable";
  }
  if (price > movingAverage) return "Above";
  if (price < movingAverage) return "Below";
  return "At";
}

export function momentumSignal(metrics: HistoryMetrics): {
  signal: string;
  outlook: string;
  confidence: number;
} {
  let score = 0;
  let available = 0;

  const checks = [
    metrics.performance5D === null ? null : metrics.performance5D > 0,
    metrics.roc14 === null ? null : metrics.roc14 > 0,
    metrics.roc21 === null ? null : metrics.roc21 > 0,
    metrics.latestClose === null || metrics.ma20 === null ? null : metrics.latestClose > metrics.ma20,
    metrics.latestClose === null || metrics.ma50 === null ? null : metrics.latestClose > metrics.ma50,
    metrics.rsi14 === null ? null : metrics.rsi14 > 45 && metrics.rsi14 < 70
  ];

  for (const check of checks) {
    if (check !== null) {
      available += 1;
      score += check ? 1 : 0;
    }
  }

  const ratio = available === 0 ? 0 : score / available;
  if (available === 0) {
    return { signal: "Data unavailable", outlook: "Data unavailable", confidence: 0 };
  }

  if (ratio >= 0.75) {
    return { signal: "Bullish", outlook: "Constructive 1-2 week setup if volume confirms.", confidence: Math.round(ratio * 100) };
  }

  if (ratio >= 0.5) {
    return { signal: "Mixed", outlook: "Balanced 1-2 week setup; wait for confirmation.", confidence: Math.round(ratio * 100) };
  }

  return { signal: "Weak", outlook: "Cautious 1-2 week setup while momentum lags.", confidence: Math.round(ratio * 100) };
}

export function scoreValueScreen(input: {
  percentFromLow: number | null;
  trailingPe: number | null;
  filters: FilterResult;
}): number {
  let score = 0;
  if (input.percentFromLow !== null) {
    score += input.percentFromLow <= 10 ? 35 : input.percentFromLow <= 25 ? 18 : 6;
  }
  if (input.trailingPe !== null) {
    score += input.trailingPe <= 10 ? 35 : input.trailingPe <= 18 ? 18 : 5;
  }
  score += input.filters.passed ? 30 : 0;
  return Math.min(100, score);
}

export function scoreMomentum(metrics: HistoryMetrics): number {
  const signal = momentumSignal(metrics);
  let score = signal.confidence;
  if (signal.signal === "Bullish") score += 10;
  if (signal.signal === "Weak") score -= 15;
  return Math.max(0, Math.min(100, score));
}

export function scoreDataQuality(sourceRecords: SourceRecord[], warnings: string[]): number {
  return summarizeSourceQuality(sourceRecords, warnings).confidence;
}

export function buildRecommendation(input: {
  metrics: HistoryMetrics;
  trailingPe: number | null;
  filters: FilterResult;
  sourceRecords: SourceRecord[];
  warnings: string[];
  inputQualifiesValue: boolean;
}): Recommendation {
  const value = scoreValueScreen({
    percentFromLow: input.metrics.percentFromLow,
    trailingPe: input.trailingPe,
    filters: input.filters
  });
  const momentum = scoreMomentum(input.metrics);
  const dataQuality = scoreDataQuality(input.sourceRecords, input.warnings);
  const total = Math.round(value * 0.4 + momentum * 0.35 + dataQuality * 0.25);
  const finalRating = total >= 70 ? "Buy" : total >= 45 ? "Watch" : "Avoid";

  return {
    bullCase: [
      input.inputQualifiesValue
        ? "Value screen passes: price is within 10% of the 52-week low, trailing P/E is at or below 10, and regional filters pass."
        : "Value setup is incomplete unless price proximity, valuation, and regional filter checks improve.",
      momentum >= 60
        ? "Technical momentum is supportive across recent performance, ROC, RSI, and moving-average checks."
        : "Momentum can improve if recent ROC turns positive and price reclaims key moving averages."
    ],
    bearCase: [
      input.trailingPe === null
        ? "Trailing P/E is unavailable, so valuation cannot be verified."
        : input.trailingPe > 10
          ? "Trailing P/E is above the strict value threshold."
          : "Low P/E alone can reflect market concern about growth, leverage, or cyclicality.",
      input.filters.passed
        ? "Regional liquidity and market-cap filters pass, but free-source data can still be delayed or stale."
        : "One or more regional liquidity, price, or market-cap filters did not pass or could not be verified."
    ],
    baseCase:
      finalRating === "Buy"
        ? "The combined value, momentum, and data-quality score supports a constructive but verification-dependent stance."
        : finalRating === "Watch"
          ? "The setup has some useful signals but needs stronger confirmation before becoming compelling."
          : "The setup lacks enough verified value, momentum, or quality signals for a favorable stance.",
    catalysts: [
      "Upcoming earnings, guidance updates, and official company disclosures.",
      "Peer re-rating, sector rotation, or a break above the 20D and 50D moving averages.",
      "Improved data quality from official exchange, regulator, or company IR pages."
    ],
    fundamentalRisks: [
      "Unverified or stale fundamentals can distort valuation screens.",
      "Low valuation can be a value trap if earnings quality, leverage, or cyclicality worsens."
    ],
    technicalRisks: [
      "Weak ROC, price below major moving averages, or overbought RSI can reduce near-term odds.",
      "Thin or inconsistent volume can make short-term signals less reliable."
    ],
    finalRating,
    confidence: Math.round(total),
    timeHorizon: "1-2 weeks for momentum signals; longer-term decisions require independent fundamental verification.",
    scores: { value, momentum, dataQuality, total }
  };
}
