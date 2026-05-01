import { CACHE_TTL, getCached } from "./cache";
import { buildDataReliability } from "./data-reliability";
import { DATA_UNAVAILABLE } from "./format";
import { fetchFundamentals } from "./fundamentals";
import { buildRecommendation, momentumSignal, priceVsMovingAverage, rsiLabel } from "./recommendation";
import { detectRegion, evaluateRegionalFilters } from "./regions";
import { fetchHistory } from "./history";
import { SAMPLE_TICKERS, normalizeTicker } from "./tickers";
import type {
  AnalysisResponse,
  FilterResult,
  FundamentalData,
  HistoryMetrics,
  PeerScoreRow,
  Region,
  SourceRecord,
  SourceStatus
} from "./types";

const EMPTY_METRICS: HistoryMetrics = {
  latestClose: null,
  high52Week: null,
  low52Week: null,
  percentFromLow: null,
  averageVolume: null,
  performance5D: null,
  ma20: null,
  ma50: null,
  ma200: null,
  rsi14: null,
  roc14: null,
  roc21: null
};

function emptyFundamentals(ticker: string, region: Region): FundamentalData {
  return {
    ticker,
    companyName: null,
    exchange: null,
    country: null,
    region,
    currency: null,
    sector: null,
    industry: null,
    marketCap: null,
    marketCapUsd: null,
    marketCapEur: null,
    trailingPe: null,
    averageVolume: null,
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
}

function filterAverageVolume(metrics: HistoryMetrics, fundamentals: FundamentalData): number | null {
  return metrics.averageVolume ?? fundamentals.averageVolume;
}

function qualifiesValue(metrics: HistoryMetrics, fundamentals: FundamentalData, filters: FilterResult): boolean {
  return (
    metrics.percentFromLow !== null &&
    metrics.percentFromLow <= 10 &&
    fundamentals.trailingPe !== null &&
    fundamentals.trailingPe <= 10 &&
    filters.passed
  );
}

function sourceRecord(
  metric: string,
  value: string,
  source: string,
  url: string | null,
  warning?: string,
  verification: SourceRecord["verification"] = value === DATA_UNAVAILABLE ? "unavailable" : "computed",
  confidence = value === DATA_UNAVAILABLE ? 0 : 70
): SourceRecord {
  return {
    metric,
    value,
    source,
    url,
    retrievedAt: new Date().toISOString(),
    freshness: "Computed by Stock Analyser from retrieved public data",
    verification,
    confidence,
    warning
  };
}

function matchPeer(target: FundamentalData, candidate: FundamentalData): { priority: number; reason: string } | null {
  const sameIndustry =
    target.industry !== null &&
    candidate.industry !== null &&
    target.industry.toLowerCase() === candidate.industry.toLowerCase();
  const sameSector =
    target.sector !== null &&
    candidate.sector !== null &&
    target.sector.toLowerCase() === candidate.sector.toLowerCase();
  const sameCountry =
    target.country !== null &&
    candidate.country !== null &&
    target.country.toLowerCase() === candidate.country.toLowerCase();
  const sameRegion = target.region === candidate.region;

  if (sameIndustry && sameCountry) return { priority: 1, reason: "Same industry and country" };
  if (sameIndustry && sameRegion) return { priority: 2, reason: "Same industry and region" };
  if (sameSector && sameCountry) return { priority: 3, reason: "Same sector and country" };
  if (sameSector && sameRegion) return { priority: 4, reason: "Same sector and region" };
  if (sameIndustry) return { priority: 5, reason: "Global same-industry fallback" };
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function run(): Promise<void> {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      results.push(await worker(item));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function buildPeerRows(
  target: FundamentalData,
  forceRefresh: boolean
): Promise<{ rows: PeerScoreRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (!target.sector && !target.industry) {
    return {
      rows: [],
      warnings: ["Peer matching requires verified sector or industry data. Peers are unavailable."]
    };
  }

  const candidates = SAMPLE_TICKERS.filter((sample) => sample.ticker !== target.ticker);
  const peerBasics = await mapLimit(candidates, 4, async (candidate) => {
    try {
      const fundamentals = await fetchFundamentals(candidate.ticker, candidate.region, forceRefresh, false);
      const match = matchPeer(target, fundamentals.data);
      return match ? { fundamentals: fundamentals.data, match } : null;
    } catch {
      return null;
    }
  });

  const matched = peerBasics
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.match.priority - b.match.priority)
    .slice(0, 12);

  const rows = await mapLimit(matched, 4, async (item) => {
    let metrics = EMPTY_METRICS;
    try {
      const history = await fetchHistory(item.fundamentals.ticker, item.fundamentals.region, forceRefresh);
      metrics = history.metrics;
    } catch {
      warnings.push(`Historical peer metrics unavailable for ${item.fundamentals.ticker}.`);
    }

    const filters = evaluateRegionalFilters({
      region: item.fundamentals.region,
      latestClose: metrics.latestClose,
      averageVolume: filterAverageVolume(metrics, item.fundamentals),
      marketCapUsd: item.fundamentals.marketCapUsd
    });
    const signal = momentumSignal(metrics);

    return {
      ticker: item.fundamentals.ticker,
      companyName: item.fundamentals.companyName,
      country: item.fundamentals.country,
      region: item.fundamentals.region,
      sector: item.fundamentals.sector,
      industry: item.fundamentals.industry,
      latestClose: metrics.latestClose,
      percentFromLow: metrics.percentFromLow,
      trailingPe: item.fundamentals.trailingPe,
      averageVolume: filterAverageVolume(metrics, item.fundamentals),
      performance5D: metrics.performance5D,
      roc14: metrics.roc14,
      roc21: metrics.roc21,
      rsi14: metrics.rsi14,
      rsiLabel: rsiLabel(metrics.rsi14),
      ma20: metrics.ma20,
      ma50: metrics.ma50,
      ma200: metrics.ma200,
      priceVsMa20: priceVsMovingAverage(metrics.latestClose, metrics.ma20),
      priceVsMa50: priceVsMovingAverage(metrics.latestClose, metrics.ma50),
      priceVsMa200: priceVsMovingAverage(metrics.latestClose, metrics.ma200),
      signal: signal.signal,
      outlook: signal.outlook,
      confidence: signal.confidence,
      filters,
      qualifiesValue: qualifiesValue(metrics, item.fundamentals, filters),
      matchReason: item.match.reason
    };
  });

  return { rows, warnings };
}

function buildDataQualityRecords(filters: FilterResult): SourceRecord[] {
  return filters.criteria.map((criterion) =>
    sourceRecord(
      `${criterion.label} regional filter`,
      criterion.passed === null ? DATA_UNAVAILABLE : criterion.passed ? "Pass" : "Fail",
      "Stock Analyser regional filter rules",
      null,
      criterion.passed === null ? criterion.detail ?? `${criterion.label} could not be verified.` : undefined,
      criterion.passed === null ? "unavailable" : "computed",
      criterion.passed === null ? 0 : 68
    )
  );
}

export async function buildAnalysis(input: {
  query: string;
  region: Region;
  forceRefresh?: boolean;
}): Promise<AnalysisResponse> {
  const requestedTicker = normalizeTicker(input.query);
  const requestedRegion = detectRegion(requestedTicker, input.region);
  const retrievedAt = new Date().toISOString();
  const warnings: string[] = [];
  const sourceStatuses: SourceStatus[] = [
    {
      label: "Cache policy",
      status: "ok",
      detail: "Historical data daily, fundamentals 24h, peers weekly, metadata monthly.",
      url: null
    }
  ];

  let fundamentals: FundamentalData = emptyFundamentals(requestedTicker, requestedRegion);
  let resolvedFromSearch = false;
  let fundamentalSources: SourceRecord[] = [];

  try {
    const fundamentalsResult = await fetchFundamentals(input.query, requestedRegion, Boolean(input.forceRefresh));
    fundamentals = fundamentalsResult.data;
    resolvedFromSearch = fundamentalsResult.resolvedFromSearch;
    fundamentalSources = fundamentalsResult.sourceRecords;
    sourceStatuses.push(...fundamentalsResult.statuses);
    warnings.push(...fundamentalsResult.warnings);
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Fundamentals retrieval failed: ${error.message}`
        : "Fundamentals retrieval failed."
    );
    sourceStatuses.push({
      label: "Fundamentals",
      status: "error",
      detail: "No verified public fundamentals could be retrieved.",
      url: null
    });
  }

  let history: AnalysisResponse["history"] = null;
  let metrics = EMPTY_METRICS;
  let historySources: SourceRecord[] = [];
  try {
    const historyResult = await fetchHistory(fundamentals.ticker, fundamentals.region, Boolean(input.forceRefresh));
    metrics = historyResult.metrics;
    historySources = historyResult.sourceRecords;
    history = {
      provider: historyResult.provider,
      sourceUrl: historyResult.sourceUrl,
      stooqSymbol: historyResult.stooqSymbol,
      rowCount: historyResult.rows.length,
      rows: historyResult.rows.slice(-260),
      metrics: historyResult.metrics
    };
    sourceStatuses.push({
      label: "Historical OHLCV",
      status: "ok",
      detail: `Using ${historyResult.provider} symbol ${historyResult.stooqSymbol}.`,
      url: historyResult.sourceUrl
    });
    warnings.push(...historyResult.warnings);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Historical data retrieval failed.");
    sourceStatuses.push({
      label: "Historical OHLCV",
      status: "warning",
      detail: "No verified Stooq history was available for this ticker.",
      url: null
    });
  }

  const filters = evaluateRegionalFilters({
    region: fundamentals.region,
    latestClose: metrics.latestClose,
    averageVolume: filterAverageVolume(metrics, fundamentals),
    marketCapUsd: fundamentals.marketCapUsd
  });
  warnings.push(...filters.warnings);

  const peerResult = await getCached(
    "peers",
    `v2-${fundamentals.ticker}-${fundamentals.region}-${fundamentals.sector ?? "no-sector"}-${fundamentals.industry ?? "no-industry"}`,
    CACHE_TTL.peersWeekly,
    () => buildPeerRows(fundamentals, Boolean(input.forceRefresh)),
    Boolean(input.forceRefresh)
  );
  const peers = peerResult.value.rows;
  warnings.push(...peerResult.value.warnings);
  sourceStatuses.push({
    label: "Peer universe",
    status: peers.length > 0 ? "ok" : "warning",
    detail:
      peers.length > 0
        ? `Matched ${peers.length} peers using the requested industry/sector fallback logic.`
        : "No peers could be verified from the seeded global peer universe.",
    url: null
  });

  fundamentals = { ...fundamentals, peers: peers.map((peer) => peer.ticker) };
  const sourceRecords = [
    ...historySources,
    ...fundamentalSources,
    ...buildDataQualityRecords(filters),
    sourceRecord("Peer cache", `${peers.length} matched peers`, "Stock Analyser peer matching", null, undefined, "computed", 65)
  ];

  const valuePeers = peers.filter((peer) => peer.qualifiesValue);
  const topMomentumPeers = peers
    .filter((peer) => peer.performance5D !== null)
    .sort((a, b) => (b.performance5D ?? -Infinity) - (a.performance5D ?? -Infinity))
    .slice(0, 10);
  const inputQualifies = qualifiesValue(metrics, fundamentals, filters);
  const recommendation = buildRecommendation({
    metrics,
    trailingPe: fundamentals.trailingPe,
    filters,
    sourceRecords,
    warnings,
    inputQualifiesValue: inputQualifies
  });
  const dataReliability = buildDataReliability({
    records: sourceRecords,
    warnings,
    fundamentals,
    filters,
    metrics,
    historyRowCount: history?.rowCount ?? 0
  });

  return {
    mode: "live",
    query: input.query,
    ticker: fundamentals.ticker,
    region: fundamentals.region,
    resolvedFromSearch,
    retrievedAt,
    history,
    fundamentals,
    filters,
    valueScreen: {
      inputQualifies,
      peers: valuePeers
    },
    momentum: {
      topPeers: topMomentumPeers
    },
    crossAnalysis: {
      peerCount: peers.length,
      valuePeerCount: valuePeers.length,
      momentumPeerCount: topMomentumPeers.length,
      notes: [
        inputQualifies
          ? "Input stock passes the strict value screen."
          : "Input stock does not pass the strict value screen or has unavailable required metrics.",
        topMomentumPeers.length > 0
          ? "Momentum ranking uses verified peer histories with 5D performance available."
          : "Momentum ranking unavailable because peer histories could not be verified.",
        warnings.length > 0
          ? "Warnings should be reviewed before relying on the score."
          : "No data-quality warnings were generated."
      ]
    },
    recommendation,
    dataReliability,
    sourceRecords,
    sourceStatuses,
    warnings
  };
}
