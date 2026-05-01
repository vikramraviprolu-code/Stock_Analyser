export const DATA_UNAVAILABLE = "Data unavailable";

export function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DATA_UNAVAILABLE;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    ...options
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DATA_UNAVAILABLE;
  }

  return `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || !currency) {
    return DATA_UNAVAILABLE;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: Math.abs(value) >= 1_000_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function displayValue(value: string | number | null | undefined): string {
  if (typeof value === "number") {
    return formatNumber(value);
  }

  return value ?? DATA_UNAVAILABLE;
}
