import { getCached, CACHE_TTL } from "./cache";
import { calculateHistoryMetrics } from "./indicators";
import { stooqCandidates } from "./symbol-meta";
import type { HistoryMetrics, OhlcvRow, Region, SourceRecord } from "./types";
import { fetchText } from "./http";
import { DATA_UNAVAILABLE, formatNumber, formatPercent } from "./format";

export interface HistoryResult {
  provider: string;
  rows: OhlcvRow[];
  metrics: HistoryMetrics;
  stooqSymbol: string;
  sourceUrl: string;
  sourceRecords: SourceRecord[];
  warnings: string[];
}

function stooqUrl(symbol: string): string {
  return `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}&i=d`;
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseStooqCsv(csv: string): OhlcvRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]?.toLowerCase() ?? "";
  if (
    lines.length < 2 ||
    /no data/i.test(csv) ||
    /apikey|captcha|get_apikey/i.test(csv) ||
    !header.includes("date") ||
    !header.includes("open") ||
    !header.includes("close")
  ) {
    return [];
  }

  const rows: OhlcvRow[] = [];
  for (const line of lines.slice(1)) {
    const [date, openRaw, highRaw, lowRaw, closeRaw, volumeRaw] = line.split(",");
    const open = parseNumber(openRaw ?? "");
    const high = parseNumber(highRaw ?? "");
    const low = parseNumber(lowRaw ?? "");
    const close = parseNumber(closeRaw ?? "");
    const volume = parseNumber(volumeRaw ?? "");

    if (
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      open !== null &&
      high !== null &&
      low !== null &&
      close !== null &&
      volume !== null
    ) {
      rows.push({ date, open, high, low, close, volume });
    }
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function historySourceRecords(
  metrics: HistoryMetrics,
  sourceUrl: string,
  retrievedAt: string,
  cacheState: string
): SourceRecord[] {
  const freshness = `Stooq daily CSV; cache ${cacheState}; refreshed at most daily`;

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
    source: "Stooq historical CSV",
    url: sourceUrl,
    retrievedAt,
    freshness,
    verification: "primary" as const,
    confidence: value === DATA_UNAVAILABLE ? 0 : 92
  }));
}

async function loadStooqHistory(ticker: string, region: Region): Promise<Omit<HistoryResult, "sourceRecords" | "provider">> {
  const candidates = stooqCandidates(ticker, region);
  const warnings: string[] = [];

  for (const candidate of candidates) {
    const sourceUrl = stooqUrl(candidate);
    try {
      const csv = await fetchText(sourceUrl);
      const rows = parseStooqCsv(csv);
      if (rows.length > 0) {
        return {
          rows,
          metrics: calculateHistoryMetrics(rows),
          stooqSymbol: candidate,
          sourceUrl,
          warnings
        };
      }
      warnings.push(`Stooq returned no usable rows for ${candidate}.`);
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Stooq request failed for ${candidate}: ${error.message}`
          : `Stooq request failed for ${candidate}.`
      );
    }
  }

  throw new Error(`No Stooq CSV history could be verified for ${ticker}.`);
}

export async function fetchStooqHistory(
  ticker: string,
  region: Region,
  forceRefresh = false
): Promise<HistoryResult> {
  const retrievedAt = new Date().toISOString();
  const { value, cache } = await getCached(
    "history",
    `v2-${ticker}-${region}`,
    CACHE_TTL.historyDaily,
    () => loadStooqHistory(ticker, region),
    forceRefresh
  );

  return {
    provider: "Stooq CSV",
    ...value,
    sourceRecords: historySourceRecords(value.metrics, value.sourceUrl, retrievedAt, cache)
  };
}
