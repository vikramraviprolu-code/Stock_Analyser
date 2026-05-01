import type { FundamentalsResult } from "../fundamentals";
import type { HistoryResult } from "../stooq";
import type { Region } from "../types";

export interface HistoricalPriceProvider {
  getHistory(ticker: string, region: Region, forceRefresh?: boolean): Promise<HistoryResult>;
}

export interface FundamentalsProvider {
  getFundamentals(query: string, region: Region, forceRefresh?: boolean): Promise<FundamentalsResult>;
}

export interface FxProvider {
  convert(value: number | null, fromCurrency: string | null, toCurrency: string, forceRefresh?: boolean): Promise<{
    value: number | null;
    warning?: string;
    sourceUrl?: string | null;
  }>;
}

export interface SymbolResolverProvider {
  detectRegion(ticker: string, requestedRegion?: Region): Region;
}
