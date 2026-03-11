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

/**
 * 複合テクニカルシグナル判定
 * RSI / MACD / SMA クロスの複合スコアから買い・売り優勢を判定する。
 *
 * スコア配分（最大 ±8）:
 *   RSI(14)         : <30 → +2 / <40 → +1 / >60 → -1 / >70 → -2
 *   MACD ヒストグラム: >0 → +1 / <0 → -1
 *   MACD クロス方向  : 直近シグナル上抜け +1 / 下抜け -1
 *   価格 vs SMA(20) : 上 +1 / 下 -1
 *   価格 vs SMA(50) : 上 +1 / 下 -1
 *
 * 戻り値: { score, label, level }
 *   level: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell"
 */
export interface SignalResult {
  score: number;
  label: string;
  level: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell";
}

export function calcSignal(rows: OHLCV[]): SignalResult {
  const neutral: SignalResult = { score: 0, label: "中立", level: "neutral" };
  if (!rows?.length || rows.length < 26) return neutral;

  const closes = rows.map((r) => Number(r.close) || 0);
  const last = closes[closes.length - 1];
  if (last <= 0) return neutral;

  let score = 0;

  const rsi = calcRSI(closes, 14);
  const lastRsi = rsi[rsi.length - 1];
  if (lastRsi != null) {
    if (lastRsi < 30) score += 2;
    else if (lastRsi < 40) score += 1;
    else if (lastRsi > 70) score -= 2;
    else if (lastRsi > 60) score -= 1;
  }

  const { histogram } = calcMACD(closes);
  const lastHist = histogram[histogram.length - 1];
  const prevHist = histogram[histogram.length - 2];
  if (lastHist != null) {
    score += lastHist > 0 ? 1 : -1;
  }
  if (lastHist != null && prevHist != null) {
    if (prevHist <= 0 && lastHist > 0) score += 1;
    else if (prevHist >= 0 && lastHist < 0) score -= 1;
  }

  const sma20 = calcSMA(closes, 20);
  const lastSma20 = sma20[sma20.length - 1];
  if (lastSma20 != null) {
    score += last > lastSma20 ? 1 : -1;
  }

  const sma50 = calcSMA(closes, 50);
  const lastSma50 = sma50[sma50.length - 1];
  if (lastSma50 != null) {
    score += last > lastSma50 ? 1 : -1;
  }

  if (score >= 4) return { score, label: "強い買い", level: "strong_buy" };
  if (score >= 2) return { score, label: "買い優勢", level: "buy" };
  if (score <= -4) return { score, label: "強い売り", level: "strong_sell" };
  if (score <= -2) return { score, label: "売り優勢", level: "sell" };
  return { score, label: "中立", level: "neutral" };
}

export function addIndicators(rows: OHLCV[]): {
  date: string;
  close: number;
  volume: number;
  vwap: number;
  sma20: number | null;
  sma50: number | null;
  sma75: number | null;
  sma200: number | null;
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
  const sma75 = calcSMA(closes, 75);
  const sma200 = calcSMA(closes, 200);
  const rsi = calcRSI(closes, 14);
  const { macd, signal, histogram } = calcMACD(closes);

  return safe.map((r, i) => ({
    date: r.date,
    close: r.close,
    volume: r.volume,
    vwap: vwapArr[i] ?? (r.high + r.low + r.close) / 3,
    sma20: sma20[i] ?? null,
    sma50: sma50[i] ?? null,
    sma75: sma75[i] ?? null,
    sma200: sma200[i] ?? null,
    rsi: rsi[i] ?? null,
    macd: macd[i] ?? null,
    macdSignal: signal[i] ?? null,
    macdHistogram: histogram[i] ?? null,
  }));
}
