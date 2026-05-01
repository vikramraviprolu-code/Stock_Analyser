import { StockAnalyser } from "@/src/components/StockAnalyser";
import { detectRegion } from "@/src/lib/regions";
import { normalizeTicker } from "@/src/lib/tickers";

export default async function TerminalTickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = normalizeTicker(decodeURIComponent(rawTicker));

  return <StockAnalyser autoAnalyse initialQuery={ticker} initialRegion={detectRegion(ticker)} initialView="Analyse" />;
}
