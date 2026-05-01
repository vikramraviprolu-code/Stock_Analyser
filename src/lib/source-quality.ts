import { DATA_UNAVAILABLE } from "./format";
import type { SourceRecord, SourceVerification } from "./types";

export interface SourceQualitySummary {
  confidence: number;
  verified: number;
  unavailable: number;
  primary: number;
  recognized: number;
  computed: number;
  fallback: number;
}

export function verificationLabel(record: SourceRecord): SourceVerification {
  if (record.value === DATA_UNAVAILABLE) return "unavailable";
  if (record.verification) return record.verification;
  if (/stooq|nasdaq/i.test(record.source)) return "primary";
  if (/yahoo/i.test(record.source)) return "recognized";
  if (/computed|regional filter|peer matching/i.test(record.source)) return "computed";
  if (record.warning) return "fallback";
  return "recognized";
}

export function sourceConfidence(record: SourceRecord): number {
  if (record.value === DATA_UNAVAILABLE) return 0;
  if (typeof record.confidence === "number" && Number.isFinite(record.confidence)) {
    return Math.max(0, Math.min(100, Math.round(record.confidence)));
  }

  switch (verificationLabel(record)) {
    case "primary":
      return 92;
    case "recognized":
      return 76;
    case "computed":
      return 70;
    case "search-hint":
      return 58;
    case "fallback":
      return 54;
    case "unavailable":
      return 0;
  }
}

export function summarizeSourceQuality(records: SourceRecord[], warnings: string[] = []): SourceQualitySummary {
  if (records.length === 0) {
    return {
      confidence: 0,
      verified: 0,
      unavailable: 0,
      primary: 0,
      recognized: 0,
      computed: 0,
      fallback: 0
    };
  }

  const summary = records.reduce<SourceQualitySummary>(
    (accumulator, record) => {
      const verification = verificationLabel(record);
      const confidence = sourceConfidence(record);
      accumulator.confidence += confidence;
      if (record.value === DATA_UNAVAILABLE || verification === "unavailable") {
        accumulator.unavailable += 1;
      } else {
        accumulator.verified += 1;
      }

      if (verification === "primary") accumulator.primary += 1;
      if (verification === "recognized" || verification === "search-hint") accumulator.recognized += 1;
      if (verification === "computed") accumulator.computed += 1;
      if (verification === "fallback") accumulator.fallback += 1;
      return accumulator;
    },
    {
      confidence: 0,
      verified: 0,
      unavailable: 0,
      primary: 0,
      recognized: 0,
      computed: 0,
      fallback: 0
    }
  );

  const warningPenalty = Math.min(25, warnings.length * 3);
  summary.confidence = Math.max(0, Math.round(summary.confidence / records.length - warningPenalty));
  return summary;
}
