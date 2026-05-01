import { detectRegion } from "../regions";
import type { SymbolResolverProvider } from "./types";

export const symbolResolverProvider: SymbolResolverProvider = {
  detectRegion
};
