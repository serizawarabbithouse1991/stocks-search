/**
 * テクニカル指標の計算（日足 OHLCV 用）
 */

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 日次 VWAP: (H+L+C)/3（日足では 1 本ごとの典型価格） */
export function calcVWAP(rows: OHLCV[]): number[] {
  return rows.map((r) => (r.high + r.low + r.close) / 3);
}

/** SMA(period) */
export function calcSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push(sum / period);
  }
  return result;
}

/** EMA(period) */
function calcEMA(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = [];
  let ema: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (ema == null) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      ema = sum / period;
    } else {
      ema = values[i] * k + ema * (1 - k);
    }
    result.push(ema);
  }
  return result;
}

/** RSI(period) デフォルト 14 */
export function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(null);
      continue;
    }
    let gainSum = 0;
    let lossSum = 0;
    for (let j = i - period + 1; j < i; j++) {
      const diff = closes[j + 1] - closes[j];
      if (diff > 0) gainSum += diff;
      else lossSum += -diff;
    }
    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;
    if (avgLoss === 0) {
      result.push(100);
      continue;
    }
    const rs = avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

/** MACD(12, 26, 9) → { macd, signal, histogram } */
export function calcMACD(closes: number[]): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macd: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] != null && ema26[i] != null) {
      macd.push(ema12[i]! - ema26[i]!);
    } else {
      macd.push(null);
    }
  }
  const macdValues = macd.map((m) => m ?? 0);
  const signal = calcEMA(macdValues, 9);
  const histogram: (number | null)[] = [];
  for (let i = 0; i < macd.length; i++) {
    if (macd[i] != null && signal[i] != null) {
      histogram.push(macd[i]! - signal[i]!);
    } else {
      histogram.push(null);
    }
  }
  return { macd, signal, histogram };
}

export function addIndicators(rows: OHLCV[]): {
  date: string;
  close: number;
  volume: number;
  vwap: number;
  sma20: number | null;
  sma50: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
}[] {
  if (!rows?.length) return [];
  const safe = rows.map((r) => ({
    date: String(r?.date ?? ""),
    open: Number(r?.open) || 0,
    high: Number(r?.high) || 0,
    low: Number(r?.low) || 0,
    close: Number(r?.close) || 0,
    volume: Number(r?.volume) || 0,
  }));
  const closes = safe.map((r) => r.close);
  const vwapArr = calcVWAP(safe);
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const rsi = calcRSI(closes, 14);
  const { macd, signal, histogram } = calcMACD(closes);

  return safe.map((r, i) => ({
    date: r.date,
    close: r.close,
    volume: r.volume,
    vwap: vwapArr[i] ?? (r.high + r.low + r.close) / 3,
    sma20: sma20[i] ?? null,
    sma50: sma50[i] ?? null,
    rsi: rsi[i] ?? null,
    macd: macd[i] ?? null,
    macdSignal: signal[i] ?? null,
    macdHistogram: histogram[i] ?? null,
  }));
}
