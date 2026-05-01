import { fetchHistory } from "../history";
import type { HistoricalPriceProvider } from "./types";

export const historicalPriceProvider: HistoricalPriceProvider = {
  getHistory: fetchHistory
};
