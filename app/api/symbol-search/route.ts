import { NextResponse } from "next/server";
import { parseBooleanFlag, parseTickerQuery } from "@/src/lib/api-validation";
import { searchSymbolMatches } from "@/src/lib/symbol-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryResult = parseTickerQuery(searchParams.get("q") ?? searchParams.get("ticker"), "ticker or company");
  if (!queryResult.ok) {
    return NextResponse.json({ error: queryResult.message }, { status: queryResult.status });
  }

  const refreshResult = parseBooleanFlag(searchParams.get("refresh"), "refresh");
  if (!refreshResult.ok) {
    return NextResponse.json({ error: refreshResult.message }, { status: refreshResult.status });
  }

  try {
    const matches = await searchSymbolMatches(queryResult.value, refreshResult.value);
    return NextResponse.json({ query: queryResult.value, matches });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Symbol search failed." },
      { status: 500 }
    );
  }
}
