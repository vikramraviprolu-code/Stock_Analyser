import { CACHE_TTL, getCached } from "./cache";
import { DATA_UNAVAILABLE, formatMoney, formatNumber, formatPercent } from "./format";
import { convertCurrency, convertToUsd } from "./fx";
import { fetchJson, fetchText } from "./http";
import { detectRegion } from "./regions";
import { looksLikeTicker, normalizeTicker, resolveKnownCompanyAlias } from "./tickers";
import type { FundamentalData, Region, SourceRecord, SourceStatus } from "./types";

interface YahooSearchQuote {
  symbol?: string;
  quoteType?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  exchange?: string;
  sector?: string;
  sectorDisp?: string;
  industry?: string;
  industryDisp?: string;
}

interface YahooSearchResponse {
  quotes?: YahooSearchQuote[];
}

interface YahooQuoteResponse {
  quoteResponse?: {
    result?: Array<Record<string, unknown>>;
  };
}

interface YahooSummaryResult {
  summaryProfile?: Record<string, unknown>;
  summaryDetail?: Record<string, unknown>;
  calendarEvents?: Record<string, unknown>;
  price?: Record<string, unknown>;
  defaultKeyStatistics?: Record<string, unknown>;
  financialData?: Record<string, unknown>;
}

interface YahooSummaryResponse {
  quoteSummary?: {
    result?: YahooSummaryResult[];
    error?: unknown;
  };
}

interface YahooChartMetaResponse {
  chart?: {
    result?: Array<{
      meta?: Record<string, unknown>;
    }>;
    error?: {
      description?: string;
    };
  };
}

interface NasdaqSummaryResponse {
  data?: {
    symbol?: string;
    summaryData?: Record<string, { label?: string; value?: string }>;
  };
}

interface NasdaqProfileResponse {
  data?: Record<string, { label?: string; value?: string }>;
}

export interface FundamentalsResult {
  data: FundamentalData;
  sourceRecords: SourceRecord[];
  statuses: SourceStatus[];
  warnings: string[];
  resolvedFromSearch: boolean;
}

function yahooQuoteUrl(ticker: string): string {
  return `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
}

function yahooSummaryUrl(ticker: string): string {
  const modules = "price,summaryProfile,summaryDetail,defaultKeyStatistics,financialData,calendarEvents";
  return `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
}

function yahooSearchUrl(query: string): string {
  return `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
}

function yahooChartMetaUrl(ticker: string): string {
  return `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`;
}

function yahooPageUrl(ticker: string): string {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`;
}

function nasdaqSummaryUrl(ticker: string): string {
  return `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/summary?assetclass=stocks`;
}

function nasdaqProfileUrl(ticker: string): string {
  return `https://api.nasdaq.com/api/company/${encodeURIComponent(ticker)}/company-profile`;
}

function nasdaqPageUrl(ticker: string): string {
  return `https://www.nasdaq.com/market-activity/stocks/${encodeURIComponent(ticker.toLowerCase())}`;
}

