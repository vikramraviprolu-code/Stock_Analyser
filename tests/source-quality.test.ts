import { describe, expect, it } from "vitest";
import { sourceConfidence, summarizeSourceQuality, verificationLabel } from "../src/lib/source-quality";
import type { SourceRecord } from "../src/lib/types";

function record(value: string, source: string, confidence?: number): SourceRecord {
  return {
    metric: "Metric",
    value,
    source,
    url: null,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    freshness: "Unit test",
    confidence
  };
}

describe("source quality", () => {
  it("classifies source records by provenance", () => {
    expect(verificationLabel(record("100", "Stooq historical CSV"))).toBe("primary");
    expect(verificationLabel(record("100", "Yahoo Finance public quote endpoints"))).toBe("recognized");
    expect(verificationLabel(record("Data unavailable", "Yahoo Finance public quote endpoints"))).toBe("unavailable");
  });

  it("uses explicit confidence when present", () => {
    expect(sourceConfidence(record("100", "Unit test", 83))).toBe(83);
  });

  it("summarizes confidence with warning penalties", () => {
    const summary = summarizeSourceQuality(
      [record("100", "Stooq historical CSV"), record("Data unavailable", "Yahoo Finance public quote endpoints")],
      ["warning"]
    );
    expect(summary.verified).toBe(1);
    expect(summary.unavailable).toBe(1);
    expect(summary.confidence).toBe(43);
  });
});
