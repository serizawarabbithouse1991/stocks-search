import { useState, useEffect, useCallback } from "react";
import {
  fetchScreenerFields,
  runScreener,
  type ScreenerField,
  type ScreenerCondition,
  type ScreenerResult,
} from "../api";

interface Props {
  onAddTickers: (tickers: { code: string; name: string }[]) => void;
}

interface ConditionRow {
  id: number;
  field: string;
  op: string;
  value: string;
}

const NUMBER_OPS = [
  { value: "<=", label: "以下 (<=)" },
  { value: ">=", label: "以上 (>=)" },
  { value: "<", label: "未満 (<)" },
  { value: ">", label: "超 (>)" },
  { value: "==", label: "等しい (=)" },
];
const STRING_OPS = [
  { value: "==", label: "一致" },
  { value: "contains", label: "含む" },
];

const PRESETS: { name: string; conditions: Omit<ConditionRow, "id">[]; sortBy: string }[] = [
  {
    name: "高配当",
    conditions: [
      { field: "dividend_yield", op: ">=", value: "0.03" },
      { field: "per", op: "<=", value: "20" },
    ],
    sortBy: "dividend_yield",
  },
  {
    name: "割安成長",
    conditions: [
      { field: "per", op: "<=", value: "15" },
      { field: "roe", op: ">=", value: "0.10" },
      { field: "pbr", op: "<=", value: "2" },
    ],
    sortBy: "roe",
  },
  {
    name: "大型安定",
    conditions: [
      { field: "market", op: "==", value: "プライム（内国株式）" },
      { field: "scale", op: "==", value: "TOPIX Core30" },
    ],
    sortBy: "market_cap",
  },
  {
    name: "高収益",
    conditions: [
      { field: "profit_margin", op: ">=", value: "0.10" },
      { field: "operating_margin", op: ">=", value: "0.15" },
    ],
    sortBy: "profit_margin",
  },
];

const CUSTOM_PRESETS_KEY = "stocksview-screener-presets";

interface SavedPreset {
  name: string;
  conditions: Omit<ConditionRow, "id">[];
  sortBy: string;
}

function loadCustomPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveCustomPresets(presets: SavedPreset[]) {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

let nextId = 1;

function formatValue(key: string, val: unknown): string {
  if (val == null) return "-";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (key === "dividend_yield" || key === "roe" || key === "roa" ||
      key === "profit_margin" || key === "operating_margin" || key === "payout_ratio") {
    return `${(n * 100).toFixed(2)}%`;
  }
  if (key === "market_cap") {
    if (n >= 1e12) return `${(n / 1e12).toFixed(1)}兆`;
    if (n >= 1e8) return `${(n / 1e8).toFixed(0)}億`;
    return n.toLocaleString();
  }
  if (key === "avg_volume") return n.toLocaleString();
  if (key === "per" || key === "forward_per" || key === "pbr" || key === "beta") return n.toFixed(2);
  if (key === "eps") return `¥${n.toFixed(1)}`;
  return String(val);
}

export default function ScreenerPanel({ onAddTickers }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [fields, setFields] = useState<ScreenerField[]>([]);
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [sortBy, setSortBy] = useState("dividend_yield");
  const [sortDir, setSortDir] = useState("desc");
  const [limit, setLimit] = useState(50);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [totalScanned, setTotalScanned] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortColumnDir, setSortColumnDir] = useState<"asc" | "desc">("desc");
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());
  const [customPresets, setCustomPresets] = useState<SavedPreset[]>(loadCustomPresets());
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  useEffect(() => {
    fetchScreenerFields().then((r) => setFields(r.fields));
  }, []);

  const addCondition = () => {
    const defaultField = fields.find(f => f.type === "number")?.field || "per";
    setConditions((prev) => [...prev, { id: nextId++, field: defaultField, op: "<=", value: "" }]);
  };

  const removeCondition = (id: number) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const updateCondition = (id: number, key: keyof ConditionRow, val: string) => {
    setConditions((prev) => prev.map((c) => c.id === id ? { ...c, [key]: val } : c));
  };

  const handleSavePreset = () => {
    if (!presetName.trim() || conditions.length === 0) return;
    const newPreset: SavedPreset = {
      name: presetName.trim(),
      conditions: conditions.map(({ field, op, value }) => ({ field, op, value })),
      sortBy,
    };
    const updated = [...customPresets.filter((p) => p.name !== newPreset.name), newPreset];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setPresetName("");
    setShowSavePreset(false);
  };

  const handleDeletePreset = (name: string) => {
    const updated = customPresets.filter((p) => p.name !== name);
    setCustomPresets(updated);
    saveCustomPresets(updated);
  };

  const applyPreset = (preset: typeof PRESETS[number]) => {
    const newConds = preset.conditions.map((c) => ({ ...c, id: nextId++ }));
    setConditions(newConds);
    setSortBy(preset.sortBy);
  };

  const handleScan = useCallback(async () => {
    setLoading(true);
    setError("");
    setResults([]);
    setSelectedResults(new Set());
    try {
      const apiConditions: ScreenerCondition[] = conditions
        .filter((c) => c.value !== "")
        .map((c) => {
          const field = fields.find((f) => f.field === c.field);
          const value = field?.type === "number" ? Number(c.value) : c.value;
          return { field: c.field, op: c.op, value };
        });
      const res = await runScreener(apiConditions, sortBy, sortDir, limit);
      setResults(res.results);
      setTotalMatched(res.total_matched);
      setTotalScanned(res.total_scanned);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [conditions, fields, sortBy, sortDir, limit]);

  const toggleResult = (ticker: string) => {
    setSelectedResults((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const addSelected = () => {
    const tickers = results
      .filter((r) => selectedResults.has(r.ticker))
      .map((r) => ({ code: r.ticker, name: r.name }));
    if (tickers.length > 0) onAddTickers(tickers);
    setSelectedResults(new Set());
  };

  const addAll = () => {
    const tickers = results.map((r) => ({ code: r.ticker, name: r.name }));
    if (tickers.length > 0) onAddTickers(tickers);
  };

  const handleColumnSort = (col: string) => {
    if (sortColumn === col) {
      setSortColumnDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortColumnDir("desc");
    }
  };

  const sortedResults = sortColumn
    ? [...results].sort((a, b) => {
        const va = a[sortColumn];
        const vb = b[sortColumn];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const na = Number(va);
        const nb = Number(vb);
        if (!isNaN(na) && !isNaN(nb)) {
          return sortColumnDir === "asc" ? na - nb : nb - na;
        }
        return sortColumnDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      })
    : results;

  const getFieldInfo = (fieldId: string) => fields.find((f) => f.field === fieldId);

  const DISPLAY_COLUMNS = [
    { key: "ticker", label: "コード" },
    { key: "name", label: "銘柄名" },
    { key: "market", label: "市場" },
    { key: "sector33", label: "業種" },
    { key: "per", label: "PER" },
    { key: "pbr", label: "PBR" },
    { key: "roe", label: "ROE" },
    { key: "dividend_yield", label: "配当利回り" },
    { key: "market_cap", label: "時価総額" },
  ];

  return (
    <div className="panel screener-panel">
      <div className="wl-header" onClick={() => setIsOpen(!isOpen)}>
        <h2 style={{ margin: 0, cursor: "pointer", userSelect: "none" }}>
          <span className="wl-arrow">{isOpen ? "▾" : "▸"}</span>
          スクリーナー
        </h2>
      </div>

      {isOpen && (
        <div className="screener-body">
          {/* プリセット */}
          <div className="screener-presets">
            <span className="screener-presets-label">プリセット:</span>
            {PRESETS.map((p) => (
              <button key={p.name} className="screener-preset-btn" onClick={() => applyPreset(p)}>
                {p.name}
              </button>
            ))}
          </div>

          {/* カスタムプリセット */}
          {customPresets.length > 0 && (
            <div className="screener-presets">
              <span className="screener-presets-label">保存済み:</span>
              {customPresets.map((p) => (
                <span key={p.name} className="screener-custom-preset">
                  <button className="screener-preset-btn screener-preset-custom" onClick={() => applyPreset(p)}>
                    {p.name}
                  </button>
                  <button className="screener-preset-delete" onClick={() => handleDeletePreset(p.name)}>×</button>
                </span>
              ))}
            </div>
          )}

          {/* 条件ビルダー */}
          <div className="screener-conditions">
            {conditions.map((c) => {
              const fi = getFieldInfo(c.field);
              const ops = fi?.type === "string" ? STRING_OPS : NUMBER_OPS;
              return (
                <div key={c.id} className="screener-condition-row">
                  <select
                    value={c.field}
                    onChange={(e) => updateCondition(c.id, "field", e.target.value)}
                  >
                    {fields.map((f) => (
                      <option key={f.field} value={f.field}>{f.label}</option>
                    ))}
                  </select>
                  <select
                    value={c.op}
                    onChange={(e) => updateCondition(c.id, "op", e.target.value)}
                  >
                    {ops.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    type={fi?.type === "number" ? "number" : "text"}
                    step="any"
                    value={c.value}
                    onChange={(e) => updateCondition(c.id, "value", e.target.value)}
                    placeholder="値を入力"
                  />
                  <button className="screener-remove-btn" onClick={() => removeCondition(c.id)}>×</button>
                </div>
              );
            })}
            <div className="screener-condition-actions">
              <button className="secondary screener-add-btn" onClick={addCondition}>+ 条件追加</button>
              {conditions.length > 0 && (
                <>
                  {showSavePreset ? (
                    <span className="screener-save-row">
                      <input
                        type="text"
                        placeholder="プリセット名"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
                      />
                      <button onClick={handleSavePreset} disabled={!presetName.trim()}>保存</button>
                      <button className="secondary" onClick={() => setShowSavePreset(false)}>取消</button>
                    </span>
                  ) : (
                    <button className="secondary screener-add-btn" onClick={() => setShowSavePreset(true)}>
                      💾 条件を保存
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ソート・件数 */}
          <div className="screener-options">
            <label>
              ソート:
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                {fields.filter((f) => f.type === "number").map((f) => (
                  <option key={f.field} value={f.field}>{f.label}</option>
                ))}
              </select>
            </label>
            <label>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
                <option value="desc">降順</option>
                <option value="asc">昇順</option>
              </select>
            </label>
            <label>
              上限:
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {[10, 25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>{n}件</option>
                ))}
              </select>
            </label>
            <button onClick={handleScan} disabled={loading}>
              {loading ? "スキャン中..." : "スキャン"}
            </button>
          </div>

          {error && <p className="ai-error">{error}</p>}

          {/* 結果 */}
          {results.length > 0 && (
            <div className="screener-results">
              <div className="screener-results-header">
                <span>{totalMatched}件ヒット（{totalScanned}件中）</span>
                <div className="screener-results-actions">
                  {selectedResults.size > 0 && (
                    <button onClick={addSelected}>選択({selectedResults.size})を比較に追加</button>
                  )}
                  <button className="secondary" onClick={addAll}>全て比較に追加</button>
                </div>
              </div>
              <div className="screener-table-wrap">
                <table className="screener-table">
                  <thead>
                    <tr>
                      <th className="screener-th-check">
                        <input
                          type="checkbox"
                          checked={selectedResults.size === results.length && results.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedResults(new Set(results.map((r) => r.ticker)));
                            } else {
                              setSelectedResults(new Set());
                            }
                          }}
                        />
                      </th>
                      {DISPLAY_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          className="screener-th-sortable"
                          onClick={() => handleColumnSort(col.key)}
                        >
                          {col.label}
                          {sortColumn === col.key && (
                            <span className="screener-sort-arrow">
                              {sortColumnDir === "asc" ? " ▲" : " ▼"}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedResults.map((r) => (
                      <tr key={r.ticker} className={selectedResults.has(r.ticker) ? "screener-row-selected" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedResults.has(r.ticker)}
                            onChange={() => toggleResult(r.ticker)}
                          />
                        </td>
                        {DISPLAY_COLUMNS.map((col) => (
                          <td key={col.key}>{formatValue(col.key, r[col.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && results.length === 0 && totalScanned > 0 && (
            <p className="screener-empty">条件に一致する銘柄がありませんでした</p>
          )}
        </div>
      )}
    </div>
  );
}
