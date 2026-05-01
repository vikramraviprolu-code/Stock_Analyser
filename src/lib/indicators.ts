import type { HistoryMetrics, OhlcvRow } from "./types";

export function movingAverage(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) {
    return null;
  }

  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

export function rateOfChange(values: number[], periodsBack: number): number | null {
  if (periodsBack <= 0 || values.length <= periodsBack) {
    return null;
  }

  const current = values[values.length - 1];
  const previous = values[values.length - 1 - periodsBack];
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

export function rsi(values: number[], period = 14): number | null {
  if (period <= 0 || values.length <= period) {
    return null;
  }

  const slice = values.slice(-(period + 1));
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < slice.length; index += 1) {
    const change = slice[index] - slice[index - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;

  if (averageGain === 0 && averageLoss === 0) {
    return 50;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

export function highLow52Week(rows: OhlcvRow[]): { high: number | null; low: number | null } {
  if (rows.length === 0) {
    return { high: null, low: null };
  }

  const latestYear = rows.slice(-252);
  const high = Math.max(...latestYear.map((row) => row.high).filter(Number.isFinite));
  const low = Math.min(...latestYear.map((row) => row.low).filter(Number.isFinite));

  return {
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null
  };
}

export function averageVolume(rows: OhlcvRow[], period = 20): number | null {
  if (rows.length === 0) {
    return null;
  }

  const slice = rows.slice(-Math.min(period, rows.length));
  const validVolumes = slice.map((row) => row.volume).filter(Number.isFinite);
  if (validVolumes.length === 0) {
    return null;
  }

  return validVolumes.reduce((sum, value) => sum + value, 0) / validVolumes.length;
}

export function calculateHistoryMetrics(rows: OhlcvRow[]): HistoryMetrics {
  const closes = rows.map((row) => row.close).filter(Number.isFinite);
  const latestClose = closes.length > 0 ? closes[closes.length - 1] : null;
  const { high, low } = highLow52Week(rows);

  return {
    latestClose,
    high52Week: high,
    low52Week: low,
    percentFromLow:
      latestClose !== null && low !== null && low !== 0 ? ((latestClose - low) / low) * 100 : null,
    averageVolume: averageVolume(rows),
    performance5D: rateOfChange(closes, 5),
    ma20: movingAverage(closes, 20),
    ma50: movingAverage(closes, 50),
    ma200: movingAverage(closes, 200),
    rsi14: rsi(closes, 14),
    roc14: rateOfChange(closes, 14),
    roc21: rateOfChange(closes, 21)
  };
}
