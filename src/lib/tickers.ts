import { aliasTickerForQuery, enrichSymbolMatch, exchangeForTicker, normalizeSearchText } from "./symbol-meta";
import type { Region, SymbolMatch } from "./types";

export interface SeedTicker {
  ticker: string;
  region: Region;
  name?: string;
  sectorHint?: string;
}

export const SAMPLE_TICKERS: SeedTicker[] = [
  { ticker: "AAPL", region: "USA", name: "Apple", sectorHint: "Technology" },
  { ticker: "MSFT", region: "USA", name: "Microsoft", sectorHint: "Technology" },
  { ticker: "NVDA", region: "USA", name: "Nvidia", sectorHint: "Technology" },
  { ticker: "TSLA", region: "USA", name: "Tesla", sectorHint: "Consumer Cyclical" },
  { ticker: "AMZN", region: "USA", name: "Amazon", sectorHint: "Consumer Cyclical" },
  { ticker: "GOOGL", region: "USA", name: "Alphabet", sectorHint: "Communication Services" },
  { ticker: "META", region: "USA", name: "Meta Platforms", sectorHint: "Communication Services" },
  { ticker: "AVGO", region: "USA", name: "Broadcom", sectorHint: "Technology" },
  { ticker: "AMD", region: "USA", name: "AMD", sectorHint: "Technology" },
  { ticker: "ORCL", region: "USA", name: "Oracle", sectorHint: "Technology" },
  { ticker: "JPM", region: "USA", name: "JPMorgan Chase", sectorHint: "Financial Services" },
  { ticker: "BAC", region: "USA", name: "Bank of America", sectorHint: "Financial Services" },
  { ticker: "XOM", region: "USA", name: "Exxon Mobil", sectorHint: "Energy" },
  { ticker: "CVX", region: "USA", name: "Chevron", sectorHint: "Energy" },
  { ticker: "WMT", region: "USA", name: "Walmart", sectorHint: "Consumer Defensive" },
  { ticker: "COST", region: "USA", name: "Costco", sectorHint: "Consumer Defensive" },
  { ticker: "RELIANCE.NS", region: "India", name: "Reliance Industries", sectorHint: "Energy" },
  { ticker: "TCS.NS", region: "India", name: "Tata Consultancy Services", sectorHint: "Technology" },
  { ticker: "HDFCBANK.NS", region: "India", name: "HDFC Bank", sectorHint: "Financial Services" },
  { ticker: "INFY.NS", region: "India", name: "Infosys", sectorHint: "Technology" },
  { ticker: "ICICIBANK.NS", region: "India", name: "ICICI Bank", sectorHint: "Financial Services" },
  { ticker: "SBIN.NS", region: "India", name: "State Bank of India", sectorHint: "Financial Services" },
  { ticker: "BHARTIARTL.NS", region: "India", name: "Bharti Airtel", sectorHint: "Communication Services" },
  { ticker: "ITC.NS", region: "India", name: "ITC", sectorHint: "Consumer Defensive" },
  { ticker: "LT.NS", region: "India", name: "Larsen & Toubro", sectorHint: "Industrials" },
  { ticker: "HINDUNILVR.NS", region: "India", name: "Hindustan Unilever", sectorHint: "Consumer Defensive" },
  { ticker: "ASML.AS", region: "Europe", name: "ASML", sectorHint: "Technology" },
  { ticker: "SAP.DE", region: "Europe", name: "SAP", sectorHint: "Technology" },
  { ticker: "DBK.DE", region: "Europe", name: "Deutsche Bank", sectorHint: "Financial Services" },
  { ticker: "SHEL.L", region: "Europe", name: "Shell", sectorHint: "Energy" },
  { ticker: "MC.PA", region: "Europe", name: "LVMH", sectorHint: "Consumer Cyclical" },
  { ticker: "NESN.SW", region: "Europe", name: "Nestle", sectorHint: "Consumer Defensive" },
  { ticker: "AIR.PA", region: "Europe", name: "Airbus", sectorHint: "Industrials" },
  { ticker: "OR.PA", region: "Europe", name: "L'Oreal", sectorHint: "Consumer Defensive" },
  { ticker: "TTE.PA", region: "Europe", name: "TotalEnergies", sectorHint: "Energy" },
  { ticker: "SIE.DE", region: "Europe", name: "Siemens", sectorHint: "Industrials" },
  { ticker: "ALV.DE", region: "Europe", name: "Allianz", sectorHint: "Financial Services" },
  { ticker: "NOVN.SW", region: "Europe", name: "Novartis", sectorHint: "Healthcare" },
  { ticker: "UBSG.SW", region: "Europe", name: "UBS", sectorHint: "Financial Services" },
  { ticker: "AZN.L", region: "Europe", name: "AstraZeneca", sectorHint: "Healthcare" },
  { ticker: "7203.T", region: "Japan", name: "Toyota", sectorHint: "Consumer Cyclical" },
  { ticker: "9984.T", region: "Japan", name: "SoftBank Group", sectorHint: "Communication Services" },
  { ticker: "6758.T", region: "Japan", name: "Sony", sectorHint: "Technology" },
  { ticker: "8306.T", region: "Japan", name: "Mitsubishi UFJ", sectorHint: "Financial Services" },
  { ticker: "6861.T", region: "Japan", name: "Keyence", sectorHint: "Technology" },
  { ticker: "9432.T", region: "Japan", name: "NTT", sectorHint: "Communication Services" },
  { ticker: "8035.T", region: "Japan", name: "Tokyo Electron", sectorHint: "Technology" },
  { ticker: "0700.HK", region: "Hong Kong", name: "Tencent", sectorHint: "Communication Services" },
  { ticker: "9988.HK", region: "Hong Kong", name: "Alibaba", sectorHint: "Consumer Cyclical" },
  { ticker: "0005.HK", region: "Hong Kong", name: "HSBC", sectorHint: "Financial Services" },
  { ticker: "1299.HK", region: "Hong Kong", name: "AIA", sectorHint: "Financial Services" },
  { ticker: "0388.HK", region: "Hong Kong", name: "Hong Kong Exchanges", sectorHint: "Financial Services" },
  { ticker: "3690.HK", region: "Hong Kong", name: "Meituan", sectorHint: "Consumer Cyclical" },
  { ticker: "005930.KS", region: "South Korea", name: "Samsung Electronics", sectorHint: "Technology" },
  { ticker: "000660.KS", region: "South Korea", name: "SK Hynix", sectorHint: "Technology" },
  { ticker: "035420.KS", region: "South Korea", name: "Naver", sectorHint: "Communication Services" },
  { ticker: "005380.KS", region: "South Korea", name: "Hyundai Motor", sectorHint: "Consumer Cyclical" },
  { ticker: "051910.KS", region: "South Korea", name: "LG Chem", sectorHint: "Basic Materials" },
  { ticker: "2330.TW", region: "Taiwan", name: "TSMC", sectorHint: "Technology" },
  { ticker: "2317.TW", region: "Taiwan", name: "Hon Hai", sectorHint: "Technology" },
  { ticker: "2454.TW", region: "Taiwan", name: "MediaTek", sectorHint: "Technology" },
  { ticker: "2308.TW", region: "Taiwan", name: "Delta Electronics", sectorHint: "Technology" },
  { ticker: "2881.TW", region: "Taiwan", name: "Fubon Financial", sectorHint: "Financial Services" },
  { ticker: "CBA.AX", region: "Australia", name: "Commonwealth Bank", sectorHint: "Financial Services" },
  { ticker: "BHP.AX", region: "Australia", name: "BHP", sectorHint: "Basic Materials" },
  { ticker: "CSL.AX", region: "Australia", name: "CSL", sectorHint: "Healthcare" },
  { ticker: "NAB.AX", region: "Australia", name: "National Australia Bank", sectorHint: "Financial Services" },
  { ticker: "WBC.AX", region: "Australia", name: "Westpac", sectorHint: "Financial Services" },
  { ticker: "ANZ.AX", region: "Australia", name: "ANZ", sectorHint: "Financial Services" },
  { ticker: "D05.SI", region: "Singapore", name: "DBS Group", sectorHint: "Financial Services" },
  { ticker: "O39.SI", region: "Singapore", name: "OCBC", sectorHint: "Financial Services" },
  { ticker: "U11.SI", region: "Singapore", name: "UOB", sectorHint: "Financial Services" },
  { ticker: "Z74.SI", region: "Singapore", name: "Singtel", sectorHint: "Communication Services" }
];

