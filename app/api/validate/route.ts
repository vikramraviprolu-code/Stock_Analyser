import { NextResponse } from "next/server";
import { parseBooleanFlag, parseRegionSet, parseValidationScope } from "@/src/lib/api-validation";
import { fetchFundamentals } from "@/src/lib/fundamentals";
import { fetchHistory } from "@/src/lib/history";
import { summarizeSourceQuality } from "@/src/lib/source-quality";
import { PRD_EXAMPLE_TICKERS, SAMPLE_TICKERS } from "@/src/lib/tickers";
import type { Region, SourceRecord, SourceStatus, ValidationResponse, ValidationRow } from "@/src/lib/types";

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

async function buildValidationRow(input: {
  ticker: string;
  region: Region;
  forceRefresh: boolean;
  retrievedAt: string;
}): Promise<ValidationRow> {
  const warnings: string[] = [];
  const sourceRecords: SourceRecord[] = [];
  let resolvedTicker = input.ticker;
  let resolvedRegion = input.region;
  let companyName: string | null = null;
  let fundamentalsStatus: ValidationRow["fundamentalsStatus"] = "error";
  let historyStatus: ValidationRow["historyStatus"] = "error";
  let stooqStatus: ValidationRow["stooqStatus"] = "unavailable";
  let historyProvider: string | null = null;
  let historySourceUrl: string | null = null;

  try {
    const fundamentals = await fetchFundamentals(input.ticker, input.region, input.forceRefresh, false);
    resolvedTicker = fundamentals.data.ticker;
    resolvedRegion = fundamentals.data.region;
    companyName = fundamentals.data.companyName;
    sourceRecords.push(...fundamentals.sourceRecords);
    warnings.push(...fundamentals.warnings);
    fundamentalsStatus =
      fundamentals.data.companyName || fundamentals.data.marketCapUsd !== null || fundamentals.data.trailingPe !== null
        ? "ok"
        : "warning";
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Fundamentals validation failed.");
  }

  try {
    const history = await fetchHistory(resolvedTicker, resolvedRegion, input.forceRefresh);
    sourceRecords.push(...history.sourceRecords);
    warnings.push(...history.warnings);
    historyProvider = history.provider;
    historySourceUrl = history.sourceUrl;
    historyStatus = history.rows.length > 0 && history.metrics.latestClose !== null ? "ok" : "warning";
    stooqStatus = history.provider === "Stooq CSV" ? "primary" : "fallback";
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "History validation failed.");
  }

  const quality = summarizeSourceQuality(sourceRecords, warnings);
  const unavailableMetrics = sourceRecords
    .filter((record) => record.value === "Data unavailable")
    .map((record) => record.metric);

  return {
    ticker: resolvedTicker,
    region: resolvedRegion,
    companyName,
    historyStatus,
    fundamentalsStatus,
    stooqStatus,
    metricCoverage: sourceRecords.length === 0 ? 0 : Math.round((quality.verified / sourceRecords.length) * 100),
    sourceConfidence: quality.confidence,
    sourceCount: sourceRecords.length,
    warningCount: warnings.length,
    unavailableMetrics,
    historyProvider,
    historySourceUrl,
    retrievedAt: input.retrievedAt
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refreshResult = parseBooleanFlag(searchParams.get("refresh"), "refresh");
  if (!refreshResult.ok) {
    return NextResponse.json({ error: refreshResult.message }, { status: refreshResult.status });
  }

  const scopeResult = parseValidationScope(searchParams.get("scope"));
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.message }, { status: scopeResult.status });
  }

  const regionsResult = parseRegionSet(searchParams.get("regions"));
  if (!regionsResult.ok) {
    return NextResponse.json({ error: regionsResult.message }, { status: regionsResult.status });
  }

  const refresh = refreshResult.value;
  const scope = scopeResult.value;
  const selectedRegions = regionsResult.value;
  const retrievedAt = new Date().toISOString();
  const baseUniverse = scope === "universe" ? SAMPLE_TICKERS : PRD_EXAMPLE_TICKERS;
  const universe = baseUniverse.filter((item) => !selectedRegions || selectedRegions.has(item.region));

  const rows = await mapLimit(universe, 4, (item) =>
    buildValidationRow({
      ticker: item.ticker,
      region: item.region,
      forceRefresh: refresh,
      retrievedAt
    })
  );

  const sourceStatuses: SourceStatus[] = [
    {
      label: "Validation scope",
      status: "ok",
      detail:
        scope === "universe"
          ? "Validating the expanded seeded global universe."
          : "Validating the PRD example ticker set.",
      url: null
    },
    {
      label: "Validation rule",
      status: "ok",
      detail: "Rows show coverage only for metrics verified by the current free public-source pipeline.",
      url: null
    }
  ];

  const response: ValidationResponse = {
    mode: "live",
    universe: scope === "universe" ? "Expanded seeded global universe" : "PRD example tickers",
    retrievedAt,
    rows: rows.sort((a, b) => a.ticker.localeCompare(b.ticker)),
    warnings: rows.flatMap((row) =>
      row.unavailableMetrics.map((metric) => `${row.ticker}: ${metric} is Data unavailable.`)
    ),
    sourceStatuses
  };

  return NextResponse.json(response);
}
