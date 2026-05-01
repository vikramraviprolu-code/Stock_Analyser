import { CACHE_TTL, getCached } from "./cache";
import { fetchJson } from "./http";
import { detectRegion } from "./regions";
import { enrichSymbolMatch } from "./symbol-meta";
import { findKnownTickerMatches, normalizeTicker } from "./tickers";
import type { Region, SymbolMatch } from "./types";

interface YahooSearchResponse {
  quotes?: Array<{
    symbol?: string;
    quoteType?: string;
    shortname?: string;
    longname?: string;
    exchDisp?: string;
    exchange?: string;
  }>;
}

function yahooSearchUrl(query: string): string {
  return `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`;
}

function yahooPageUrl(ticker: string): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`;
}

function dedupeMatches(matches: SymbolMatch[]): SymbolMatch[] {
  const byTicker = new Map<string, SymbolMatch>();
  for (const match of matches) {
    const key = normalizeTicker(match.ticker);
    const current = byTicker.get(key);
    if (!current || current.source === "recognized") {
      byTicker.set(key, match);
    }
  }
  return [...byTicker.values()];
}

async function loadRecognizedSymbolMatches(query: string): Promise<SymbolMatch[]> {
  const payload = await fetchJson<YahooSearchResponse>(yahooSearchUrl(query));
  return (payload.quotes ?? [])
    .filter((quote) => quote.quoteType === "EQUITY" && quote.symbol)
    .map((quote) => {
      const ticker = normalizeTicker(quote.symbol ?? "");
      return enrichSymbolMatch(
        {
          ticker,
          name: quote.longname ?? quote.shortname ?? null,
          exchange: quote.exchDisp ?? quote.exchange ?? null,
          region: detectRegion(ticker),
          source: "recognized" as const,
          sourceUrl: yahooPageUrl(ticker)
        },
        query
      );
    });
}

export async function searchSymbolMatches(query: string, forceRefresh = false): Promise<SymbolMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const knownMatches = findKnownTickerMatches(trimmed, 8);
  let recognizedMatches: SymbolMatch[] = [];
  if (trimmed.length >= 2) {
    try {
      const { value } = await getCached(
        "metadata",
        `symbol-search-v1-${trimmed}`,
        CACHE_TTL.metadataMonthly,
        () => loadRecognizedSymbolMatches(trimmed),
        forceRefresh
      );
      recognizedMatches = value;
    } catch {
      recognizedMatches = [];
    }
  }

  return dedupeMatches([...knownMatches, ...recognizedMatches]).slice(0, 10);
}

export function bestRegionForQuery(query: string, matches: SymbolMatch[], fallback: Region = "USA"): Region {
  const normalized = normalizeTicker(query);
  const suffixRegion = detectRegion(normalized);
  if (suffixRegion !== "USA" || /\.[A-Z0-9]+$/.test(normalized)) {
    return suffixRegion;
  }

  const exact = matches.find((match) => {
    const ticker = normalizeTicker(match.ticker);
    const name = normalizeTicker(match.name ?? "");
    return ticker === normalized || name === normalized;
  });
  if (exact) {
    return exact.region;
  }

  return matches[0]?.region ?? fallback;
}