export const PRD_EXAMPLE_TICKERS: SeedTicker[] = [
  "AAPL",
  "MSFT",
  "NVDA",
  "TSLA",
  "RELIANCE.NS",
  "TCS.NS",
  "HDFCBANK.NS",
  "INFY.NS",
  "ASML.AS",
  "SAP.DE",
  "SHEL.L",
  "MC.PA",
  "NESN.SW",
  "7203.T",
  "9984.T",
  "0700.HK",
  "9988.HK",
  "005930.KS",
  "2330.TW",
  "CBA.AX"
].map((ticker) => {
  const seeded = SAMPLE_TICKERS.find((item) => item.ticker === ticker);
  if (seeded) {
    return seeded;
  }
  return { ticker, region: "USA" };
});

export function resolveKnownCompanyAlias(query: string, region?: Region): SeedTicker | null {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return null;
  }

  const regionMatches = (item: SeedTicker) => !region || region === "Asia-Pacific" || item.region === region;
  const normalizedName = (item: SeedTicker) => normalizeSearchText(item.name);
  const aliasTicker = aliasTickerForQuery(query);
  const aliasMatch = aliasTicker ? SAMPLE_TICKERS.find((item) => item.ticker === aliasTicker && regionMatches(item)) : null;
  if (aliasMatch) {
    return aliasMatch;
  }
  const globalAliasMatch = aliasTicker ? SAMPLE_TICKERS.find((item) => item.ticker === aliasTicker) : null;
  if (globalAliasMatch) {
    return globalAliasMatch;
  }

  const exact = SAMPLE_TICKERS.find((item) => {
    const name = normalizedName(item);
    return name === normalized && regionMatches(item);
  });
  if (exact) {
    return exact;
  }

  const globalExact = SAMPLE_TICKERS.find((item) => normalizedName(item) === normalized);
  if (globalExact) {
    return globalExact;
  }

  const partial = SAMPLE_TICKERS.find((item) => {
    const name = normalizedName(item);
    return Boolean(name && normalized.length >= 4 && name.includes(normalized) && regionMatches(item));
  });
  if (partial) {
    return partial;
  }

  return (
    SAMPLE_TICKERS.find((item) => {
      const name = normalizedName(item);
      return Boolean(name && normalized.length >= 4 && name.includes(normalized));
    }) ?? null
  );
}

