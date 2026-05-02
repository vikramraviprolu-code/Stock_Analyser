import { describe, expect, it } from "vitest";
import { DATA_UNAVAILABLE, displayValue, formatDateTime, formatMoney, formatNumber, formatPercent } from "../src/lib/format";

describe("format helpers", () => {
  it("formats finite numbers and preserves unavailable numeric values", () => {
    expect(formatNumber(1234.567)).toBe("1,234.57");
    expect(formatNumber(1234.567, { maximumFractionDigits: 1 })).toBe("1,234.6");
    expect(formatNumber(null)).toBe(DATA_UNAVAILABLE);
    expect(formatNumber(Number.NaN)).toBe(DATA_UNAVAILABLE);
  });

  it("formats percentages with two decimals", () => {
    expect(formatPercent(1.234)).toBe("1.23%");
    expect(formatPercent(-0.5)).toBe("-0.50%");
    expect(formatPercent(undefined)).toBe(DATA_UNAVAILABLE);
  });

  it("formats money with compact notation for large values", () => {
    expect(formatMoney(123.4, "USD")).toBe("$123.40");
    expect(formatMoney(2_500_000_000, "USD")).toBe("$2.5B");
    expect(formatMoney(100, null)).toBe(DATA_UNAVAILABLE);
  });

  it("formats date-times and display values consistently", () => {
    expect(formatDateTime("2026-05-02T10:30:00.000Z")).toContain("2026");
    expect(displayValue(1234.5)).toBe("1,234.5");
    expect(displayValue("Verified")).toBe("Verified");
    expect(displayValue(null)).toBe(DATA_UNAVAILABLE);
  });
});
