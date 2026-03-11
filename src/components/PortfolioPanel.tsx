import { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  getPortfolioPositions,
  addPortfolioPosition,
  deletePortfolioPosition,
  importPortfolioCsv,
  getPortfolioSummary,
  getMoomooStatus,
  getMoomooPositions,
  type PortfolioPosition,
} from "../api";

const BROKERS = [
  { id: "sbi", label: "SBI証券" },
  { id: "rakuten", label: "楽天証券" },
  { id: "moomoo", label: "moomoo証券" },
  { id: "other", label: "その他" },
];

function formatYen(n: number) {
  return `¥${n.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}`;
}

function PnlBadge({ value, pct }: { value: number; pct: number }) {
  const cls = value >= 0 ? "positive" : "negative";
  return (
    <span className={`pf-pnl ${cls}`}>
      {value >= 0 ? "+" : ""}{formatYen(value)} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
    </span>
  );
}

export default function PortfolioPanel() {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"list" | "add" | "import" | "moomoo">("list");

  const [ticker, setTicker] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [broker, setBroker] = useState("sbi");
  const [addError, setAddError] = useState("");

  const [importBroker, setImportBroker] = useState("sbi");
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [moomooStatus, setMoomooStatus] = useState<{ connected: boolean; error?: string } | null>(null);
  const [moomooPositions, setMoomooPositions] = useState<any[]>([]);

  const [summary, setSummary] = useState<any>(null);
  const [latestPrices, setLatestPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (token) loadPositions();
  }, [token]);

  const loadPositions = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getPortfolioPositions(token);
      setPositions(res.positions || []);
      const sum = await getPortfolioSummary(token);
      setSummary(sum);
    } catch {}
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!token || !ticker.trim()) return;
    setAddError("");
    let code = ticker.trim();
    if (/^\d{3,4}[A-Z]?$/.test(code)) code = `${code}.T`;
    try {
      await addPortfolioPosition(token, {
        ticker: code,
        quantity: parseFloat(qty) || 0,
        avg_price: parseFloat(price) || 0,
        broker,
      });
      setTicker("");
      setQty("");
      setPrice("");
      await loadPositions();
      setTab("list");
    } catch (e: any) {
      setAddError(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    await deletePortfolioPosition(token, id);
    await loadPositions();
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setImportMsg("");
    try {
      const res = await importPortfolioCsv(token, file, importBroker);
      setImportMsg(`${res.added}件追加（合計${res.total}件）`);
      await loadPositions();
    } catch (err: any) {
      setImportMsg(`エラー: ${err.message}`);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleMoomooCheck = async () => {
    const s = await getMoomooStatus();
    setMoomooStatus(s);
  };

  const handleMoomooFetch = async () => {
    try {
      const res = await getMoomooPositions("JP");
      setMoomooPositions(res.positions || []);
    } catch (e: any) {
      setMoomooStatus({ connected: false, error: e.message });
    }
  };

  const handleMoomooImportAll = async () => {
    if (!token) return;
    for (const p of moomooPositions) {
      await addPortfolioPosition(token, {
        ticker: p.ticker,
        quantity: p.quantity,
        avg_price: p.avg_price,
        broker: "moomoo",
      });
    }
    await loadPositions();
    setTab("list");
  };

  const totalCost = positions.reduce((s, p) => s + p.quantity * p.avg_price, 0);

  if (!token) {
    return (
      <div className="panel pf-panel">
        <h2>ポートフォリオ</h2>
        <p className="ai-hint">ログインするとポートフォリオ機能を利用できます</p>
      </div>
    );
  }

  return (
    <div className="panel pf-panel">
      <div className="wl-header" onClick={() => setIsOpen(!isOpen)}>
        <h2 style={{ margin: 0, cursor: "pointer", userSelect: "none" }}>
          <span className="wl-arrow">{isOpen ? "▾" : "▸"}</span>
          ポートフォリオ
          {positions.length > 0 && <span className="wl-badge">{positions.length}</span>}
        </h2>
      </div>

      {isOpen && (
        <div className="pf-body">
          {/* タブ */}
          <div className="ai-tabs">
            <button className={`chart-toolbar-btn ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
              保有一覧
            </button>
            <button className={`chart-toolbar-btn ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>
              手動追加
            </button>
            <button className={`chart-toolbar-btn ${tab === "import" ? "active" : ""}`} onClick={() => setTab("import")}>
              CSVインポート
            </button>
            <button className={`chart-toolbar-btn ${tab === "moomoo" ? "active" : ""}`} onClick={() => setTab("moomoo")}>
              moomoo連携
            </button>
          </div>

          {/* サマリー */}
          {positions.length > 0 && tab === "list" && (
            <div className="pf-summary">
              <div className="pf-summary-row">
                <span className="label">取得総額</span>
                <span className="value">{formatYen(totalCost)}</span>
              </div>
              {summary?.sector_allocation?.length > 0 && (
                <div className="pf-allocation">
                  <span className="label">セクター配分</span>
                  <div className="pf-alloc-bar">
                    {summary.sector_allocation.slice(0, 8).map((s: any) => (
                      <div
                        key={s.name}
                        className="pf-alloc-segment"
                        style={{ flex: s.pct }}
                        title={`${s.name}: ${s.pct}%`}
                      >
                        <span>{s.name} {s.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {summary?.broker_allocation?.length > 0 && (
                <div className="pf-allocation">
                  <span className="label">証券会社別</span>
                  <div className="pf-broker-chips">
                    {summary.broker_allocation.map((b: any) => (
                      <span key={b.name} className="pf-broker-chip">
                        {BROKERS.find((br) => br.id === b.name)?.label || b.name} {b.pct}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 保有一覧 */}
          {tab === "list" && (
            <div className="pf-list">
              {loading && <p className="ai-hint">読み込み中...</p>}
              {!loading && positions.length === 0 && (
                <p className="ai-hint">保有銘柄がありません。手動追加・CSVインポート・moomoo連携で追加してください。</p>
              )}
              {positions.map((p) => {
                const cost = p.quantity * p.avg_price;
                return (
                  <div key={p.id} className="pf-item">
                    <div className="pf-item-main">
                      <span className="pf-item-ticker">{p.ticker}</span>
                      <span className="pf-item-name">{p.name}</span>
                      <span className="pf-item-broker">
                        {BROKERS.find((b) => b.id === p.broker)?.label || p.broker}
                      </span>
                    </div>
                    <div className="pf-item-detail">
                      <span>{p.quantity}株 × {formatYen(p.avg_price)} = {formatYen(cost)}</span>
                      {p.sector && <span className="tag-badge badge-sector">{p.sector}</span>}
                    </div>
                    <button className="pf-delete-btn" onClick={() => handleDelete(p.id)} title="削除">&times;</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 手動追加 */}
          {tab === "add" && (
            <div className="pf-add-form">
              <div className="pf-form-row">
                <input placeholder="銘柄コード (例: 7203)" value={ticker} onChange={(e) => setTicker(e.target.value)} />
                <input placeholder="数量" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div className="pf-form-row">
                <input placeholder="取得単価" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
                <select value={broker} onChange={(e) => setBroker(e.target.value)}>
                  {BROKERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <button onClick={handleAdd} disabled={!ticker.trim()}>追加</button>
              {addError && <p className="ai-error">{addError}</p>}
            </div>
          )}

          {/* CSVインポート */}
          {tab === "import" && (
            <div className="pf-import">
              <p className="ai-hint">
                SBI証券・楽天証券の「保有銘柄一覧CSV」をそのままインポートできます。
                「銘柄コード」「保有数量」「取得単価」列を自動検出します。
              </p>
              <div className="pf-form-row">
                <select value={importBroker} onChange={(e) => setImportBroker(e.target.value)}>
                  {BROKERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
                <label className="wl-file-btn">
                  <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvImport} hidden />
                  CSVを選択
                </label>
              </div>
              {importMsg && <p className="ai-hint" style={{ marginTop: 8 }}>{importMsg}</p>}
            </div>
          )}

          {/* moomoo連携 */}
          {tab === "moomoo" && (
            <div className="pf-moomoo">
              <p className="ai-hint">
                moomoo証券のOpenDデーモンが起動している場合、保有銘柄を自動取得できます。
              </p>
              <div className="pf-form-row">
                <button onClick={handleMoomooCheck}>接続確認</button>
                <button onClick={handleMoomooFetch} disabled={!moomooStatus?.connected}>保有銘柄を取得</button>
              </div>
              {moomooStatus && (
                <p className={moomooStatus.connected ? "ai-hint" : "ai-error"}>
                  {moomooStatus.connected ? "✓ moomoo OpenD に接続済み" : `✗ 接続失敗: ${moomooStatus.error}`}
                </p>
              )}
              {moomooPositions.length > 0 && (
                <div className="pf-moomoo-list">
                  <div className="ai-suggestions-header">
                    <span>{moomooPositions.length}銘柄取得</span>
                    <button className="secondary" onClick={handleMoomooImportAll}>全て取り込み</button>
                  </div>
                  {moomooPositions.map((p: any) => (
                    <div key={p.ticker} className="pf-item">
                      <div className="pf-item-main">
                        <span className="pf-item-ticker">{p.ticker}</span>
                        <span className="pf-item-name">{p.name}</span>
                      </div>
                      <div className="pf-item-detail">
                        <span>{p.quantity}株 × {formatYen(p.avg_price)}</span>
                        <PnlBadge value={p.pnl} pct={p.pnl_pct} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
