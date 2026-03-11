import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";
import type { ComparisonPoint } from "../types";
import type { StockData } from "../types";
import { addIndicators } from "../indicators";
import CandlestickChart from "./CandlestickChart";

type ChartType = "line" | "area" | "smooth" | "candle";
type YAxisMode = "normalized" | "price";

interface Props {
  comparison: ComparisonPoint[];
  stocks: StockData[];
  tickerNames: Record<string, string>;
  startDate: string;
  endDate: string;
  onPeriodChange?: (start: string, end: string) => void;
}

const COLORS = [
  "#58a6ff",
  "#f0883e",
  "#3fb950",
  "#bc8cff",
  "#f778ba",
  "#79c0ff",
  "#d29922",
  "#56d4dd",
];

function getPeriodPresets(): { label: string; start: string; end: string }[] {
  const end = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return [
    { label: "1M", start: fmt(new Date(end.getFullYear(), end.getMonth() - 1, end.getDate())), end: fmt(end) },
    { label: "3M", start: fmt(new Date(end.getFullYear(), end.getMonth() - 3, end.getDate())), end: fmt(end) },
    { label: "6M", start: fmt(new Date(end.getFullYear(), end.getMonth() - 6, end.getDate())), end: fmt(end) },
    { label: "1Y", start: fmt(new Date(end.getFullYear() - 1, end.getMonth(), end.getDate())), end: fmt(end) },
  ];
}

