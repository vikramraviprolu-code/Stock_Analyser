import { describe, expect, it } from "vitest";
import { buildDataReliability } from "../src/lib/data-reliability";
import type { FilterResult, FundamentalData, HistoryMetrics, SourceRecord } from "../src/lib/types";

const metrics: HistoryMetrics = {
  latestClose: 100,
  high52Week: 130,
  low52Week: 80,
  percentFromLow: 25,
  averageVolume: 1_000_000,
  performance5D: 4,
  ma20: 96,
  ma50: 92,
  ma200: 88,
  rsi14: 61,
  roc14: 6,
  roc21: 8
};

const fundamentals: FundamentalData = {
  ticker: "AAPL",
  companyName: "Apple Inc.",
  exchange: "Nasdaq",
  country: "United States",
  region: "USA",
  currency: "USD",
  sector: "Technology",
  industry: "Consumer Electronics",
  marketCap: 2_000_000_000_000,
  marketCapUsd: 2_000_000_000_000,
  marketCapEur: 1_850_000_000_000,
  trailingPe: 25,
  averageVolume: 50_000_000,
  revenueTtm: null,
  epsTtm: null,
  grossMargin: null,
  operatingMargin: null,
  netMargin: null,
  returnOnEquity: null,
  returnOnAssets: null,
  debtToEquity: null,
  freeCashFlow: null,
  dividendYield: null,
  payoutRatio: null,
  revenueGrowth: null,
  earningsGrowth: null,
  beta: null,
  peers: [],
  earningsDate: null
};

const filters: FilterResult = {
  region: "USA",
  passed: true,
  criteria: [
    { label: "Price", actual: 100, threshold: 5, unit: "USD", passed: true },
    { label: "Volume", actual: 1_000_000, threshold: 500_000, unit: "shares", passed: true },
    { label: "Market cap", actual: 2_000_000_000_000, threshold: 2_000_000_000, unit: "USD", passed: true }
  ],
  warnings: []
};

const records: SourceRecord[] = [
  {
    metric: "Latest close",
    value: "100",
    source: "Stooq CSV",
    url: "https://stooq.com/",
    retrievedAt: "2026-05-01T00:00:00.000Z",
    freshness: "daily",
    verification: "primary",
    confidence: 92
  },
  {
    metric: "Market cap",
    value: "2T",
    source: "Recognized finance source",
    url: "https://example.com/",
    retrievedAt: "2026-05-01T00:00:00.000Z",
    freshness: "24h",
    verification: "recognized",
    confidence: 76
  }
];

describe("data reliability", () => {
  it("scores complete verified data as high reliability", () => {
    const summary = buildDataReliability({
      records,
      warnings: [],
      fundamentals,
      filters,
      metrics,
      historyRowCount: 252
    });

    expect(summary.label).toBe("High");
    expect(summary.score).toBeGreaterThanOrEqual(75);
    expect(summary.gates.every((gate) => gate.status === "ok")).toBe(true);
  });

  it("penalizes missing history and warnings", () => {
    const summary = buildDataReliability({
      records,
      warnings: ["History unavailable", "Fallback used"],
      fundamentals: { ...fundamentals, marketCapUsd: null, trailingPe: null },
      filters: {
        ...filters,
        criteria: [{ label: "Market cap", actual: null, threshold: 2_000_000_000, unit: "USD", passed: null }]
      },
      metrics: null,
      historyRowCount: 0
    });

    expect(summary.score).toBeLessThan(75);
    expect(summary.gates.some((gate) => gate.status === "error")).toBe(true);
  });
});
