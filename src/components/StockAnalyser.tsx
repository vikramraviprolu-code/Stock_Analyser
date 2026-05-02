"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { logClientError } from "@/src/lib/client-error";
import { DATA_UNAVAILABLE, displayValue, formatDateTime, formatMoney, formatNumber, formatPercent } from "@/src/lib/format";
import { DISCLAIMER } from "@/src/lib/legal";
import { priceVsMovingAverage, rsiLabel } from "@/src/lib/recommendation";
import { detectRegion, REGIONS } from "@/src/lib/regions";
import { summarizeSourceQuality, verificationLabel } from "@/src/lib/source-quality";
import { findKnownTickerMatches, normalizeTicker, SAMPLE_TICKERS } from "@/src/lib/tickers";
import { APP_CODENAME, APP_VERSION } from "@/src/lib/version";
import type {
  AnalysisResponse,
  AlertMetric,
  AlertOperator,
  AlertSchedule,
  AlertSchedulerResponse,
  AlertsResponse,
  AuthSessionResponse,
  DeploymentReadinessResponse,
  FilterCriterion,
  EventsResponse,
  EventRow,
  OhlcvRow,
  PeerScoreRow,
  PortfolioResponse,
  Region,
  ScreenerResponse,
  ScreenerRow,
  SourceRecord,
  SourceStatus,
  SymbolMatch,
  ValidationResponse,
  ValidationRow,
  WatchlistItem,
  WatchlistResponse,
  WorkspaceDeleteResponse,
  WorkspaceExportResponse
} from "@/src/lib/types";

const TABS = [
  "Overview",
  "Value Screen",
  "Momentum",
  "Cross-Analysis",
  "Recommendation",
  "Data Quality",
  "Sources"
] as const;

type Tab = (typeof TABS)[number];
type WorkspaceView = "Analyse" | "Discover" | "Watchlist" | "Portfolio" | "Alerts" | "Compare" | "Events" | "Validate" | "Auth" | "Privacy";
type ScreenerViewMode = "table" | "charts";
type ChartMode = "line" | "candles";
type ChartRange = "1M" | "3M" | "6M" | "1Y";
type IndicatorPanelMode = "RSI" | "ROC" | "Volume";
type ChartOverlayKey = "ma20" | "ma50" | "ma200";
type ScreenPreset = "balanced" | "value" | "momentum" | "quality";
type ScreenerSortKey =
  | "totalScore"
  | "valueScore"
  | "momentumScore"
  | "dataQualityScore"
  | "performance5D"
  | "percentFromLow"
  | "trailingPe"
  | "marketCapUsd";
type ValidationScope = "examples" | "universe";
type DisplayCurrency = "Local" | "USD" | "EUR";
type OpenWorkspaceOptions = { resetAnalysisInput?: boolean };

const LOCAL_SESSION_PATH = "/__stock-analyser-session";
const LOCAL_SESSION_STORAGE_KEY = "stock-analyser-page-session";
const WATCHLIST_STORAGE_KEY = "stock-analyser-watchlist-v2";
const SAVED_SCREENS_STORAGE_KEY = "stock-analyser-saved-screens-v1";
const COMPARE_LIMIT = 5;
const CHART_RANGE_POINTS: Record<ChartRange, number> = {
  "1M": 22,
  "3M": 66,
  "6M": 132,
  "1Y": 260
};

interface ScreenerFilters {
  search: string;
  region: Region | "All";
  minTotalScore: number;
  minDataQuality: number;
  minMarketCapUsd: string;
  maxPe: string;
  nearLowOnly: boolean;
  passingFiltersOnly: boolean;
  sourceCleanOnly: boolean;
  sortBy: ScreenerSortKey;
  sortDirection: "asc" | "desc";
}

interface SavedScreen {
  id: string;
  name: string;
  filters: ScreenerFilters;
  createdAt: string;
}

interface ChartOverlays {
  ma20: boolean;
  ma50: boolean;
  ma200: boolean;
}

interface PortfolioForm {
  ticker: string;
  region: Region;
  quantity: string;
  averageCost: string;
  currency: string;
  notes: string;
}

interface AlertForm {
  ticker: string;
  region: Region;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: string;
  schedule: AlertSchedule;
}

interface AuthForm {
  username: string;
  passphrase: string;
}

interface StockAnalyserProps {
  autoAnalyse?: boolean;
  initialQuery?: string;
  initialRegion?: Region;
  initialView?: WorkspaceView;
}

interface SymbolSearchResponse {
  matches: SymbolMatch[];
}

function getPageSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const generated = window.crypto.randomUUID();
    window.sessionStorage.setItem(LOCAL_SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function getLifecycleEndpoint(): string | null {
  if (["127.0.0.1", "localhost", "stockanalyser.app"].includes(window.location.hostname)) {
    return `${window.location.origin}${LOCAL_SESSION_PATH}`;
  }

  return null;
}

function useLocalHttpsSession() {
  useEffect(() => {
    const sessionId = getPageSessionId();
    const endpoint = getLifecycleEndpoint();
    if (!endpoint) {
      return;
    }
    const sameOrigin = endpoint.startsWith(window.location.origin);

    function sendSessionEvent(event: "heartbeat" | "end") {
      const body = JSON.stringify({ event, sessionId, timestamp: new Date().toISOString() });
      const url = `${endpoint}/${event}`;

      if (event === "end" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
        return;
      }

      const mode: RequestMode = sameOrigin ? "same-origin" : "no-cors";
      void fetch(url, {
        body,
        cache: "no-store",
        headers: { "content-type": "text/plain" },
        keepalive: true,
        method: "POST",
        mode
      }).catch(() => undefined);
    }

    sendSessionEvent("heartbeat");
    const heartbeatId = window.setInterval(() => sendSessionEvent("heartbeat"), 10000);
    const endSession = () => sendSessionEvent("end");
    const resumeSession = () => sendSessionEvent("heartbeat");

    window.addEventListener("pagehide", endSession);
    window.addEventListener("pageshow", resumeSession);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener("pagehide", endSession);
      window.removeEventListener("pageshow", resumeSession);
      endSession();
    };
  }, []);
}

function useGlobalErrorLogging() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      logClientError(event.error ?? event.message);
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      logClientError(event.reason);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);
}

function scoreTone(score: number): "positive" | "negative" | "neutral" {
  if (score >= 70) return "positive";
  if (score < 45) return "negative";
  return "neutral";
}

function sourceHealth(records: SourceRecord[], warnings: string[]) {
  const summary = summarizeSourceQuality(records, warnings);
  return { score: summary.confidence, ...summary };
}

function metricTone(value: number | null | undefined, positiveWhenHigh = true): "positive" | "negative" | "neutral" {
  if (value === null || value === undefined || !Number.isFinite(value)) return "neutral";
  if (positiveWhenHigh) return value >= 0 ? "positive" : "negative";
  return value <= 10 ? "positive" : value <= 25 ? "neutral" : "negative";
}

function formatMarketCap(
  fundamentals: AnalysisResponse["fundamentals"],
  displayCurrency: DisplayCurrency
): string {
  if (displayCurrency === "USD") {
    return formatMoney(fundamentals.marketCapUsd, "USD");
  }
  if (displayCurrency === "EUR") {
    return formatMoney(fundamentals.marketCapEur, "EUR");
  }
  return formatMoney(fundamentals.marketCap, fundamentals.currency);
}

function formatDecimalPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? DATA_UNAVAILABLE : formatPercent(value * 100);
}

function fundamentalV2Items(fundamentals: AnalysisResponse["fundamentals"]) {
  return [
    { label: "Revenue TTM", value: formatMoney(fundamentals.revenueTtm, fundamentals.currency), group: "Scale" },
    { label: "EPS TTM", value: formatNumber(fundamentals.epsTtm), group: "Value" },
    { label: "Gross margin", value: formatDecimalPercent(fundamentals.grossMargin), group: "Margins" },
    { label: "Operating margin", value: formatDecimalPercent(fundamentals.operatingMargin), group: "Margins" },
    { label: "Net margin", value: formatDecimalPercent(fundamentals.netMargin), group: "Margins" },
    { label: "Return on equity", value: formatDecimalPercent(fundamentals.returnOnEquity), group: "Returns" },
    { label: "Return on assets", value: formatDecimalPercent(fundamentals.returnOnAssets), group: "Returns" },
    { label: "Debt to equity", value: formatNumber(fundamentals.debtToEquity), group: "Balance Sheet" },
    { label: "Free cash flow", value: formatMoney(fundamentals.freeCashFlow, fundamentals.currency), group: "Cash Flow" },
    { label: "Dividend yield", value: formatDecimalPercent(fundamentals.dividendYield), group: "Yield" },
    { label: "Payout ratio", value: formatDecimalPercent(fundamentals.payoutRatio), group: "Yield" },
    { label: "Revenue growth", value: formatDecimalPercent(fundamentals.revenueGrowth), group: "Growth" },
    { label: "Earnings growth", value: formatDecimalPercent(fundamentals.earningsGrowth), group: "Growth" },
    { label: "Beta", value: formatNumber(fundamentals.beta), group: "Risk" }
  ];
}

function fundamentalV2Coverage(fundamentals: AnalysisResponse["fundamentals"]) {
  const items = fundamentalV2Items(fundamentals);
  const available = items.filter((item) => item.value !== DATA_UNAVAILABLE).length;
  return { available, total: items.length, percent: Math.round((available / Math.max(1, items.length)) * 100) };
}

function alertMetricLabel(metric: AlertMetric): string {
  if (metric === "price") return "Latest close";
  if (metric === "rsi14") return "RSI 14D";
  if (metric === "percentFromLow") return "% from low";
  return "5D performance";
}

function alertScheduleLabel(schedule: AlertSchedule): string {
  if (schedule === "manual") return "Manual";
  if (schedule === "daily") return "Daily";
  return "Hourly";
}

function formatOptionalDateTime(value: string | null | undefined): string {
  return value ? formatDateTime(value) : DATA_UNAVAILABLE;
}

function formatAlertValue(metric: AlertMetric, value: number | null): string {
  if (metric === "price" || metric === "rsi14") {
    return formatNumber(value);
  }
  return formatPercent(value);
}

function mergeSymbolMatches(...groups: SymbolMatch[][]): SymbolMatch[] {
  const byTicker = new Map<string, SymbolMatch>();
  for (const group of groups) {
    for (const match of group) {
      const key = normalizeTicker(match.ticker);
      const current = byTicker.get(key);
      if (!current || current.source === "recognized") {
        byTicker.set(key, match);
      }
    }
  }
  return [...byTicker.values()].slice(0, 10);
}

function bestRegionFromMatches(query: string, matches: SymbolMatch[], fallback: Region): Region {
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

  return exact?.region ?? matches[0]?.region ?? fallback;
}

function combinedPeers(analysis: AnalysisResponse): PeerScoreRow[] {
  const rows = [...analysis.valueScreen.peers, ...analysis.momentum.topPeers];
  return Array.from(new Map(rows.map((row) => [row.ticker, row])).values());
}

function screenerMatches(row: ScreenerRow, filters: ScreenerFilters): boolean {
  const search = filters.search.trim().toLowerCase();
  if (filters.region !== "All" && row.region !== filters.region) return false;
  if (row.totalScore < filters.minTotalScore) return false;
  if (row.dataQualityScore < filters.minDataQuality) return false;
  if (filters.sourceCleanOnly && (row.warningCount > 0 || row.status !== "ok")) return false;
  if (filters.minMarketCapUsd.trim()) {
    const minMarketCap = Number(filters.minMarketCapUsd);
    if (Number.isFinite(minMarketCap) && (row.marketCapUsd === null || row.marketCapUsd < minMarketCap)) return false;
  }
  if (filters.nearLowOnly && (row.percentFromLow === null || row.percentFromLow > 10)) return false;
  if (filters.passingFiltersOnly && !row.filtersPassed) return false;
  if (filters.maxPe.trim()) {
    const maxPe = Number(filters.maxPe);
    if (Number.isFinite(maxPe) && (row.trailingPe === null || row.trailingPe > maxPe)) return false;
  }
  if (!search) return true;
  return [row.ticker, row.companyName, row.sector, row.industry, row.country]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

function screenerSortValue(row: ScreenerRow, key: ScreenerSortKey): number | null {
  return row[key];
}

function sortScreenerRows(rows: ScreenerRow[], filters: ScreenerFilters): ScreenerRow[] {
  const direction = filters.sortDirection === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = screenerSortValue(a, filters.sortBy);
    const right = screenerSortValue(b, filters.sortBy);
    if (left === null && right === null) return a.ticker.localeCompare(b.ticker);
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * direction || a.ticker.localeCompare(b.ticker);
  });
}

function presetFilters(preset: ScreenPreset): ScreenerFilters {
  if (preset === "value") {
    return {
      search: "",
      region: "All",
      minTotalScore: 50,
      minDataQuality: 45,
      minMarketCapUsd: "2000000000",
      maxPe: "12",
      nearLowOnly: true,
      passingFiltersOnly: true,
      sourceCleanOnly: false,
      sortBy: "valueScore",
      sortDirection: "desc"
    };
  }

  if (preset === "momentum") {
    return {
      search: "",
      region: "All",
      minTotalScore: 60,
      minDataQuality: 40,
      minMarketCapUsd: "",
      maxPe: "",
      nearLowOnly: false,
      passingFiltersOnly: false,
      sourceCleanOnly: false,
      sortBy: "performance5D",
      sortDirection: "desc"
    };
  }

  if (preset === "quality") {
    return {
      search: "",
      region: "All",
      minTotalScore: 65,
      minDataQuality: 70,
      minMarketCapUsd: "2000000000",
      maxPe: "",
      nearLowOnly: false,
      passingFiltersOnly: true,
      sourceCleanOnly: true,
      sortBy: "dataQualityScore",
      sortDirection: "desc"
    };
  }

  return {
    search: "",
    region: "All",
    minTotalScore: 45,
    minDataQuality: 35,
    minMarketCapUsd: "",
    maxPe: "",
    nearLowOnly: false,
    passingFiltersOnly: false,
    sourceCleanOnly: false,
    sortBy: "totalScore",
    sortDirection: "desc"
  };
}

function screenerRowFromAnalysis(analysis: AnalysisResponse): ScreenerRow {
  const metrics = analysis.history?.metrics;
  const signal = analysis.momentum.topPeers.find((peer) => peer.ticker === analysis.ticker)?.signal ?? "See analysis";

  return {
    ticker: analysis.ticker,
    region: analysis.region,
    companyName: analysis.fundamentals.companyName,
    exchange: analysis.fundamentals.exchange,
    country: analysis.fundamentals.country,
    currency: analysis.fundamentals.currency,
    sector: analysis.fundamentals.sector,
    industry: analysis.fundamentals.industry,
    latestClose: metrics?.latestClose ?? null,
    marketCapUsd: analysis.fundamentals.marketCapUsd,
    trailingPe: analysis.fundamentals.trailingPe,
    averageVolume: metrics?.averageVolume ?? analysis.fundamentals.averageVolume,
    percentFromLow: metrics?.percentFromLow ?? null,
    performance5D: metrics?.performance5D ?? null,
    roc14: metrics?.roc14 ?? null,
    roc21: metrics?.roc21 ?? null,
    rsi14: metrics?.rsi14 ?? null,
    rsiLabel: rsiLabel(metrics?.rsi14 ?? null),
    priceVsMa20: priceVsMovingAverage(metrics?.latestClose ?? null, metrics?.ma20 ?? null),
    priceVsMa50: priceVsMovingAverage(metrics?.latestClose ?? null, metrics?.ma50 ?? null),
    priceVsMa200: priceVsMovingAverage(metrics?.latestClose ?? null, metrics?.ma200 ?? null),
    signal,
    outlook: analysis.recommendation.baseCase,
    confidence: analysis.recommendation.confidence,
    valueScore: analysis.recommendation.scores.value,
    momentumScore: analysis.recommendation.scores.momentum,
    dataQualityScore: analysis.recommendation.scores.dataQuality,
    totalScore: analysis.recommendation.scores.total,
    qualifiesValue: analysis.valueScreen.inputQualifies,
    filtersPassed: analysis.filters.passed,
    sourceCount: analysis.sourceRecords.length,
    warningCount: analysis.warnings.length,
    historyProvider: analysis.history?.provider ?? null,
    historySourceUrl: analysis.history?.sourceUrl ?? null,
    chartRows: analysis.history?.rows.slice(-260) ?? [],
    warnings: analysis.warnings,
    retrievedAt: analysis.retrievedAt,
    status: analysis.warnings.length > 0 ? "warning" : "ok"
  };
}

