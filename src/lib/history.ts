import { CACHE_TTL, getCached } from "./cache";
import { DATA_UNAVAILABLE, formatNumber, formatPercent } from "./format";
import { calculateHistoryMetrics } from "./indicators";
import { fetchStooqHistory, type HistoryResult } from "./stooq";
import type { HistoryMetrics, OhlcvRow, Region, SourceRecord } from "./types";
import { fetchJson } from "./http";

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      description?: string;
    };
  };
}

interface NasdaqHistoricalResponse {
  data?: {
    symbol?: string;
    tradesTable?: {
      rows?: Array<{
        date?: string;
        close?: string;
        volume?: string;
        open?: string;
        high?: string;
        low?: string;
      }>;
    };
  };
}

function yahooChartUrl(ticker: string): string {
  return `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`;
}

function nasdaqHistoricalUrl(ticker: string): string {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 370);
  const format = (date: Date) => date.toISOString().slice(0, 10);
  return `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/historical?assetclass=stocks&fromdate=${format(start)}&todate=${format(end)}&limit=9999`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseMarketNumber(value: string | undefined): number | null {
  if (!value || /n\/a|data unavailable/i.test(value)) {
    return null;
  }

  const parsed = Number(value.replace(/[$,%\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNasdaqDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [month, day, year] = value.split("/");
  if (!month || !day || !year) {
    return null;
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function historySourceRecords(
  metrics: HistoryMetrics,
  sourceUrl: string,
  retrievedAt: string,
  cacheState: string
): SourceRecord[] {
  const freshness = `Yahoo chart public endpoint; cache ${cacheState}; refreshed at most daily`;
  return [
    ["Latest close", metrics.latestClose === null ? DATA_UNAVAILABLE : formatNumber(metrics.latestClose)],
    ["52-week high", metrics.high52Week === null ? DATA_UNAVAILABLE : formatNumber(metrics.high52Week)],
    ["52-week low", metrics.low52Week === null ? DATA_UNAVAILABLE : formatNumber(metrics.low52Week)],
    ["% from 52-week low", metrics.percentFromLow === null ? DATA_UNAVAILABLE : formatPercent(metrics.percentFromLow)],
    ["Average volume", metrics.averageVolume === null ? DATA_UNAVAILABLE : formatNumber(metrics.averageVolume)],
    ["5D performance", metrics.performance5D === null ? DATA_UNAVAILABLE : formatPercent(metrics.performance5D)],
    ["20D moving average", metrics.ma20 === null ? DATA_UNAVAILABLE : formatNumber(metrics.ma20)],
    ["50D moving average", metrics.ma50 === null ? DATA_UNAVAILABLE : formatNumber(metrics.ma50)],
    ["200D moving average", metrics.ma200 === null ? DATA_UNAVAILABLE : formatNumber(metrics.ma200)],
    ["RSI 14D", metrics.rsi14 === null ? DATA_UNAVAILABLE : formatNumber(metrics.rsi14)],
    ["ROC 14D", metrics.roc14 === null ? DATA_UNAVAILABLE : formatPercent(metrics.roc14)],
    ["ROC 21D", metrics.roc21 === null ? DATA_UNAVAILABLE : formatPercent(metrics.roc21)]
  ].map(([metric, value]) => ({
    metric,
    value,
    source: "Yahoo Finance chart public endpoint",
    url: sourceUrl,
    retrievedAt,
    freshness,
    verification: "recognized" as const,
    confidence: value === DATA_UNAVAILABLE ? 0 : 74,
    warning: "Stooq CSV was unavailable, so this row uses the recognized finance fallback."
  }));
}

function fallbackSourceRecords(
  metrics: HistoryMetrics,
  sourceUrl: string,
  retrievedAt: string,
  cacheState: string,
  source: string,
  warning: string
): SourceRecord[] {
  const freshness = `${source}; cache ${cacheState}; refreshed at most daily`;
  return [
    ["Latest close", metrics.latestClose === null ? DATA_UNAVAILABLE : formatNumber(metrics.latestClose)],
    ["52-week high", metrics.high52Week === null ? DATA_UNAVAILABLE : formatNumber(metrics.high52Week)],
    ["52-week low", metrics.low52Week === null ? DATA_UNAVAILABLE : formatNumber(metrics.low52Week)],
    ["% from 52-week low", metrics.percentFromLow === null ? DATA_UNAVAILABLE : formatPercent(metrics.percentFromLow)],
    ["Average volume", metrics.averageVolume === null ? DATA_UNAVAILABLE : formatNumber(metrics.averageVolume)],
    ["5D performance", metrics.performance5D === null ? DATA_UNAVAILABLE : formatPercent(metrics.performance5D)],
    ["20D moving average", metrics.ma20 === null ? DATA_UNAVAILABLE : formatNumber(metrics.ma20)],
    ["50D moving average", metrics.ma50 === null ? DATA_UNAVAILABLE : formatNumber(metrics.ma50)],
    ["200D moving average", metrics.ma200 === null ? DATA_UNAVAILABLE : formatNumber(metrics.ma200)],
    ["RSI 14D", metrics.rsi14 === null ? DATA_UNAVAILABLE : formatNumber(metrics.rsi14)],
    ["ROC 14D", metrics.roc14 === null ? DATA_UNAVAILABLE : formatPercent(metrics.roc14)],
    ["ROC 21D", metrics.roc21 === null ? DATA_UNAVAILABLE : formatPercent(metrics.roc21)]
  ].map(([metric, value]) => ({
    metric,
    value,
    source,
    url: sourceUrl,
    retrievedAt,
    freshness,
    verification: source.includes("Nasdaq") ? ("primary" as const) : ("recognized" as const),
    confidence: value === DATA_UNAVAILABLE ? 0 : source.includes("Nasdaq") ? 86 : 72,
    warning
  }));
}

async function loadYahooHistory(ticker: string): Promise<Omit<HistoryResult, "sourceRecords">> {
  const sourceUrl = yahooChartUrl(ticker);
  const payload = await fetchJson<YahooChartResponse>(sourceUrl);
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];
  const rows: OhlcvRow[] = [];

  if (!quote || timestamps.length === 0) {
    throw new Error(payload.chart?.error?.description ?? `No Yahoo chart data could be verified for ${ticker}.`);
  }

  for (let index = 0; index < timestamps.length; index += 1) {
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    const volume = quote.volume?.[index];
    if (
      isFiniteNumber(open) &&
      isFiniteNumber(high) &&
      isFiniteNumber(low) &&
      isFiniteNumber(close) &&
      isFiniteNumber(volume)
    ) {
      rows.push({
        date: new Date(timestamps[index] * 1000).toISOString().slice(0, 10),
        open,
        high,
        low,
        close,
        volume
      });
    }
  }

  if (rows.length === 0) {
    throw new Error(`No usable Yahoo chart rows could be verified for ${ticker}.`);
  }

  return {
    provider: "Yahoo chart fallback",
    rows,
    metrics: calculateHistoryMetrics(rows),
    stooqSymbol: result?.meta?.symbol ?? ticker,
    sourceUrl,
    warnings: ["Stooq CSV was unavailable; using Yahoo Finance chart public endpoint as a fallback."]
  };
}

async function fetchYahooHistory(ticker: string, forceRefresh: boolean): Promise<HistoryResult> {
  const retrievedAt = new Date().toISOString();
  const { value, cache } = await getCached(
    "history-yahoo",
    `v2-${ticker}`,
    CACHE_TTL.historyDaily,
    () => loadYahooHistory(ticker),
    forceRefresh
  );

  return {
    ...value,
    sourceRecords: historySourceRecords(value.metrics, value.sourceUrl, retrievedAt, cache)
  };
}

async function loadNasdaqHistory(ticker: string): Promise<Omit<HistoryResult, "sourceRecords">> {
  const sourceUrl = nasdaqHistoricalUrl(ticker);
  const payload = await fetchJson<NasdaqHistoricalResponse>(sourceUrl);
  const rows = (payload.data?.tradesTable?.rows ?? [])
    .map((row) => {
      const date = parseNasdaqDate(row.date);
      const open = parseMarketNumber(row.open);
      const high = parseMarketNumber(row.high);
      const low = parseMarketNumber(row.low);
      const close = parseMarketNumber(row.close);
      const volume = parseMarketNumber(row.volume);
      if (date && open !== null && high !== null && low !== null && close !== null && volume !== null) {
        return { date, open, high, low, close, volume };
      }
      return null;
    })
    .filter((row): row is OhlcvRow => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length === 0) {
    throw new Error(`No usable Nasdaq historical rows could be verified for ${ticker}.`);
  }

  return {
    provider: "Nasdaq historical fallback",
    rows,
    metrics: calculateHistoryMetrics(rows),
    stooqSymbol: payload.data?.symbol ?? ticker,
    sourceUrl,
    warnings: ["Stooq CSV was unavailable; using Nasdaq public historical endpoint as a fallback."]
  };
}

async function fetchNasdaqHistory(ticker: string, forceRefresh: boolean): Promise<HistoryResult> {
  const retrievedAt = new Date().toISOString();
  const { value, cache } = await getCached(
    "history-nasdaq",
    `v1-${ticker}`,
    CACHE_TTL.historyDaily,
    () => loadNasdaqHistory(ticker),
    forceRefresh
  );

  return {
    ...value,
    sourceRecords: fallbackSourceRecords(
      value.metrics,
      value.sourceUrl,
      retrievedAt,
      cache,
      "Nasdaq public historical endpoint",
      "Stooq CSV was unavailable, so this row uses the official exchange fallback."
    )
  };
}

export async function fetchHistory(ticker: string, region: Region, forceRefresh = false): Promise<HistoryResult> {
  try {
    return await fetchStooqHistory(ticker, region, forceRefresh);
  } catch (error) {
    const stooqWarning = error instanceof Error ? error.message : "Stooq CSV was unavailable.";
    if (region === "USA" && !ticker.includes(".")) {
      try {
        const nasdaq = await fetchNasdaqHistory(ticker, forceRefresh);
        return { ...nasdaq, warnings: [stooqWarning, ...nasdaq.warnings] };
      } catch {
        // Fall through to the recognized finance fallback below.
      }
    }

    const yahoo = await fetchYahooHistory(ticker, forceRefresh);
    return { ...yahoo, warnings: [stooqWarning, ...yahoo.warnings] };
  }
}
