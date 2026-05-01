import { NextResponse } from "next/server";
import { parseBooleanFlag, parseRegionParam, parseTickerQuery } from "@/src/lib/api-validation";
import { buildAnalysis } from "@/src/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryResult = parseTickerQuery(searchParams.get("ticker") ?? searchParams.get("q"), "ticker or company");
  if (!queryResult.ok) {
    return NextResponse.json({ error: queryResult.message }, { status: queryResult.status });
  }

  const regionResult = parseRegionParam(searchParams.get("region"), queryResult.value);
  if (!regionResult.ok) {
    return NextResponse.json({ error: regionResult.message }, { status: regionResult.status });
  }

  if (searchParams.has("demo")) {
    return NextResponse.json({ error: "Demo analysis mode is not supported. Live public-source data only." }, { status: 400 });
  }

  const refreshResult = parseBooleanFlag(searchParams.get("refresh"), "refresh");
  if (!refreshResult.ok) {
    return NextResponse.json({ error: refreshResult.message }, { status: refreshResult.status });
  }

  try {
    const analysis = await buildAnalysis({
      query: queryResult.value,
      region: regionResult.value,
      forceRefresh: refreshResult.value
    });
    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed." },
      { status: 500 }
    );
  }
}
