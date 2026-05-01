import { NextResponse } from "next/server";
import { parseBooleanFlag, parseTickerList } from "@/src/lib/api-validation";
import { fetchFundamentals } from "@/src/lib/fundamentals";
import { detectRegion } from "@/src/lib/regions";
import { PRD_EXAMPLE_TICKERS } from "@/src/lib/tickers";
import type { EventRow, EventsResponse, SourceStatus } from "@/src/lib/types";

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refreshResult = parseBooleanFlag(searchParams.get("refresh"), "refresh");
  if (!refreshResult.ok) {
    return NextResponse.json({ error: refreshResult.message }, { status: refreshResult.status });
  }

  const tickerList = parseTickerList(
    searchParams.get("tickers"),
    PRD_EXAMPLE_TICKERS.slice(0, 12).map((item) => item.ticker)
  );
  if (!tickerList.ok) {
    return NextResponse.json({ error: tickerList.message }, { status: tickerList.status });
  }

  const retrievedAt = new Date().toISOString();
  const rows = await mapLimit(tickerList.value, 4, async (ticker): Promise<EventRow> => {
    const region = detectRegion(ticker);
    try {
      const fundamentals = await fetchFundamentals(ticker, region, refreshResult.value, false);
      const source = fundamentals.sourceRecords.find((record) => record.metric === "Earnings date");
      const eventDate = fundamentals.data.earningsDate;
      return {
        ticker: fundamentals.data.ticker,
        companyName: fundamentals.data.companyName,
        region: fundamentals.data.region,
        eventType: "Earnings",
        eventDate,
        source: source?.source ?? "Public fundamentals layer",
        sourceUrl: source?.url ?? null,
        status: eventDate ? "ok" : "unavailable",
        warning: eventDate ? undefined : "No verified public source returned an earnings date."
      };
    } catch (error) {
      return {
        ticker,
        companyName: null,
        region,
        eventType: "Earnings",
        eventDate: null,
        source: "Public fundamentals layer",
        sourceUrl: null,
        status: "unavailable",
        warning: error instanceof Error ? error.message : "Event retrieval failed."
      };
    }
  });

  const sourceStatuses: SourceStatus[] = [
    {
      label: "Events source",
      status: rows.some((row) => row.status === "ok") ? "ok" : "warning",
      detail: "Earnings dates are retrieved only when the no-key public fundamentals layer verifies them.",
      url: null
    }
  ];

  const response: EventsResponse = {
    mode: "live",
    retrievedAt,
    rows,
    warnings: rows.flatMap((row) => (row.warning ? [`${row.ticker}: ${row.warning}`] : [])),
    sourceStatuses
  };

  return NextResponse.json(response);
}
