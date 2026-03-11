import { useState, useMemo } from "react";
import type { StockData } from "../types";
import { calcSignal, calcSMA, calcRSI, type SignalResult, type OHLCV } from "../indicators";
import StockDetailModal from "./StockDetailModal";

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

interface TrendMA {
  period: number;
  label: string;
  value: number | null;
  deviation: number | null;
  direction: "up" | "down" | null;
}

function TrendArrow({ dir }: { dir: "up" | "down" | null }) {
  if (!dir) return <span className="trend-arrow trend-neutral">—</span>;
  return dir === "up"
    ? <span className="trend-arrow trend-up">↗</span>
    : <span className="trend-arrow trend-down">↘</span>;
}

function TrendRow({ trends }: { trends: TrendMA[] }) {
  return (
    <div className="trend-grid">
      {trends.map((t) => (
        <div key={t.period} className={`trend-cell ${t.direction ?? "neutral"}`}>
          <div className="trend-label">{t.label}</div>
          <TrendArrow dir={t.direction} />
          <div className="trend-dev">
            {t.deviation != null ? `${t.deviation >= 0 ? "+" : ""}${t.deviation.toFixed(1)}%` : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StatsCards({ stocks, tickerNames }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("stats");
  const [detailTicker, setDetailTicker] = useState<string | null>(null);

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
    const m: Record<string, { signal: SignalResult; ma25: number | null; rsi: number | null; trends: TrendMA[] }> = {};
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
        const last = closes[closes.length - 1];
        const sma25 = calcSMA(closes, 25);
        const rsi14 = calcRSI(closes, 14);

        const makeTrend = (period: number, label: string): TrendMA => {
          const sma = calcSMA(closes, period);
          const val = sma[sma.length - 1];
          if (val == null || last <= 0) return { period, label, value: null, deviation: null, direction: null };
          const dev = ((last - val) / val) * 100;
          return { period, label, value: val, deviation: dev, direction: last >= val ? "up" : "down" };
        };

        m[s.ticker] = {
          signal: calcSignal(ohlcv),
          ma25: sma25[sma25.length - 1] ?? null,
          rsi: rsi14[rsi14.length - 1] ?? null,
          trends: [
            makeTrend(5, "5日線"),
            makeTrend(25, "25日線"),
            makeTrend(75, "75日線"),
            makeTrend(200, "200日線"),
          ],
        };
      }
    }
    return m;
  }, [stocks]);

  const detailStock = detailTicker ? stocks.find((s) => s.ticker === detailTicker) : null;

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
            <div
              key={s.ticker}
              className="stat-card stat-card-clickable"
              onClick={() => setDetailTicker(s.ticker)}
              title="クリックで詳細を表示"
            >
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

              {/* トレンド表示 */}
              {tech?.trends && <TrendRow trends={tech.trends} />}

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
                        {s.last_close > 0 && (() => {
                          const above = s.last_close >= tech.ma25;
                          const diff = ((s.last_close - tech.ma25) / tech.ma25 * 100).toFixed(1);
                          return (
                            <span className={`stat-indicator-tag ${above ? "positive" : "negative"}`}>
                              {above ? "▲買い" : "▼売り"} ({above ? "+" : ""}{diff}%)
                            </span>
                          );
                        })()}
                      </span>
                    </div>
                  )}
                  {tech?.rsi != null && (
                    <div className="stat-row">
                      <span className="label">RSI(14)</span>
                      <span className="value">
                        {tech.rsi.toFixed(1)}
                        <span className={`stat-indicator-tag ${tech.rsi < 30 ? "positive" : tech.rsi > 70 ? "negative" : tech.rsi < 50 ? "positive" : "negative"}`}>
                          {tech.rsi < 30 ? "▲強い買い" : tech.rsi < 50 ? "▲買い圏" : tech.rsi > 70 ? "▼強い売り" : "▼売り圏"}
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

      {/* 銘柄詳細モーダル */}
      {detailTicker && detailStock && (
        <StockDetailModal
          stock={detailStock}
          name={displayName(detailTicker, detailStock.name, tickerNames)}
          trends={technicals[detailTicker]?.trends ?? []}
          signal={technicals[detailTicker]?.signal ?? null}
          rsi={technicals[detailTicker]?.rsi ?? null}
          onClose={() => setDetailTicker(null)}
        />
      )}
    </>
  );
}
