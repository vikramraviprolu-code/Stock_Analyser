import { NextResponse } from "next/server";
import { parseRegionParam, parseTickerQuery } from "@/src/lib/api-validation";
import { workspaceOwnerId } from "@/src/lib/auth";
import { listWatchlist, removeWatchlistItem, upsertWatchlistItem } from "@/src/lib/workspace-store";
import type { WatchlistResponse } from "@/src/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(items: WatchlistResponse["items"]): WatchlistResponse {
  return {
    mode: "server-synced",
    retrievedAt: new Date().toISOString(),
    items,
    status: {
      label: "Watchlist sync",
      status: "ok",
      detail: "Watchlist is stored through the Stock Analyser server workspace store. Swap the store adapter for a hosted database when cloud credentials are available.",
      url: null
    }
  };
}

export async function GET(request: Request) {
  const ownerId = await workspaceOwnerId(request);
  return NextResponse.json(response(await listWatchlist(ownerId)));
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { ticker?: string; region?: string };
  const tickerResult = parseTickerQuery(payload.ticker ?? null, "ticker");
  if (!tickerResult.ok) {
    return NextResponse.json({ error: tickerResult.message }, { status: tickerResult.status });
  }
  const regionResult = parseRegionParam(payload.region ?? null, tickerResult.value);
  if (!regionResult.ok) {
    return NextResponse.json({ error: regionResult.message }, { status: regionResult.status });
  }

  const ownerId = await workspaceOwnerId(request);
  return NextResponse.json(response(await upsertWatchlistItem({ ticker: tickerResult.value, region: regionResult.value }, ownerId)));
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickerResult = parseTickerQuery(searchParams.get("ticker"), "ticker");
  if (!tickerResult.ok) {
    return NextResponse.json({ error: tickerResult.message }, { status: tickerResult.status });
  }

  const ownerId = await workspaceOwnerId(request);
  return NextResponse.json(response(await removeWatchlistItem(tickerResult.value, ownerId)));
}