function ProgressBar({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="progress-row">
      <div>
        <span>{label}</span>
        <strong>{formatNumber(value)}%</strong>
      </div>
      <div className="progress-track">
        <span className={scoreTone(value)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function preferredSymbolMatch(query: string, matches: SymbolMatch[]): SymbolMatch | null {
  const normalized = normalizeTicker(query);
  return matches.find((match) => normalizeTicker(match.ticker) === normalized) ?? matches[0] ?? null;
}

function SymbolResolutionPanel({
  query,
  matches,
  loading
}: {
  query: string;
  matches: SymbolMatch[];
  loading: boolean;
}) {
  const match = preferredSymbolMatch(query, matches);
  if (!query.trim()) {
    return null;
  }

  return (
    <section className="resolution-panel" aria-label="Symbol resolution quality">
      <div>
        <span>Resolver</span>
        <strong>{loading ? "Searching public symbols" : match ? `${match.ticker} selected` : "Awaiting verified match"}</strong>
      </div>
      <div>
        <span>Confidence</span>
        <strong>{match?.confidence !== undefined ? `${match.confidence}%` : DATA_UNAVAILABLE}</strong>
      </div>
      <div>
        <span>Listing</span>
        <strong>{match?.primaryListing === "likely" ? "Likely primary" : "Verify listing"}</strong>
      </div>
      <div>
        <span>Stooq candidates</span>
        <strong>{match?.stooqSymbols?.slice(0, 2).join(", ") ?? DATA_UNAVAILABLE}</strong>
      </div>
      <p>
        {match?.matchReason ?? "Choose a candidate before analysis."}
        {match?.warnings?.length ? ` ${match.warnings[0]}` : ""}
      </p>
    </section>
  );
}

function WorkstationStatus({
  analysis,
  screenerResponse,
  watchlistCount,
  compareCount
}: {
  analysis: AnalysisResponse | null;
  screenerResponse: ScreenerResponse | null;
  watchlistCount: number;
  compareCount: number;
}) {
  const quality = analysis ? analysis.dataReliability.score : null;
  const activeHistory = analysis?.history?.provider ?? "No analysis loaded";

  return (
    <section className="workstation-strip" aria-label="Market workstation status">
      <div>
        <span>Market workstation</span>
        <strong>{analysis?.ticker ?? "Ready"}</strong>
        <small>{analysis?.fundamentals.companyName ?? "Search a ticker or company to begin"}</small>
      </div>
      <div>
        <span>History rail</span>
        <strong>{activeHistory}</strong>
        <small>{analysis?.history?.stooqSymbol ?? "Stooq preferred, public fallback allowed"}</small>
      </div>
      <div>
        <span>Data confidence</span>
        <strong>{quality === null ? DATA_UNAVAILABLE : `${quality}%`}</strong>
        <small>{analysis ? `${analysis.dataReliability.label} reliability · ${analysis.sourceRecords.length} source records` : "Source audit appears after analysis"}</small>
      </div>
      <div>
        <span>Lists</span>
        <strong>{watchlistCount} watch / {compareCount} compare</strong>
        <small>{screenerResponse ? `${screenerResponse.rows.length} screened rows loaded` : "Run a screen to populate discovery"}</small>
      </div>
    </section>
  );
}

function rollingAverageSeries(rows: OhlcvRow[], period: number): Array<number | null> {
  return rows.map((_, index) => {
    if (index + 1 < period) {
      return null;
    }

    const slice = rows.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, row) => sum + row.close, 0) / period;
  });
}

function rocSeries(rows: OhlcvRow[], period: number): Array<number | null> {
  return rows.map((row, index) => {
    const previous = rows[index - period]?.close;
    if (!previous || previous === 0) {
      return null;
    }

    return ((row.close - previous) / previous) * 100;
  });
}

function rsiSeries(rows: OhlcvRow[], period: number): Array<number | null> {
  return rows.map((_, index) => {
    if (index < period) {
      return null;
    }

    let gains = 0;
    let losses = 0;
    for (let offset = index - period + 1; offset <= index; offset += 1) {
      const change = rows[offset].close - rows[offset - 1].close;
      if (change >= 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    if (losses === 0) {
      return 100;
    }

    const relativeStrength = gains / losses;
    return 100 - 100 / (1 + relativeStrength);
  });
}

function seriesPoints(series: Array<number | null>, xFor: (index: number) => number, yFor: (value: number) => number): string {
  return series
    .map((value, index) => (value === null ? null : `${xFor(index)},${yFor(value)}`))
    .filter((point): point is string => point !== null)
    .join(" ");
}

function PriceChart({
  rows,
  mode,
  currency,
  range,
  overlays,
  indicatorPanel
}: {
  rows: OhlcvRow[];
  mode: ChartMode;
  currency?: string | null;
  range: ChartRange;
  overlays: ChartOverlays;
  indicatorPanel: IndicatorPanelMode;
}) {
  const rangeSize = CHART_RANGE_POINTS[range];
  const startIndex = Math.max(0, rows.length - rangeSize);
  const visibleRows = rows.slice(startIndex);
  if (visibleRows.length < 2) {
    return <p className="empty-state">Data unavailable.</p>;
  }

  const fullMa20 = rollingAverageSeries(rows, 20).slice(startIndex);
  const fullMa50 = rollingAverageSeries(rows, 50).slice(startIndex);
  const fullMa200 = rollingAverageSeries(rows, 200).slice(startIndex);
  const rsiValues = rsiSeries(rows, 14).slice(startIndex);
  const rocValues = rocSeries(rows, 14).slice(startIndex);
  const width = 760;
  const height = 344;
  const padding = 24;
  const priceTop = padding;
  const priceBottom = 236;
  const indicatorTop = 266;
  const indicatorBottom = height - padding;
  const overlayPrices = [
    ...(overlays.ma20 ? fullMa20 : []),
    ...(overlays.ma50 ? fullMa50 : []),
    ...(overlays.ma200 ? fullMa200 : [])
  ].filter((value): value is number => value !== null && Number.isFinite(value));
  const prices = [...visibleRows.flatMap((row) => [row.high, row.low, row.close]), ...overlayPrices].filter(Number.isFinite);
  const volumes = visibleRows.map((row) => row.volume).filter(Number.isFinite);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const maxVolume = Math.max(...volumes, 1);
  const xFor = (index: number) => padding + (index / Math.max(1, visibleRows.length - 1)) * (width - padding * 2);
  const yFor = (price: number) => priceBottom - ((price - minPrice) / Math.max(1, maxPrice - minPrice)) * (priceBottom - priceTop);
  const linePoints = visibleRows.map((row, index) => `${xFor(index)},${yFor(row.close)}`).join(" ");
  const indicatorValues =
    indicatorPanel === "RSI"
      ? rsiValues
      : indicatorPanel === "ROC"
        ? rocValues
        : visibleRows.map((row) => row.volume);
  const numericIndicatorValues = indicatorValues.filter((value): value is number => value !== null && Number.isFinite(value));
  const indicatorMin =
    indicatorPanel === "RSI"
      ? 0
      : indicatorPanel === "Volume"
        ? 0
        : Math.min(0, ...numericIndicatorValues);
  const indicatorMax =
    indicatorPanel === "RSI"
      ? 100
      : indicatorPanel === "Volume"
        ? maxVolume
        : Math.max(0, ...numericIndicatorValues);
  const yIndicator = (value: number) =>
    indicatorBottom - ((value - indicatorMin) / Math.max(1, indicatorMax - indicatorMin)) * (indicatorBottom - indicatorTop);
  const indicatorPoints = seriesPoints(indicatorValues, xFor, yIndicator);

  return (
    <div className="chart-panel">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historical price chart">
        <g className="chart-grid">
          {[0, 1, 2, 3].map((item) => (
            <line key={item} x1={padding} x2={width - padding} y1={priceTop + item * ((priceBottom - priceTop) / 3)} y2={priceTop + item * ((priceBottom - priceTop) / 3)} />
          ))}
          <line x1={padding} x2={width - padding} y1={indicatorTop} y2={indicatorTop} />
          <line x1={padding} x2={width - padding} y1={indicatorBottom} y2={indicatorBottom} />
          <line className="indicator-midline" x1={padding} x2={width - padding} y1={yIndicator(indicatorPanel === "RSI" ? 50 : 0)} y2={yIndicator(indicatorPanel === "RSI" ? 50 : 0)} />
        </g>
        {mode === "line" ? (
          <polyline className="price-line" fill="none" points={linePoints} />
        ) : (
          visibleRows.map((row, index) => {
            const x = xFor(index);
            const openY = yFor(row.open);
            const closeY = yFor(row.close);
            return (
              <g key={`candle-${row.date}`} className={row.close >= row.open ? "candle up" : "candle down"}>
                <line x1={x} x2={x} y1={yFor(row.high)} y2={yFor(row.low)} />
                <rect x={x - 3} y={Math.min(openY, closeY)} width="6" height={Math.max(2, Math.abs(closeY - openY))} />
              </g>
            );
          })
        )}
        {overlays.ma20 ? <polyline className="ma-line ma20" fill="none" points={seriesPoints(fullMa20, xFor, yFor)} /> : null}
        {overlays.ma50 ? <polyline className="ma-line ma50" fill="none" points={seriesPoints(fullMa50, xFor, yFor)} /> : null}
        {overlays.ma200 ? <polyline className="ma-line ma200" fill="none" points={seriesPoints(fullMa200, xFor, yFor)} /> : null}
        {indicatorPanel === "Volume"
          ? visibleRows.map((row, index) => {
              const x = xFor(index);
              const volumeHeight = (row.volume / maxVolume) * (indicatorBottom - indicatorTop);
              return (
                <rect
                  key={`volume-${row.date}`}
                  className="volume-bar"
                  x={x - 2}
                  y={indicatorBottom - volumeHeight}
                  width="4"
                  height={volumeHeight}
                />
              );
            })
          : <polyline className="indicator-line" fill="none" points={indicatorPoints} />}
      </svg>
      <div className="chart-legend" aria-label="Chart overlays">
        <span className="legend-price">Close</span>
        {overlays.ma20 ? <span className="legend-ma20">20D MA</span> : null}
        {overlays.ma50 ? <span className="legend-ma50">50D MA</span> : null}
        {overlays.ma200 ? <span className="legend-ma200">200D MA</span> : null}
        <span>{indicatorPanel}</span>
      </div>
      <div className="chart-caption">
        <span>{visibleRows[0]?.date}</span>
        <strong>{formatMoney(visibleRows.at(-1)?.close, currency ?? null)}</strong>
        <span>{visibleRows.at(-1)?.date}</span>
      </div>
    </div>
  );
}

function VisualScorecard({ analysis }: { analysis: AnalysisResponse }) {
  const qualityScore = Math.round((analysis.recommendation.scores.dataQuality + (analysis.filters.passed ? 80 : 35)) / 2);
  const riskScore = Math.max(0, 100 - Math.min(80, analysis.warnings.length * 8 + (analysis.filters.passed ? 0 : 18)));

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <span>Visual scorecard</span>
          <h2>Conviction Snapshot</h2>
        </div>
        <span className={badgeClass(scoreTone(analysis.recommendation.scores.total))}>
          {analysis.recommendation.finalRating}
        </span>
      </div>
      <div className="scorecard-grid">
        <ProgressBar label="Value" value={analysis.recommendation.scores.value} detail="52-week low proximity, P/E, regional filters" />
        <ProgressBar label="Momentum" value={analysis.recommendation.scores.momentum} detail="5D performance, ROC, RSI, moving averages" />
        <ProgressBar label="Quality" value={qualityScore} detail="Derived from data availability and regional filter pass/fail" />
        <ProgressBar label="Risk Control" value={riskScore} detail={`${analysis.warnings.length} warning${analysis.warnings.length === 1 ? "" : "s"} considered`} />
        <ProgressBar label="Data Reliability" value={analysis.dataReliability.score} detail={`${analysis.dataReliability.label} · ${analysis.dataReliability.coveragePercent}% field coverage`} />
      </div>
    </section>
  );
}

function ChartWorkbench({
  analysis,
  chartMode,
  chartRange,
  chartOverlays,
  indicatorPanel,
  onChartModeChange,
  onChartRangeChange,
  onChartOverlayChange,
  onIndicatorPanelChange
}: {
  analysis: AnalysisResponse;
  chartMode: ChartMode;
  chartRange: ChartRange;
  chartOverlays: ChartOverlays;
  indicatorPanel: IndicatorPanelMode;
  onChartModeChange: (mode: ChartMode) => void;
  onChartRangeChange: (range: ChartRange) => void;
  onChartOverlayChange: (key: ChartOverlayKey, value: boolean) => void;
  onIndicatorPanelChange: (mode: IndicatorPanelMode) => void;
}) {
  const metrics = analysis.history?.metrics;

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <span>Chart workspace</span>
          <h2>Price, Volume, RSI, ROC</h2>
        </div>
        <span className="source-pill">{analysis.history?.rowCount ?? 0} rows</span>
      </div>
      <div className="chart-control-bar">
        <div className="segmented compact" aria-label="Chart range">
          {(["1M", "3M", "6M", "1Y"] as ChartRange[]).map((item) => (
            <button key={item} type="button" className={chartRange === item ? "active" : ""} onClick={() => onChartRangeChange(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="segmented compact" aria-label="Chart style">
          <button type="button" className={chartMode === "line" ? "active" : ""} onClick={() => onChartModeChange("line")}>
            Line
          </button>
          <button type="button" className={chartMode === "candles" ? "active" : ""} onClick={() => onChartModeChange("candles")}>
            Candles
          </button>
        </div>
        <div className="overlay-toggles" aria-label="Moving average overlays">
          {([
            ["ma20", "20D"],
            ["ma50", "50D"],
            ["ma200", "200D"]
          ] as Array<[ChartOverlayKey, string]>).map(([key, label]) => (
            <label key={key} className="toggle-pill">
              <input
                type="checkbox"
                checked={chartOverlays[key]}
                onChange={(event) => onChartOverlayChange(key, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="segmented compact" aria-label="Indicator panel">
          {(["RSI", "ROC", "Volume"] as IndicatorPanelMode[]).map((item) => (
            <button key={item} type="button" className={indicatorPanel === item ? "active" : ""} onClick={() => onIndicatorPanelChange(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      {analysis.history ? (
        <PriceChart
          rows={analysis.history.rows}
          mode={chartMode}
          currency={analysis.fundamentals.currency}
          range={chartRange}
          overlays={chartOverlays}
          indicatorPanel={indicatorPanel}
        />
      ) : (
        <p className="empty-state">Data unavailable.</p>
      )}
      <div className="indicator-strip">
        <span>20D MA: {formatNumber(metrics?.ma20)}</span>
        <span>50D MA: {formatNumber(metrics?.ma50)}</span>
        <span>200D MA: {formatNumber(metrics?.ma200)}</span>
        <span>RSI: {formatNumber(metrics?.rsi14)}</span>
        <span>ROC 14D: {formatPercent(metrics?.roc14)}</span>
        <span>ROC 21D: {formatPercent(metrics?.roc21)}</span>
      </div>
    </section>
  );
}

function EventCalendar({ analysis }: { analysis: AnalysisResponse }) {
  const events = [
    {
      label: "Earnings",
      value: analysis.fundamentals.earningsDate ? formatDateTime(analysis.fundamentals.earningsDate) : DATA_UNAVAILABLE,
      detail: analysis.fundamentals.earningsDate ? "Verified from public fundamentals layer where available." : "No verified public source returned an earnings date."
    },
    {
      label: "Dividend",
      value: DATA_UNAVAILABLE,
      detail: "Dividend events are not yet verified by the current no-key source layer."
    },
    {
      label: "Split",
      value: DATA_UNAVAILABLE,
      detail: "Split calendar is not yet verified by the current no-key source layer."
    }
  ];

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <span>Catalyst calendar</span>
          <h2>Events To Verify</h2>
        </div>
      </div>
      <div className="event-grid">
        {events.map((event) => (
          <article key={event.label}>
            <span>{event.label}</span>
            <strong>{event.value}</strong>
            <p>{event.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DataQualityCommandCenter({ analysis }: { analysis: AnalysisResponse }) {
  const health = sourceHealth(analysis.sourceRecords, analysis.warnings);
  const sourceGroups = analysis.sourceRecords.reduce<Record<string, number>>((groups, record) => {
    groups[record.source] = (groups[record.source] ?? 0) + 1;
    return groups;
  }, {});

  return (
    <div className="panel-stack">
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Data quality command center</span>
            <h2>Source Audit</h2>
          </div>
          <span className={badgeClass(scoreTone(analysis.dataReliability.score))}>{formatNumber(analysis.dataReliability.score)}% reliability</span>
        </div>
        <div className="metric-grid four">
          <MetricCard label="Reliability" value={analysis.dataReliability.label} subvalue={`${analysis.dataReliability.coveragePercent}% field coverage`} />
          <MetricCard label="Verified fields" value={formatNumber(health.verified)} />
          <MetricCard label="Unavailable fields" value={formatNumber(health.unavailable)} />
          <MetricCard label="Primary sources" value={formatNumber(health.primary)} />
          <MetricCard label="Recognized sources" value={formatNumber(health.recognized)} />
          <MetricCard label="Computed metrics" value={formatNumber(health.computed)} />
          <MetricCard label="Fallback records" value={formatNumber(health.fallback)} />
          <MetricCard label="Warning penalty" value={formatNumber(analysis.dataReliability.warningPenalty)} />
          <MetricCard label="Sources" value={formatNumber(Object.keys(sourceGroups).length)} />
        </div>
      </section>
      <section className="content-band">
        <h2>Reliability Gates</h2>
        <div className="info-grid">
          {analysis.dataReliability.gates.map((gate) => (
            <p key={gate.label}>
              <strong>{gate.label}</strong>
              <span className={badgeClass(gate.status)}>{gate.status}</span>
              {gate.detail}
            </p>
          ))}
        </div>
      </section>
      <section className="content-band">
        <h2>Freshness Timeline</h2>
        <div className="timeline-list">
          {analysis.sourceRecords.slice(0, 12).map((record, index) => (
            <article key={`${record.metric}-${index}`}>
              <span>{formatDateTime(record.retrievedAt)}</span>
              <strong>{record.metric}</strong>
              <p>{record.freshness}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PeerMatrix({ analysis }: { analysis: AnalysisResponse }) {
  const peers = combinedPeers(analysis).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  if (peers.length === 0) {
    return <p className="empty-state">Data unavailable.</p>;
  }

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <span>Peer matrix</span>
          <h2>Valuation vs Momentum</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Match</th>
              <th>% From Low</th>
              <th>P/E</th>
              <th>5D %</th>
              <th>Momentum</th>
              <th>Filters</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((peer) => (
              <tr key={`peer-matrix-${peer.ticker}`}>
                <td>{peer.ticker}</td>
                <td>{peer.matchReason}</td>
                <td><span className={badgeClass(metricTone(peer.percentFromLow, false))}>{formatPercent(peer.percentFromLow)}</span></td>
                <td>{peer.trailingPe === null ? DATA_UNAVAILABLE : formatNumber(peer.trailingPe)}</td>
                <td><span className={badgeClass(metricTone(peer.performance5D))}>{formatPercent(peer.performance5D)}</span></td>
                <td>{peer.signal}</td>
                <td>{peer.filters.passed ? "Pass" : "Fail"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScenarioPanel({ analysis }: { analysis: AnalysisResponse }) {
  const metrics = analysis.history?.metrics;
  const technicalTrigger =
    metrics?.ma20 !== null && metrics?.ma20 !== undefined
      ? `Close above 20D MA (${formatMoney(metrics.ma20, analysis.fundamentals.currency)}) with positive ROC.`
      : DATA_UNAVAILABLE;
  const invalidation =
    metrics?.low52Week !== null && metrics?.low52Week !== undefined
      ? `Break below verified 52-week low (${formatMoney(metrics.low52Week, analysis.fundamentals.currency)}).`
      : DATA_UNAVAILABLE;

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <span>Scenario recommendation</span>
          <h2>What Would Change The View</h2>
        </div>
      </div>
      <div className="scenario-grid">
        <article>
          <span>Upside case</span>
          <p>{analysis.recommendation.bullCase.join(" ")}</p>
        </article>
        <article>
          <span>Downside case</span>
          <p>{analysis.recommendation.bearCase.join(" ")}</p>
        </article>
        <article>
          <span>Technical trigger</span>
          <p>{technicalTrigger}</p>
        </article>
        <article>
          <span>Invalidation level</span>
          <p>{invalidation}</p>
        </article>
      </div>
    </section>
  );
}

function statusClass(status: SourceStatus["status"]): string {
  return `status ${status}`;
}

function badgeClass(value: string): string {
  const normalized = value.toLowerCase();
  if (
    normalized.includes("buy") ||
    normalized.includes("pass") ||
    normalized.includes("bullish") ||
    normalized.includes("ok") ||
    normalized.includes("primary") ||
    normalized.includes("recognized")
  ) {
    return "badge positive";
  }
  if (
    normalized.includes("avoid") ||
    normalized.includes("fail") ||
    normalized.includes("weak") ||
    normalized.includes("error") ||
    normalized.includes("unavailable")
  ) {
    return "badge negative";
  }
  return "badge neutral";
}

function MetricCard({
  label,
  value,
  subvalue
}: {
  label: string;
  value: string;
  subvalue?: string;
}) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {subvalue ? <small>{subvalue}</small> : null}
    </div>
  );
}

function WarningPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className="warning-panel">
      <strong>Warnings</strong>
      {warnings.length > 0 ? (
        <ul>
          {warnings.map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function StatusCards({ statuses }: { statuses: SourceStatus[] }) {
  return (
    <div className="status-grid">
      {statuses.map((status) => (
        <article key={`${status.label}-${status.url ?? "none"}`} className={statusClass(status.status)}>
          <span>{status.label}</span>
          <strong>{status.status.toUpperCase()}</strong>
          <p>{status.detail}</p>
          {status.url ? (
            <a href={status.url} target="_blank" rel="noreferrer">
              Source
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function FilterTable({ criteria }: { criteria: FilterCriterion[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Actual</th>
          <th>Threshold</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {criteria.map((criterion) => (
          <tr key={criterion.label}>
            <td>{criterion.label}</td>
            <td>{criterion.actual === null ? DATA_UNAVAILABLE : formatNumber(criterion.actual)}</td>
            <td>
              {formatNumber(criterion.threshold)} {criterion.unit}
            </td>
            <td>
              <span className={badgeClass(criterion.passed === null ? DATA_UNAVAILABLE : criterion.passed ? "Pass" : "Fail")}>
                {criterion.passed === null ? DATA_UNAVAILABLE : criterion.passed ? "Pass" : "Fail"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PeerTable({ rows, kind }: { rows: PeerScoreRow[]; kind: "value" | "momentum" }) {
  if (rows.length === 0) {
    return <p className="empty-state">Data unavailable.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Company</th>
            <th>Match</th>
            <th>5D %</th>
            <th>ROC 14D</th>
            <th>ROC 21D</th>
            <th>RSI</th>
            {kind === "value" ? (
              <>
                <th>% from low</th>
                <th>P/E</th>
                <th>Filters</th>
              </>
            ) : (
              <>
                <th>20D</th>
                <th>50D</th>
                <th>200D</th>
                <th>Signal</th>
                <th>Outlook</th>
                <th>Confidence</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${kind}-${row.ticker}`}>
              <td>{row.ticker}</td>
              <td>{row.companyName ?? DATA_UNAVAILABLE}</td>
              <td>{row.matchReason}</td>
              <td>{formatPercent(row.performance5D)}</td>
              <td>{formatPercent(row.roc14)}</td>
              <td>{formatPercent(row.roc21)}</td>
              <td>
                {row.rsi14 === null ? DATA_UNAVAILABLE : `${formatNumber(row.rsi14)} (${row.rsiLabel})`}
              </td>
              {kind === "value" ? (
                <>
                  <td>{formatPercent(row.percentFromLow)}</td>
                  <td>{row.trailingPe === null ? DATA_UNAVAILABLE : formatNumber(row.trailingPe)}</td>
                  <td>
                    <span className={badgeClass(row.filters.passed ? "Pass" : "Fail")}>
                      {row.filters.passed ? "Pass" : "Fail"}
                    </span>
                  </td>
                </>
              ) : (
                <>
                  <td>{row.priceVsMa20}</td>
                  <td>{row.priceVsMa50}</td>
                  <td>{row.priceVsMa200}</td>
                  <td>
                    <span className={badgeClass(row.signal)}>{row.signal}</span>
                  </td>
                  <td>{row.outlook}</td>
                  <td>{formatNumber(row.confidence)}%</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourcesTable({ records }: { records: SourceRecord[] }) {
  if (records.length === 0) {
    return <p className="empty-state">Data unavailable.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Source</th>
            <th>Confidence</th>
            <th>Verification</th>
            <th>URL</th>
            <th>Retrieved At</th>
            <th>Freshness</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={`${record.metric}-${index}`}>
              <td>{record.metric}</td>
              <td>{record.value}</td>
              <td>{record.source}</td>
              <td>{formatNumber(record.confidence ?? 0)}%</td>
              <td>
                <span className={badgeClass(verificationLabel(record))}>{verificationLabel(record)}</span>
              </td>
              <td>
                {record.url ? (
                  <a href={record.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : (
                  DATA_UNAVAILABLE
                )}
              </td>
              <td>{formatDateTime(record.retrievedAt)}</td>
              <td>
                {record.freshness}
                {record.warning ? <small className="source-warning">{record.warning}</small> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScreenerResultsTable({
  rows,
  onAnalyse,
  onWatch,
  onCompare,
  compared
}: {
  rows: ScreenerRow[];
  onAnalyse: (row: ScreenerRow) => void;
  onWatch: (row: ScreenerRow) => void;
  onCompare: (row: ScreenerRow) => void;
  compared: string[];
}) {
  if (rows.length === 0) {
    return <p className="empty-state">No stocks match the current screen.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Company</th>
            <th>Region</th>
            <th>Sector</th>
            <th>Price</th>
            <th>Market Cap</th>
            <th>P/E</th>
            <th>% From Low</th>
            <th>5D</th>
            <th>RSI</th>
            <th>Signal</th>
            <th>Total</th>
            <th>Data</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`screen-${row.ticker}`}>
              <td><strong>{row.ticker}</strong></td>
              <td>{row.companyName ?? DATA_UNAVAILABLE}</td>
              <td>{row.region}</td>
              <td>{row.sector ?? DATA_UNAVAILABLE}</td>
              <td>{formatMoney(row.latestClose, row.currency)}</td>
              <td>{formatMoney(row.marketCapUsd, "USD")}</td>
              <td>{row.trailingPe === null ? DATA_UNAVAILABLE : formatNumber(row.trailingPe)}</td>
              <td><span className={badgeClass(metricTone(row.percentFromLow, false))}>{formatPercent(row.percentFromLow)}</span></td>
              <td><span className={badgeClass(metricTone(row.performance5D))}>{formatPercent(row.performance5D)}</span></td>
              <td>{row.rsi14 === null ? DATA_UNAVAILABLE : `${formatNumber(row.rsi14)} (${row.rsiLabel})`}</td>
              <td>{row.signal}</td>
              <td><span className={badgeClass(scoreTone(row.totalScore))}>{row.totalScore}</span></td>
              <td>{row.warningCount === 0 ? "Clean" : `${row.warningCount} warning${row.warningCount === 1 ? "" : "s"}`}</td>
              <td>
                <div className="row-actions">
                  <button type="button" className="secondary mini" onClick={() => onAnalyse(row)}>Open</button>
                  <button type="button" className="secondary mini" onClick={() => onWatch(row)}>Watch</button>
                  <button type="button" className={compared.includes(row.ticker) ? "mini" : "secondary mini"} onClick={() => onCompare(row)}>
                    {compared.includes(row.ticker) ? "Added" : "Compare"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScreenerChartGrid({
  rows,
  chartMode,
  onAnalyse,
  onWatch,
  onCompare,
  compared
}: {
  rows: ScreenerRow[];
  chartMode: ChartMode;
  onAnalyse: (row: ScreenerRow) => void;
  onWatch: (row: ScreenerRow) => void;
  onCompare: (row: ScreenerRow) => void;
  compared: string[];
}) {
  if (rows.length === 0) {
    return <p className="empty-state">No stocks match the current screen.</p>;
  }

  return (
    <div className="screen-card-grid">
      {rows.map((row) => (
        <article key={`screen-card-${row.ticker}`} className="screen-card">
          <div className="section-heading">
            <div>
              <span>{row.region}</span>
              <h2>{row.ticker}</h2>
            </div>
            <span className={badgeClass(scoreTone(row.totalScore))}>{row.totalScore}</span>
          </div>
          <PriceChart
            rows={row.chartRows}
            mode={chartMode}
            currency={row.currency}
            range="3M"
            overlays={{ ma20: true, ma50: false, ma200: false }}
            indicatorPanel="Volume"
          />
          <div className="mini-metrics">
            <span>P/E {row.trailingPe === null ? DATA_UNAVAILABLE : formatNumber(row.trailingPe)}</span>
            <span>5D {formatPercent(row.performance5D)}</span>
            <span>RSI {formatNumber(row.rsi14)}</span>
          </div>
          <p>{row.companyName ?? DATA_UNAVAILABLE}</p>
          <div className="row-actions">
            <button type="button" className="secondary mini" onClick={() => onAnalyse(row)}>Open</button>
            <button type="button" className="secondary mini" onClick={() => onWatch(row)}>Watch</button>
            <button type="button" className={compared.includes(row.ticker) ? "mini" : "secondary mini"} onClick={() => onCompare(row)}>
              {compared.includes(row.ticker) ? "Added" : "Compare"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ScreenerPanel({
  response,
  rows,
  filters,
  loading,
  error,
  preset,
  viewMode,
  chartMode,
  compared,
  savedScreens,
  screenName,
  onFiltersChange,
  onPresetChange,
  onViewModeChange,
  onChartModeChange,
  onScreenNameChange,
  onSaveScreen,
  onApplySavedScreen,
  onDeleteSavedScreen,
  onRun,
  onAnalyse,
  onWatch,
  onCompare
}: {
  response: ScreenerResponse | null;
  rows: ScreenerRow[];
  filters: ScreenerFilters;
  loading: boolean;
  error: string | null;
  preset: ScreenPreset;
  viewMode: ScreenerViewMode;
  chartMode: ChartMode;
  compared: string[];
  savedScreens: SavedScreen[];
  screenName: string;
  onFiltersChange: (filters: ScreenerFilters) => void;
  onPresetChange: (preset: ScreenPreset) => void;
  onViewModeChange: (mode: ScreenerViewMode) => void;
  onChartModeChange: (mode: ChartMode) => void;
  onScreenNameChange: (name: string) => void;
  onSaveScreen: () => void;
  onApplySavedScreen: (screen: SavedScreen) => void;
  onDeleteSavedScreen: (id: string) => void;
  onRun: (refresh?: boolean) => void;
  onAnalyse: (row: ScreenerRow) => void;
  onWatch: (row: ScreenerRow) => void;
  onCompare: (row: ScreenerRow) => void;
}) {
  const totalWarnings = response?.warnings.length ?? 0;

  return (
    <div className="panel-stack">
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Discovery hub</span>
            <h2>Screener Builder</h2>
          </div>
          <div className="row-actions">
            <button type="button" onClick={() => onRun(false)} disabled={loading}>
              {loading ? "Screening..." : "Run Screen"}
            </button>
            <button type="button" className="secondary" onClick={() => onRun(true)} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>
        <div className="preset-row">
          {(["balanced", "value", "momentum", "quality"] as ScreenPreset[]).map((item) => (
            <button
              key={item}
              type="button"
              className={preset === item ? "active" : "secondary"}
              onClick={() => onPresetChange(item)}
            >
              {item === "balanced" ? "Balanced" : item === "value" ? "Value Near Lows" : item === "momentum" ? "Momentum Leaders" : "High Quality"}
            </button>
          ))}
        </div>
        <div className="saved-screen-row">
          <label>
            <span>Save current screen</span>
            <input
              value={screenName}
              placeholder="My screen"
              onChange={(event) => onScreenNameChange(event.target.value)}
            />
          </label>
          <button type="button" className="secondary" onClick={onSaveScreen}>
            Save Screen
          </button>
          {savedScreens.length > 0 ? (
            <div className="saved-screen-list" aria-label="Saved screens">
              {savedScreens.map((screen) => (
                <span key={screen.id}>
                  <button type="button" className="secondary mini" onClick={() => onApplySavedScreen(screen)}>
                    {screen.name}
                  </button>
                  <button type="button" className="secondary mini icon-button" onClick={() => onDeleteSavedScreen(screen.id)} aria-label={`Delete ${screen.name}`}>
                    x
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="screener-controls">
          <label>
            <span>Search results</span>
            <input
              value={filters.search}
              placeholder="Ticker, sector, country"
              onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
            />
          </label>
          <label>
            <span>Region</span>
            <select value={filters.region} onChange={(event) => onFiltersChange({ ...filters, region: event.target.value as Region | "All" })}>
              <option value="All">All</option>
              {REGIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Minimum total score</span>
            <input
              type="number"
              min="0"
              max="100"
              value={filters.minTotalScore}
              onChange={(event) => onFiltersChange({ ...filters, minTotalScore: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Max trailing P/E</span>
            <input
              value={filters.maxPe}
              placeholder="Any"
              onChange={(event) => onFiltersChange({ ...filters, maxPe: event.target.value })}
            />
          </label>
          <label>
            <span>Min data quality</span>
            <input
              type="number"
              min="0"
              max="100"
              value={filters.minDataQuality}
              onChange={(event) => onFiltersChange({ ...filters, minDataQuality: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Min market cap USD</span>
            <input
              value={filters.minMarketCapUsd}
              placeholder="Any"
              onChange={(event) => onFiltersChange({ ...filters, minMarketCapUsd: event.target.value })}
            />
          </label>
          <label>
            <span>Sort by</span>
            <select value={filters.sortBy} onChange={(event) => onFiltersChange({ ...filters, sortBy: event.target.value as ScreenerSortKey })}>
              <option value="totalScore">Total score</option>
              <option value="valueScore">Value score</option>
              <option value="momentumScore">Momentum score</option>
              <option value="dataQualityScore">Data quality</option>
              <option value="performance5D">5D performance</option>
              <option value="percentFromLow">% from low</option>
              <option value="trailingPe">P/E</option>
              <option value="marketCapUsd">Market cap</option>
            </select>
          </label>
          <label>
            <span>Direction</span>
            <select value={filters.sortDirection} onChange={(event) => onFiltersChange({ ...filters, sortDirection: event.target.value as "asc" | "desc" })}>
              <option value="desc">High to low</option>
              <option value="asc">Low to high</option>
            </select>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={filters.nearLowOnly}
              onChange={(event) => onFiltersChange({ ...filters, nearLowOnly: event.target.checked })}
            />
            <span>Within 10% of low</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={filters.passingFiltersOnly}
              onChange={(event) => onFiltersChange({ ...filters, passingFiltersOnly: event.target.checked })}
            />
            <span>Regional filters pass</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={filters.sourceCleanOnly}
              onChange={(event) => onFiltersChange({ ...filters, sourceCleanOnly: event.target.checked })}
            />
            <span>No source warnings</span>
          </label>
        </div>
        <div className="toolbar-row">
          <div className="segmented">
            <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => onViewModeChange("table")}>Table</button>
            <button type="button" className={viewMode === "charts" ? "active" : ""} onClick={() => onViewModeChange("charts")}>Charts</button>
          </div>
          <div className="segmented">
            <button type="button" className={chartMode === "line" ? "active" : ""} onClick={() => onChartModeChange("line")}>Line</button>
            <button type="button" className={chartMode === "candles" ? "active" : ""} onClick={() => onChartModeChange("candles")}>Candles</button>
          </div>
          <span>{response ? `${rows.length} of ${response.rows.length} results` : "Run a screen to load live public-source rows."}</span>
          {totalWarnings > 0 ? <span className="source-warning">{totalWarnings} source warnings</span> : null}
        </div>
        {error ? <p className="error-copy">{error}</p> : null}
      </section>
      {loading ? (
        <section className="loading-state"><div /><div /><div /></section>
      ) : viewMode === "table" ? (
        <ScreenerResultsTable rows={rows} onAnalyse={onAnalyse} onWatch={onWatch} onCompare={onCompare} compared={compared} />
      ) : (
        <ScreenerChartGrid rows={rows} chartMode={chartMode} onAnalyse={onAnalyse} onWatch={onWatch} onCompare={onCompare} compared={compared} />
      )}
    </div>
  );
}

function WatchlistPanel({
  watchlist,
  rows,
  loading,
  syncStatus,
  syncError,
  onRefresh,
  onRemove,
  onAnalyse,
  onCompare
}: {
  watchlist: WatchlistItem[];
  rows: ScreenerRow[];
  loading: boolean;
  syncStatus: SourceStatus | null;
  syncError: string | null;
  onRefresh: () => void;
  onRemove: (ticker: string) => void;
  onAnalyse: (item: WatchlistItem) => void;
  onCompare: (row: ScreenerRow) => void;
}) {
  const rowByTicker = new Map(rows.map((row) => [row.ticker, row]));

  return (
    <div className="panel-stack">
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Personal workspace</span>
            <h2>Watchlists</h2>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading || watchlist.length === 0}>
            {loading ? "Refreshing..." : "Refresh Watchlist"}
          </button>
        </div>
        <p className="source-note">
          {syncStatus?.detail ?? "Watchlist sync status is loading."}
          {syncError ? ` ${syncError}` : ""}
        </p>
        {watchlist.length === 0 ? (
          <p className="empty-state">Add stocks from Discovery or an open analysis to start a server-synced watchlist.</p>
        ) : (
          <div className="watch-grid">
            {watchlist.map((item) => {
              const row = rowByTicker.get(item.ticker);
              return (
                <article key={`watch-${item.ticker}`}>
                  <div className="section-heading">
                    <div>
                      <span>{item.region}</span>
                      <h2>{item.ticker}</h2>
                    </div>
                    <span className={badgeClass(scoreTone(row?.totalScore ?? 0))}>
                      {row ? row.totalScore : DATA_UNAVAILABLE}
                    </span>
                  </div>
                  <p>{row?.companyName ?? "Run refresh to load public-source data."}</p>
                  <div className="mini-metrics">
                    <span>Price {row ? formatMoney(row.latestClose, row.currency) : DATA_UNAVAILABLE}</span>
                    <span>5D {row ? formatPercent(row.performance5D) : DATA_UNAVAILABLE}</span>
                    <span>Data {row ? `${row.dataQualityScore}%` : DATA_UNAVAILABLE}</span>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="secondary mini" onClick={() => onAnalyse(item)}>Open</button>
                    {row ? <button type="button" className="secondary mini" onClick={() => onCompare(row)}>Compare</button> : null}
                    <button type="button" className="secondary mini" onClick={() => onRemove(item.ticker)}>Remove</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function PortfolioPanel({
  response,
  form,
  loading,
  error,
  onFormChange,
  onSubmit,
  onRefresh,
  onRemove,
  onAnalyse
}: {
  response: PortfolioResponse | null;
  form: PortfolioForm;
  loading: boolean;
  error: string | null;
  onFormChange: (form: PortfolioForm) => void;
  onSubmit: () => void;
  onRefresh: (refresh?: boolean) => void;
  onRemove: (id: string) => void;
  onAnalyse: (ticker: string, region: Region) => void;
}) {
  const rows = response?.rows ?? [];

  return (
    <div className="panel-stack">
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Server-synced workspace</span>
            <h2>Portfolio</h2>
          </div>
          <div className="row-actions">
            <button type="button" onClick={() => onRefresh(false)} disabled={loading}>
              {loading ? "Loading..." : "Load Portfolio"}
            </button>
            <button type="button" className="secondary" onClick={() => onRefresh(true)} disabled={loading}>
              Refresh Prices
            </button>
          </div>
        </div>
        <div className="portfolio-form">
          <div className="field-group">
            <label>Ticker</label>
            <input value={form.ticker} onChange={(event) => onFormChange({ ...form, ticker: event.target.value })} placeholder="AAPL" />
          </div>
          <div className="field-group">
            <label>Region</label>
            <select value={form.region} onChange={(event) => onFormChange({ ...form, region: event.target.value as Region })}>
              {REGIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label>Quantity</label>
            <input value={form.quantity} onChange={(event) => onFormChange({ ...form, quantity: event.target.value })} inputMode="decimal" placeholder="10" />
          </div>
          <div className="field-group">
            <label>Avg cost</label>
            <input value={form.averageCost} onChange={(event) => onFormChange({ ...form, averageCost: event.target.value })} inputMode="decimal" placeholder="125.50" />
          </div>
          <div className="field-group">
            <label>Currency</label>
            <input value={form.currency} onChange={(event) => onFormChange({ ...form, currency: event.target.value })} placeholder="Auto" />
          </div>
          <div className="field-group">
            <label>Notes</label>
            <input value={form.notes} onChange={(event) => onFormChange({ ...form, notes: event.target.value })} placeholder="Optional" />
          </div>
          <button type="button" onClick={onSubmit} disabled={loading}>Add Holding</button>
        </div>
        {error ? <p className="error-copy">{error}</p> : null}
        <p className="source-note">{response?.status.detail ?? "Portfolio holdings are stored server-side for this app instance."}</p>
      </section>
      <div className="metric-grid four">
        <MetricCard label="Market value" value={formatMoney(response?.totals.marketValue, rows[0]?.currency ?? "USD")} />
        <MetricCard label="Cost basis" value={formatMoney(response?.totals.costBasis, rows[0]?.currency ?? "USD")} />
        <MetricCard label="Unrealized P/L" value={formatMoney(response?.totals.unrealizedPnl, rows[0]?.currency ?? "USD")} />
        <MetricCard label="P/L %" value={formatPercent(response?.totals.unrealizedPnlPercent)} />
      </div>
      <section className="content-band">
        {rows.length === 0 ? (
          <p className="empty-state">Add a holding to start tracking valuation and unrealized P/L.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Company</th>
                  <th>Qty</th>
                  <th>Avg cost</th>
                  <th>Latest</th>
                  <th>Market value</th>
                  <th>P/L</th>
                  <th>Sector</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.ticker}</strong></td>
                    <td>{row.companyName ?? DATA_UNAVAILABLE}</td>
                    <td>{formatNumber(row.quantity)}</td>
                    <td>{formatMoney(row.averageCost, row.currency)}</td>
                    <td>{formatMoney(row.latestClose, row.currency)}</td>
                    <td>{formatMoney(row.marketValue, row.currency)}</td>
                    <td>
                      <span className={badgeClass(metricTone(row.unrealizedPnl))}>
                        {formatMoney(row.unrealizedPnl, row.currency)} / {formatPercent(row.unrealizedPnlPercent)}
                      </span>
                    </td>
                    <td>{row.sector ?? DATA_UNAVAILABLE}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="secondary mini" onClick={() => onAnalyse(row.ticker, row.region)}>Open</button>
                        <button type="button" className="secondary mini" onClick={() => onRemove(row.id)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AlertsPanel({
  response,
  form,
  loading,
  error,
  onFormChange,
  onSubmit,
  onRefresh,
  onEvaluate,
  onRunScheduled,
  onRemove
}: {
  response: AlertsResponse | null;
  form: AlertForm;
  loading: boolean;
  error: string | null;
  onFormChange: (form: AlertForm) => void;
  onSubmit: () => void;
  onRefresh: () => void;
  onEvaluate: () => void;
  onRunScheduled: (force?: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const rules = response?.rules ?? [];
  const events = response?.events ?? [];
  const notifications = response?.notifications ?? [];
  const schedulerRuns = response?.schedulerRuns ?? [];
  const scheduler = response?.scheduler;

  return (
    <div className="panel-stack">
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Server-synced workspace</span>
            <h2>Alerts</h2>
          </div>
          <div className="row-actions">
            <button type="button" onClick={onRefresh} disabled={loading}>{loading ? "Loading..." : "Load Alerts"}</button>
            <button type="button" className="secondary" onClick={onEvaluate} disabled={loading}>Evaluate Now</button>
            <button type="button" className="secondary" onClick={() => onRunScheduled(false)} disabled={loading}>Run Due Checks</button>
          </div>
        </div>
        <div className="portfolio-form">
          <div className="field-group">
            <label>Ticker</label>
            <input value={form.ticker} onChange={(event) => onFormChange({ ...form, ticker: event.target.value })} placeholder="AAPL" />
          </div>
          <div className="field-group">
            <label>Region</label>
            <select value={form.region} onChange={(event) => onFormChange({ ...form, region: event.target.value as Region })}>
              {REGIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label>Metric</label>
            <select value={form.metric} onChange={(event) => onFormChange({ ...form, metric: event.target.value as AlertMetric })}>
              {(["price", "rsi14", "percentFromLow", "performance5D"] as AlertMetric[]).map((item) => (
                <option key={item} value={item}>{alertMetricLabel(item)}</option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label>Condition</label>
            <select value={form.operator} onChange={(event) => onFormChange({ ...form, operator: event.target.value as AlertOperator })}>
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>
          <div className="field-group">
            <label>Threshold</label>
            <input value={form.threshold} onChange={(event) => onFormChange({ ...form, threshold: event.target.value })} inputMode="decimal" placeholder="70" />
          </div>
          <div className="field-group">
            <label>Schedule</label>
            <select value={form.schedule} onChange={(event) => onFormChange({ ...form, schedule: event.target.value as AlertSchedule })}>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <button type="button" onClick={onSubmit} disabled={loading}>Add Alert</button>
        </div>
        {error ? <p className="error-copy">{error}</p> : null}
        <p className="source-note">{response?.status.detail ?? "Alerts are persisted server-side. Scheduled checks run while this app page is active."}</p>
      </section>
      <div className="metric-grid four">
        <MetricCard
          label="Scheduler"
          value={scheduler?.enabled ? "Active" : "Idle"}
          subvalue={scheduler?.detail ?? "Add an hourly or daily rule to activate local checks."}
        />
        <MetricCard label="Due rules" value={formatNumber(scheduler?.dueRules)} subvalue={scheduler?.intervalMinutes ? `Checks every ${scheduler.intervalMinutes} min while page is open` : "Local scheduler"} />
        <MetricCard
          label="Next check"
          value={scheduler?.dueRules ? "Due now" : formatOptionalDateTime(scheduler?.nextRunAt)}
          subvalue={`Last run ${formatOptionalDateTime(scheduler?.lastRunAt)}`}
        />
        <MetricCard label="Notifications" value={formatNumber(notifications.length)} subvalue={`${schedulerRuns.length} scheduler run${schedulerRuns.length === 1 ? "" : "s"} retained`} />
      </div>
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>{rules.length} rule{rules.length === 1 ? "" : "s"}</span>
            <h2>Alert Rules</h2>
          </div>
        </div>
        {rules.length === 0 ? (
          <p className="empty-state">Add a price, RSI, 52-week range, or 5D momentum rule to start monitoring.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Metric</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th>Schedule</th>
                  <th>Last evaluated</th>
                  <th>Next check</th>
                  <th>Last triggered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td><strong>{rule.ticker}</strong></td>
                    <td>{alertMetricLabel(rule.metric)}</td>
                    <td>{rule.operator} {formatAlertValue(rule.metric, rule.threshold)}</td>
                    <td><span className={badgeClass(rule.enabled ? "ok" : "warning")}>{rule.enabled ? "Enabled" : "Paused"}</span></td>
                    <td>{alertScheduleLabel(rule.schedule)}</td>
                    <td>{formatOptionalDateTime(rule.lastEvaluatedAt)}</td>
                    <td>{formatOptionalDateTime(rule.nextEvaluationAt)}</td>
                    <td>{formatOptionalDateTime(rule.lastTriggeredAt)}</td>
                    <td><button type="button" className="secondary mini" onClick={() => onRemove(rule.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>{notifications.length} notification{notifications.length === 1 ? "" : "s"}</span>
            <h2>Notifications</h2>
          </div>
        </div>
        {notifications.length === 0 ? (
          <p className="empty-state">No alert notifications have been delivered yet.</p>
        ) : (
          <div className="timeline-list compact">
            {notifications.slice(0, 12).map((notification) => (
              <article key={notification.id}>
                <span>{formatDateTime(notification.deliveredAt)} · {notification.status}</span>
                <strong>{notification.title}</strong>
                <p>{notification.message}</p>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>{events.length} event{events.length === 1 ? "" : "s"}</span>
            <h2>Alert Events</h2>
          </div>
        </div>
        {events.length === 0 ? (
          <p className="empty-state">No alert events have fired yet.</p>
        ) : (
          <div className="timeline-list">
            {events.slice(0, 12).map((event) => (
              <article key={event.id}>
                <span>{formatDateTime(event.triggeredAt)}</span>
                <strong>{event.message}</strong>
                <p>Actual: {formatAlertValue(event.metric, event.actual)} · Threshold: {formatAlertValue(event.metric, event.threshold)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>{schedulerRuns.length} run{schedulerRuns.length === 1 ? "" : "s"}</span>
            <h2>Scheduler Runs</h2>
          </div>
        </div>
        {schedulerRuns.length === 0 ? (
          <p className="empty-state">No scheduler runs have been recorded yet.</p>
        ) : (
          <div className="timeline-list compact">
            {schedulerRuns.slice(0, 8).map((run) => (
              <article key={run.id}>
                <span>{formatDateTime(run.finishedAt)} · {run.trigger}</span>
                <strong>{run.rulesChecked} checked · {run.eventsCreated} event{run.eventsCreated === 1 ? "" : "s"} · {run.notificationsCreated} notification{run.notificationsCreated === 1 ? "" : "s"}</strong>
                <p>{run.warnings.length > 0 ? run.warnings.join(" ") : "Completed without source warnings."}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PrivacyPanel({
  workspaceExport,
  readiness,
  loading,
  error,
  message,
  deleteConfirm,
  onDeleteConfirmChange,
  onExport,
  onDelete,
  onRefresh
}: {
  workspaceExport: WorkspaceExportResponse | null;
  readiness: DeploymentReadinessResponse | null;
  loading: boolean;
  error: string | null;
  message: string | null;
  deleteConfirm: string;
  onDeleteConfirmChange: (value: string) => void;
  onExport: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const storage = workspaceExport?.storage;
  const privacy = workspaceExport?.privacy;
  const auditEvents = workspaceExport?.data.auditEvents ?? [];
  const consentHistory = privacy?.consentHistory ?? [];
  const cloudSync = readiness?.cloudSync;
  const hostedWorker = readiness?.hostedWorker;

  return (
    <div className="panel-stack">
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Security and privacy</span>
            <h2>GDPR Controls</h2>
          </div>
          <div className="row-actions">
            <button type="button" onClick={onRefresh} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
            <a className="secondary button-link" href="/privacy" target="_blank" rel="noreferrer">
              Privacy Notice
            </a>
          </div>
        </div>
        <p className="source-note">
          This workspace stores only user-entered watchlist, portfolio, alert, and preference data. No advertising cookies or third-party analytics are enabled.
        </p>
        {error ? <p className="error-copy">{error}</p> : null}
        {message ? <p className="success-copy">{message}</p> : null}
      </section>

      <div className="metric-grid four">
        <MetricCard label="Storage" value={storage?.provider ?? DATA_UNAVAILABLE} subvalue={storage?.cloudReady ? "Cloud adapter-ready" : "Local only"} />
        <MetricCard label="Encryption" value={storage?.encryptionAtRest ?? DATA_UNAVAILABLE} subvalue={storage?.keyManagement ?? "Key status unavailable"} />
        <MetricCard label="Auth" value={storage?.authEnabled ? "Enabled" : "Not configured"} subvalue="Required before hosted sync" />
        <MetricCard label="Retention" value={storage?.retentionDays ? `${storage.retentionDays} days` : DATA_UNAVAILABLE} subvalue={storage?.plaintextMigration ? "Plaintext migrated this session" : "Encrypted store active"} />
        <MetricCard label="Analytics" value={privacy?.consent.analytics ? "Opted in" : "Off"} subvalue="Default off" />
        <MetricCard label="Email briefs" value={privacy?.consent.emailBriefs ? "Opted in" : "Off"} subvalue="Default off" />
      </div>

      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Deployment readiness</span>
            <h2>Cloud Sync and Hosted Worker</h2>
          </div>
          <span className={badgeClass(readiness?.status.status ?? "warning")}>{readiness?.status.status ?? "Pending"}</span>
        </div>
        <div className="metric-grid four">
          <MetricCard label="Cloud sync" value={cloudSync?.configured ? "Configured" : "Local adapter"} subvalue={cloudSync?.detail ?? "Readiness status unavailable"} />
          <MetricCard label="Database driver" value={cloudSync?.driver ?? DATA_UNAVAILABLE} subvalue={cloudSync?.migrationPath ? `Schema v${cloudSync.schemaVersion} · ${cloudSync.migrationPath}` : "Migration status unavailable"} />
          <MetricCard label="Hosted worker" value={hostedWorker?.configured ? "Armed" : "Not configured"} subvalue={hostedWorker?.detail ?? "Readiness status unavailable"} />
          <MetricCard label="Worker endpoint" value={hostedWorker?.endpoint ? "/api/alerts/worker" : DATA_UNAVAILABLE} subvalue={hostedWorker?.auth ?? "Bearer secret"} />
          <MetricCard label="GDPR controls" value={readiness?.gdpr.exportEnabled && readiness.gdpr.deleteEnabled ? "Enabled" : DATA_UNAVAILABLE} subvalue="Export, erasure, consent history, audit trail" />
        </div>
        {readiness?.warnings.length ? (
          <div className="info-grid">
            {readiness.warnings.map((warning) => (
              <p key={warning}>
                <strong>Readiness gap</strong>
                {warning}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Data subject rights</span>
            <h2>Access, Portability, Erasure</h2>
          </div>
          <button type="button" onClick={onExport} disabled={loading}>
            Export Workspace JSON
          </button>
        </div>
        <div className="info-grid">
          {(privacy?.rights ?? ["Access/export", "Rectification", "Erasure", "Portability"]).map((right) => (
            <p key={right}>
              <strong>{right}</strong>
              Available in this app instance
            </p>
          ))}
        </div>
      </section>

      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Security evidence</span>
            <h2>Storage and Audit Trail</h2>
          </div>
        </div>
        <div className="info-grid">
          {(privacy?.dataCategories ?? []).map((category) => (
            <p key={category}>
              <strong>Data category</strong>
              {category}
            </p>
          ))}
        </div>
        {auditEvents.length > 0 ? (
          <div className="timeline-list compact">
            {auditEvents.slice(0, 8).map((event) => (
              <article key={event.id}>
                <span>{formatDateTime(event.createdAt)} · {event.category}</span>
                <strong>{event.action}</strong>
                <p>{event.detail}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No workspace audit events yet.</p>
        )}
      </section>

      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Consent history</span>
            <h2>Optional Processing</h2>
          </div>
        </div>
        {consentHistory.length > 0 ? (
          <div className="timeline-list compact">
            {consentHistory.slice(0, 6).map((entry) => (
              <article key={`${entry.createdAt}-${entry.reason}`}>
                <span>{formatDateTime(entry.createdAt)}</span>
                <strong>{entry.reason}</strong>
                <p>
                  Analytics: {entry.consent.analytics ? "On" : "Off"} · Email briefs: {entry.consent.emailBriefs ? "On" : "Off"} · Product updates: {entry.consent.productUpdates ? "On" : "Off"}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No consent changes recorded yet. Optional processing remains off by default.</p>
        )}
      </section>

      <section className="content-band danger-zone">
        <div className="section-heading">
          <div>
            <span>Erasure</span>
            <h2>Delete Workspace Data</h2>
          </div>
        </div>
        <p className="source-note">Type DELETE to remove watchlist, portfolio, alert rules, alert events, and consent preferences from this app instance.</p>
        <div className="saved-screen-row">
          <div className="field-group">
            <label>Confirmation</label>
            <input value={deleteConfirm} onChange={(event) => onDeleteConfirmChange(event.target.value)} placeholder="DELETE" />
          </div>
          <button type="button" className="secondary" onClick={onDelete} disabled={loading || deleteConfirm !== "DELETE"}>
            Delete Workspace
          </button>
        </div>
      </section>

      {privacy?.warnings.length ? (
        <WarningPanel warnings={privacy.warnings} />
      ) : null}
    </div>
  );
}

function AuthPanel({
  session,
  form,
  loading,
  error,
  message,
  deleteConfirm,
  onFormChange,
  onDeleteConfirmChange,
  onRegister,
  onLogin,
  onLogout,
  onDeleteAccount,
  onRefresh
}: {
  session: AuthSessionResponse | null;
  form: AuthForm;
  loading: boolean;
  error: string | null;
  message: string | null;
  deleteConfirm: string;
  onFormChange: (form: AuthForm) => void;
  onDeleteConfirmChange: (value: string) => void;
  onRegister: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onRefresh: () => void;
}) {
  const authenticated = session?.authenticated === true;

  return (
    <div className="panel-stack">
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Secure workspace</span>
            <h2>Account and Sync Foundation</h2>
          </div>
          <div className="row-actions">
            <button type="button" onClick={onRefresh} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
            {authenticated ? (
              <button type="button" className="secondary" onClick={onLogout} disabled={loading}>
                Sign Out
              </button>
            ) : null}
          </div>
        </div>
        <p className="source-note">
          Local accounts use encrypted credentials and httpOnly signed sessions. Hosted cloud sync can plug into this workspace-owner boundary when a production identity provider is selected.
        </p>
        {error ? <p className="error-copy">{error}</p> : null}
        {message ? <p className="success-copy">{message}</p> : null}
      </section>

      <div className="metric-grid four">
        <MetricCard label="Session" value={authenticated ? "Signed in" : "Anonymous"} subvalue={session?.status.detail ?? "Session status unavailable"} />
        <MetricCard label="User" value={session?.user?.username ?? DATA_UNAVAILABLE} subvalue={session?.user?.lastLoginAt ? `Last login ${formatDateTime(session.user.lastLoginAt)}` : "No local user session"} />
        <MetricCard label="Workspace owner" value={session?.workspaceOwnerId ?? DATA_UNAVAILABLE} subvalue={session?.provider ?? "Provider unavailable"} />
        <MetricCard label="Cloud adapter" value={session?.cloudReady ? "Ready" : "Not ready"} subvalue="Auth boundary established" />
      </div>

      {!authenticated ? (
        <section className="content-band">
          <div className="section-heading">
            <div>
              <span>Local identity</span>
              <h2>Create or Sign In</h2>
            </div>
          </div>
          <div className="portfolio-form">
            <div className="field-group">
              <label>Username</label>
              <input
                value={form.username}
                onChange={(event) => onFormChange({ ...form, username: event.target.value })}
                autoComplete="username"
                placeholder="your-name"
              />
            </div>
            <div className="field-group">
              <label>Passphrase</label>
              <input
                value={form.passphrase}
                onChange={(event) => onFormChange({ ...form, passphrase: event.target.value })}
                type="password"
                autoComplete="current-password"
                placeholder="10+ characters"
              />
            </div>
            <button type="button" onClick={onLogin} disabled={loading}>
              Sign In
            </button>
            <button type="button" className="secondary" onClick={onRegister} disabled={loading}>
              Create Account
            </button>
          </div>
          <p className="source-note">
            Accounts are local to this machine. The passphrase is hashed with scrypt; account records are stored in encrypted local JSON.
          </p>
        </section>
      ) : (
        <section className="content-band">
          <div className="section-heading">
            <div>
              <span>Signed in</span>
              <h2>{session.user?.username}</h2>
            </div>
            <span className={badgeClass("ok")}>Workspace isolated</span>
          </div>
          <div className="info-grid">
            <p>
              <strong>Created</strong>
              {session.user?.createdAt ? formatDateTime(session.user.createdAt) : DATA_UNAVAILABLE}
            </p>
            <p>
              <strong>Last login</strong>
              {session.user?.lastLoginAt ? formatDateTime(session.user.lastLoginAt) : DATA_UNAVAILABLE}
            </p>
            <p>
              <strong>Sync scope</strong>
              Authenticated local workspace
            </p>
          </div>
        </section>
      )}

      {session?.warnings.length ? <WarningPanel warnings={session.warnings} /> : null}

      {authenticated ? (
        <section className="content-band danger-zone">
          <div className="section-heading">
            <div>
              <span>Erasure</span>
              <h2>Delete Local Account</h2>
            </div>
          </div>
          <p className="source-note">Type DELETE to remove this local account and its scoped workspace from this app instance.</p>
          <div className="saved-screen-row">
            <div className="field-group">
              <label>Confirmation</label>
              <input value={deleteConfirm} onChange={(event) => onDeleteConfirmChange(event.target.value)} placeholder="DELETE" />
            </div>
            <button type="button" className="secondary" onClick={onDeleteAccount} disabled={loading || deleteConfirm !== "DELETE"}>
              Delete Account
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ComparePanel({
  rows,
  onRemove,
  onAnalyse
}: {
  rows: ScreenerRow[];
  onRemove: (ticker: string) => void;
  onAnalyse: (row: ScreenerRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Comparison tool</span>
            <h2>Side-by-Side Matrix</h2>
          </div>
        </div>
        <p className="empty-state">Add up to {COMPARE_LIMIT} stocks from Discovery or Watchlist to compare verified metrics.</p>
      </section>
    );
  }

  return (
    <div className="panel-stack">
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Comparison tool</span>
            <h2>Side-by-Side Matrix</h2>
          </div>
        </div>
        <div className="compare-grid" style={{ gridTemplateColumns: `170px repeat(${rows.length}, minmax(190px, 1fr))` }}>
          <strong>Metric</strong>
          {rows.map((row) => (
            <article key={`compare-head-${row.ticker}`}>
              <strong>{row.ticker}</strong>
              <span>{row.companyName ?? DATA_UNAVAILABLE}</span>
              <div className="row-actions">
                <button type="button" className="secondary mini" onClick={() => onAnalyse(row)}>Open</button>
                <button type="button" className="secondary mini" onClick={() => onRemove(row.ticker)}>Remove</button>
              </div>
            </article>
          ))}
          {[
            ["Total score", (row: ScreenerRow) => `${row.totalScore}`],
            ["Value score", (row: ScreenerRow) => `${row.valueScore}`],
            ["Momentum score", (row: ScreenerRow) => `${row.momentumScore}`],
            ["Data confidence", (row: ScreenerRow) => `${row.dataQualityScore}%`],
            ["Latest close", (row: ScreenerRow) => formatMoney(row.latestClose, row.currency)],
            ["Market cap", (row: ScreenerRow) => formatMoney(row.marketCapUsd, "USD")],
            ["P/E", (row: ScreenerRow) => row.trailingPe === null ? DATA_UNAVAILABLE : formatNumber(row.trailingPe)],
            ["5D performance", (row: ScreenerRow) => formatPercent(row.performance5D)],
            ["RSI", (row: ScreenerRow) => row.rsi14 === null ? DATA_UNAVAILABLE : `${formatNumber(row.rsi14)} (${row.rsiLabel})`],
            ["Signal", (row: ScreenerRow) => row.signal],
            ["Warnings", (row: ScreenerRow) => `${row.warningCount}`]
          ].map(([label, getter]) => (
            <div key={`compare-${label}`} className="compare-row">
              <strong>{label as string}</strong>
              {rows.map((row) => <span key={`${label}-${row.ticker}`}>{(getter as (row: ScreenerRow) => string)(row)}</span>)}
            </div>
          ))}
        </div>
      </section>
      <div className="screen-card-grid">
        {rows.map((row) => (
          <article key={`compare-chart-${row.ticker}`} className="screen-card">
            <div className="section-heading">
              <div>
                <span>{row.region}</span>
                <h2>{row.ticker}</h2>
              </div>
            </div>
            <PriceChart
              rows={row.chartRows}
              mode="line"
              currency={row.currency}
              range="3M"
              overlays={{ ma20: true, ma50: false, ma200: false }}
              indicatorPanel="Volume"
            />
          </article>
        ))}
      </div>
    </div>
  );
}

function EventsPanel({
  response,
  loading,
  error,
  watchlistCount,
  onRun
}: {
  response: EventsResponse | null;
  loading: boolean;
  error: string | null;
  watchlistCount: number;
  onRun: (refresh?: boolean) => void;
}) {
  const rows = response?.rows ?? [];
  const verified = rows.filter((row) => row.status === "ok").length;

  return (
    <div className="panel-stack">
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Market calendar</span>
            <h2>Events</h2>
          </div>
          <div className="row-actions">
            <button type="button" onClick={() => onRun(false)} disabled={loading}>
              {loading ? "Loading..." : "Load Events"}
            </button>
            <button type="button" className="secondary" onClick={() => onRun(true)} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>
        <p className="empty-state">
          {watchlistCount > 0
            ? "Using your watchlist tickers. Earnings dates remain unavailable unless a public source verifies them."
            : "Using the PRD example tickers until you add watchlist names."}
        </p>
        {error ? <p className="error-copy">{error}</p> : null}
      </section>
      {loading ? (
        <section className="loading-state"><div /><div /><div /></section>
      ) : response ? (
        <>
          <div className="metric-grid three">
            <MetricCard label="Events checked" value={formatNumber(rows.length)} />
            <MetricCard label="Verified dates" value={formatNumber(verified)} />
            <MetricCard label="Warnings" value={formatNumber(response.warnings.length)} />
          </div>
          <StatusCards statuses={response.sourceStatuses} />
          <section className="content-band">
            <div className="section-heading">
              <div>
                <span>{formatDateTime(response.retrievedAt)}</span>
                <h2>Verified Event Rows</h2>
              </div>
            </div>
            <EventsTable rows={rows} />
          </section>
        </>
      ) : (
        <section className="empty-start">
          <strong>Load events to verify earnings dates from public-source fundamentals.</strong>
          <span>{DATA_UNAVAILABLE}</span>
        </section>
      )}
    </div>
  );
}

function EventsTable({ rows }: { rows: EventRow[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">Data unavailable.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Company</th>
            <th>Region</th>
            <th>Event</th>
            <th>Date</th>
            <th>Status</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`event-${row.ticker}-${row.eventType}`}>
              <td><strong>{row.ticker}</strong></td>
              <td>{row.companyName ?? DATA_UNAVAILABLE}</td>
              <td>{row.region}</td>
              <td>{row.eventType}</td>
              <td>{row.eventDate ? formatDateTime(row.eventDate) : DATA_UNAVAILABLE}</td>
              <td><span className={badgeClass(row.status)}>{row.status}</span></td>
              <td>
                {row.sourceUrl ? (
                  <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                    {row.source}
                  </a>
                ) : (
                  row.source
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValidationPanel({
  response,
  scope,
  loading,
  error,
  onScopeChange,
  onRun
}: {
  response: ValidationResponse | null;
  scope: ValidationScope;
  loading: boolean;
  error: string | null;
  onScopeChange: (scope: ValidationScope) => void;
  onRun: (refresh?: boolean) => void;
}) {
  const rows = response?.rows ?? [];
  const averageCoverage =
    rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.metricCoverage, 0) / rows.length);
  const averageConfidence =
    rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.sourceConfidence, 0) / rows.length);
  const stooqPrimary = rows.filter((row) => row.stooqStatus === "primary").length;
  const unavailableRows = rows.filter((row) => row.historyStatus === "error" || row.fundamentalsStatus === "error").length;

  return (
    <div className="panel-stack">
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Coverage lab</span>
            <h2>PRD Data Validation</h2>
          </div>
          <div className="row-actions">
            <button type="button" onClick={() => onRun(false)} disabled={loading}>
              {loading ? "Validating..." : "Run Validation"}
            </button>
            <button type="button" className="secondary" onClick={() => onRun(true)} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>
        <div className="toolbar-row">
          <label>
            <span>Scope</span>
            <select value={scope} onChange={(event) => onScopeChange(event.target.value as ValidationScope)}>
              <option value="examples">PRD examples</option>
              <option value="universe">Expanded universe</option>
            </select>
          </label>
          <span>
            {response
              ? `${rows.length} tickers validated from ${response.universe}`
              : "Run validation to audit public-source coverage."}
          </span>
        </div>
        {error ? <p className="error-copy">{error}</p> : null}
      </section>

      {loading ? (
        <section className="loading-state"><div /><div /><div /></section>
      ) : response ? (
        <>
          <div className="metric-grid four">
            <MetricCard label="Average coverage" value={`${averageCoverage}%`} />
            <MetricCard label="Average confidence" value={`${averageConfidence}%`} />
            <MetricCard label="Stooq primary rows" value={formatNumber(stooqPrimary)} />
            <MetricCard label="Needs attention" value={formatNumber(unavailableRows)} />
          </div>
          <StatusCards statuses={response.sourceStatuses} />
          <section className="content-band">
            <div className="section-heading">
              <div>
                <span>{formatDateTime(response.retrievedAt)}</span>
                <h2>Validation Results</h2>
              </div>
            </div>
            <ValidationTable rows={rows} />
          </section>
        </>
      ) : (
        <section className="empty-start">
          <strong>Run validation to see where the PRD ticker set is fully verified.</strong>
          <span>{DATA_UNAVAILABLE}</span>
        </section>
      )}
    </div>
  );
}

function ValidationTable({ rows }: { rows: ValidationRow[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">Data unavailable.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Company</th>
            <th>Region</th>
            <th>History</th>
            <th>Fundamentals</th>
            <th>Stooq</th>
            <th>Coverage</th>
            <th>Confidence</th>
            <th>Unavailable</th>
            <th>Warnings</th>
            <th>History Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`validation-${row.ticker}`}>
              <td><strong>{row.ticker}</strong></td>
              <td>{row.companyName ?? DATA_UNAVAILABLE}</td>
              <td>{row.region}</td>
              <td><span className={badgeClass(row.historyStatus)}>{row.historyStatus}</span></td>
              <td><span className={badgeClass(row.fundamentalsStatus)}>{row.fundamentalsStatus}</span></td>
              <td><span className={badgeClass(row.stooqStatus)}>{row.stooqStatus}</span></td>
              <td>{formatNumber(row.metricCoverage)}%</td>
              <td>{formatNumber(row.sourceConfidence)}%</td>
              <td>{row.unavailableMetrics.length > 0 ? row.unavailableMetrics.slice(0, 3).join(", ") : "None"}</td>
              <td>{formatNumber(row.warningCount)}</td>
              <td>
                {row.historySourceUrl ? (
                  <a href={row.historySourceUrl} target="_blank" rel="noreferrer">
                    {row.historyProvider ?? "Open"}
                  </a>
                ) : (
                  DATA_UNAVAILABLE
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({
  analysis,
  displayCurrency,
  chartMode,
  chartRange,
  chartOverlays,
  indicatorPanel,
  onChartModeChange,
  onChartRangeChange,
  onChartOverlayChange,
  onIndicatorPanelChange
}: {
  analysis: AnalysisResponse;
  displayCurrency: DisplayCurrency;
  chartMode: ChartMode;
  chartRange: ChartRange;
  chartOverlays: ChartOverlays;
  indicatorPanel: IndicatorPanelMode;
  onChartModeChange: (mode: ChartMode) => void;
  onChartRangeChange: (range: ChartRange) => void;
  onChartOverlayChange: (key: ChartOverlayKey, value: boolean) => void;
  onIndicatorPanelChange: (mode: IndicatorPanelMode) => void;
}) {
  const metrics = analysis.history?.metrics;
  const fundamentals = analysis.fundamentals;

  return (
    <div className="panel-stack">
      <div className="metric-grid">
        <MetricCard
          label="Latest close"
          value={metrics ? formatMoney(metrics.latestClose, fundamentals.currency) : DATA_UNAVAILABLE}
          subvalue={
            analysis.history?.stooqSymbol
              ? `${analysis.history.provider}: ${analysis.history.stooqSymbol}`
              : undefined
          }
        />
        <MetricCard label="52-week range" value={`${formatNumber(metrics?.low52Week)} - ${formatNumber(metrics?.high52Week)}`} />
        <MetricCard label="% from low" value={formatPercent(metrics?.percentFromLow)} />
        <MetricCard label="5D performance" value={formatPercent(metrics?.performance5D)} />
        <MetricCard label="Trailing P/E" value={fundamentals.trailingPe === null ? DATA_UNAVAILABLE : formatNumber(fundamentals.trailingPe)} />
        <MetricCard label="Market cap" value={formatMarketCap(fundamentals, displayCurrency)} subvalue={displayCurrency === "Local" ? "Local listing currency" : "FX converted public-source equivalent"} />
        <MetricCard label="Average volume" value={formatNumber(metrics?.averageVolume ?? fundamentals.averageVolume)} />
        <MetricCard label="Earnings date" value={fundamentals.earningsDate ? formatDateTime(fundamentals.earningsDate) : DATA_UNAVAILABLE} />
      </div>

      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Company</span>
            <h2>{fundamentals.companyName ?? analysis.ticker}</h2>
          </div>
          <span className={badgeClass("ok")}>Live public sources</span>
        </div>
        <div className="info-grid">
          <p>
            <strong>Ticker</strong>
            {analysis.ticker}
          </p>
          <p>
            <strong>Exchange</strong>
            {fundamentals.exchange ?? DATA_UNAVAILABLE}
          </p>
          <p>
            <strong>Country</strong>
            {fundamentals.country ?? DATA_UNAVAILABLE}
          </p>
          <p>
            <strong>Region</strong>
            {analysis.region}
          </p>
          <p>
            <strong>Sector</strong>
            {fundamentals.sector ?? DATA_UNAVAILABLE}
          </p>
          <p>
            <strong>Industry</strong>
            {fundamentals.industry ?? DATA_UNAVAILABLE}
          </p>
        </div>
      </section>

      <VisualScorecard analysis={analysis} />
      <FundamentalsV2Panel analysis={analysis} />
      <ChartWorkbench
        analysis={analysis}
        chartMode={chartMode}
        chartRange={chartRange}
        chartOverlays={chartOverlays}
        indicatorPanel={indicatorPanel}
        onChartModeChange={onChartModeChange}
        onChartRangeChange={onChartRangeChange}
        onChartOverlayChange={onChartOverlayChange}
        onIndicatorPanelChange={onIndicatorPanelChange}
      />
      <EventCalendar analysis={analysis} />
      <StatusCards statuses={analysis.sourceStatuses} />
      <WarningPanel warnings={analysis.warnings} />
    </div>
  );
}

function FundamentalsV2Panel({ analysis }: { analysis: AnalysisResponse }) {
  const items = fundamentalV2Items(analysis.fundamentals);
  const coverage = fundamentalV2Coverage(analysis.fundamentals);
  const unavailable = items.filter((item) => item.value === DATA_UNAVAILABLE).map((item) => item.label);

  return (
    <section className="content-band">
      <div className="section-heading">
        <div>
          <span>Fundamentals v2</span>
          <h2>Quality, Growth, Yield, Risk</h2>
        </div>
        <span className={badgeClass(scoreTone(coverage.percent))}>
          {coverage.available}/{coverage.total} verified
        </span>
      </div>
      <div className="fundamental-grid">
        {items.map((item) => (
          <article key={item.label}>
            <span>{item.group}</span>
            <strong>{item.value}</strong>
            <small>{item.label}</small>
          </article>
        ))}
      </div>
      <p className="source-note">
        Fundamentals v2 uses public structured fields where available. Missing values remain {DATA_UNAVAILABLE}
        {unavailable.length > 0 ? `: ${unavailable.slice(0, 5).join(", ")}${unavailable.length > 5 ? ", ..." : ""}.` : "."}
      </p>
    </section>
  );
}

function RecommendationPanel({ analysis }: { analysis: AnalysisResponse }) {
  const recommendation = analysis.recommendation;

  return (
    <div className="panel-stack">
      <section className="recommendation-band">
        <div>
          <span>Final rating</span>
          <h2>{recommendation.finalRating}</h2>
          <p>{recommendation.baseCase}</p>
        </div>
        <div className="score-ring">
          <strong>{recommendation.confidence}</strong>
          <span>confidence</span>
        </div>
      </section>

      <div className="metric-grid four">
        <MetricCard label="Value score" value={`${recommendation.scores.value}/100`} />
        <MetricCard label="Momentum score" value={`${recommendation.scores.momentum}/100`} />
        <MetricCard label="Data quality" value={`${recommendation.scores.dataQuality}/100`} />
        <MetricCard label="Total score" value={`${recommendation.scores.total}/100`} />
      </div>

      <div className="case-grid">
        <section>
          <h3>Bull Case</h3>
          <ul>{recommendation.bullCase.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h3>Bear Case</h3>
          <ul>{recommendation.bearCase.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h3>Catalysts</h3>
          <ul>{recommendation.catalysts.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h3>Risks</h3>
          <ul>
            {[...recommendation.fundamentalRisks, ...recommendation.technicalRisks].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="content-band">
        <span>Time horizon</span>
        <p>{recommendation.timeHorizon}</p>
      </section>
      <ScenarioPanel analysis={analysis} />
    </div>
  );
}

function TabContent({
  tab,
  analysis,
  displayCurrency,
  chartMode,
  chartRange,
  chartOverlays,
  indicatorPanel,
  onChartModeChange,
  onChartRangeChange,
  onChartOverlayChange,
  onIndicatorPanelChange
}: {
  tab: Tab;
  analysis: AnalysisResponse;
  displayCurrency: DisplayCurrency;
  chartMode: ChartMode;
  chartRange: ChartRange;
  chartOverlays: ChartOverlays;
  indicatorPanel: IndicatorPanelMode;
  onChartModeChange: (mode: ChartMode) => void;
  onChartRangeChange: (range: ChartRange) => void;
  onChartOverlayChange: (key: ChartOverlayKey, value: boolean) => void;
  onIndicatorPanelChange: (mode: IndicatorPanelMode) => void;
}) {
  if (tab === "Overview") {
    return (
      <Overview
        analysis={analysis}
        displayCurrency={displayCurrency}
        chartMode={chartMode}
        chartRange={chartRange}
        chartOverlays={chartOverlays}
        indicatorPanel={indicatorPanel}
        onChartModeChange={onChartModeChange}
        onChartRangeChange={onChartRangeChange}
        onChartOverlayChange={onChartOverlayChange}
        onIndicatorPanelChange={onIndicatorPanelChange}
      />
    );
  }

  if (tab === "Value Screen") {
    return (
      <div className="panel-stack">
        <section className="content-band">
          <div className="section-heading">
            <div>
              <span>Input stock</span>
              <h2>{analysis.ticker}</h2>
            </div>
            <span className={badgeClass(analysis.valueScreen.inputQualifies ? "Pass" : "Fail")}>
              {analysis.valueScreen.inputQualifies ? "Qualifies" : "Does not qualify"}
            </span>
          </div>
          <FilterTable criteria={analysis.filters.criteria} />
        </section>
        <section className="content-band">
          <div className="section-heading">
            <div>
              <span>{"Peers within 10% of 52-week low, P/E <= 10, passing filters"}</span>
              <h2>{analysis.valueScreen.peers.length} matches</h2>
            </div>
          </div>
          <PeerTable rows={analysis.valueScreen.peers} kind="value" />
        </section>
      </div>
    );
  }

  if (tab === "Momentum") {
    return (
      <section className="content-band">
        <div className="section-heading">
          <div>
            <span>Top peers by 5D performance</span>
            <h2>Momentum Rank</h2>
          </div>
        </div>
        <PeerTable rows={analysis.momentum.topPeers} kind="momentum" />
      </section>
    );
  }

  if (tab === "Cross-Analysis") {
    return (
      <div className="panel-stack">
        <div className="metric-grid three">
          <MetricCard label="Verified peers" value={formatNumber(analysis.crossAnalysis.peerCount)} />
          <MetricCard label="Value peers" value={formatNumber(analysis.crossAnalysis.valuePeerCount)} />
          <MetricCard label="Momentum peers" value={formatNumber(analysis.crossAnalysis.momentumPeerCount)} />
        </div>
        <section className="content-band">
          <h2>Cross-Analysis Notes</h2>
          <ul>{analysis.crossAnalysis.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
        <PeerMatrix analysis={analysis} />
      </div>
    );
  }

  if (tab === "Recommendation") {
    return <RecommendationPanel analysis={analysis} />;
  }

  if (tab === "Data Quality") {
    return (
      <div className="panel-stack">
        <DataQualityCommandCenter analysis={analysis} />
        <StatusCards statuses={analysis.sourceStatuses} />
        <section className="content-band">
          <h2>Regional Filters</h2>
          <FilterTable criteria={analysis.filters.criteria} />
        </section>
        <WarningPanel warnings={analysis.warnings} />
      </div>
    );
  }

  return (
    <section className="content-band">
      <SourcesTable records={analysis.sourceRecords} />
    </section>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function reportList(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function buildResearchReportHtml(analysis: AnalysisResponse, displayCurrency: DisplayCurrency): string {
  const metrics = analysis.history?.metrics;
  const coverage = fundamentalV2Coverage(analysis.fundamentals);
  const fundamentals = fundamentalV2Items(analysis.fundamentals);
  const peers = combinedPeers(analysis).slice(0, 8);
  const sourceRows = analysis.sourceRecords.slice(0, 24);
  const title = `${analysis.ticker} Research Report`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { background: #071017; color: #e8eef2; font: 14px/1.5 Inter, Arial, sans-serif; margin: 0; padding: 32px; }
    main { max-width: 1080px; margin: 0 auto; }
    section { border: 1px solid #2b3a45; margin: 0 0 16px; padding: 18px; }
    h1, h2 { margin: 0 0 8px; }
    h1 { font-size: 32px; }
    h2 { font-size: 18px; color: #d0a247; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .cell { background: #10161d; border: 1px solid #2b3a45; padding: 12px; }
    .cell span, th { color: #91a2ad; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .cell strong { display: block; font-size: 18px; margin-top: 4px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #2b3a45; padding: 8px; text-align: left; vertical-align: top; }
    a { color: #57a9ff; }
    .disclaimer { color: #d6a23d; font-weight: 700; }
  </style>
</head>
<body>
<main>
  <section>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(analysis.fundamentals.companyName ?? DATA_UNAVAILABLE)} · ${escapeHtml(analysis.region)} · Retrieved ${escapeHtml(formatDateTime(analysis.retrievedAt))}</p>
    <p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>
  </section>
  <section>
    <h2>Executive Summary</h2>
    <div class="grid">
      <div class="cell"><span>Final rating</span><strong>${escapeHtml(analysis.recommendation.finalRating)}</strong></div>
      <div class="cell"><span>Confidence</span><strong>${analysis.recommendation.confidence}%</strong></div>
      <div class="cell"><span>Total score</span><strong>${analysis.recommendation.scores.total}/100</strong></div>
      <div class="cell"><span>Data quality</span><strong>${analysis.recommendation.scores.dataQuality}/100</strong></div>
    </div>
    <p>${escapeHtml(analysis.recommendation.baseCase)}</p>
  </section>
  <section>
    <h2>Market Snapshot</h2>
    <div class="grid">
      <div class="cell"><span>Latest close</span><strong>${escapeHtml(formatMoney(metrics?.latestClose, analysis.fundamentals.currency))}</strong></div>
      <div class="cell"><span>52-week range</span><strong>${escapeHtml(`${formatNumber(metrics?.low52Week)} - ${formatNumber(metrics?.high52Week)}`)}</strong></div>
      <div class="cell"><span>5D performance</span><strong>${escapeHtml(formatPercent(metrics?.performance5D))}</strong></div>
      <div class="cell"><span>Market cap</span><strong>${escapeHtml(formatMarketCap(analysis.fundamentals, displayCurrency))}</strong></div>
    </div>
  </section>
  <section>
    <h2>Fundamentals v2 Coverage: ${coverage.available}/${coverage.total}</h2>
    <table><tbody>${fundamentals.map((item) => `<tr><th>${escapeHtml(item.label)}</th><td>${escapeHtml(item.value)}</td><td>${escapeHtml(item.group)}</td></tr>`).join("")}</tbody></table>
  </section>
  <section>
    <h2>Cases, Catalysts, Risks</h2>
    <h3>Bull Case</h3>${reportList(analysis.recommendation.bullCase)}
    <h3>Bear Case</h3>${reportList(analysis.recommendation.bearCase)}
    <h3>Catalysts</h3>${reportList(analysis.recommendation.catalysts)}
    <h3>Risks</h3>${reportList([...analysis.recommendation.fundamentalRisks, ...analysis.recommendation.technicalRisks])}
  </section>
  <section>
    <h2>Peer Snapshot</h2>
    <table>
      <thead><tr><th>Ticker</th><th>Company</th><th>5D</th><th>RSI</th><th>Signal</th></tr></thead>
      <tbody>${peers.map((peer) => `<tr><td>${escapeHtml(peer.ticker)}</td><td>${escapeHtml(peer.companyName ?? DATA_UNAVAILABLE)}</td><td>${escapeHtml(formatPercent(peer.performance5D))}</td><td>${escapeHtml(formatNumber(peer.rsi14))}</td><td>${escapeHtml(peer.signal)}</td></tr>`).join("")}</tbody>
    </table>
  </section>
  <section>
    <h2>Source Audit</h2>
    <table>
      <thead><tr><th>Metric</th><th>Value</th><th>Source</th><th>URL</th><th>Freshness</th></tr></thead>
      <tbody>${sourceRows.map((record) => `<tr><td>${escapeHtml(record.metric)}</td><td>${escapeHtml(record.value)}</td><td>${escapeHtml(record.source)}</td><td>${record.url ? `<a href="${escapeHtml(record.url)}">${escapeHtml(record.url)}</a>` : DATA_UNAVAILABLE}</td><td>${escapeHtml(record.freshness)}</td></tr>`).join("")}</tbody>
    </table>
  </section>
</main>
</body>
</html>`;
}

function ResearchReportBuilder({
  analysis,
  displayCurrency,
  onExportHtml,
  onPrint
}: {
  analysis: AnalysisResponse;
  displayCurrency: DisplayCurrency;
  onExportHtml: () => void;
  onPrint: () => void;
}) {
  const metrics = analysis.history?.metrics;
  const coverage = fundamentalV2Coverage(analysis.fundamentals);
  const peerRows = combinedPeers(analysis).slice(0, 5);

  return (
    <section className="report-builder" aria-label="Research report builder">
      <div className="section-heading">
        <div>
          <span>Research report</span>
          <h2>{analysis.ticker} Investment Note</h2>
        </div>
        <div className="row-actions">
          <button type="button" className="secondary" onClick={onPrint}>
            Export PDF
          </button>
          <button type="button" onClick={onExportHtml}>
            Export HTML
          </button>
        </div>
      </div>
      <div className="report-grid">
        <article>
          <span>Final rating</span>
          <strong>{analysis.recommendation.finalRating}</strong>
          <p>{analysis.recommendation.baseCase}</p>
        </article>
        <article>
          <span>Confidence</span>
          <strong>{analysis.recommendation.confidence}%</strong>
          <p>{analysis.recommendation.timeHorizon}</p>
        </article>
        <article>
          <span>Market snapshot</span>
          <strong>{formatMoney(metrics?.latestClose, analysis.fundamentals.currency)}</strong>
          <p>5D {formatPercent(metrics?.performance5D)} · Market cap {formatMarketCap(analysis.fundamentals, displayCurrency)}</p>
        </article>
        <article>
          <span>Fundamentals v2</span>
          <strong>{coverage.available}/{coverage.total}</strong>
          <p>Verified public-source fields; missing metrics remain {DATA_UNAVAILABLE}.</p>
        </article>
      </div>
      <div className="report-columns">
        <section>
          <h3>Bull Case</h3>
          <ul>{analysis.recommendation.bullCase.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h3>Bear Case</h3>
          <ul>{analysis.recommendation.bearCase.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h3>Catalysts</h3>
          <ul>{analysis.recommendation.catalysts.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h3>Source Audit</h3>
          <ul>
            <li>{analysis.sourceRecords.length} source records</li>
            <li>{analysis.warnings.length} warning{analysis.warnings.length === 1 ? "" : "s"}</li>
            <li>{peerRows.length} peer rows in report preview</li>
          </ul>
        </section>
      </div>
    </section>
  );
}

function LandingPage({ onOpen }: { onOpen: (view: WorkspaceView, options?: OpenWorkspaceOptions) => void }) {
  const modules: Array<{ view: WorkspaceView; title: string }> = [
    {
      view: "Discover",
      title: "Discover"
    },
    {
      view: "Analyse",
      title: "Analyse"
    },
    {
      view: "Watchlist",
      title: "Watchlist"
    },
    {
      view: "Portfolio",
      title: "Portfolio"
    },
    {
      view: "Alerts",
      title: "Alerts"
    },
    {
      view: "Compare",
      title: "Compare"
    },
    {
      view: "Events",
      title: "Events"
    },
    {
      view: "Validate",
      title: "Validate"
    },
    {
      view: "Auth",
      title: "Account"
    },
    {
      view: "Privacy",
      title: "Privacy"
    },
  ];

  return (
    <section className="landing-hero">
      <div className="market-scene" aria-hidden="true">
        <div className="chart-field">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} style={{ height: `${24 + ((index * 13) % 58)}%` }} />
          ))}
        </div>
      </div>

      <nav className="landing-nav" aria-label="Landing navigation">
        <strong>Stock Analyser</strong>
        <div>
          <button type="button" className="secondary" onClick={() => onOpen("Discover")}>
            Run screener
          </button>
          <button type="button" className="secondary" onClick={() => onOpen("Analyse", { resetAnalysisInput: true })}>
            Analyse stock
          </button>
          <button type="button" className="secondary" onClick={() => onOpen("Portfolio")}>
            Portfolio
          </button>
          <button type="button" className="secondary" onClick={() => onOpen("Alerts")}>
            Alerts
          </button>
        </div>
      </nav>

      <div className="landing-copy">
        <span className="eyebrow">Global equity workspace</span>
        <h1>Stock Analyser</h1>
        <p>
          Discover, analyse, compare, monitor portfolios, and source-audit global equities across the USA,
          India, Europe, and Asia-Pacific using free public data paths. Unverified metrics stay clearly marked as Data unavailable.
        </p>
        <div className="landing-actions">
          <button type="button" onClick={() => onOpen("Analyse", { resetAnalysisInput: true })}>
            Open analyser
          </button>
          <button type="button" className="secondary" onClick={() => onOpen("Discover")}>
            Run screener
          </button>
          <button type="button" className="text-button" onClick={() => onOpen("Compare")}>
            Compare stocks
          </button>
          <button type="button" className="text-button" onClick={() => onOpen("Portfolio")}>
            Track portfolio
          </button>
          <button type="button" className="text-button" onClick={() => onOpen("Alerts")}>
            Manage alerts
          </button>
          <button type="button" className="text-button" onClick={() => onOpen("Validate")}>
            Validate coverage
          </button>
        </div>
      </div>

      <div className="landing-console" aria-label="Stock Analyser workspace modules">
        {modules.map((module) => (
          <button
            key={module.view}
            type="button"
            onClick={() => onOpen(module.view, module.view === "Analyse" ? { resetAnalysisInput: true } : undefined)}
            aria-label={`Open ${module.title}`}
          >
            <span>{module.view}</span>
            <strong>{module.title}</strong>
            <small>Open</small>
          </button>
        ))}
      </div>

      <p className="landing-disclaimer">{DISCLAIMER}</p>
    </section>
  );
}

export function StockAnalyser({
  autoAnalyse = false,
  initialQuery = "",
  initialRegion = "USA",
  initialView = "Analyse"
}: StockAnalyserProps = {}) {
  useLocalHttpsSession();
  useGlobalErrorLogging();

  const [query, setQuery] = useState(initialQuery);
  const [region, setRegion] = useState<Region>(initialRegion);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(initialView);
  const [screenPreset, setScreenPreset] = useState<ScreenPreset>("balanced");
  const [screenerFilters, setScreenerFilters] = useState<ScreenerFilters>(presetFilters("balanced"));
  const [screenerResponse, setScreenerResponse] = useState<ScreenerResponse | null>(null);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerError, setScreenerError] = useState<string | null>(null);
  const [screenerViewMode, setScreenerViewMode] = useState<ScreenerViewMode>("table");
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>([]);
  const [screenName, setScreenName] = useState("");
  const [chartMode, setChartMode] = useState<ChartMode>("line");
  const [chartRange, setChartRange] = useState<ChartRange>("6M");
  const [chartOverlays, setChartOverlays] = useState<ChartOverlays>({ ma20: true, ma50: true, ma200: false });
  const [indicatorPanel, setIndicatorPanel] = useState<IndicatorPanelMode>("RSI");
  const [reportOpen, setReportOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistRows, setWatchlistRows] = useState<ScreenerRow[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistSyncStatus, setWatchlistSyncStatus] = useState<SourceStatus | null>(null);
  const [watchlistSyncError, setWatchlistSyncError] = useState<string | null>(null);
  const [portfolioResponse, setPortfolioResponse] = useState<PortfolioResponse | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [portfolioForm, setPortfolioForm] = useState<PortfolioForm>({
    ticker: "",
    region: "USA",
    quantity: "",
    averageCost: "",
    currency: "",
    notes: ""
  });
  const [alertsResponse, setAlertsResponse] = useState<AlertsResponse | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alertForm, setAlertForm] = useState<AlertForm>({
    ticker: "",
    region: "USA",
    metric: "price",
    operator: "above",
    threshold: "",
    schedule: "hourly"
  });
  const [authSession, setAuthSession] = useState<AuthSessionResponse | null>(null);
  const [authForm, setAuthForm] = useState<AuthForm>({ username: "", passphrase: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authDeleteConfirm, setAuthDeleteConfirm] = useState("");
  const [workspaceExport, setWorkspaceExport] = useState<WorkspaceExportResponse | null>(null);
  const [deploymentReadiness, setDeploymentReadiness] = useState<DeploymentReadinessResponse | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [validationScope, setValidationScope] = useState<ValidationScope>("examples");
  const [validationResponse, setValidationResponse] = useState<ValidationResponse | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [eventsResponse, setEventsResponse] = useState<EventsResponse | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("Local");
  const [symbolMatches, setSymbolMatches] = useState<SymbolMatch[]>(() =>
    initialQuery.trim() ? findKnownTickerMatches(initialQuery, 8) : []
  );
  const [symbolSearchLoading, setSymbolSearchLoading] = useState(false);
  const autoAnalysedRef = useRef(false);
  const tickerInputRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const tickerInputId = `${formId}-ticker`;
  const regionSelectId = `${formId}-region`;

  const examples = useMemo(() => SAMPLE_TICKERS.slice(0, 20), []);
  const filteredScreenerRows = useMemo(
    () => sortScreenerRows((screenerResponse?.rows ?? []).filter((row) => screenerMatches(row, screenerFilters)), screenerFilters),
    [screenerFilters, screenerResponse]
  );
  const compareRows = useMemo(() => {
    const rows = [
      ...(screenerResponse?.rows ?? []),
      ...watchlistRows,
      ...(analysis ? [screenerRowFromAnalysis(analysis)] : [])
    ];
    const byTicker = new Map(rows.map((row) => [row.ticker, row]));
    return compareTickers.map((ticker) => byTicker.get(ticker)).filter((row): row is ScreenerRow => row !== undefined);
  }, [analysis, compareTickers, screenerResponse, watchlistRows]);

  async function reloadWatchlistFromServer() {
    const response = await fetch("/api/watchlist", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Watchlist sync failed.");
    }
    const payload = (await response.json()) as WatchlistResponse;
    setWatchlist(payload.items);
    setWatchlistSyncStatus(payload.status);
    setWatchlistSyncError(null);
  }

  async function refreshWorkspaceAfterAuth() {
      setWatchlistRows([]);
      setPortfolioResponse(null);
      setAlertsResponse(null);
      setWorkspaceExport(null);
      setDeploymentReadiness(null);
      await reloadWatchlistFromServer();
  }

  async function loadAuthSession() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Session check failed.");
      }
      await response.json();
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      if (sessionResponse.ok) {
        setAuthSession((await sessionResponse.json()) as AuthSessionResponse);
      } else {
        setAuthSession(null);
      }
    } catch (requestError) {
      setAuthError(requestError instanceof Error ? requestError.message : "Session check failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  function clearInitialHomeInput() {
    if (initialQuery.trim()) {
      return;
    }
    setQuery("");
    setRegion("USA");
    setSymbolMatches([]);
    setSymbolSearchLoading(false);
    if (tickerInputRef.current) {
      tickerInputRef.current.value = "";
    }
  }

  useEffect(() => {
    void loadAuthSession();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadWatchlist() {
      try {
        const response = await fetch("/api/watchlist", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Watchlist sync failed.");
        }
        const payload = (await response.json()) as WatchlistResponse;
        if (cancelled) return;
        setWatchlist(payload.items);
        setWatchlistSyncStatus(payload.status);
        setWatchlistSyncError(null);

        const stored = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
        const localItems = stored ? (JSON.parse(stored) as WatchlistItem[]) : [];
        if (payload.items.length === 0 && localItems.length > 0) {
          await Promise.all(
            localItems
              .filter((item) => item.ticker && REGIONS.includes(item.region))
              .map((item) =>
                fetch("/api/watchlist", {
                  method: "POST",
                  body: JSON.stringify({ ticker: item.ticker, region: item.region }),
                  headers: { "content-type": "application/json" }
                })
              )
          );
          const migrated = await fetch("/api/watchlist", { cache: "no-store" });
          const migratedPayload = (await migrated.json()) as WatchlistResponse;
          if (!cancelled) setWatchlist(migratedPayload.items);
        }
      } catch (loadError) {
        setWatchlistSyncError(loadError instanceof Error ? loadError.message : "Watchlist sync failed.");
        try {
          const stored = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as WatchlistItem[];
            setWatchlist(parsed.filter((item) => item.ticker && REGIONS.includes(item.region)));
          }
        } catch {
          setWatchlist([]);
        }
      }
    }
    void loadWatchlist();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SAVED_SCREENS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SavedScreen[];
        setSavedScreens(parsed.filter((item) => item.id && item.name && item.filters));
      }
    } catch {
      setSavedScreens([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_SCREENS_STORAGE_KEY, JSON.stringify(savedScreens));
  }, [savedScreens]);

  useEffect(() => {
    if (initialQuery.trim()) {
      return;
    }

    clearInitialHomeInput();
    const frameId = window.requestAnimationFrame(clearInitialHomeInput);
    const timeoutId = window.setTimeout(clearInitialHomeInput, 250);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [initialQuery]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSymbolMatches([]);
      setSymbolSearchLoading(false);
      setRegion("USA");
      return;
    }

    const knownMatches = findKnownTickerMatches(trimmed, 8);
    setSymbolMatches(knownMatches);
    setRegion(bestRegionFromMatches(trimmed, knownMatches, "USA"));

    if (trimmed.length < 2) {
      setSymbolSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setSymbolSearchLoading(true);
      const params = new URLSearchParams({ q: trimmed });
      fetch(`/api/symbol-search?${params.toString()}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            return { matches: knownMatches } satisfies SymbolSearchResponse;
          }
          return (await response.json()) as SymbolSearchResponse;
        })
        .then((payload) => {
          const merged = mergeSymbolMatches(knownMatches, payload.matches ?? []);
          setSymbolMatches(merged);
          setRegion(bestRegionFromMatches(trimmed, merged, "USA"));
        })
        .catch((searchError) => {
          if (!(searchError instanceof DOMException && searchError.name === "AbortError")) {
            setSymbolMatches(knownMatches);
          }
        })
        .finally(() => setSymbolSearchLoading(false));
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

  function scrollToWorkspace() {
    document.getElementById("data-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openWorkspace(view: WorkspaceView, options: OpenWorkspaceOptions = {}) {
    if (view === "Analyse" && options.resetAnalysisInput) {
      clearInitialHomeInput();
    }
    setWorkspaceView(view);
    window.requestAnimationFrame(scrollToWorkspace);
  }

  function selectSymbolMatch(match: SymbolMatch) {
    setQuery(match.ticker);
    setRegion(match.region);
    setSymbolMatches([match]);
  }

  async function requestAnalysis(
    options: { refresh?: boolean } = {},
    override?: { query: string; region: Region }
  ) {
    setLoading(true);
    setError(null);
    const targetQuery = override?.query ?? query;
    const targetRegion = override?.region ?? region;

    const params = new URLSearchParams({
      ticker: targetQuery,
      region: targetRegion,
      refresh: options.refresh ? "1" : "0"
    });

    try {
      const response = await fetch(`/api/analyse?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Analysis failed.");
      }
      const payload = (await response.json()) as AnalysisResponse;
      setAnalysis(payload);
      setActiveTab("Overview");
      setReportOpen(false);
      setWorkspaceView("Analyse");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoAnalyse || autoAnalysedRef.current) {
      return;
    }

    autoAnalysedRef.current = true;
    setWorkspaceView("Analyse");
    void requestAnalysis({}, { query: initialQuery, region: initialRegion });
  }, [autoAnalyse, initialQuery, initialRegion]);

  async function runScreener(refresh = false) {
    setScreenerLoading(true);
    setScreenerError(null);

    const params = new URLSearchParams({
      refresh: refresh ? "1" : "0"
    });
    if (screenerFilters.region !== "All") {
      params.set("regions", screenerFilters.region);
    }

    try {
      const response = await fetch(`/api/screener?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Screener failed.");
      }
      const payload = (await response.json()) as ScreenerResponse;
      setScreenerResponse(payload);
    } catch (requestError) {
      setScreenerError(requestError instanceof Error ? requestError.message : "Screener failed.");
    } finally {
      setScreenerLoading(false);
    }
  }

  async function runValidation(refresh = false) {
    setValidationLoading(true);
    setValidationError(null);

    const params = new URLSearchParams({
      refresh: refresh ? "1" : "0",
      scope: validationScope
    });

    try {
      const response = await fetch(`/api/validate?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Validation failed.");
      }
      const payload = (await response.json()) as ValidationResponse;
      setValidationResponse(payload);
    } catch (requestError) {
      setValidationError(requestError instanceof Error ? requestError.message : "Validation failed.");
    } finally {
      setValidationLoading(false);
    }
  }

  async function runEvents(refresh = false) {
    setEventsLoading(true);
    setEventsError(null);

    const tickers = watchlist.length > 0 ? watchlist.map((item) => item.ticker).join(",") : "";
    const params = new URLSearchParams({
      refresh: refresh ? "1" : "0"
    });
    if (tickers) {
      params.set("tickers", tickers);
    }

    try {
      const response = await fetch(`/api/events?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Events failed.");
      }
      const payload = (await response.json()) as EventsResponse;
      setEventsResponse(payload);
    } catch (requestError) {
      setEventsError(requestError instanceof Error ? requestError.message : "Events failed.");
    } finally {
      setEventsLoading(false);
    }
  }

  function applyPreset(preset: ScreenPreset) {
    setScreenPreset(preset);
    setScreenerFilters(presetFilters(preset));
  }

  function saveCurrentScreen() {
    const name = screenName.trim() || `${screenPreset[0].toUpperCase()}${screenPreset.slice(1)} screen`;
    const saved: SavedScreen = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      filters: screenerFilters,
      createdAt: new Date().toISOString()
    };
    setSavedScreens((current) => [saved, ...current.filter((item) => item.name.toLowerCase() !== name.toLowerCase())].slice(0, 8));
    setScreenName("");
  }

  function applySavedScreen(screen: SavedScreen) {
    setScreenerFilters(screen.filters);
    setScreenPreset("balanced");
  }

  function deleteSavedScreen(id: string) {
    setSavedScreens((current) => current.filter((item) => item.id !== id));
  }

  function updateChartOverlay(key: ChartOverlayKey, value: boolean) {
    setChartOverlays((current) => ({ ...current, [key]: value }));
  }

  function exportAnalysisPdf() {
    window.print();
  }

  function exportResearchHtml() {
    if (!analysis) {
      return;
    }

    const html = buildResearchReportHtml(analysis, displayCurrency);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${analysis.ticker.toLowerCase()}-research-report.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function addToWatchlist(item: { ticker: string; region: Region }) {
    setWatchlist((current) => {
      if (current.some((entry) => entry.ticker === item.ticker)) {
        return current;
      }
      return [...current, { ticker: item.ticker, region: item.region, addedAt: new Date().toISOString() }];
    });
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        body: JSON.stringify(item),
        headers: { "content-type": "application/json" }
      });
      if (!response.ok) {
        throw new Error("Watchlist sync failed.");
      }
      const payload = (await response.json()) as WatchlistResponse;
      setWatchlist(payload.items);
      setWatchlistSyncStatus(payload.status);
      setWatchlistSyncError(null);
    } catch (syncError) {
      setWatchlistSyncError(syncError instanceof Error ? syncError.message : "Watchlist sync failed.");
    }
  }

  async function removeFromWatchlist(ticker: string) {
    setWatchlist((current) => current.filter((item) => item.ticker !== ticker));
    setWatchlistRows((current) => current.filter((row) => row.ticker !== ticker));
    try {
      const params = new URLSearchParams({ ticker });
      const response = await fetch(`/api/watchlist?${params.toString()}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Watchlist sync failed.");
      }
      const payload = (await response.json()) as WatchlistResponse;
      setWatchlist(payload.items);
      setWatchlistSyncStatus(payload.status);
      setWatchlistSyncError(null);
    } catch (syncError) {
      setWatchlistSyncError(syncError instanceof Error ? syncError.message : "Watchlist sync failed.");
    }
  }

  function toggleCompare(row: ScreenerRow) {
    setCompareTickers((current) => {
      if (current.includes(row.ticker)) {
        return current.filter((ticker) => ticker !== row.ticker);
      }
      return [...current.slice(Math.max(0, current.length - COMPARE_LIMIT + 1)), row.ticker];
    });
    setWorkspaceView("Compare");
  }

  async function openRow(row: ScreenerRow) {
    setQuery(row.ticker);
    setRegion(row.region);
    setWorkspaceView("Analyse");
    await requestAnalysis({}, { query: row.ticker, region: row.region });
  }

  async function openWatchlistItem(item: WatchlistItem) {
    setQuery(item.ticker);
    setRegion(item.region);
    setWorkspaceView("Analyse");
    await requestAnalysis({}, { query: item.ticker, region: item.region });
  }

  async function refreshWatchlist() {
    if (watchlist.length === 0) {
      return;
    }

    setWatchlistLoading(true);
    const rows: ScreenerRow[] = [];
    for (const item of watchlist) {
      try {
        const params = new URLSearchParams({ ticker: item.ticker, region: item.region });
        const response = await fetch(`/api/analyse?${params.toString()}`, { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as AnalysisResponse;
          rows.push(screenerRowFromAnalysis(payload));
        }
      } catch {
        // Keep the watchlist visible even if one ticker cannot be refreshed.
      }
    }
    setWatchlistRows(rows);
    setWatchlistLoading(false);
  }

  async function loadPortfolio(refresh = false) {
    setPortfolioLoading(true);
    setPortfolioError(null);
    try {
      const params = new URLSearchParams({ refresh: refresh ? "1" : "0" });
      const response = await fetch(`/api/portfolio?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Portfolio sync failed.");
      }
      setPortfolioResponse((await response.json()) as PortfolioResponse);
    } catch (requestError) {
      setPortfolioError(requestError instanceof Error ? requestError.message : "Portfolio sync failed.");
    } finally {
      setPortfolioLoading(false);
    }
  }

  async function savePortfolioHolding() {
    const quantity = Number(portfolioForm.quantity);
    const averageCost = Number(portfolioForm.averageCost);
    setPortfolioLoading(true);
    setPortfolioError(null);
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        body: JSON.stringify({
          ticker: portfolioForm.ticker,
          region: portfolioForm.region,
          quantity,
          averageCost,
          currency: portfolioForm.currency,
          notes: portfolioForm.notes
        }),
        headers: { "content-type": "application/json" }
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not save holding.");
      }
      setPortfolioResponse((await response.json()) as PortfolioResponse);
      setPortfolioForm({ ticker: "", region: "USA", quantity: "", averageCost: "", currency: "", notes: "" });
    } catch (requestError) {
      setPortfolioError(requestError instanceof Error ? requestError.message : "Could not save holding.");
    } finally {
      setPortfolioLoading(false);
    }
  }

  async function removePortfolioHolding(id: string) {
    setPortfolioLoading(true);
    setPortfolioError(null);
    try {
      const params = new URLSearchParams({ id });
      const response = await fetch(`/api/portfolio?${params.toString()}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not remove holding.");
      }
      setPortfolioResponse((await response.json()) as PortfolioResponse);
    } catch (requestError) {
      setPortfolioError(requestError instanceof Error ? requestError.message : "Could not remove holding.");
    } finally {
      setPortfolioLoading(false);
    }
  }

  async function loadAlerts(evaluate = false) {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const params = new URLSearchParams({ evaluate: evaluate ? "1" : "0" });
      const response = await fetch(`/api/alerts?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Alert sync failed.");
      }
      setAlertsResponse((await response.json()) as AlertsResponse);
    } catch (requestError) {
      setAlertsError(requestError instanceof Error ? requestError.message : "Alert sync failed.");
    } finally {
      setAlertsLoading(false);
    }
  }

  async function saveAlertRule() {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        body: JSON.stringify({
          ticker: alertForm.ticker,
          region: alertForm.region,
          metric: alertForm.metric,
          operator: alertForm.operator,
          threshold: Number(alertForm.threshold),
          enabled: true,
          schedule: alertForm.schedule
        }),
        headers: { "content-type": "application/json" }
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not save alert.");
      }
      setAlertsResponse((await response.json()) as AlertsResponse);
      setAlertForm({ ticker: "", region: "USA", metric: "price", operator: "above", threshold: "", schedule: "hourly" });
    } catch (requestError) {
      setAlertsError(requestError instanceof Error ? requestError.message : "Could not save alert.");
    } finally {
      setAlertsLoading(false);
    }
  }

  async function runScheduledAlerts(force = false) {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const schedulerResponse = await fetch("/api/alerts/scheduler", {
        method: "POST",
        body: JSON.stringify({ force }),
        headers: { "content-type": "application/json" }
      });
      if (!schedulerResponse.ok) {
        const payload = (await schedulerResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Scheduled alert check failed.");
      }
      const schedulerPayload = (await schedulerResponse.json()) as AlertSchedulerResponse;
      if (schedulerPayload.warnings.length > 0) {
        setAlertsError(schedulerPayload.warnings.join(" "));
      }

      const alerts = await fetch("/api/alerts?evaluate=0", { cache: "no-store" });
      if (!alerts.ok) {
        throw new Error("Alert refresh failed after scheduled check.");
      }
      setAlertsResponse((await alerts.json()) as AlertsResponse);
    } catch (requestError) {
      setAlertsError(requestError instanceof Error ? requestError.message : "Scheduled alert check failed.");
    } finally {
      setAlertsLoading(false);
    }
  }

  async function removeAlertRule(id: string) {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const params = new URLSearchParams({ id });
      const response = await fetch(`/api/alerts?${params.toString()}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not remove alert.");
      }
      setAlertsResponse((await response.json()) as AlertsResponse);
    } catch (requestError) {
      setAlertsError(requestError instanceof Error ? requestError.message : "Could not remove alert.");
    } finally {
      setAlertsLoading(false);
    }
  }

  async function submitAuth(mode: "login" | "register") {
    setAuthLoading(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        body: JSON.stringify(authForm),
        headers: { "content-type": "application/json" }
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? (mode === "login" ? "Sign in failed." : "Account creation failed."));
      }
      const payload = (await response.json()) as AuthSessionResponse;
      setAuthSession(payload);
      setAuthForm({ username: "", passphrase: "" });
      setAuthMessage(mode === "login" ? "Signed in. Workspace data is now scoped to this account." : "Account created. Workspace data is now scoped to this account.");
      await refreshWorkspaceAfterAuth();
    } catch (requestError) {
      setAuthError(requestError instanceof Error ? requestError.message : "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function logoutAuth() {
    setAuthLoading(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Sign out failed.");
      }
      await response.json();
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      setAuthSession(sessionResponse.ok ? ((await sessionResponse.json()) as AuthSessionResponse) : null);
      setAuthMessage("Signed out. Anonymous local workspace is active.");
      await refreshWorkspaceAfterAuth();
    } catch (requestError) {
      setAuthError(requestError instanceof Error ? requestError.message : "Sign out failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function deleteLocalAccount() {
    setAuthLoading(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      const response = await fetch("/api/auth/account?confirm=DELETE", { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Account deletion failed.");
      }
      setAuthSession((await response.json()) as AuthSessionResponse);
      setAuthDeleteConfirm("");
      setAuthMessage("Local account and scoped workspace deleted.");
      await refreshWorkspaceAfterAuth();
    } catch (requestError) {
      setAuthError(requestError instanceof Error ? requestError.message : "Account deletion failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadWorkspaceExport() {
    setPrivacyLoading(true);
    setPrivacyError(null);
    setPrivacyMessage(null);
    try {
      const [workspaceResponse, readinessResponse] = await Promise.all([
        fetch("/api/workspace", { cache: "no-store" }),
        fetch("/api/system/readiness", { cache: "no-store" })
      ]);
      if (!workspaceResponse.ok) {
        const payload = (await workspaceResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Workspace export failed.");
      }
      if (!readinessResponse.ok) {
        const payload = (await readinessResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Readiness check failed.");
      }
      setWorkspaceExport((await workspaceResponse.json()) as WorkspaceExportResponse);
      setDeploymentReadiness((await readinessResponse.json()) as DeploymentReadinessResponse);
    } catch (requestError) {
      setPrivacyError(requestError instanceof Error ? requestError.message : "Workspace export failed.");
    } finally {
      setPrivacyLoading(false);
    }
  }

  async function exportWorkspaceJson() {
    setPrivacyLoading(true);
    setPrivacyError(null);
    setPrivacyMessage(null);
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Workspace export failed.");
      }
      const payload = (await response.json()) as WorkspaceExportResponse;
      setWorkspaceExport(payload);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `stock-analyser-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setPrivacyMessage("Workspace export generated.");
    } catch (requestError) {
      setPrivacyError(requestError instanceof Error ? requestError.message : "Workspace export failed.");
    } finally {
      setPrivacyLoading(false);
    }
  }

  async function deleteWorkspace() {
    setPrivacyLoading(true);
    setPrivacyError(null);
    setPrivacyMessage(null);
    try {
      const response = await fetch("/api/workspace?confirm=DELETE", { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Workspace deletion failed.");
      }
      const payload = (await response.json()) as WorkspaceDeleteResponse;
      setWatchlist([]);
      setWatchlistRows([]);
      setPortfolioResponse(null);
      setAlertsResponse(null);
      setWorkspaceExport(null);
      setDeploymentReadiness(null);
      setDeleteConfirm("");
      setPrivacyMessage(payload.status.detail);
    } catch (requestError) {
      setPrivacyError(requestError instanceof Error ? requestError.message : "Workspace deletion failed.");
    } finally {
      setPrivacyLoading(false);
    }
  }

  useEffect(() => {
    if (workspaceView === "Portfolio" && !portfolioResponse && !portfolioLoading) {
      void loadPortfolio(false);
    }
    if (workspaceView === "Alerts" && !alertsResponse && !alertsLoading) {
      void loadAlerts(false);
    }
    if (workspaceView === "Privacy" && (!workspaceExport || !deploymentReadiness) && !privacyLoading) {
      void loadWorkspaceExport();
    }
  }, [workspaceView, portfolioResponse, portfolioLoading, alertsResponse, alertsLoading, workspaceExport, deploymentReadiness, privacyLoading]);

  useEffect(() => {
    if (!alertsResponse?.scheduler.enabled) {
      return;
    }

    let cancelled = false;
    async function runDueChecks() {
      if (document.visibilityState !== "visible") {
        return;
      }

      try {
        const schedulerResponse = await fetch("/api/alerts/scheduler", {
          method: "POST",
          body: JSON.stringify({ force: false }),
          headers: { "content-type": "application/json" }
        });
        if (!schedulerResponse.ok || cancelled) {
          return;
        }
        const schedulerPayload = (await schedulerResponse.json()) as AlertSchedulerResponse;
        const shouldReload = workspaceView === "Alerts" || schedulerPayload.run.eventsCreated > 0 || schedulerPayload.run.notificationsCreated > 0;
        if (shouldReload) {
          const alerts = await fetch("/api/alerts?evaluate=0", { cache: "no-store" });
          if (alerts.ok && !cancelled) {
            setAlertsResponse((await alerts.json()) as AlertsResponse);
          }
        } else if (!cancelled) {
          setAlertsResponse((current) =>
            current
              ? {
                  ...current,
                  retrievedAt: schedulerPayload.retrievedAt,
                  scheduler: schedulerPayload.scheduler,
                  schedulerRuns: [schedulerPayload.run, ...current.schedulerRuns].slice(0, 50),
                  warnings: schedulerPayload.warnings
                }
              : current
          );
        }
      } catch (scheduleError) {
        logClientError(scheduleError);
      }
    }

    const intervalMs = Math.max(1, alertsResponse.scheduler.intervalMinutes) * 60 * 1000;
    const intervalId = window.setInterval(() => void runDueChecks(), intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runDueChecks();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [alertsResponse?.scheduler.enabled, alertsResponse?.scheduler.intervalMinutes, workspaceView]);

  return (
    <main id="main-content">
      <LandingPage onOpen={openWorkspace} />
      <section id="data-workspace" className="workspace-shell">
        <div className="topbar">
          <div>
            <span className="eyebrow">Stock Analyser</span>
            <h1>Global Market Workstation</h1>
            <span className="version-pill">v{APP_VERSION} {APP_CODENAME}</span>
          </div>
          <div className="topbar-actions">
            <p>{DISCLAIMER}</p>
            <div className="segmented" aria-label="Display currency">
              {(["Local", "USD", "EUR"] as DisplayCurrency[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={displayCurrency === item ? "active" : ""}
                  title={`Show supported money fields in ${item}`}
                  aria-pressed={displayCurrency === item}
                  onClick={() => setDisplayCurrency(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <WorkstationStatus
          analysis={analysis}
          screenerResponse={screenerResponse}
          watchlistCount={watchlist.length}
          compareCount={compareTickers.length}
        />

        <nav className="product-nav" aria-label="Stock Analyser workspace">
          {(["Analyse", "Discover", "Watchlist", "Portfolio", "Alerts", "Compare", "Events", "Validate", "Auth", "Privacy"] as WorkspaceView[]).map((view) => (
            <button
              key={view}
              type="button"
              className={workspaceView === view ? "active" : "secondary"}
              onClick={() => openWorkspace(view)}
            >
              {view}
            </button>
          ))}
        </nav>

        {workspaceView === "Analyse" ? (
          <>
            <form
              className="search-row"
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                void requestAnalysis();
              }}
            >
              <div className="field-group search-field-main">
                <label htmlFor={tickerInputId}>Ticker or company</label>
                <input
                  id={tickerInputId}
                  ref={tickerInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="AAPL, RELIANCE.NS, ASML.AS"
                />
              </div>
              <div className="field-group search-field-region">
                <label htmlFor={regionSelectId}>Region</label>
                <select
                  id={regionSelectId}
                  value={query.trim() ? region : ""}
                  disabled
                  aria-readonly="true"
                  title="Region is inferred from the selected ticker match."
                >
                  <option value="">Auto-detect</option>
                  {REGIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="search-actions">
                <button type="submit" disabled={loading || !query.trim()}>
                  {loading ? "Analysing..." : "Analyse"}
                </button>
                <button type="button" className="secondary" disabled={loading || !query.trim()} onClick={() => void requestAnalysis({ refresh: true })}>
                  Refresh Data
                </button>
              </div>
            </form>

            {query.trim() ? (
              <div className="match-strip" aria-label="Ticker and company matches">
                <div>
                  <strong>Matches</strong>
                  <span>{symbolSearchLoading ? "Searching public symbols..." : `${symbolMatches.length} match${symbolMatches.length === 1 ? "" : "es"}`}</span>
                </div>
                {symbolMatches.length > 0 ? (
                  <div className="match-list">
                    {symbolMatches.map((match) => (
                      <button
                        key={`${match.source}-${match.ticker}`}
                        type="button"
                        className={normalizeTicker(query) === normalizeTicker(match.ticker) ? "active" : ""}
                        onClick={() => selectSymbolMatch(match)}
                      >
                        <strong>{match.ticker}</strong>
                        <span>{match.name ?? "Company name unavailable"}</span>
                        <small>
                          {match.region}{match.exchange ? ` · ${match.exchange}` : ""}
                          {match.confidence !== undefined ? ` · ${match.confidence}%` : ""}
                        </small>
                        <small>{match.primaryListing === "likely" ? "Likely primary listing" : "Verify listing"} · Stooq: {match.stooqSymbols?.[0] ?? DATA_UNAVAILABLE}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>No seeded match yet. Region falls back to ticker suffix detection, then USA.</p>
                )}
              </div>
            ) : null}

            <SymbolResolutionPanel query={query} matches={symbolMatches} loading={symbolSearchLoading} />

            <div className="example-row">
              {examples.map((example) => (
                <button
                  key={example.ticker}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setQuery(example.ticker);
                    setRegion(example.region);
                    void requestAnalysis({}, { query: example.ticker, region: example.region });
                  }}
                >
                  {example.ticker}
                </button>
              ))}
            </div>

            {analysis ? (
              <div className="analysis-toolbar">
                <span>{analysis.ticker} loaded from live public sources</span>
                <div className="row-actions">
                  <button type="button" className="secondary" onClick={() => addToWatchlist({ ticker: analysis.ticker, region: analysis.region })}>
                    Add to Watchlist
                  </button>
                  <button type="button" className="secondary" onClick={() => toggleCompare(screenerRowFromAnalysis(analysis))}>
                    Add to Compare
                  </button>
                  <button type="button" className="secondary" onClick={() => setReportOpen((current) => !current)}>
                    Research Report
                  </button>
                  <button type="button" className="secondary" onClick={exportAnalysisPdf}>
                    Export PDF
                  </button>
                  <button type="button" className="secondary" onClick={exportResearchHtml}>
                    Export HTML
                  </button>
                </div>
              </div>
            ) : null}

            {analysis && reportOpen ? (
              <ResearchReportBuilder
                analysis={analysis}
                displayCurrency={displayCurrency}
                onExportHtml={exportResearchHtml}
                onPrint={exportAnalysisPdf}
              />
            ) : null}

            {error ? (
              <section className="error-state">
                <strong>{error}</strong>
              </section>
            ) : null}

            {loading && !analysis ? (
              <section className="loading-state">
                <div />
                <div />
                <div />
              </section>
            ) : null}

            {analysis ? (
              <>
                <nav className="tabs" aria-label="Analysis tabs">
                  {TABS.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={activeTab === tab ? "active" : ""}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>
                <TabContent
                  tab={activeTab}
                  analysis={analysis}
                  displayCurrency={displayCurrency}
                  chartMode={chartMode}
                  chartRange={chartRange}
                  chartOverlays={chartOverlays}
                  indicatorPanel={indicatorPanel}
                  onChartModeChange={setChartMode}
                  onChartRangeChange={setChartRange}
                  onChartOverlayChange={updateChartOverlay}
                  onIndicatorPanelChange={setIndicatorPanel}
                />
              </>
            ) : (
              <section className="empty-start">
                <strong>Enter a ticker or company name to begin.</strong>
                <span>{displayValue(null)}</span>
              </section>
            )}
          </>
        ) : null}

        {workspaceView === "Discover" ? (
          <ScreenerPanel
            response={screenerResponse}
            rows={filteredScreenerRows}
            filters={screenerFilters}
            loading={screenerLoading}
            error={screenerError}
            preset={screenPreset}
            viewMode={screenerViewMode}
            chartMode={chartMode}
            compared={compareTickers}
            savedScreens={savedScreens}
            screenName={screenName}
            onFiltersChange={setScreenerFilters}
            onPresetChange={applyPreset}
            onViewModeChange={setScreenerViewMode}
            onChartModeChange={setChartMode}
            onScreenNameChange={setScreenName}
            onSaveScreen={saveCurrentScreen}
            onApplySavedScreen={applySavedScreen}
            onDeleteSavedScreen={deleteSavedScreen}
            onRun={(refresh) => void runScreener(refresh)}
            onAnalyse={(row) => void openRow(row)}
            onWatch={addToWatchlist}
            onCompare={toggleCompare}
          />
        ) : null}

        {workspaceView === "Watchlist" ? (
          <WatchlistPanel
            watchlist={watchlist}
            rows={watchlistRows}
            loading={watchlistLoading}
            syncStatus={watchlistSyncStatus}
            syncError={watchlistSyncError}
            onRefresh={() => void refreshWatchlist()}
            onRemove={(ticker) => void removeFromWatchlist(ticker)}
            onAnalyse={(item) => void openWatchlistItem(item)}
            onCompare={toggleCompare}
          />
        ) : null}

        {workspaceView === "Portfolio" ? (
          <PortfolioPanel
            response={portfolioResponse}
            form={portfolioForm}
            loading={portfolioLoading}
            error={portfolioError}
            onFormChange={setPortfolioForm}
            onSubmit={() => void savePortfolioHolding()}
            onRefresh={(refresh) => void loadPortfolio(refresh)}
            onRemove={(id) => void removePortfolioHolding(id)}
            onAnalyse={(ticker, targetRegion) => {
              setQuery(ticker);
              setRegion(targetRegion);
              void requestAnalysis({}, { query: ticker, region: targetRegion });
            }}
          />
        ) : null}

        {workspaceView === "Alerts" ? (
          <AlertsPanel
            response={alertsResponse}
            form={alertForm}
            loading={alertsLoading}
            error={alertsError}
            onFormChange={setAlertForm}
            onSubmit={() => void saveAlertRule()}
            onRefresh={() => void loadAlerts(false)}
            onEvaluate={() => void loadAlerts(true)}
            onRunScheduled={(force) => void runScheduledAlerts(force)}
            onRemove={(id) => void removeAlertRule(id)}
          />
        ) : null}

        {workspaceView === "Privacy" ? (
          <PrivacyPanel
            workspaceExport={workspaceExport}
            readiness={deploymentReadiness}
            loading={privacyLoading}
            error={privacyError}
            message={privacyMessage}
            deleteConfirm={deleteConfirm}
            onDeleteConfirmChange={setDeleteConfirm}
            onExport={() => void exportWorkspaceJson()}
            onDelete={() => void deleteWorkspace()}
            onRefresh={() => void loadWorkspaceExport()}
          />
        ) : null}

        {workspaceView === "Auth" ? (
          <AuthPanel
            session={authSession}
            form={authForm}
            loading={authLoading}
            error={authError}
            message={authMessage}
            deleteConfirm={authDeleteConfirm}
            onFormChange={setAuthForm}
            onDeleteConfirmChange={setAuthDeleteConfirm}
            onRegister={() => void submitAuth("register")}
            onLogin={() => void submitAuth("login")}
            onLogout={() => void logoutAuth()}
            onDeleteAccount={() => void deleteLocalAccount()}
            onRefresh={() => void loadAuthSession()}
          />
        ) : null}

        {workspaceView === "Compare" ? (
          <ComparePanel
            rows={compareRows}
            onRemove={(ticker) => setCompareTickers((current) => current.filter((item) => item !== ticker))}
            onAnalyse={(row) => void openRow(row)}
          />
        ) : null}

        {workspaceView === "Events" ? (
          <EventsPanel
            response={eventsResponse}
            loading={eventsLoading}
            error={eventsError}
            watchlistCount={watchlist.length}
            onRun={(refresh) => void runEvents(refresh)}
          />
        ) : null}

        {workspaceView === "Validate" ? (
          <ValidationPanel
            response={validationResponse}
            scope={validationScope}
            loading={validationLoading}
            error={validationError}
            onScopeChange={setValidationScope}
            onRun={(refresh) => void runValidation(refresh)}
          />
        ) : null}
      </section>
    </main>
  );
}
