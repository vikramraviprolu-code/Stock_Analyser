import { NextResponse } from "next/server";
import { parseBooleanFlag, parseRegionParam, parseTickerQuery } from "@/src/lib/api-validation";
import { workspaceOwnerId } from "@/src/lib/auth";
import { DATA_UNAVAILABLE } from "@/src/lib/format";
import { fetchFundamentals } from "@/src/lib/fundamentals";
import { fetchHistory } from "@/src/lib/history";
import { listPortfolio, removePortfolioHolding, upsertPortfolioHolding } from "@/src/lib/workspace-store";
import type { PortfolioHolding, PortfolioResponse, PortfolioRow } from "@/src/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function enrichHolding(holding: PortfolioHolding, forceRefresh: boolean): Promise<PortfolioRow> {
  const warnings: string[] = [];
  let latestClose: number | null = null;
  let companyName: string | null = null;
  let sector: string | null = null;
  let currency = holding.currency;

  try {
    const fundamentals = await fetchFundamentals(holding.ticker, holding.region, forceRefresh, false);
    companyName = fundamentals.data.companyName;
    sector = fundamentals.data.sector;
    currency = holding.currency ?? fundamentals.data.currency;
    warnings.push(...fundamentals.warnings);
    const history = await fetchHistory(fundamentals.data.ticker, fundamentals.data.region, forceRefresh);
    latestClose = history.metrics.latestClose;
    warnings.push(...history.warnings);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Portfolio market data unavailable.");
  }

  const costBasis = holding.quantity * holding.averageCost;
  const marketValue = latestClose === null ? null : holding.quantity * latestClose;
  const unrealizedPnl = marketValue === null ? null : marketValue - costBasis;
  const unrealizedPnlPercent = unrealizedPnl === null || costBasis === 0 ? null : (unrealizedPnl / costBasis) * 100;

  return {
    ...holding,
    currency,
    companyName,
    latestClose,
    marketValue,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPercent,
    sector,
    sourceWarnings: warnings
  };
}

function totals(rows: PortfolioRow[]): PortfolioResponse["totals"] {
  const costBasis = rows.reduce((sum, row) => sum + (row.costBasis ?? 0), 0);
  const marketRows = rows.filter((row) => row.marketValue !== null);
  if (marketRows.length === 0) {
    return {
      marketValue: null,
      costBasis: costBasis || null,
      unrealizedPnl: null,
      unrealizedPnlPercent: null
    };
  }

  const marketValue = marketRows.reduce((sum, row) => sum + (row.marketValue ?? 0), 0);
  const unrealizedPnl = marketValue - costBasis;
  return {
    marketValue,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPercent: costBasis === 0 ? null : (unrealizedPnl / costBasis) * 100
  };
}

async function buildResponse(forceRefresh: boolean, ownerId: string): Promise<PortfolioResponse> {
  const holdings = await listPortfolio(ownerId);
  const rows = await Promise.all(holdings.map((holding) => enrichHolding(holding, forceRefresh)));
  const warnings = rows.flatMap((row) => row.sourceWarnings.map((warning) => `${row.ticker}: ${warning}`));
  return {
    mode: "server-synced",
    retrievedAt: new Date().toISOString(),
    holdings,
    rows,
    totals: totals(rows),
    warnings,
    status: {
      label: "Portfolio sync",
      status: "ok",
      detail: "Holdings are persisted through the Stock Analyser server workspace store. Market value uses latest verified public close where available.",
      url: null
    }
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refreshResult = parseBooleanFlag(searchParams.get("refresh"), "refresh");
  if (!refreshResult.ok) {
    return NextResponse.json({ error: refreshResult.message }, { status: refreshResult.status });
  }

  return NextResponse.json(await buildResponse(refreshResult.value, await workspaceOwnerId(request)));
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    id?: string | null;
    ticker?: string;
    region?: string;
    quantity?: number;
    averageCost?: number;
    currency?: string | null;
    notes?: string | null;
  };
  const tickerResult = parseTickerQuery(payload.ticker ?? null, "ticker");
  if (!tickerResult.ok) return NextResponse.json({ error: tickerResult.message }, { status: tickerResult.status });
  const regionResult = parseRegionParam(payload.region ?? null, tickerResult.value);
  if (!regionResult.ok) return NextResponse.json({ error: regionResult.message }, { status: regionResult.status });
  if (!Number.isFinite(payload.quantity) || Number(payload.quantity) <= 0) {
    return NextResponse.json({ error: "Quantity must be greater than 0." }, { status: 400 });
  }
  if (!Number.isFinite(payload.averageCost) || Number(payload.averageCost) < 0) {
    return NextResponse.json({ error: "Average cost must be 0 or greater." }, { status: 400 });
  }

  const ownerId = await workspaceOwnerId(request);
  await upsertPortfolioHolding({
    id: payload.id,
    ticker: tickerResult.value,
    region: regionResult.value,
    quantity: Number(payload.quantity),
    averageCost: Number(payload.averageCost),
    currency: payload.currency ?? null,
    notes: payload.notes ?? null
  }, ownerId);
  return NextResponse.json(await buildResponse(false, ownerId));
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: DATA_UNAVAILABLE }, { status: 400 });
  }
  const ownerId = await workspaceOwnerId(request);
  await removePortfolioHolding(id, ownerId);
  return NextResponse.json(await buildResponse(false, ownerId));
}
