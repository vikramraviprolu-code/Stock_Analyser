import { describe, expect, it } from "vitest";
import { averageVolume, calculateHistoryMetrics, highLow52Week, movingAverage, rateOfChange, rsi } from "../src/lib/indicators";
import { parseStooqCsv } from "../src/lib/stooq";
import type { OhlcvRow } from "../src/lib/types";

function rowsFromCloses(closes: number[]): OhlcvRow[] {
  return closes.map((close, index) => ({
    date: `2025-01-${String(index + 1).padStart(2, "0")}`,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 1000 + index
  }));
}

describe("technical indicators", () => {
  it("calculates a simple moving average", () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toBe(4);
    expect(movingAverage([1, 2], 3)).toBeNull();
    expect(movingAverage([1, 2, 3], 0)).toBeNull();
  });

  it("calculates rate of change", () => {
    expect(rateOfChange([100, 105, 110], 2)).toBe(10);
    expect(rateOfChange([0, 10], 1)).toBeNull();
    expect(rateOfChange([100, 110], 0)).toBeNull();
    expect(rateOfChange([100], 1)).toBeNull();
    expect(rateOfChange([100, Number.NaN], 1)).toBeNull();
  });

  it("calculates RSI from recent closes", () => {
    const value = rsi([44, 45, 46, 45, 47, 49, 48, 50, 52, 51, 53, 55, 56, 58, 57], 14);
    expect(value).toBeCloseTo(80.95, 1);
    expect(rsi(Array.from({ length: 15 }, (_, index) => 100 + index), 14)).toBe(100);
    expect(rsi(Array.from({ length: 15 }, () => 100), 14)).toBe(50);
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });

  it("calculates 52-week high and low from latest 252 rows", () => {
    const rows = rowsFromCloses(Array.from({ length: 260 }, (_, index) => index + 1));
    const result = highLow52Week(rows);
    expect(result.high).toBe(262);
    expect(result.low).toBe(7);
    expect(highLow52Week([])).toEqual({ high: null, low: null });
  });

  it("calculates average volume and aggregate history metrics", () => {
    const rows = rowsFromCloses(Array.from({ length: 220 }, (_, index) => 100 + index));
    expect(averageVolume(rows, 20)).toBe(1209.5);
    expect(averageVolume([], 20)).toBeNull();
    expect(averageVolume(rows.map((row) => ({ ...row, volume: Number.NaN })), 20)).toBeNull();
    const metrics = calculateHistoryMetrics(rows);
    expect(metrics.latestClose).toBe(319);
    expect(metrics.ma20).toBe(309.5);
    expect(metrics.ma50).toBe(294.5);
    expect(metrics.ma200).toBe(219.5);
    expect(metrics.performance5D).toBeCloseTo(1.59, 1);
  });

  it("rejects non-OHLCV Stooq responses", () => {
    const csv = [
      "Use the following URL to download CSV data:",
      "1. Open https://stooq.com/q/d/?s=aapl.us&get_apikey,0,0,0,0,0"
    ].join("\n");

    expect(parseStooqCsv(csv)).toEqual([]);
  });

  it("parses valid Stooq CSV rows and ignores invalid records", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "2026-01-03,12,13,11,12.5,bad",
      "not-a-date,12,13,11,12,1000",
      "2026-01-02,10,11,9,10.5,900"
    ].join("\n");

    const rows = parseStooqCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: "2026-01-02",
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: 900
    });
  });
});
