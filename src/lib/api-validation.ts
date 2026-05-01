import { detectRegion, REGIONS } from "./regions";
import type { Region } from "./types";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string };

const TICKER_PATTERN = /^[0-9A-Za-z ._-]{1,80}$/;

export function parseBooleanFlag(value: string | null, name: string): ValidationResult<boolean> {
  if (value === null || value === "" || value === "0" || value === "false") {
    return { ok: true, value: false };
  }
  if (value === "1" || value === "true") {
    return { ok: true, value: true };
  }
  return { ok: false, status: 400, message: `${name} must be 1, 0, true, or false.` };
}

export function parseTickerQuery(value: string | null, label = "ticker"): ValidationResult<string> {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return { ok: false, status: 400, message: `Missing ${label} query parameter.` };
  }
  if (!TICKER_PATTERN.test(trimmed)) {
    return {
      ok: false,
      status: 400,
      message: `${label} must be 1-80 characters and contain only letters, numbers, spaces, dots, dashes, or underscores.`
    };
  }
  return { ok: true, value: trimmed };
}

export function parseRegionParam(value: string | null, fallbackQuery: string): ValidationResult<Region> {
  if (!value) {
    return { ok: true, value: detectRegion(fallbackQuery) };
  }
  if (REGIONS.includes(value as Region)) {
    return { ok: true, value: value as Region };
  }
  return { ok: false, status: 400, message: `region must be one of: ${REGIONS.join(", ")}.` };
}

export function parseRegionSet(value: string | null): ValidationResult<Set<Region> | null> {
  if (!value || value === "All") {
    return { ok: true, value: null };
  }

  const parsed = value.split(",").map((item) => item.trim());
  const invalid = parsed.find((item) => !REGIONS.includes(item as Region));
  if (invalid) {
    return { ok: false, status: 400, message: `Invalid region: ${invalid}.` };
  }
  return { ok: true, value: new Set(parsed as Region[]) };
}

export function parseValidationScope(value: string | null): ValidationResult<"examples" | "universe"> {
  if (!value || value === "examples") {
    return { ok: true, value: "examples" };
  }
  if (value === "universe") {
    return { ok: true, value: "universe" };
  }
  return { ok: false, status: 400, message: "scope must be examples or universe." };
}

export function parseTickerList(value: string | null, fallback: string[]): ValidationResult<string[]> {
  if (!value?.trim()) {
    return { ok: true, value: fallback };
  }

  const tickers = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (tickers.length === 0 || tickers.length > 24) {
    return { ok: false, status: 400, message: "tickers must include 1-24 symbols." };
  }

  const invalid = tickers.find((ticker) => !TICKER_PATTERN.test(ticker));
  if (invalid) {
    return { ok: false, status: 400, message: `Invalid ticker: ${invalid}.` };
  }

  return { ok: true, value: tickers };
}
