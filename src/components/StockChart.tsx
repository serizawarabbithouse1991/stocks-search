import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ComparisonPoint } from "../types";

interface Props {
  comparison: ComparisonPoint[];
  tickerNames: Record<string, string>;
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

export default function StockChart({ comparison, tickerNames }: Props) {
  if (!comparison.length) return <div className="loading">データがありません</div>;

  // ティッカーキーを取得（dateを除く）
  const tickers = Object.keys(comparison[0]).filter((k) => k !== "date");

  // 日付ラベルを間引く（20刻み程度）
  const step = Math.max(1, Math.floor(comparison.length / 20));

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={comparison} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#8b949e", fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)} // MM-DD
            interval={step}
          />
          <YAxis tick={{ fill: "#8b949e", fontSize: 11 }} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 6,
              fontSize: 13,
            }}
            labelStyle={{ color: "#8b949e" }}
            formatter={(value: number, name: string) => [
              `${value.toFixed(1)}`,
              tickerNames[name] || name,
            ]}
          />
          <Legend
            formatter={(value: string) => tickerNames[value] || value}
            wrapperStyle={{ fontSize: 13 }}
          />
          {tickers.map((ticker, i) => (
            <Line
              key={ticker}
              type="monotone"
              dataKey={ticker}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
