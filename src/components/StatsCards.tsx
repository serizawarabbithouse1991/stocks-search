import type { StockData } from "../types";

interface Props {
  stocks: StockData[];
  tickerNames: Record<string, string>;
}

function formatPrice(n: number): string {
  return n.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

export default function StatsCards({ stocks, tickerNames }: Props) {
  return (
    <div className="stats-grid">
      {stocks.map((s) => (
        <div key={s.ticker} className="stat-card">
          <h3>
            {tickerNames[s.ticker] || s.ticker}
            <span className="label" style={{ fontWeight: 400, fontSize: "0.85rem", marginLeft: 8 }}>
              {s.ticker}
            </span>
          </h3>
          <div className="stat-row">
            <span className="label">期間始値</span>
            <span className="value">&yen;{formatPrice(s.first_close)}</span>
          </div>
          <div className="stat-row">
            <span className="label">期間終値</span>
            <span className="value">&yen;{formatPrice(s.last_close)}</span>
          </div>
          <div className="stat-row">
            <span className="label">最高値</span>
            <span className="value">
              &yen;{formatPrice(s.high_max)}{" "}
              <span className="label" style={{ fontSize: "0.8rem" }}>({s.high_max_date})</span>
            </span>
          </div>
          <div className="stat-row">
            <span className="label">最安値</span>
            <span className="value">
              &yen;{formatPrice(s.low_min)}{" "}
              <span className="label" style={{ fontSize: "0.8rem" }}>({s.low_min_date})</span>
            </span>
          </div>
          <div className="stat-row">
            <span className="label">騰落率</span>
            <span className={`value ${s.change_pct >= 0 ? "positive" : "negative"}`}>
              {s.change_pct >= 0 ? "+" : ""}
              {s.change_pct}%
            </span>
          </div>
          <div className="stat-row">
            <span className="label">取得日数</span>
            <span className="value">{s.count}日</span>
          </div>
        </div>
      ))}
    </div>
  );
}
