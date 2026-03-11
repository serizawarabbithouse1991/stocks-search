import { useState, useMemo } from "react";
import type { StockData } from "../types";
import { calcSignal, calcSMA, calcRSI, type SignalResult, type OHLCV } from "../indicators";

interface Props {
  stocks: StockData[];
  tickerNames: Record<string, string>;
}

type ViewMode = "stats" | "chart";

function formatPrice(n: number): string {
  return n.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

function Sparkline({ data, width = 220, height = 64 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  const isUp = data[data.length - 1] >= data[0];
  const color = isUp ? "var(--positive)" : "var(--negative)";
  const gradId = `sp-${Math.random().toString(36).slice(2, 8)}`;

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.8} />
    </svg>
  );
}

function displayName(ticker: string, stockName: string | undefined, tickerNames: Record<string, string>): string {
  const name = tickerNames[ticker] || stockName;
  if (name && name !== ticker && name !== ticker.replace(/\.T$/, "")) return name;
  return "";
}

export default function StatsCards({ stocks, tickerNames }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("stats");

  const sparklineData = useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const s of stocks) {
      if (s.data?.length) {
        m[s.ticker] = s.data.map((r) => Number(r.close) || 0).filter((v) => v > 0);
      }
    }
    return m;
  }, [stocks]);

  const technicals = useMemo(() => {
    const m: Record<string, { signal: SignalResult; ma25: number | null; rsi: number | null }> = {};
    for (const s of stocks) {
      if (s.data?.length) {
        const ohlcv: OHLCV[] = s.data.map((r) => ({
          date: r.date,
          open: Number(r.open) || 0,
          high: Number(r.high) || 0,
          low: Number(r.low) || 0,
          close: Number(r.close) || 0,
          volume: Number(r.volume) || 0,
        }));
        const closes = ohlcv.map((r) => r.close);
        const sma25 = calcSMA(closes, 25);
        const rsi14 = calcRSI(closes, 14);
        m[s.ticker] = {
          signal: calcSignal(ohlcv),
          ma25: sma25[sma25.length - 1] ?? null,
          rsi: rsi14[rsi14.length - 1] ?? null,
        };
      }
    }
    return m;
  }, [stocks]);

  if (!stocks?.length) return null;

  return (
    <>
      <div className="stats-header">
        <div className="stats-toggle">
          <button
            type="button"
            className={`chart-toolbar-btn ${viewMode === "stats" ? "active" : ""}`}
            onClick={() => setViewMode("stats")}
          >
            サマリー
          </button>
          <button
            type="button"
            className={`chart-toolbar-btn ${viewMode === "chart" ? "active" : ""}`}
            onClick={() => setViewMode("chart")}
          >
            ミニチャート
          </button>
        </div>
      </div>
      <div className="stats-grid">
        {stocks.map((s) => {
          const name = displayName(s.ticker, s.name, tickerNames);
          const symbolCode = s.ticker;
          const tech = technicals[s.ticker];
          const sig = tech?.signal;
          return (
            <div key={s.ticker} className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-symbol">{symbolCode}</span>
                {name && <span className="stat-card-name">{name}</span>}
                <span className={`stat-card-change ${s.change_pct >= 0 ? "positive" : "negative"}`}>
                  {s.change_pct >= 0 ? "+" : ""}{s.change_pct}%
                </span>
              </div>
              {sig && (
                <div className={`signal-badge signal-${sig.level}`} title={`スコア: ${sig.score}`}>
                  <span className="signal-dot" />
                  {sig.label}
                </div>
              )}

              {viewMode === "stats" ? (
                <div className="stat-card-body">
                  <div className="stat-row">
                    <span className="label">始値</span>
                    <span className="value">&yen;{formatPrice(s.first_close)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">終値</span>
                    <span className="value">&yen;{formatPrice(s.last_close)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">高値</span>
                    <span className="value">
                      &yen;{formatPrice(s.high_max)}{" "}
                      <span className="label" style={{ fontSize: "0.75rem" }}>({s.high_max_date})</span>
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="label">安値</span>
                    <span className="value">
                      &yen;{formatPrice(s.low_min)}{" "}
                      <span className="label" style={{ fontSize: "0.75rem" }}>({s.low_min_date})</span>
                    </span>
                  </div>
                  {tech?.ma25 != null && (
                    <div className="stat-row">
                      <span className="label">MA25</span>
                      <span className="value">
                        &yen;{formatPrice(tech.ma25)}
                        {s.last_close > 0 && (
                          <span className={`stat-indicator-tag ${s.last_close >= tech.ma25 ? "positive" : "negative"}`}>
                            {s.last_close >= tech.ma25 ? "上" : "下"}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {tech?.rsi != null && (
                    <div className="stat-row">
                      <span className="label">RSI(14)</span>
                      <span className="value">
                        {tech.rsi.toFixed(1)}
                        <span className={`stat-indicator-tag ${tech.rsi < 30 ? "positive" : tech.rsi > 70 ? "negative" : ""}`}>
                          {tech.rsi < 30 ? "売られ過ぎ" : tech.rsi > 70 ? "買われ過ぎ" : ""}
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="stat-row">
                    <span className="label">日数</span>
                    <span className="value">{s.count}日</span>
                  </div>
                </div>
              ) : (
                <div className="stat-card-chart">
                  <Sparkline data={sparklineData[s.ticker] || []} />
                  <div className="stat-card-price-row">
                    <span className="value">&yen;{formatPrice(s.last_close)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
