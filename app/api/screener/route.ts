import { NextResponse } from "next/server";
import { parseBooleanFlag, parseRegionSet } from "@/src/lib/api-validation";
import { fetchFundamentals } from "@/src/lib/fundamentals";
import { fetchHistory } from "@/src/lib/history";
import { momentumSignal, priceVsMovingAverage, rsiLabel, scoreDataQuality, scoreMomentum, scoreValueScreen } from "@/src/lib/recommendation";
import { evaluateRegionalFilters } from "@/src/lib/regions";
import { SAMPLE_TICKERS } from "@/src/lib/tickers";
import type { Region, ScreenerResponse, ScreenerRow, SourceStatus } from "@/src/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function filterAverageVolume(historyAverage: number | null, fundamentalAverage: number | null): number | null {
  return historyAverage ?? fundamentalAverage;
}

async function buildScreenerRow(input: {
  ticker: string;
  region: Region;
  forceRefresh: boolean;
  retrievedAt: string;
}): Promise<ScreenerRow> {
  const warnings: string[] = [];

  try {
    const fundamentals = await fetchFundamentals(input.ticker, input.region, input.forceRefresh, false);
    warnings.push(...fundamentals.warnings);

    let history;
    try {
      history = await fetchHistory(fundamentals.data.ticker, fundamentals.data.region, input.forceRefresh);
      warnings.push(...history.warnings);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Historical data unavailable.");
    }

    const metrics = history?.metrics ?? {
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
    const filters = evaluateRegionalFilters({
      region: fundamentals.data.region,
      latestClose: metrics.latestClose,
      averageVolume: filterAverageVolume(metrics.averageVolume, fundamentals.data.averageVolume),
      marketCapUsd: fundamentals.data.marketCapUsd
    });
    warnings.push(...filters.warnings);

    const sourceRecords = [...(history?.sourceRecords ?? []), ...fundamentals.sourceRecords];
    const valueScore = scoreValueScreen({
      percentFromLow: metrics.percentFromLow,
      trailingPe: fundamentals.data.trailingPe,
      filters
    });
    const momentumScore = scoreMomentum(metrics);
    const dataQualityScore = scoreDataQuality(sourceRecords, warnings);
    const totalScore = Math.round(valueScore * 0.4 + momentumScore * 0.35 + dataQualityScore * 0.25);
    const signal = momentumSignal(metrics);
    const qualifiesValue =
      metrics.percentFromLow !== null &&
      metrics.percentFromLow <= 10 &&
      fundamentals.data.trailingPe !== null &&
      fundamentals.data.trailingPe <= 10 &&
      filters.passed;

    return {
      ticker: fundamentals.data.ticker,
      region: fundamentals.data.region,
      companyName: fundamentals.data.companyName,
      exchange: fundamentals.data.exchange,
      country: fundamentals.data.country,
      currency: fundamentals.data.currency,
      sector: fundamentals.data.sector,
      industry: fundamentals.data.industry,
      latestClose: metrics.latestClose,
      marketCapUsd: fundamentals.data.marketCapUsd,
      trailingPe: fundamentals.data.trailingPe,
      averageVolume: filterAverageVolume(metrics.averageVolume, fundamentals.data.averageVolume),
      percentFromLow: metrics.percentFromLow,
      performance5D: metrics.performance5D,
      roc14: metrics.roc14,
      roc21: metrics.roc21,
      rsi14: metrics.rsi14,
      rsiLabel: rsiLabel(metrics.rsi14),
      priceVsMa20: priceVsMovingAverage(metrics.latestClose, metrics.ma20),
      priceVsMa50: priceVsMovingAverage(metrics.latestClose, metrics.ma50),
      priceVsMa200: priceVsMovingAverage(metrics.latestClose, metrics.ma200),
      signal: signal.signal,
      outlook: signal.outlook,
      confidence: signal.confidence,
      valueScore,
      momentumScore,
      dataQualityScore,
      totalScore,
      qualifiesValue,
      filtersPassed: filters.passed,
      sourceCount: sourceRecords.length,
      warningCount: warnings.length,
      historyProvider: history?.provider ?? null,
      historySourceUrl: history?.sourceUrl ?? null,
      chartRows: history?.rows.slice(-120) ?? [],
      warnings,
      retrievedAt: input.retrievedAt,
      status: warnings.length > 0 ? "warning" : "ok"
    };
  } catch (error) {
    return {
      ticker: input.ticker,
      region: input.region,
      companyName: null,
      exchange: null,
      country: null,
      currency: null,
      sector: null,
      industry: null,
      latestClose: null,
      marketCapUsd: null,
      trailingPe: null,
      averageVolume: null,
      percentFromLow: null,
      performance5D: null,
      roc14: null,
      roc21: null,
      rsi14: null,
      rsiLabel: "Data unavailable",
      priceVsMa20: "Data unavailable",
      priceVsMa50: "Data unavailable",
      priceVsMa200: "Data unavailable",
      signal: "Data unavailable",
      outlook: "Data unavailable",
      confidence: 0,
      valueScore: 0,
      momentumScore: 0,
      dataQualityScore: 0,
      totalScore: 0,
      qualifiesValue: false,
      filtersPassed: false,
      sourceCount: 0,
      warningCount: 1,
      historyProvider: null,
      historySourceUrl: null,
      chartRows: [],
      warnings: [error instanceof Error ? error.message : "Screener row unavailable."],
      retrievedAt: input.retrievedAt,
      status: "error"
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const regionsResult = parseRegionSet(searchParams.get("regions"));
  if (!regionsResult.ok) {
    return NextResponse.json({ error: regionsResult.message }, { status: regionsResult.status });
  }

  const refreshResult = parseBooleanFlag(searchParams.get("refresh"), "refresh");
  if (!refreshResult.ok) {
    return NextResponse.json({ error: refreshResult.message }, { status: refreshResult.status });
  }

  const selectedRegions = regionsResult.value;
  const refresh = refreshResult.value;
  const retrievedAt = new Date().toISOString();

  const universe = SAMPLE_TICKERS.filter((item) => !selectedRegions || selectedRegions.has(item.region));
  const rows = await mapLimit(universe, 4, (item) =>
    buildScreenerRow({
      ticker: item.ticker,
      region: item.region,
      forceRefresh: refresh,
      retrievedAt
    })
  );
  const sourceStatuses: SourceStatus[] = [
    {
      label: "Screener universe",
      status: "ok",
      detail: "Uses the Stock Analyser seeded global universe and free public data sources.",
      url: null
    },
    {
      label: "Screener row mode",
      status: "ok",
      detail: "Rows avoid peer recursion for speed; open a ticker for full peer analysis.",
      url: null
    }
  ];
  const response: ScreenerResponse = {
    mode: "live",
    universe: "Seeded global universe",
    retrievedAt,
    rows: rows.sort((a, b) => b.totalScore - a.totalScore),
    warnings: rows.flatMap((row) => row.warnings.map((warning) => `${row.ticker}: ${warning}`)),
    sourceStatuses
  };

  return NextResponse.json(response);
}
