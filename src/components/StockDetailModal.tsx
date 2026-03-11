import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { StockData } from "../types";
import { addIndicators, type SignalResult } from "../indicators";
import { fetchFundamentals, type Fundamentals } from "../api";
import { useChartColors } from "../ThemeContext";

interface TrendMA {
  period: number;
  label: string;
  value: number | null;
  deviation: number | null;
  direction: "up" | "down" | null;
}

interface Props {
  stock: StockData;
  name: string;
  trends: TrendMA[];
  signal: SignalResult | null;
  rsi: number | null;
  onClose: () => void;
}

function fmtYen(n: number | null | undefined): string {
  if (n == null) return "—";
  return `¥${n.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}`;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function fmtBigYen(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}兆円`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(0)}億円`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)}万円`;
  return `¥${n.toLocaleString()}`;
}

function TrendArrowBig({ dir, label, dev }: { dir: "up" | "down" | null; label: string; dev: number | null }) {
  const cls = dir === "up" ? "trend-card-up" : dir === "down" ? "trend-card-down" : "trend-card-neutral";
  return (
    <div className={`trend-card ${cls}`}>
      <div className="trend-card-arrow">
        {dir === "up" ? "↗" : dir === "down" ? "↘" : "→"}
      </div>
      <div className="trend-card-label">{label}</div>
      <div className="trend-card-dev">
        {dev != null ? `${dev >= 0 ? "+" : ""}${dev.toFixed(2)}%` : "—"}
      </div>
    </div>
  );
}

export default function StockDetailModal({ stock, name, trends, signal, rsi, onClose }: Props) {
  const cc = useChartColors();
  const [fund, setFund] = useState<Fundamentals | null>(null);
  const [fundLoading, setFundLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "fundamentals" | "chart">("overview");

  useEffect(() => {
    setFundLoading(true);
    fetchFundamentals(stock.ticker).then((f) => {
      setFund(f);
      setFundLoading(false);
    });
  }, [stock.ticker]);

  const chartData = useMemo(() => {
    if (!stock.data?.length) return [];
    const rows = stock.data
      .map((r) => ({
        date: String(r.date ?? ""),
        open: Number(r.open) || 0,
        high: Number(r.high) || 0,
        low: Number(r.low) || 0,
        close: Number(r.close) || 0,
        volume: Number(r.volume) || 0,
      }))
      .filter((r) => r.close > 0);
    try {
      return addIndicators(rows);
    } catch {
      return rows;
    }
  }, [stock]);

  const step = Math.max(1, Math.floor(chartData.length / 20));

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="detail-header">
          <div className="detail-header-left">
            <span className="detail-ticker">{stock.ticker}</span>
            {name && <span className="detail-name">{name}</span>}
            <span className={`stat-card-change ${stock.change_pct >= 0 ? "positive" : "negative"}`}>
              {stock.change_pct >= 0 ? "+" : ""}{stock.change_pct}%
            </span>
            {signal && (
              <span className={`signal-badge signal-${signal.level}`} style={{ marginLeft: 8 }}>
                <span className="signal-dot" />
                {signal.label}
              </span>
            )}
          </div>
          <button className="detail-close" onClick={onClose}>&times;</button>
        </div>

        {/* トレンド */}
        <div className="detail-trend-row">
          <span className="detail-section-label">株価トレンド（平均線方向）</span>
          <div className="detail-trend-cards">
            {trends.map((t) => (
              <TrendArrowBig key={t.period} dir={t.direction} label={t.label} dev={t.deviation} />
            ))}
          </div>
        </div>

        {/* タブ */}
        <div className="ai-tabs" style={{ marginTop: 12 }}>
          <button className={`chart-toolbar-btn ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>概要</button>
          <button className={`chart-toolbar-btn ${tab === "fundamentals" ? "active" : ""}`} onClick={() => setTab("fundamentals")}>ファンダメンタルズ</button>
          <button className={`chart-toolbar-btn ${tab === "chart" ? "active" : ""}`} onClick={() => setTab("chart")}>チャート</button>
        </div>

        {/* 概要タブ */}
        {tab === "overview" && (
          <div className="detail-body">
            <div className="detail-grid-2col">
              <div className="detail-section">
                <h4>価格情報</h4>
                <table className="detail-table">
                  <tbody>
                    <tr><td>終値</td><td>{fmtYen(stock.last_close)}</td></tr>
                    <tr><td>始値</td><td>{fmtYen(stock.first_close)}</td></tr>
                    <tr><td>高値</td><td>{fmtYen(stock.high_max)} <small>({stock.high_max_date})</small></td></tr>
                    <tr><td>安値</td><td>{fmtYen(stock.low_min)} <small>({stock.low_min_date})</small></td></tr>
                    {fund && (
                      <>
                        <tr><td>52週高値</td><td>{fmtYen(fund.fifty_two_week_high)}</td></tr>
                        <tr><td>52週安値</td><td>{fmtYen(fund.fifty_two_week_low)}</td></tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="detail-section">
                <h4>テクニカル</h4>
                <table className="detail-table">
                  <tbody>
                    {rsi != null && <tr><td>RSI(14)</td><td>{rsi.toFixed(1)}</td></tr>}
                    {trends.map((t) => (
                      <tr key={t.period}>
                        <td>{t.label}</td>
                        <td>
                          {t.value != null ? fmtYen(t.value) : "—"}
                          {t.deviation != null && (
                            <span className={`stat-indicator-tag ${t.direction === "up" ? "positive" : "negative"}`} style={{ marginLeft: 6 }}>
                              {t.deviation >= 0 ? "+" : ""}{t.deviation.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {fund?.summary && (
              <div className="detail-section">
                <h4>企業概要</h4>
                <p className="detail-summary">{fund.summary.slice(0, 300)}{fund.summary.length > 300 ? "..." : ""}</p>
              </div>
            )}
          </div>
        )}

        {/* ファンダメンタルズタブ */}
        {tab === "fundamentals" && (
          <div className="detail-body">
            {fundLoading ? (
              <p className="ai-hint">ファンダメンタルズを取得中...</p>
            ) : !fund ? (
              <p className="ai-error">データを取得できませんでした</p>
            ) : (
              <div className="detail-grid-2col">
                <div className="detail-section">
                  <h4>バリュエーション</h4>
                  <table className="detail-table">
                    <tbody>
                      <tr><td>時価総額</td><td>{fmtBigYen(fund.market_cap)}</td></tr>
                      <tr><td>企業価値 (EV)</td><td>{fmtBigYen(fund.enterprise_value)}</td></tr>
                      <tr><td>PER（実績）</td><td>{fmtNum(fund.per)}</td></tr>
                      <tr><td>PER（予想）</td><td>{fmtNum(fund.forward_per)}</td></tr>
                      <tr><td>PBR</td><td>{fmtNum(fund.pbr)}</td></tr>
                      <tr><td>EPS</td><td>{fmtNum(fund.eps)}</td></tr>
                      <tr><td>1株純資産 (BPS)</td><td>{fmtNum(fund.book_value)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="detail-section">
                  <h4>配当</h4>
                  <table className="detail-table">
                    <tbody>
                      <tr><td>配当利回り</td><td>{fmtPct(fund.dividend_yield)}</td></tr>
                      <tr><td>1株配当</td><td>{fmtNum(fund.dividend_rate)}</td></tr>
                      <tr><td>配当性向</td><td>{fmtPct(fund.payout_ratio)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="detail-section">
                  <h4>収益性</h4>
                  <table className="detail-table">
                    <tbody>
                      <tr><td>ROE</td><td>{fmtPct(fund.roe)}</td></tr>
                      <tr><td>ROA</td><td>{fmtPct(fund.roa)}</td></tr>
                      <tr><td>営業利益率</td><td>{fmtPct(fund.operating_margin)}</td></tr>
                      <tr><td>純利益率</td><td>{fmtPct(fund.profit_margin)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="detail-section">
                  <h4>財務</h4>
                  <table className="detail-table">
                    <tbody>
                      <tr><td>売上高</td><td>{fmtBigYen(fund.revenue)}</td></tr>
                      <tr><td>純利益</td><td>{fmtBigYen(fund.net_income)}</td></tr>
                      <tr><td>有利子負債</td><td>{fmtBigYen(fund.total_debt)}</td></tr>
                      <tr><td>現金等</td><td>{fmtBigYen(fund.total_cash)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="detail-section">
                  <h4>その他</h4>
                  <table className="detail-table">
                    <tbody>
                      <tr><td>業種</td><td>{fund.sector} / {fund.industry}</td></tr>
                      <tr><td>β値</td><td>{fmtNum(fund.beta)}</td></tr>
                      <tr><td>平均出来高</td><td>{fund.avg_volume?.toLocaleString() ?? "—"}</td></tr>
                      <tr><td>アナリスト目標</td><td>{fmtYen(fund.target_mean_price)}</td></tr>
                      <tr><td>推奨</td><td className="detail-recommendation">{fund.recommendation || "—"}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* チャートタブ */}
        {tab === "chart" && (
          <div className="detail-body">
            {chartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
                    <XAxis dataKey="date" tick={{ fill: cc.text, fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} interval={step} />
                    <YAxis yAxisId="price" tick={{ fill: cc.text, fontSize: 10 }} domain={["auto", "auto"]} />
                    <YAxis yAxisId="vol" orientation="right" hide domain={[0, (dm: number) => dm * 4]} />
                    <Tooltip
                      contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}`, borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: cc.text }}
                    />
                    <Line yAxisId="price" type="monotone" dataKey="close" stroke="#58a6ff" strokeWidth={2} dot={false} connectNulls name="終値" />
                    <Line yAxisId="price" type="monotone" dataKey="sma20" stroke="#3fb950" strokeWidth={1.2} dot={false} connectNulls name="SMA(20)" />
                    <Line yAxisId="price" type="monotone" dataKey="sma50" stroke="#f778ba" strokeWidth={1.2} dot={false} connectNulls name="SMA(50)" />
                    <Line yAxisId="price" type="monotone" dataKey="sma200" stroke="#d29922" strokeWidth={1.2} dot={false} connectNulls name="SMA(200)" />
                    <Bar yAxisId="vol" dataKey="volume" fill={cc.volumeFill} opacity={0.3} radius={[2, 2, 0, 0]} maxBarSize={16} isAnimationActive={false} name="出来高" />
                  </ComposedChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={100}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
                    <XAxis dataKey="date" hide />
                    <YAxis domain={[0, 100]} tick={{ fill: cc.text, fontSize: 10 }} width={32} />
                    <ReferenceLine y={70} stroke="#f85149" strokeDasharray="2 2" />
                    <ReferenceLine y={30} stroke="#3fb950" strokeDasharray="2 2" />
                    <Tooltip
                      contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}`, borderRadius: 6, fontSize: 11 }}
                      formatter={(v: number) => [v.toFixed(1), "RSI"]}
                    />
                    <Line type="monotone" dataKey="rsi" stroke="#bc8cff" strokeWidth={2} dot={false} connectNulls name="RSI(14)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </>
            ) : (
              <p className="ai-hint">チャートデータがありません</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
