import { detectRegion } from "./regions";
import type { Region, SymbolMatch } from "./types";

interface ListingSuffixMeta {
  region: Region;
  stooqSuffix: string;
  exchange: string;
  country: string;
}

export const LISTING_SUFFIX_META: Record<string, ListingSuffixMeta> = {
  NS: { region: "India", stooqSuffix: "IN", exchange: "NSE", country: "India" },
  BO: { region: "India", stooqSuffix: "IN", exchange: "BSE", country: "India" },
  AS: { region: "Europe", stooqSuffix: "NL", exchange: "Euronext Amsterdam", country: "Netherlands" },
  DE: { region: "Europe", stooqSuffix: "DE", exchange: "Xetra", country: "Germany" },
  L: { region: "Europe", stooqSuffix: "UK", exchange: "London Stock Exchange", country: "United Kingdom" },
  PA: { region: "Europe", stooqSuffix: "FR", exchange: "Euronext Paris", country: "France" },
  SW: { region: "Europe", stooqSuffix: "CH", exchange: "SIX Swiss Exchange", country: "Switzerland" },
  T: { region: "Japan", stooqSuffix: "JP", exchange: "Tokyo Stock Exchange", country: "Japan" },
  HK: { region: "Hong Kong", stooqSuffix: "HK", exchange: "Hong Kong Stock Exchange", country: "Hong Kong" },
  KS: { region: "South Korea", stooqSuffix: "KR", exchange: "Korea Exchange", country: "South Korea" },
  KQ: { region: "South Korea", stooqSuffix: "KR", exchange: "KOSDAQ", country: "South Korea" },
  TW: { region: "Taiwan", stooqSuffix: "TW", exchange: "Taiwan Stock Exchange", country: "Taiwan" },
  TWO: { region: "Taiwan", stooqSuffix: "TW", exchange: "Taipei Exchange", country: "Taiwan" },
  AX: { region: "Australia", stooqSuffix: "AU", exchange: "Australian Securities Exchange", country: "Australia" },
  SI: { region: "Singapore", stooqSuffix: "SG", exchange: "Singapore Exchange", country: "Singapore" }
};

export const COMPANY_ALIASES: Record<string, string> = {
  google: "GOOGL",
  alphabet: "GOOGL",
  "alphabet inc": "GOOGL",
  facebook: "META",
  meta: "META",
  nvidia: "NVDA",
  "deutsche bank": "DBK.DE",
  "deutsche bank ag": "DBK.DE",
  samsung: "005930.KS",
  "samsung electronics": "005930.KS",
  tencent: "0700.HK",
  alibaba: "9988.HK",
  toyota: "7203.T",
  "toyota motor": "7203.T",
  softbank: "9984.T",
  "softbank group": "9984.T",
  tsmc: "2330.TW",
  "taiwan semiconductor": "2330.TW",
  "taiwan semiconductor manufacturing": "2330.TW",
  reliance: "RELIANCE.NS",
  "reliance industries": "RELIANCE.NS",
  tcs: "TCS.NS",
  "tata consultancy": "TCS.NS",
  "tata consultancy services": "TCS.NS",
  "hdfc bank": "HDFCBANK.NS",
  infosys: "INFY.NS",
  lvmh: "MC.PA",
  nestle: "NESN.SW",
  shell: "SHEL.L",
  dbs: "D05.SI",
  "dbs group": "D05.SI",
  "commonwealth bank": "CBA.AX",
  bhp: "BHP.AX"
};

export function normalizeSearchText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function tickerSuffix(ticker: string): string | null {
  const parts = ticker.trim().toUpperCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? null : null;
}

export function aliasTickerForQuery(query: string): string | null {
  return COMPANY_ALIASES[normalizeSearchText(query)] ?? null;
}

export function exchangeForTicker(ticker: string): string | null {
  const suffix = tickerSuffix(ticker);
  if (!suffix) {
    return "US listing";
  }
  return LISTING_SUFFIX_META[suffix]?.exchange ?? null;
}

export function stooqCandidates(ticker: string, region: Region): string[] {
  const normalized = ticker.trim().toUpperCase();
  const candidates = new Set<string>();
  const suffix = tickerSuffix(normalized);

  if (suffix) {
    const base = normalized.split(".").slice(0, -1).join(".");
    const stooqSuffix = LISTING_SUFFIX_META[suffix]?.stooqSuffix;
    if (stooqSuffix) {
      candidates.add(`${base}.${stooqSuffix}`.toLowerCase());
    }
    candidates.add(normalized.toLowerCase());
  } else if (detectRegion(normalized, region) === "USA") {
    candidates.add(`${normalized}.US`.toLowerCase());
    candidates.add(normalized.toLowerCase());
  } else {
    candidates.add(normalized.toLowerCase());
  }

  return [...candidates];
}

export function enrichSymbolMatch(
  match: Omit<SymbolMatch, "confidence" | "matchReason" | "stooqSymbols" | "primaryListing" | "warnings">,
  query: string,
  fallbackRegion: Region = match.region
): SymbolMatch {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTicker = match.ticker.trim().toUpperCase();
  const suffix = tickerSuffix(normalizedTicker);
  const suffixMeta = suffix ? LISTING_SUFFIX_META[suffix] : null;
  const region = suffixMeta?.region ?? detectRegion(normalizedTicker, fallbackRegion);
  const name = normalizeSearchText(match.name ?? undefined);
  const sourceConfidence = match.source === "alias" ? 96 : match.source === "seeded" ? 92 : 76;
  const exactConfidence =
    normalizedQuery && (normalizedQuery === normalizedTicker.toLowerCase() || normalizedQuery === name) ? 4 : 0;
  const suffixConfidence = suffixMeta || region === "USA" ? 3 : 0;
  const confidence = Math.min(99, sourceConfidence + exactConfidence + suffixConfidence);
  const stooqSymbols = stooqCandidates(normalizedTicker, region);
  const warnings: string[] = [];

  if (!suffixMeta && region !== "USA") {
    warnings.push("No recognized exchange suffix was available; region was inferred from fallback rules.");
  }
  if (match.source === "recognized") {
    warnings.push("Symbol came from a recognized public finance search endpoint; verify primary listing before trading.");
  }

  return {
    ...match,
    exchange: match.exchange ?? suffixMeta?.exchange ?? exchangeForTicker(normalizedTicker),
    region,
    confidence,
    matchReason:
      match.source === "alias"
        ? "Company alias mapped to a known primary listing"
        : match.source === "seeded"
          ? "Seeded global universe match"
          : "Recognized public symbol search match",
    stooqSymbols,
    primaryListing: match.source === "recognized" ? "unknown" : suffixMeta || region === "USA" ? "likely" : "unknown",
    warnings
  };
}
