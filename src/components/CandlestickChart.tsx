import { useState, useMemo, useRef, useCallback } from "react";
import type { StockData } from "../types";
import { addIndicators } from "../indicators";

interface Props {
  stock: StockData;
  tickerName: string;
}

const UP_COLOR = "#3fb950";
const DOWN_COLOR = "#f85149";
const GRID_COLOR = "#30363d";
const TEXT_COLOR = "#8b949e";
const BG_COLOR = "#0d1117";

interface Row {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isUp: boolean;
  sma20: number | null;
  sma50: number | null;
  sma75: number | null;
  sma200: number | null;
}

export default function CandlestickChart({ stock, tickerName }: Props) {
  const [showVolume, setShowVolume] = useState(true);
  const [showSMA20, setShowSMA20] = useState(false);
  const [showSMA50, setShowSMA50] = useState(false);
  const [showSMA75, setShowSMA75] = useState(false);
  const [showSMA200, setShowSMA200] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const data = useMemo((): Row[] => {
    if (!stock?.data?.length) return [];
    const raw = stock.data
      .map((r) => ({
        date: String(r.date ?? ""),
        open: Number(r.open) || 0,
        high: Number(r.high) || 0,
        low: Number(r.low) || 0,
        close: Number(r.close) || 0,
        volume: Number(r.volume) || 0,
      }))
      .filter((r) => r.close > 0);
    let sma20: (number | null)[] = raw.map(() => null);
    let sma50: (number | null)[] = raw.map(() => null);
    let sma75: (number | null)[] = raw.map(() => null);
    let sma200: (number | null)[] = raw.map(() => null);
    try {
      const ind = addIndicators(raw);
      sma20 = ind.map((r) => r.sma20);
      sma50 = ind.map((r) => r.sma50);
      sma75 = ind.map((r) => r.sma75);
      sma200 = ind.map((r) => r.sma200);
    } catch { /* ignore */ }
    return raw.map((r, i) => ({
      ...r,
      isUp: r.close >= r.open,
      sma20: sma20[i],
      sma50: sma50[i],
      sma75: sma75[i],
      sma200: sma200[i],
    }));
  }, [stock]);

  const margin = { top: 10, right: 60, bottom: 30, left: 10 };
  const chartWidth = 900;
  const priceHeight = 300;
  const volHeight = showVolume ? 80 : 0;
  const totalHeight = priceHeight + volHeight + margin.top + margin.bottom;
  const innerW = chartWidth - margin.left - margin.right;

  const n = data.length;
  const candleW = n > 0 ? Math.max(1, Math.min(12, (innerW / n) * 0.7)) : 4;
  const gap = n > 0 ? innerW / n : 1;

  const priceMin = useMemo(() => (n > 0 ? Math.min(...data.map((d) => d.low)) * 0.998 : 0), [data, n]);
  const priceMax = useMemo(() => (n > 0 ? Math.max(...data.map((d) => d.high)) * 1.002 : 100), [data, n]);
  const volMax = useMemo(() => (n > 0 ? Math.max(...data.map((d) => d.volume), 1) : 1), [data, n]);

  const yPrice = useCallback((v: number) => margin.top + priceHeight - ((v - priceMin) / (priceMax - priceMin)) * priceHeight, [priceMin, priceMax, priceHeight]);
  const yVol = useCallback((v: number) => margin.top + priceHeight + volHeight - (v / volMax) * volHeight, [volMax, priceHeight, volHeight]);
  const xPos = useCallback((i: number) => margin.left + i * gap + gap / 2, [gap]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || n === 0) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = Math.round((x - margin.left - gap / 2) / gap);
      setHoverIdx(idx >= 0 && idx < n ? idx : null);
    },
    [n, gap]
  );

  if (data.length === 0) return <div className="loading">データがありません</div>;

  const labelStep = Math.max(1, Math.floor(n / 12));
  const priceTicks = 5;
  const priceRange = priceMax - priceMin;
  const priceStep = priceRange / priceTicks;

  const hoverRow = hoverIdx != null ? data[hoverIdx] : null;

  const sma20Points = showSMA20
    ? data.map((d, i) => (d.sma20 != null ? `${xPos(i)},${yPrice(d.sma20)}` : null)).filter(Boolean)
    : [];
  const sma50Points = showSMA50
    ? data.map((d, i) => (d.sma50 != null ? `${xPos(i)},${yPrice(d.sma50)}` : null)).filter(Boolean)
    : [];
  const sma75Points = showSMA75
    ? data.map((d, i) => (d.sma75 != null ? `${xPos(i)},${yPrice(d.sma75)}` : null)).filter(Boolean)
    : [];
  const sma200Points = showSMA200
    ? data.map((d, i) => (d.sma200 != null ? `${xPos(i)},${yPrice(d.sma200)}` : null)).filter(Boolean)
    : [];

  return (
    <div className="candlestick-wrapper">
      <div className="chart-toolbar" style={{ borderBottom: "none", padding: "4px 0", marginBottom: 4 }}>
        <button type="button" className={`chart-toolbar-btn ${showVolume ? "active" : ""}`} onClick={() => setShowVolume(!showVolume)}>出来高</button>
        <button type="button" className={`chart-toolbar-btn ${showSMA20 ? "active" : ""}`} onClick={() => setShowSMA20(!showSMA20)}>SMA(20)</button>
        <button type="button" className={`chart-toolbar-btn ${showSMA50 ? "active" : ""}`} onClick={() => setShowSMA50(!showSMA50)}>SMA(50)</button>
        <button type="button" className={`chart-toolbar-btn ${showSMA75 ? "active" : ""}`} onClick={() => setShowSMA75(!showSMA75)}>SMA(75)</button>
        <button type="button" className={`chart-toolbar-btn ${showSMA200 ? "active" : ""}`} onClick={() => setShowSMA200(!showSMA200)}>SMA(200)</button>
      </div>
      {hoverRow && (
        <div className="candle-tooltip">
          <span>{hoverRow.date}</span>
          <span>O: {hoverRow.open.toLocaleString()}</span>
          <span>H: {hoverRow.high.toLocaleString()}</span>
          <span>L: {hoverRow.low.toLocaleString()}</span>
          <span style={{ color: hoverRow.isUp ? UP_COLOR : DOWN_COLOR, fontWeight: 600 }}>C: {hoverRow.close.toLocaleString()}</span>
          <span>Vol: {hoverRow.volume.toLocaleString()}</span>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${totalHeight}`}
        width="100%"
        style={{ background: BG_COLOR, borderRadius: 8 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* グリッド横線（価格） */}
        {Array.from({ length: priceTicks + 1 }).map((_, i) => {
          const val = priceMin + priceStep * i;
          const y = yPrice(val);
          return (
            <g key={`grid-${i}`}>
              <line x1={margin.left} y1={y} x2={chartWidth - margin.right} y2={y} stroke={GRID_COLOR} strokeWidth={0.5} />
              <text x={chartWidth - margin.right + 4} y={y + 3} fill={TEXT_COLOR} fontSize={10}>{Math.round(val).toLocaleString()}</text>
            </g>
          );
        })}
        {/* X 軸ラベル */}
        {data.map((d, i) =>
          i % labelStep === 0 ? (
            <text key={`x-${i}`} x={xPos(i)} y={margin.top + priceHeight + volHeight + 16} fill={TEXT_COLOR} fontSize={10} textAnchor="middle">
              {d.date.length > 10 ? d.date.slice(11, 16) : d.date.slice(5)}
            </text>
          ) : null
        )}
        {/* 出来高バー */}
        {showVolume &&
          data.map((d, i) => (
            <rect
              key={`vol-${i}`}
              x={xPos(i) - candleW / 2}
              y={yVol(d.volume)}
              width={candleW}
              height={margin.top + priceHeight + volHeight - yVol(d.volume)}
              fill={d.isUp ? `${UP_COLOR}33` : `${DOWN_COLOR}33`}
            />
          ))}
        {/* ローソク足 */}
        {data.map((d, i) => {
          const cx = xPos(i);
          const color = d.isUp ? UP_COLOR : DOWN_COLOR;
          const bodyTop = yPrice(Math.max(d.open, d.close));
          const bodyBot = yPrice(Math.min(d.open, d.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          return (
            <g key={`c-${i}`}>
              <line x1={cx} y1={yPrice(d.high)} x2={cx} y2={yPrice(d.low)} stroke={color} strokeWidth={1} />
              <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={d.isUp ? BG_COLOR : color} stroke={color} strokeWidth={1} />
            </g>
          );
        })}
        {/* SMA(20) */}
        {sma20Points.length > 1 && (
          <polyline points={sma20Points.join(" ")} fill="none" stroke="#3fb950" strokeWidth={1.5} />
        )}
        {/* SMA(50) */}
        {sma50Points.length > 1 && (
          <polyline points={sma50Points.join(" ")} fill="none" stroke="#f778ba" strokeWidth={1.5} />
        )}
        {/* SMA(75) */}
        {sma75Points.length > 1 && (
          <polyline points={sma75Points.join(" ")} fill="none" stroke="#56d4dd" strokeWidth={1.5} />
        )}
        {/* SMA(200) */}
        {sma200Points.length > 1 && (
          <polyline points={sma200Points.join(" ")} fill="none" stroke="#d29922" strokeWidth={1.5} />
        )}
        {/* クロスヘア */}
        {hoverIdx != null && (
          <>
            <line x1={xPos(hoverIdx)} y1={margin.top} x2={xPos(hoverIdx)} y2={margin.top + priceHeight + volHeight} stroke="#8b949e44" strokeWidth={1} strokeDasharray="3 2" />
          </>
        )}
      </svg>
    </div>
  );
}
