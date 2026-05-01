import type { FilterCriterion, FilterResult, Region } from "./types";

export const REGIONS: Region[] = [
  "USA",
  "India",
  "Europe",
  "Japan",
  "Hong Kong",
  "South Korea",
  "Taiwan",
  "Australia",
  "Singapore",
  "Asia-Pacific"
];

interface RegionalRule {
  price: number;
  volume: number;
  marketCapUsd: number;
  priceUnit: string;
}

export const REGIONAL_RULES: Record<Region, RegionalRule> = {
  USA: { price: 5, volume: 500_000, marketCapUsd: 2_000_000_000, priceUnit: "USD" },
  India: { price: 100, volume: 500_000, marketCapUsd: 2_000_000_000, priceUnit: "INR" },
  Europe: { price: 5, volume: 100_000, marketCapUsd: 2_000_000_000, priceUnit: "EUR/GBP/CHF" },
  Japan: { price: 500, volume: 300_000, marketCapUsd: 2_000_000_000, priceUnit: "JPY" },
  "Hong Kong": { price: 5, volume: 500_000, marketCapUsd: 2_000_000_000, priceUnit: "HKD" },
  "South Korea": { price: 5_000, volume: 100_000, marketCapUsd: 2_000_000_000, priceUnit: "KRW" },
  Taiwan: { price: 50, volume: 100_000, marketCapUsd: 2_000_000_000, priceUnit: "TWD" },
  Australia: { price: 2, volume: 100_000, marketCapUsd: 2_000_000_000, priceUnit: "AUD" },
  Singapore: { price: 1, volume: 100_000, marketCapUsd: 1_000_000_000, priceUnit: "SGD" },
  "Asia-Pacific": { price: 1, volume: 100_000, marketCapUsd: 1_000_000_000, priceUnit: "local" }
};

export function detectRegion(ticker: string, requestedRegion?: Region): Region {
  const normalized = ticker.toUpperCase();
  if (normalized.endsWith(".NS") || normalized.endsWith(".BO")) return "India";
  if (normalized.endsWith(".AS") || normalized.endsWith(".DE") || normalized.endsWith(".L")) return "Europe";
  if (normalized.endsWith(".PA") || normalized.endsWith(".SW")) return "Europe";
  if (normalized.endsWith(".T")) return "Japan";
  if (normalized.endsWith(".HK")) return "Hong Kong";
  if (normalized.endsWith(".KS") || normalized.endsWith(".KQ")) return "South Korea";
  if (normalized.endsWith(".TW") || normalized.endsWith(".TWO")) return "Taiwan";
  if (normalized.endsWith(".AX")) return "Australia";
  if (normalized.endsWith(".SI")) return "Singapore";

  return requestedRegion ?? "USA";
}

export function evaluateRegionalFilters(input: {
  region: Region;
  latestClose: number | null;
  averageVolume: number | null;
  marketCapUsd: number | null;
}): FilterResult {
  const rule = REGIONAL_RULES[input.region];
  const criteria: FilterCriterion[] = [
    {
      label: "Price",
      actual: input.latestClose,
      threshold: rule.price,
      unit: rule.priceUnit,
      passed: input.latestClose === null ? null : input.latestClose >= rule.price
    },
    {
      label: "Average volume",
      actual: input.averageVolume,
      threshold: rule.volume,
      unit: "shares",
      passed: input.averageVolume === null ? null : input.averageVolume >= rule.volume
    },
    {
      label: "Market cap",
      actual: input.marketCapUsd,
      threshold: rule.marketCapUsd,
      unit: "USD",
      passed: input.marketCapUsd === null ? null : input.marketCapUsd >= rule.marketCapUsd
    }
  ];

  const warnings = criteria
    .filter((criterion) => criterion.passed === null)
    .map((criterion) => `${criterion.label} could not be verified for the ${input.region} filter.`);

  return {
    region: input.region,
    passed: criteria.every((criterion) => criterion.passed === true),
    criteria,
    warnings
  };
}