export default function StockChart({
  comparison,
  stocks,
  tickerNames,
  startDate,
  endDate,
  onPeriodChange,
}: Props) {
  const [chartType, setChartType] = useState<ChartType>("line");
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>("normalized");
  const [showVolume, setShowVolume] = useState(true);
  const [showVWAP, setShowVWAP] = useState(false);
  const [showSMA20, setShowSMA20] = useState(false);
  const [showSMA50, setShowSMA50] = useState(false);
  const [showSMA75, setShowSMA75] = useState(false);
  const [showSMA200, setShowSMA200] = useState(false);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);

  const tickers = useMemo(
    () => (comparison.length ? Object.keys(comparison[0]).filter((k) => k !== "date") : []),
    [comparison]
  );
  const singleTicker = tickers.length === 1 ? tickers[0] : null;
  const canShowPrice = singleTicker != null;
  const canShowVolume = singleTicker != null && stocks.length > 0 && stocks[0].data?.length > 0;

  // 実価格表示用: 1銘柄の data + 指標（VWAP, SMA, RSI, MACD）
  const priceChartData = useMemo(() => {
    if (!canShowPrice || !stocks[0] || !stocks[0].data?.length) return [];
    const raw = stocks[0].data;
    const rows = raw.map((r) => ({
      date: String(r.date ?? ""),
      open: Number(r.open) || 0,
      high: Number(r.high) || 0,
      low: Number(r.low) || 0,
      close: Number(r.close) || 0,
      volume: Number(r.volume) || 0,
    })).filter((r) => r.close > 0);
    if (rows.length === 0) return [];
    try {
      const withIndicators = addIndicators(rows);
      return withIndicators.map((row) => ({
        ...row,
        [singleTicker!]: row.close,
      }));
    } catch {
      return rows.map((r) => ({
        date: r.date,
        close: r.close,
        volume: r.volume,
        [singleTicker!]: r.close,
        vwap: (r.high + r.low + r.close) / 3,
        sma20: null as number | null,
        sma50: null as number | null,
        rsi: null as number | null,
        macd: null as number | null,
        macdSignal: null as number | null,
        macdHistogram: null as number | null,
      }));
    }
  }, [canShowPrice, singleTicker, stocks]);

  // 比較（基準100）モードでも SMA を重ねられるようにする
  const comparisonWithSMA = useMemo(() => {
    if (!comparison?.length || !stocks?.length) return comparison;
    if (!(showSMA20 || showSMA50 || showSMA75 || showSMA200)) return comparison;
    const dateMap = new Map(comparison.map((c, i) => [c.date, i]));
    const enriched = comparison.map((c) => ({ ...c }));
    for (const sd of stocks) {
      if (!sd.data?.length) continue;
      const closes = sd.data.map((r) => Number(r.close) || 0);
      const base = closes[0];
      if (!base || base <= 0) continue;
      const makeSMA = (period: number) => {
        for (let i = 0; i < closes.length; i++) {
          if (i < period - 1) continue;
          let sum = 0;
          for (let j = i - period + 1; j <= i; j++) sum += closes[j];
          const sma = sum / period;
          const normalized = (sma / base) * 100;
          const idx = dateMap.get(sd.data[i].date);
          if (idx != null) {
            enriched[idx][`${sd.ticker}_sma${period}`] = Math.round(normalized * 100) / 100;
          }
        }
      };
      if (showSMA20) makeSMA(20);
      if (showSMA50) makeSMA(50);
      if (showSMA75) makeSMA(75);
      if (showSMA200) makeSMA(200);
    }
    return enriched;
  }, [comparison, stocks, showSMA20, showSMA50, showSMA75, showSMA200]);

  const chartData = yAxisMode === "price" && canShowPrice ? priceChartData : comparisonWithSMA;
  const hasIndicators = canShowPrice && yAxisMode === "price" && priceChartData.length > 0;
  const hasComparisonSMA = !canShowPrice && (showSMA20 || showSMA50 || showSMA75 || showSMA200) && stocks.length > 0;
  const step = Math.max(1, Math.floor((chartData?.length ?? 0) / 20));
  const presets = getPeriodPresets();

  if (!comparison?.length) return <div className="loading">データがありません</div>;

  const showVolumeBar = yAxisMode === "price" && canShowVolume && showVolume && singleTicker != null;
  const showAnyOverlay = hasIndicators && (showVWAP || showSMA20 || showSMA50 || showSMA75 || showSMA200);
  const useComposed = showVolumeBar || showAnyOverlay || hasComparisonSMA;

  const formatTooltipValue = (value: number, name: string) => {
    if (name === "volume") return value.toLocaleString();
    if (name === "rsi" || name === "RSI") return value.toFixed(1);
    if (name === "macd" || name === "macdSignal" || name === "macdHistogram") return value.toFixed(3);
    if (yAxisMode === "price") return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return value.toFixed(1);
  };

  const renderChart = () => {
    const isArea = chartType === "area";
    const ChartWrapper = useComposed ? ComposedChart : isArea ? AreaChart : LineChart;
    return (
      <ChartWrapper data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#8b949e", fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(5)}
          interval={step}
        />
        <YAxis
          yAxisId="main"
          tick={{ fill: "#8b949e", fontSize: 11 }}
          domain={["auto", "auto"]}
        />
        {showVolumeBar && (
          <YAxis yAxisId="volume" orientation="right" hide tick={{ fill: "#8b949e" }} />
        )}
        <Tooltip
          contentStyle={{
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 6,
            fontSize: 13,
          }}
          labelStyle={{ color: "#8b949e" }}
          formatter={(value: number, name: string) => {
            const label =
              { volume: "出来高", vwap: "VWAP", sma20: "SMA(20)", sma50: "SMA(50)" }[name] ||
              tickerNames[name] ||
              name;
            return [formatTooltipValue(value, name), label];
          }}
          labelFormatter={(label) => label}
        />
        <Legend
          formatter={(value: string) =>
            value === "volume"
              ? "出来高"
              : value === "vwap"
                ? "VWAP"
                : value === "sma20"
                  ? "SMA(20)"
                  : value === "sma50"
                    ? "SMA(50)"
                    : tickerNames[value] || value
          }
          wrapperStyle={{ fontSize: 13 }}
        />
        {tickers.map((ticker, i) =>
          isArea ? (
            <Area
              key={ticker}
              yAxisId="main"
              type="monotone"
              dataKey={ticker}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.2}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ) : (
            <Line
              key={ticker}
              yAxisId="main"
              type={chartType === "smooth" ? "monotone" : "linear"}
              dataKey={ticker}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          )
        )}
        {hasIndicators && showVWAP && (
          <Line yAxisId="main" type="monotone" dataKey="vwap" stroke="#d29922" strokeWidth={1.5} dot={false} connectNulls name="VWAP" />
        )}
        {hasIndicators && showSMA20 && (
          <Line yAxisId="main" type="monotone" dataKey="sma20" stroke="#3fb950" strokeWidth={1.5} dot={false} connectNulls name="SMA(20)" />
        )}
        {hasIndicators && showSMA50 && (
          <Line yAxisId="main" type="monotone" dataKey="sma50" stroke="#f778ba" strokeWidth={1.5} dot={false} connectNulls name="SMA(50)" />
        )}
        {hasIndicators && showSMA75 && (
          <Line yAxisId="main" type="monotone" dataKey="sma75" stroke="#56d4dd" strokeWidth={1.5} dot={false} connectNulls name="SMA(75)" />
        )}
        {hasIndicators && showSMA200 && (
          <Line yAxisId="main" type="monotone" dataKey="sma200" stroke="#d29922" strokeWidth={1.5} dot={false} connectNulls name="SMA(200)" />
        )}
        {hasComparisonSMA && tickers.map((ticker, i) => {
          const color = COLORS[i % COLORS.length];
          return [
            showSMA20 && (
              <Line
                key={`${ticker}_sma20`}
                yAxisId="main"
                type="monotone"
                dataKey={`${ticker}_sma20`}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="4 2"
                dot={false}
                connectNulls
                name={`${tickerNames[ticker] || ticker} SMA(20)`}
              />
            ),
            showSMA50 && (
              <Line
                key={`${ticker}_sma50`}
                yAxisId="main"
                type="monotone"
                dataKey={`${ticker}_sma50`}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="8 3"
                dot={false}
                connectNulls
                name={`${tickerNames[ticker] || ticker} SMA(50)`}
              />
            ),
            showSMA75 && (
              <Line
                key={`${ticker}_sma75`}
                yAxisId="main"
                type="monotone"
                dataKey={`${ticker}_sma75`}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
                name={`${tickerNames[ticker] || ticker} SMA(75)`}
              />
            ),
            showSMA200 && (
              <Line
                key={`${ticker}_sma200`}
                yAxisId="main"
                type="monotone"
                dataKey={`${ticker}_sma200`}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="12 4"
                dot={false}
                connectNulls
                name={`${tickerNames[ticker] || ticker} SMA(200)`}
              />
            ),
          ];
        })}
        {showVolumeBar && (
          <Bar
            yAxisId="volume"
            dataKey="volume"
            fill="#30363d"
            radius={[2, 2, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        )}
      </ChartWrapper>
    );
  };

  const stepSub = Math.max(1, Math.floor(priceChartData.length / 15));

  return (
    <div className="chart-wrapper">
      <div className="chart-toolbar">
        <div className="chart-toolbar-group">
          <span className="chart-toolbar-label">期間</span>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chart-toolbar-btn ${startDate === p.start ? "active" : ""}`}
              onClick={() => onPeriodChange?.(p.start, p.end)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="chart-toolbar-group">
          <span className="chart-toolbar-label">チャート</span>
          {(["line", "area", "smooth", ...(canShowPrice ? ["candle" as const] : [])] as ChartType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`chart-toolbar-btn ${chartType === t ? "active" : ""}`}
              onClick={() => setChartType(t)}
            >
              {{ line: "線", area: "エリア", smooth: "スムーズ", candle: "ローソク足" }[t]}
            </button>
          ))}
        </div>
        <div className="chart-toolbar-group">
          <span className="chart-toolbar-label">Y軸</span>
          <button
            type="button"
            className={`chart-toolbar-btn ${yAxisMode === "normalized" ? "active" : ""}`}
            onClick={() => setYAxisMode("normalized")}
          >
            基準100
          </button>
          {canShowPrice && (
            <button
              type="button"
              className={`chart-toolbar-btn ${yAxisMode === "price" ? "active" : ""}`}
              onClick={() => setYAxisMode("price")}
            >
              実価格
            </button>
          )}
        </div>
        {canShowVolume && (
          <div className="chart-toolbar-group">
            <button
              type="button"
              className={`chart-toolbar-btn ${showVolume ? "active" : ""}`}
              onClick={() => setShowVolume(!showVolume)}
            >
              出来高 {showVolume ? "ON" : "OFF"}
            </button>
          </div>
        )}
        {(hasIndicators || stocks.length > 0) && (
          <div className="chart-toolbar-group">
            <span className="chart-toolbar-label">指標</span>
            {hasIndicators && (
              <button
                type="button"
                className={`chart-toolbar-btn ${showVWAP ? "active" : ""}`}
                onClick={() => setShowVWAP(!showVWAP)}
              >
                VWAP
              </button>
            )}
            <button
              type="button"
              className={`chart-toolbar-btn ${showSMA20 ? "active" : ""}`}
              onClick={() => setShowSMA20(!showSMA20)}
            >
              SMA(20)
            </button>
            <button
              type="button"
              className={`chart-toolbar-btn ${showSMA50 ? "active" : ""}`}
              onClick={() => setShowSMA50(!showSMA50)}
            >
              SMA(50)
            </button>
            <button
              className={`chart-toolbar-btn ${showSMA75 ? "active" : ""}`}
              onClick={() => setShowSMA75(!showSMA75)}
            >
              SMA(75)
            </button>
            <button
              className={`chart-toolbar-btn ${showSMA200 ? "active" : ""}`}
              onClick={() => setShowSMA200(!showSMA200)}
            >
              SMA(200)
            </button>
            {hasIndicators && (
              <>
                <button
                  type="button"
                  className={`chart-toolbar-btn ${showRSI ? "active" : ""}`}
                  onClick={() => setShowRSI(!showRSI)}
                >
                  RSI
                </button>
                <button
                  type="button"
                  className={`chart-toolbar-btn ${showMACD ? "active" : ""}`}
                  onClick={() => setShowMACD(!showMACD)}
                >
                  MACD
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {chartType === "candle" && canShowPrice && stocks[0] ? (
        <CandlestickChart
          stock={stocks[0]}
          tickerName={tickerNames[singleTicker!] || singleTicker!}
        />
      ) : (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      )}
      {hasIndicators && showRSI && (
        <div className="chart-subpanel">
          <div className="chart-subpanel-title">RSI(14)</div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={priceChartData} margin={{ top: 4, right: 20, left: 20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey="date" tick={{ fill: "#8b949e", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={stepSub} hide />
              <YAxis domain={[0, 100]} tick={{ fill: "#8b949e", fontSize: 10 }} width={32} />
              <ReferenceLine y={70} stroke="#f85149" strokeDasharray="2 2" />
              <ReferenceLine y={30} stroke="#3fb950" strokeDasharray="2 2" />
              <Tooltip
                contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 12 }}
                formatter={(v: number) => [v.toFixed(1), "RSI"]}
                labelFormatter={(l) => l}
              />
              <Line type="monotone" dataKey="rsi" stroke="#bc8cff" strokeWidth={2} dot={false} connectNulls name="RSI" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {hasIndicators && showMACD && (
        <div className="chart-subpanel">
          <div className="chart-subpanel-title">MACD(12,26,9)</div>
          <ResponsiveContainer width="100%" height={120}>
            <ComposedChart data={priceChartData} margin={{ top: 4, right: 20, left: 20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey="date" tick={{ fill: "#8b949e", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={stepSub} />
              <YAxis tick={{ fill: "#8b949e", fontSize: 10 }} width={48} />
              <Tooltip
                contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 12 }}
                formatter={(value: number, name: string) => [value?.toFixed(3) ?? value, { macd: "MACD", macdSignal: "Signal", macdHistogram: "Histogram" }[name] ?? name]}
                labelFormatter={(l) => l}
              />
              <Bar dataKey="macdHistogram" radius={[1, 1, 0, 0]} maxBarSize={4} isAnimationActive={false}>
                {priceChartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.macdHistogram != null && entry.macdHistogram >= 0 ? "#3fb950" : "#f85149"
                    }
                  />
                ))}
              </Bar>
              <Line type="monotone" dataKey="macd" stroke="#58a6ff" strokeWidth={1.5} dot={false} connectNulls name="macd" />
              <Line type="monotone" dataKey="macdSignal" stroke="#f0883e" strokeWidth={1} dot={false} connectNulls name="macdSignal" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
