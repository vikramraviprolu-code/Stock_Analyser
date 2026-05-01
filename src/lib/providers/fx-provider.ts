import { convertCurrency } from "../fx";
import type { FxProvider } from "./types";

export const fxProvider: FxProvider = {
  convert: convertCurrency
};
