import { describe, expect, it } from "vitest";
import {
  buildRecommendation,
  momentumSignal,
  priceVsMovingAverage,
  rsiLabel,
  scoreDataQuality,
  scoreMomentum,
  scoreValueScreen
} from "../src/lib/recommendation";
import { evaluateRegionalFilters } from "../src/lib/regions";
import type { HistoryMetrics, SourceRecord } from "../src/lib/types";

const strongMetrics: HistoryMetrics = {
  latestClose: 105,
  high52Week: 180,
  low52Week: 100,
  percentFromLow: 5,
  averageVolume: 900_000,
  performance5D: 4,
  ma20: 100,
  ma50: 95,
  ma200: 90,
  rsi14: 58,
  roc14: 6,
  roc21: 8
};

const weakMetrics: HistoryMetrics = {
  latestClose: 80,
  high52Week: 140,
  low52Week: 70,
  percentFromLow: 14.28,
  averageVolume: 50_000,
  performance5D: -6,
  ma20: 90,
  ma50: 95,
  ma200: 100,
  rsi14: 35,
  roc14: -8,
  roc21: -10
};

function sources(values: string[]): SourceRecord[] {
  return values.map((value, index) => ({
    metric: `Metric ${index}`,
    value,
    source: "Unit test",
    url: null,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    freshness: "Unit test"
  }));
}

describe("recommendation scoring", () => {
  it("labels RSI and price-vs-moving-average states", () => {
    expect(rsiLabel(null)).toBe("Data unavailable");
    expect(rsiLabel(75)).toBe("Overbought");
    expect(rsiLabel(25)).toBe("Oversold");
    expect(rsiLabel(60)).toBe("Positive");
    expect(rsiLabel(40)).toBe("Weak");
    expect(rsiLabel(50)).toBe("Neutral");

    expect(priceVsMovingAverage(101, 100)).toBe("Above");
    expect(priceVsMovingAverage(99, 100)).toBe("Below");
    expect(priceVsMovingAverage(100, 100)).toBe("At");
    expect(priceVsMovingAverage(null, 100)).toBe("Data unavailable");
  });

  it("scores a qualifying value screen highly", () => {
    const filters = evaluateRegionalFilters({
      region: "USA",
      latestClose: 105,
      averageVolume: 900_000,
      marketCapUsd: 5_000_000_000
    });

    expect(scoreValueScreen({ percentFromLow: 5, trailingPe: 9, filters })).toBe(100);
    expect(scoreValueScreen({ percentFromLow: null, trailingPe: null, filters })).toBe(30);
  });

  it("labels strong and weak momentum", () => {
    expect(momentumSignal(strongMetrics).signal).toBe("Bullish");
    expect(momentumSignal(weakMetrics).signal).toBe("Weak");
    expect(scoreMomentum(strongMetrics)).toBeGreaterThan(scoreMomentum(weakMetrics));
    expect(momentumSignal({ ...weakMetrics, performance5D: null, roc14: null, roc21: null, latestClose: null, ma20: null, ma50: null, rsi14: null })).toEqual({
      signal: "Data unavailable",
      outlook: "Data unavailable",
      confidence: 0
    });
  });

  it("penalizes unavailable source records and warnings", () => {
    expect(scoreDataQuality(sources(["10", "Data unavailable", "20"]), ["warning"])).toBe(48);
  });

  it("builds buy/watch/avoid recommendations from transparent component scores", () => {
    const strongFilters = evaluateRegionalFilters({
      region: "USA",
      latestClose: 105,
      averageVolume: 900_000,
      marketCapUsd: 5_000_000_000
    });
    const weakFilters = evaluateRegionalFilters({
      region: "USA",
      latestClose: 4,
      averageVolume: 50_000,
      marketCapUsd: 500_000_000
    });

    const buy = buildRecommendation({
      metrics: strongMetrics,
      trailingPe: 9,
      filters: strongFilters,
      sourceRecords: sources(["10", "20", "30"]),
      warnings: [],
      inputQualifiesValue: true
    });
    const avoid = buildRecommendation({
      metrics: weakMetrics,
      trailingPe: 28,
      filters: weakFilters,
      sourceRecords: sources(["Data unavailable", "Data unavailable"]),
      warnings: ["missing"],
      inputQualifiesValue: false
    });

    expect(buy.finalRating).toBe("Buy");
    expect(avoid.finalRating).toBe("Avoid");
  });
});