function duckDuckGoSearchUrl(query: string): string {
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeSearchResultUrl(href: string | undefined): string | null {
  if (!href) {
    return null;
  }

  const decoded = decodeHtmlAttribute(href);
  const absolute = decoded.startsWith("//")
    ? `https:${decoded}`
    : decoded.startsWith("/")
      ? `https://duckduckgo.com${decoded}`
      : decoded;

  try {
    const url = new URL(absolute);
    return url.searchParams.get("uddg") ?? absolute;
  } catch {
    return absolute;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object" && "raw" in value) {
    return asNumber((value as { raw?: unknown }).raw);
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseNasdaqNumber(value: string | undefined): number | null {
  if (!value || /n\/a|data unavailable/i.test(value)) {
    return null;
  }

  const parsed = Number(value.replace(/[$,%\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRatioPercent(value: number | null): string {
  return value === null ? DATA_UNAVAILABLE : formatPercent(value * 100);
}

function nasdaqValue(
  source: Record<string, { label?: string; value?: string }> | undefined,
  key: string
): string | null {
  const value = source?.[key]?.value;
  return value && !/n\/a|data unavailable/i.test(value) ? value : null;
}

function firstDateFromCalendar(calendarEvents: Record<string, unknown> | undefined): string | null {
  const earnings = calendarEvents?.earnings;
  if (!earnings || typeof earnings !== "object") {
    return null;
  }

  const dates = (earnings as { earningsDate?: unknown }).earningsDate;
  const first = Array.isArray(dates) ? dates[0] : dates;
  const raw = asNumber(first);
  if (raw === null) {
    return null;
  }

  return new Date(raw * 1000).toISOString();
}

async function loadYahooSearchQuotes(query: string): Promise<YahooSearchQuote[]> {
  const payload = await fetchJson<YahooSearchResponse>(yahooSearchUrl(query));
  return payload.quotes ?? [];
}

function selectYahooEquityQuote(quotes: YahooSearchQuote[], region: Region): YahooSearchQuote | undefined {
  const equityQuotes = quotes.filter((quote) => quote.quoteType === "EQUITY" && quote.symbol);
  return equityQuotes.find((quote) => detectRegion(quote.symbol ?? "", region) === region) ?? equityQuotes[0];
}

async function loadYahooChartMeta(ticker: string): Promise<Record<string, unknown> | undefined> {
  const payload = await fetchJson<YahooChartMetaResponse>(yahooChartMetaUrl(ticker));
  return payload.chart?.result?.[0]?.meta;
}

async function resolveTickerFromSearch(query: string, region: Region): Promise<{ ticker: string; resolved: boolean }> {
  const normalized = normalizeTicker(query);
  if (looksLikeTicker(normalized)) {
    return { ticker: normalized, resolved: false };
  }

  const knownAlias = resolveKnownCompanyAlias(query, region);
  if (knownAlias) {
    return { ticker: knownAlias.ticker, resolved: true };
  }

  let regionMatch: YahooSearchQuote | undefined;
  try {
    regionMatch = selectYahooEquityQuote(await loadYahooSearchQuotes(query), region);
  } catch {
    regionMatch = undefined;
  }

  if (!regionMatch?.symbol) {
    return { ticker: normalized, resolved: false };
  }

  return { ticker: regionMatch.symbol.toUpperCase(), resolved: true };
}

async function loadOfficialHints(ticker: string): Promise<SourceStatus[]> {
  const queries = [
    `${ticker} official investor relations`,
    `${ticker} official exchange quote`
  ];

  const statuses: SourceStatus[] = [];
  for (const query of queries) {
    const url = duckDuckGoSearchUrl(query);
    try {
      const html = await fetchText(url, 5_000);
      const hrefMatch = html.match(/class="result__a"[^>]+href="([^"]+)"/);
      const resultUrl = normalizeSearchResultUrl(hrefMatch?.[1]);
      statuses.push({
        label: query.includes("investor") ? "Official IR web search" : "Official exchange web search",
        status: resultUrl ? "ok" : "warning",
        detail: resultUrl
          ? "Found at least one public web-search result for manual verification."
          : "No parseable official web-search result was returned.",
        url: resultUrl ?? url
      });
    } catch {
      statuses.push({
        label: query.includes("investor") ? "Official IR web search" : "Official exchange web search",
        status: "warning",
        detail: "Search was unavailable; structured fields fall back to recognized finance sources.",
        url
      });
    }
  }

  return statuses;
}

async function loadYahooFundamentals(ticker: string, region: Region, forceRefresh: boolean): Promise<FundamentalsResult> {
  const retrievedAt = new Date().toISOString();
  const quoteUrl = yahooQuoteUrl(ticker);
  const summaryUrl = yahooSummaryUrl(ticker);
  const warnings = [
    "Official exchange and company IR pages are preferred, but they do not expose a consistent no-key structured fundamentals API across all requested regions.",
    "Structured fundamentals use recognized public finance endpoints when official structured values cannot be automatically verified."
  ];

  let quote: Record<string, unknown> = {};
  try {
    const quotePayload = await fetchJson<YahooQuoteResponse>(quoteUrl);
    quote = quotePayload.quoteResponse?.result?.[0] ?? {};
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Yahoo quote endpoint unavailable: ${error.message}`
        : "Yahoo quote endpoint unavailable."
    );
  }

  let summary: YahooSummaryResult | undefined;
  try {
    const summaryPayload = await fetchJson<YahooSummaryResponse>(summaryUrl);
    summary = summaryPayload.quoteSummary?.result?.[0];
  } catch {
    summary = undefined;
  }

  let searchQuote: YahooSearchQuote | undefined;
  try {
    searchQuote = selectYahooEquityQuote(await loadYahooSearchQuotes(ticker), region);
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Yahoo search metadata unavailable: ${error.message}`
        : "Yahoo search metadata unavailable."
    );
  }

  let chartMeta: Record<string, unknown> | undefined;
  try {
    chartMeta = await loadYahooChartMeta(ticker);
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Yahoo chart metadata unavailable: ${error.message}`
        : "Yahoo chart metadata unavailable."
    );
  }

  const profile = summary?.summaryProfile;
  const summaryDetail = summary?.summaryDetail;
  const price = summary?.price;
  const keyStats = summary?.defaultKeyStatistics;
  const financialData = summary?.financialData;
  const calendarEvents = summary?.calendarEvents;
  const currency = asString(quote.currency) ?? asString(price?.currency) ?? asString(chartMeta?.currency);
  const marketCap = asNumber(quote.marketCap) ?? asNumber(price?.marketCap);
  const marketCapConversion = await convertToUsd(marketCap, currency, forceRefresh);
  const marketCapEurConversion = await convertCurrency(marketCap, currency, "EUR", forceRefresh);
  const companyName =
    asString(quote.longName) ??
    asString(quote.shortName) ??
    asString(price?.longName) ??
    asString(price?.shortName) ??
    asString(searchQuote?.longname) ??
    asString(searchQuote?.shortname) ??
    asString(chartMeta?.longName) ??
    asString(chartMeta?.shortName);
  const country = asString(profile?.country);
  const data: FundamentalData = {
    ticker,
    companyName,
    exchange:
      asString(quote.fullExchangeName) ??
      asString(quote.exchange) ??
      asString(price?.exchangeName) ??
      asString(searchQuote?.exchDisp) ??
      asString(searchQuote?.exchange) ??
      asString(chartMeta?.fullExchangeName) ??
      asString(chartMeta?.exchangeName),
    country,
    region: detectRegion(ticker, region),
    currency,
    sector: asString(profile?.sector) ?? asString(searchQuote?.sector) ?? asString(searchQuote?.sectorDisp),
    industry: asString(profile?.industry) ?? asString(searchQuote?.industry) ?? asString(searchQuote?.industryDisp),
    marketCap,
    marketCapUsd: marketCapConversion.valueUsd,
    marketCapEur: marketCapEurConversion.value,
    trailingPe: asNumber(quote.trailingPE) ?? asNumber(keyStats?.trailingPE),
    averageVolume: asNumber(quote.averageDailyVolume3Month) ?? asNumber(quote.averageDailyVolume10Day),
    revenueTtm: asNumber(financialData?.totalRevenue),
    epsTtm: asNumber(quote.epsTrailingTwelveMonths) ?? asNumber(keyStats?.trailingEps),
    grossMargin: asNumber(financialData?.grossMargins),
    operatingMargin: asNumber(financialData?.operatingMargins),
    netMargin: asNumber(financialData?.profitMargins) ?? asNumber(keyStats?.profitMargins),
    returnOnEquity: asNumber(financialData?.returnOnEquity),
    returnOnAssets: asNumber(financialData?.returnOnAssets),
    debtToEquity: asNumber(financialData?.debtToEquity),
    freeCashFlow: asNumber(financialData?.freeCashflow),
    dividendYield: asNumber(summaryDetail?.dividendYield) ?? asNumber(quote.trailingAnnualDividendYield),
    payoutRatio: asNumber(summaryDetail?.payoutRatio) ?? asNumber(keyStats?.payoutRatio),
    revenueGrowth: asNumber(financialData?.revenueGrowth),
    earningsGrowth: asNumber(financialData?.earningsGrowth),
    beta: asNumber(summaryDetail?.beta) ?? asNumber(keyStats?.beta),
    peers: [],
    earningsDate: firstDateFromCalendar(calendarEvents)
  };

  const sourceUrl = yahooPageUrl(ticker);
  const sourceRecords: SourceRecord[] = [
    ["Company name", data.companyName ?? DATA_UNAVAILABLE],
    ["Exchange", data.exchange ?? DATA_UNAVAILABLE],
    ["Country", data.country ?? DATA_UNAVAILABLE],
    ["Region", data.region],
    ["Currency", data.currency ?? DATA_UNAVAILABLE],
    ["Sector", data.sector ?? DATA_UNAVAILABLE],
    ["Industry", data.industry ?? DATA_UNAVAILABLE],
    ["Market cap", formatMoney(data.marketCap, data.currency)],
    ["Market cap USD equivalent", formatMoney(data.marketCapUsd, "USD")],
    ["Market cap EUR equivalent", formatMoney(data.marketCapEur, "EUR")],
    ["Trailing P/E", data.trailingPe === null ? DATA_UNAVAILABLE : formatNumber(data.trailingPe)],
    ["Average volume", data.averageVolume === null ? DATA_UNAVAILABLE : formatNumber(data.averageVolume)],
    ["Revenue TTM", formatMoney(data.revenueTtm, data.currency)],
    ["EPS TTM", data.epsTtm === null ? DATA_UNAVAILABLE : formatNumber(data.epsTtm)],
    ["Gross margin", formatRatioPercent(data.grossMargin)],
    ["Operating margin", formatRatioPercent(data.operatingMargin)],
    ["Net margin", formatRatioPercent(data.netMargin)],
    ["Return on equity", formatRatioPercent(data.returnOnEquity)],
    ["Return on assets", formatRatioPercent(data.returnOnAssets)],
    ["Debt to equity", data.debtToEquity === null ? DATA_UNAVAILABLE : formatNumber(data.debtToEquity)],
    ["Free cash flow", formatMoney(data.freeCashFlow, data.currency)],
    ["Dividend yield", formatRatioPercent(data.dividendYield)],
    ["Payout ratio", formatRatioPercent(data.payoutRatio)],
    ["Revenue growth", formatRatioPercent(data.revenueGrowth)],
    ["Earnings growth", formatRatioPercent(data.earningsGrowth)],
    ["Beta", data.beta === null ? DATA_UNAVAILABLE : formatNumber(data.beta)],
    ["Earnings date", data.earningsDate ?? DATA_UNAVAILABLE]
  ].map(([metric, value]) => ({
    metric,
    value,
    source: "Yahoo Finance public quote/search/chart endpoints",
    url: sourceUrl,
    retrievedAt,
    freshness: "Recognized finance source; cache max 24 hours",
    verification: value === DATA_UNAVAILABLE ? ("unavailable" as const) : ("recognized" as const),
    confidence: value === DATA_UNAVAILABLE ? 0 : 76,
    warning:
      metric === "Market cap USD equivalent"
        ? marketCapConversion.warning
        : metric === "Market cap EUR equivalent"
          ? marketCapEurConversion.warning
          : undefined
  }));

  if (marketCapConversion.warning) {
    warnings.push(marketCapConversion.warning);
  }
  if (marketCapEurConversion.warning && marketCapEurConversion.warning !== marketCapConversion.warning) {
    warnings.push(marketCapEurConversion.warning);
  }

  return {
    data,
    sourceRecords,
    statuses: [
      {
        label: "Recognized finance fundamentals",
        status: companyName || marketCap || data.trailingPe ? "ok" : "warning",
        detail: companyName || marketCap || data.trailingPe
          ? "Structured fundamentals were retrieved from public Yahoo Finance endpoints."
          : "No structured fundamentals could be verified from the recognized finance source.",
        url: sourceUrl
      },
      {
        label: "FX conversion",
        status: data.marketCapUsd !== null || currency === "USD" ? "ok" : "warning",
        detail:
          data.marketCapUsd !== null || currency === "USD"
            ? "USD market-cap equivalent available for regional filtering."
            : "USD market-cap equivalent unavailable; market-cap filter cannot pass.",
        url: marketCapConversion.sourceUrl ?? null
      }
    ],
    warnings,
    resolvedFromSearch: false
  };
}

async function loadNasdaqFundamentals(
  ticker: string,
  region: Region,
  forceRefresh: boolean,
  upstreamWarning?: string
): Promise<FundamentalsResult> {
  if (region !== "USA" || ticker.includes(".")) {
    throw new Error(upstreamWarning ?? "Nasdaq fallback is only available for plain US ticker symbols.");
  }

  const retrievedAt = new Date().toISOString();
  const summaryUrl = nasdaqSummaryUrl(ticker);
  const profileUrl = nasdaqProfileUrl(ticker);
  const [summaryPayload, profilePayload] = await Promise.all([
    fetchJson<NasdaqSummaryResponse>(summaryUrl),
    fetchJson<NasdaqProfileResponse>(profileUrl)
  ]);
  const summary = summaryPayload.data?.summaryData;
  const profile = profilePayload.data;
  const companyName = nasdaqValue(profile, "CompanyName");
  const address = nasdaqValue(profile, "Address");
  const marketCap = parseNasdaqNumber(nasdaqValue(summary, "MarketCap") ?? undefined);
  const averageVolume = parseNasdaqNumber(nasdaqValue(summary, "AverageVolume") ?? undefined);
  const country = address?.includes("United States") ? "United States" : null;
  const marketCapConversion = await convertToUsd(marketCap, "USD", forceRefresh);
  const marketCapEurConversion = await convertCurrency(marketCap, "USD", "EUR", forceRefresh);

  const data: FundamentalData = {
    ticker,
    companyName,
    exchange: nasdaqValue(summary, "Exchange"),
    country,
    region: "USA",
    currency: "USD",
    sector: nasdaqValue(summary, "Sector") ?? nasdaqValue(profile, "Sector"),
    industry: nasdaqValue(summary, "Industry") ?? nasdaqValue(profile, "Industry"),
    marketCap,
    marketCapUsd: marketCapConversion.valueUsd,
    marketCapEur: marketCapEurConversion.value,
    trailingPe: null,
    averageVolume,
    revenueTtm: null,
    epsTtm: null,
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    returnOnEquity: null,
    returnOnAssets: null,
    debtToEquity: null,
    freeCashFlow: null,
    dividendYield: null,
    payoutRatio: null,
    revenueGrowth: null,
    earningsGrowth: null,
    beta: null,
    peers: [],
    earningsDate: null
  };

  const pageUrl = nasdaqPageUrl(ticker);
  const sourceRecords: SourceRecord[] = [
    ["Company name", data.companyName ?? DATA_UNAVAILABLE],
    ["Exchange", data.exchange ?? DATA_UNAVAILABLE],
    ["Country", data.country ?? DATA_UNAVAILABLE],
    ["Region", data.region],
    ["Currency", data.currency ?? DATA_UNAVAILABLE],
    ["Sector", data.sector ?? DATA_UNAVAILABLE],
    ["Industry", data.industry ?? DATA_UNAVAILABLE],
    ["Market cap", formatMoney(data.marketCap, data.currency)],
    ["Market cap USD equivalent", formatMoney(data.marketCapUsd, "USD")],
    ["Market cap EUR equivalent", formatMoney(data.marketCapEur, "EUR")],
    ["Trailing P/E", DATA_UNAVAILABLE],
    ["Average volume", data.averageVolume === null ? DATA_UNAVAILABLE : formatNumber(data.averageVolume)],
    ["Revenue TTM", DATA_UNAVAILABLE],
    ["EPS TTM", DATA_UNAVAILABLE],
    ["Gross margin", DATA_UNAVAILABLE],
    ["Operating margin", DATA_UNAVAILABLE],
    ["Net margin", DATA_UNAVAILABLE],
    ["Return on equity", DATA_UNAVAILABLE],
    ["Return on assets", DATA_UNAVAILABLE],
    ["Debt to equity", DATA_UNAVAILABLE],
    ["Free cash flow", DATA_UNAVAILABLE],
    ["Dividend yield", DATA_UNAVAILABLE],
    ["Payout ratio", DATA_UNAVAILABLE],
    ["Revenue growth", DATA_UNAVAILABLE],
    ["Earnings growth", DATA_UNAVAILABLE],
    ["Beta", DATA_UNAVAILABLE],
    ["Earnings date", DATA_UNAVAILABLE]
  ].map(([metric, value]) => ({
    metric,
    value,
    source: "Nasdaq public quote/profile endpoints",
    url: pageUrl,
    retrievedAt,
    freshness: "Official exchange public endpoint; cache max 24 hours",
    verification: value === DATA_UNAVAILABLE ? ("unavailable" as const) : ("primary" as const),
    confidence: value === DATA_UNAVAILABLE ? 0 : 86,
    warning:
      value === DATA_UNAVAILABLE
        ? "Nasdaq fallback did not provide this metric."
        : metric === "Market cap EUR equivalent"
          ? marketCapEurConversion.warning
        : undefined
  }));

  return {
    data,
    sourceRecords,
    statuses: [
      {
        label: "Nasdaq fundamentals fallback",
        status: companyName || marketCap || averageVolume ? "ok" : "warning",
        detail:
          companyName || marketCap || averageVolume
            ? "Structured US fundamentals were retrieved from Nasdaq public endpoints."
            : "Nasdaq public endpoints did not return usable structured fields.",
        url: pageUrl
      }
    ],
    warnings: [
      ...(upstreamWarning ? [upstreamWarning] : []),
      "Trailing P/E and earnings date remain Data unavailable unless verified by a public source."
    ],
    resolvedFromSearch: false
  };
}

async function loadPublicFundamentals(
  ticker: string,
  region: Region,
  forceRefresh: boolean
): Promise<FundamentalsResult> {
  if (region === "USA" && !ticker.includes(".")) {
    try {
      return await loadNasdaqFundamentals(ticker, region, forceRefresh);
    } catch {
      // Fall back to recognized finance endpoints when the official exchange endpoint is unavailable.
    }
  }

  try {
    return await loadYahooFundamentals(ticker, region, forceRefresh);
  } catch (error) {
    const warning =
      error instanceof Error
        ? `Yahoo Finance public quote endpoints unavailable: ${error.message}`
        : "Yahoo Finance public quote endpoints unavailable.";
    return loadNasdaqFundamentals(ticker, region, forceRefresh, warning);
  }
}

export async function fetchFundamentals(
  query: string,
  region: Region,
  forceRefresh = false,
  includeOfficialHints = true
): Promise<FundamentalsResult> {
  const resolved = await getCached(
    "metadata",
    `resolve-v3-${query}-${region}`,
    CACHE_TTL.metadataMonthly,
    () => resolveTickerFromSearch(query, region),
    forceRefresh
  );
  const ticker = resolved.value.ticker;
  const resolvedRegion = detectRegion(ticker, region);
  const fundamentals = await getCached(
    "fundamentals",
    `v9-${ticker}-${resolvedRegion}`,
    CACHE_TTL.fundamentals24h,
    () => loadPublicFundamentals(ticker, resolvedRegion, forceRefresh),
    forceRefresh
  );
  const officialStatuses = includeOfficialHints
    ? await getCached(
        "metadata",
        `official-hints-v2-${ticker}`,
        CACHE_TTL.metadataMonthly,
        () => loadOfficialHints(ticker),
        forceRefresh
      )
    : { value: [] as SourceStatus[] };

  return {
    ...fundamentals.value,
    statuses: [...officialStatuses.value, ...fundamentals.value.statuses],
    resolvedFromSearch: resolved.value.resolved
  };
}
