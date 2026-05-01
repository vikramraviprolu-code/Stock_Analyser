import { fetchFundamentals } from "../fundamentals";
import type { FundamentalsProvider } from "./types";

export const fundamentalsProvider: FundamentalsProvider = {
  getFundamentals: fetchFundamentals
};
