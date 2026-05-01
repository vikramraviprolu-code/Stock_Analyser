import { describe, expect, it } from "vitest";
import { detectRegion, evaluateRegionalFilters } from "../src/lib/regions";

describe("regional filters", () => {
  it("detects common global ticker suffixes", () => {
    expect(detectRegion("RELIANCE.NS")).toBe("India");
    expect(detectRegion("SAP.DE")).toBe("Europe");
    expect(detectRegion("7203.T")).toBe("Japan");
    expect(detectRegion("9988.HK")).toBe("Hong Kong");
    expect(detectRegion("005930.KS")).toBe("South Korea");
    expect(detectRegion("2330.TW")).toBe("Taiwan");
    expect(detectRegion("CBA.AX")).toBe("Australia");
  });

  it("does not let a default requested region override an explicit ticker suffix", () => {
    expect(detectRegion("DBK.DE", "USA")).toBe("Europe");
  });

  it("passes USA filter when price, volume, and USD market cap meet thresholds", () => {
    const result = evaluateRegionalFilters({
      region: "USA",
      latestClose: 25,
      averageVolume: 700_000,
      marketCapUsd: 5_000_000_000
    });

    expect(result.passed).toBe(true);
    expect(result.criteria.every((criterion) => criterion.passed === true)).toBe(true);
  });

  it("fails when a regional threshold is missed", () => {
    const result = evaluateRegionalFilters({
      region: "India",
      latestClose: 90,
      averageVolume: 700_000,
      marketCapUsd: 5_000_000_000
    });

    expect(result.passed).toBe(false);
    expect(result.criteria.find((criterion) => criterion.label === "Price")?.passed).toBe(false);
  });

  it("marks unavailable market cap as unverifiable", () => {
    const result = evaluateRegionalFilters({
      region: "Europe",
      latestClose: 20,
      averageVolume: 200_000,
      marketCapUsd: null
    });

    expect(result.passed).toBe(false);
    expect(result.criteria.find((criterion) => criterion.label === "Market cap")?.passed).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });
});
