import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { StockData } from "../types";
import { addIndicators } from "../indicators";

interface Props {
  stocks: StockData[];
  tickerNames: Record<string, string>;
}

const PRICE_COLOR = "#58a6ff";

type IndicatorFlags = {
  vwap: boolean;
  sma20: boolean;
  sma50: boolean;
  sma75: boolean;
  sma200: boolean;
  rsi: boolean;
  macd: boolean;
  volume: boolean;
};

const DEFAULT_FLAGS: IndicatorFlags = {
  vwap: false,
  sma20: true,
  sma50: false,
  sma75: false,
  sma200: false,
  rsi: false,
  macd: false,
  volume: true,
};

function SingleStockChart({
  stock,
  name,
}: {
  stock: StockData;
  name: string;
}) {
  const [flags, setFlags] = useState<IndicatorFlags>({ ...DEFAULT_FLAGS });

  const toggle = (key: keyof IndicatorFlags) =>
    setFlags((f) => ({ ...f, [key]: !f[key] }));

  const data = useMemo(() => {
    if (!stock.data?.length) return [];
    const rows = stock.data.map((r) => ({
      date: String(r.date ?? ""),
      open: Number(r.open) || 0,
      high: Number(r.high) || 0,
      low: Number(r.low) || 0,
      close: Number(r.close) || 0,
      volume: Number(r.volume) || 0,
    })).filter((r) => r.close > 0);
    if (rows.length === 0) return [];
    try {
      return addIndicators(rows);
    } catch {
      return rows.map((r) => ({
        ...r,
        vwap: (r.high + r.low + r.close) / 3,
        sma20: null as number | null,
        sma50: null as number | null,
        rsi: null as number | null,
        macd: null as number | null,
        macdSignal: null as number | null,
        macdHistogram: null as number | null,
      }));
    }
  }, [stock]);

  if (data.length === 0) return null;

  const step = Math.max(1, Math.floor(data.length / 18));
  const changePct = stock.change_pct;

  return (
    <div className="individual-chart-card">
      <div className="individual-chart-header">
        <div className="individual-chart-title">
          <span className="individual-chart-ticker">{stock.ticker}</span>
          <span className="individual-chart-name">{name}</span>
          <span className={`individual-chart-change ${changePct >= 0 ? "positive" : "negative"}`}>
            {changePct >= 0 ? "+" : ""}{changePct}%
          </span>
        </div>
        <div className="chart-toolbar" style={{ padding: 0, borderBottom: "none", marginBottom: 0 }}>
          {(
            [
              ["volume", "出来高"],
              ["vwap", "VWAP"],
              ["sma20", "SMA(20)"],
              ["sma50", "SMA(50)"],
              ["sma75", "SMA(75)"],
              ["sma200", "SMA(200)"],
              ["rsi", "RSI"],
              ["macd", "MACD"],
            ] as [keyof IndicatorFlags, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chart-toolbar-btn ${flags[key] ? "active" : ""}`}
              onClick={() => toggle(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* メインチャート: 価格 + オーバーレイ指標 + 出来高 */}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#8b949e", fontSize: 10 }}
            tickFormatter={(v: string) => v.slice(5)}
            interval={step}
          />
          <YAxis yAxisId="price" tick={{ fill: "#8b949e", fontSize: 10 }} domain={["auto", "auto"]} />
          {flags.volume && <YAxis yAxisId="vol" orientation="right" hide />}
          <Tooltip
            contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "#8b949e" }}
            formatter={(value: number, n: string) => {
              const nameMap: Record<string, string> = {
                close: "終値",
                volume: "出来高",
                vwap: "VWAP",
                sma20: "SMA(20)",
                sma50: "SMA(50)",
                sma75: "SMA(75)",
                sma200: "SMA(200)",
              };
              return [
                n === "volume" ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                nameMap[n] ?? n,
              ];
            }}
          />
          <Line yAxisId="price" type="monotone" dataKey="close" stroke={PRICE_COLOR} strokeWidth={2} dot={false} connectNulls name="close" />
          {flags.vwap && (
            <Line yAxisId="price" type="monotone" dataKey="vwap" stroke="#d29922" strokeWidth={1.5} dot={false} connectNulls name="vwap" />
          )}
          {flags.sma20 && (
            <Line yAxisId="price" type="monotone" dataKey="sma20" stroke="#3fb950" strokeWidth={1.5} dot={false} connectNulls name="sma20" />
          )}
          {flags.sma50 && (
            <Line yAxisId="price" type="monotone" dataKey="sma50" stroke="#f778ba" strokeWidth={1.5} dot={false} connectNulls name="sma50" />
          )}
          {flags.sma75 && (
            <Line yAxisId="price" type="monotone" dataKey="sma75" stroke="#56d4dd" strokeWidth={1.5} dot={false} connectNulls name="sma75" />
          )}
          {flags.sma200 && (
            <Line yAxisId="price" type="monotone" dataKey="sma200" stroke="#d29922" strokeWidth={1.5} dot={false} connectNulls name="sma200" />
          )}
          {flags.volume && (
            <Bar yAxisId="vol" dataKey="volume" fill="#30363d" radius={[2, 2, 0, 0]} maxBarSize={20} isAnimationActive={false} name="volume" />
          )}
          <Legend
            formatter={(v: string) =>
              ({ close: "終値", volume: "出来高", vwap: "VWAP", sma20: "SMA(20)", sma50: "SMA(50)", sma75: "SMA(75)", sma200: "SMA(200)" }[v] ?? v)
            }
            wrapperStyle={{ fontSize: 11 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* RSI サブチャート */}
      {flags.rsi && (
        <div className="chart-subpanel">
          <div className="chart-subpanel-title">RSI(14)</div>
          <ResponsiveContainer width="100%" height={100}>
            <ComposedChart data={data} margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 100]} tick={{ fill: "#8b949e", fontSize: 10 }} width={32} />
              <ReferenceLine y={70} stroke="#f85149" strokeDasharray="2 2" />
              <ReferenceLine y={30} stroke="#3fb950" strokeDasharray="2 2" />
              <Tooltip
                contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 11 }}
                formatter={(v: number) => [v.toFixed(1), "RSI"]}
              />
              <Line type="monotone" dataKey="rsi" stroke="#bc8cff" strokeWidth={2} dot={false} connectNulls name="RSI" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* MACD サブチャート */}
      {flags.macd && (
        <div className="chart-subpanel">
          <div className="chart-subpanel-title">MACD(12,26,9)</div>
          <ResponsiveContainer width="100%" height={100}>
            <ComposedChart data={data} margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey="date" hide />
              <YAxis tick={{ fill: "#8b949e", fontSize: 10 }} width={48} />
              <Tooltip
                contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 11 }}
                formatter={(v: number, n: string) => [
                  v?.toFixed(3) ?? v,
                  { macd: "MACD", macdSignal: "Signal", macdHistogram: "Histogram" }[n] ?? n,
                ]}
              />
              <Bar dataKey="macdHistogram" maxBarSize={4} isAnimationActive={false}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.macdHistogram != null && entry.macdHistogram >= 0 ? "#3fb950" : "#f85149"} />
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

export default function IndividualCharts({ stocks, tickerNames }: Props) {
  if (!stocks?.length) return <div className="loading">データがありません</div>;

  return (
    <div className="individual-charts">
      {stocks.map((s) => (
        <SingleStockChart key={s.ticker} stock={s} name={tickerNames[s.ticker] || s.ticker} />
      ))}
    </div>
  );
}
