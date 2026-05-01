import { describe, expect, it } from "vitest";
import { findKnownTickerMatches, resolveKnownCompanyAlias } from "../src/lib/tickers";

describe("known company aliases", () => {
  it("resolves Deutsche Bank to its Xetra ticker even when the default region is USA", () => {
    const alias = resolveKnownCompanyAlias("Deutsche Bank", "USA");

    expect(alias?.ticker).toBe("DBK.DE");
    expect(alias?.region).toBe("Europe");
  });

  it("still prefers a matching regional alias when one exists", () => {
    const alias = resolveKnownCompanyAlias("HDFC Bank", "India");

    expect(alias?.ticker).toBe("HDFCBANK.NS");
  });

  it("returns typed match candidates with their regions", () => {
    const matches = findKnownTickerMatches("deutsche");

    expect(matches[0]).toMatchObject({
      ticker: "DBK.DE",
      region: "Europe",
      primaryListing: "likely"
    });
    expect(matches[0].stooqSymbols).toContain("dbk.de");
  });

  it("uses common company aliases to find primary listings", () => {
    const matches = findKnownTickerMatches("google");

    expect(matches[0]).toMatchObject({
      ticker: "GOOGL",
      region: "USA",
      source: "alias"
    });
    expect(matches[0].confidence).toBeGreaterThanOrEqual(95);
  });
});
