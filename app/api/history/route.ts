import { NextResponse } from "next/server";
import { parseBooleanFlag, parseRegionParam, parseTickerQuery } from "@/src/lib/api-validation";
import { fetchHistory } from "@/src/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickerResult = parseTickerQuery(searchParams.get("ticker"));
  if (!tickerResult.ok) {
    return NextResponse.json({ error: tickerResult.message }, { status: tickerResult.status });
  }

  const regionResult = parseRegionParam(searchParams.get("region"), tickerResult.value);
  if (!regionResult.ok) {
    return NextResponse.json({ error: regionResult.message }, { status: regionResult.status });
  }

  const refreshResult = parseBooleanFlag(searchParams.get("refresh"), "refresh");
  if (!refreshResult.ok) {
    return NextResponse.json({ error: refreshResult.message }, { status: refreshResult.status });
  }

  try {
    const result = await fetchHistory(tickerResult.value, regionResult.value, refreshResult.value);
    return NextResponse.json({
      ticker: tickerResult.value,
      region: regionResult.value,
      provider: result.provider,
      stooqSymbol: result.stooqSymbol,
      sourceUrl: result.sourceUrl,
      rows: result.rows,
      metrics: result.metrics,
      sources: result.sourceRecords,
      warnings: result.warnings
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Historical data unavailable.",
        ticker: tickerResult.value,
        region: regionResult.value
      },
      { status: 404 }
    );
  }
}