export function findKnownTickerMatches(query: string, limit = 8): SymbolMatch[] {
  const normalized = normalizeSearchText(query);
  if (normalized.length < 1) {
    return [];
  }

  const aliasTicker = aliasTickerForQuery(query);
  const scored = SAMPLE_TICKERS.map((item) => {
    const ticker = item.ticker.toLowerCase();
    const name = normalizeSearchText(item.name);
    const sector = normalizeSearchText(item.sectorHint);
    let score = 0;
    let source: SymbolMatch["source"] = "seeded";

    if (aliasTicker === item.ticker) {
      score = 98;
      source = "alias";
    } else if (ticker === normalized || name === normalized) score = 100;
    else if (ticker.startsWith(normalized)) score = 80;
    else if (name.startsWith(normalized)) score = 70;
    else if (ticker.includes(normalized)) score = 45;
    else if (normalized.length >= 3 && name.includes(normalized)) score = 40;
    else if (normalized.length >= 3 && sector.includes(normalized)) score = 15;

    return { item, score, source };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.ticker.localeCompare(b.item.ticker))
    .slice(0, limit);

  return scored.map(({ item, source }) =>
    enrichSymbolMatch(
      {
        ticker: item.ticker,
        name: item.name ?? null,
        exchange: exchangeForTicker(item.ticker),
        region: item.region,
        source,
        sourceUrl: null
      },
      query,
      item.region
    )
  );
}

export function normalizeTicker(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function looksLikeTicker(value: string): boolean {
  const normalized = normalizeTicker(value);
  return /^[0-9A-Z.-]{1,16}$/.test(normalized) && !normalized.includes(" ");
}
