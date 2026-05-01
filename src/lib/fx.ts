import { getCached, CACHE_TTL } from "./cache";
import { fetchJson } from "./http";

interface ExchangeRateResponse {
  result?: string;
  rates?: Record<string, number>;
}

async function fetchRate(fromCurrency: string, toCurrency: string, forceRefresh: boolean): Promise<{
  rate: number;
  sourceUrl: string;
}> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  const sourceUrl = `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`;
  const { value: rate } = await getCached<number>(
    "fx",
    `${from}-${to}`,
    CACHE_TTL.fxDaily,
    async () => {
      const payload = await fetchJson<ExchangeRateResponse>(sourceUrl);
      const parsedRate = payload.rates?.[to];
      if (typeof parsedRate !== "number" || !Number.isFinite(parsedRate)) {
        throw new Error(`No ${to} rate found for ${from}.`);
      }
      return parsedRate;
    },
    forceRefresh
  );

  return { rate, sourceUrl };
}

export async function convertCurrency(
  value: number | null,
  fromCurrency: string | null,
  toCurrency: string,
  forceRefresh = false
): Promise<{ value: number | null; warning?: string; sourceUrl?: string | null }> {
  if (value === null && !fromCurrency) {
    return { value: null, warning: "Value and currency were unavailable." };
  }

  if (value === null) {
    return { value: null, warning: "Value was unavailable." };
  }

  if (!fromCurrency) {
    return { value: null, warning: "Currency was unavailable." };
  }

  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) {
    return { value, sourceUrl: null };
  }

  try {
    const { rate, sourceUrl } = await fetchRate(from, to, forceRefresh);
    return { value: value * rate, sourceUrl };
  } catch (error) {
    return {
      value: null,
      warning:
        error instanceof Error
          ? `${to} conversion unavailable for ${from}: ${error.message}`
          : `${to} conversion unavailable for ${from}.`,
      sourceUrl: `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`
    };
  }
}

export async function convertToUsd(
  value: number | null,
  currency: string | null,
  forceRefresh = false
): Promise<{ valueUsd: number | null; warning?: string; sourceUrl?: string | null }> {
  const result = await convertCurrency(value, currency, "USD", forceRefresh);
  return { valueUsd: result.value, warning: result.warning, sourceUrl: result.sourceUrl };
}
