import { describe, expect, it } from "vitest";
import {
  aliasTickerForQuery,
  enrichSymbolMatch,
  exchangeForTicker,
  normalizeSearchText,
  stooqCandidates,
  tickerSuffix
} from "../src/lib/symbol-meta";

describe("symbol metadata helpers", () => {
  it("normalizes user search text and resolves common aliases", () => {
    expect(normalizeSearchText("  Deutsche   Bank AG! ")).toBe("deutsche bank ag");
    expect(aliasTickerForQuery("Deutsche Bank")).toBe("DBK.DE");
    expect(aliasTickerForQuery("unknown company")).toBeNull();
  });

  it("extracts listing suffixes and exchanges", () => {
    expect(tickerSuffix("RELIANCE.NS")).toBe("NS");
    expect(tickerSuffix("AAPL")).toBeNull();
    expect(exchangeForTicker("SAP.DE")).toBe("Xetra");
    expect(exchangeForTicker("AAPL")).toBe("US listing");
  });

  it("builds Stooq candidates for global listings", () => {
    expect(stooqCandidates("AAPL", "USA")).toEqual(["aapl.us", "aapl"]);
    expect(stooqCandidates("DBK.DE", "Europe")).toEqual(["dbk.de"]);
    expect(stooqCandidates("RELIANCE.NS", "India")).toEqual(["reliance.in", "reliance.ns"]);
  });

  it("enriches symbol matches with confidence, source warnings, and primary listing hints", () => {
    const match = enrichSymbolMatch(
      {
        ticker: "DBK.DE",
        name: "Deutsche Bank AG",
        exchange: null,
        region: "USA",
        source: "alias",
        sourceUrl: null
      },
      "deutsche bank"
    );

    expect(match.region).toBe("Europe");
    expect(match.exchange).toBe("Xetra");
    expect(match.primaryListing).toBe("likely");
    expect(match.confidence).toBeGreaterThanOrEqual(96);
    expect(match.stooqSymbols).toContain("dbk.de");

    const recognized = enrichSymbolMatch(
      {
        ticker: "SAP.DE",
        name: "SAP SE",
        exchange: null,
        region: "Europe",
        source: "recognized",
        sourceUrl: "https://finance.yahoo.com/quote/SAP.DE"
      },
      "sap"
    );
    expect(recognized.primaryListing).toBe("unknown");
    expect(recognized.warnings?.[0]).toContain("recognized public finance search endpoint");
  });
});
