import { useState, useRef } from "react";

interface Ticker {
  code: string;
  name: string;
}

interface Watchlist {
  id: string;
  name: string;
  tickers: Ticker[];
  createdAt: string;
}

interface Props {
  currentTickers: Ticker[];
  source: string;
  onLoad: (tickers: Ticker[]) => void;
}

const STORAGE_KEY = "stock-watchlists";

function loadWatchlists(): Watchlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistWatchlists(lists: Watchlist[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

/**
 * TradingView 互換の TXT パーサ。
 * 対応フォーマット:
 *   - "TSE:7203,D"  (取引所プレフィックス + タイムフレーム)
 *   - "7203"        (コードのみ)
 *   - カンマ区切り / 改行区切り
 *   - ###DIFFUSION ヘッダ行は無視
 */
function parseTxt(text: string, source: string): Ticker[] {
  const seen = new Set<string>();
  const result: Ticker[] = [];

  const lines = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));

  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
    for (let part of parts) {
      part = part.replace(/^[A-Z]+:/, "");
      if (/^[DWMH\d]{1,3}$/.test(part) && !/^\d{4,}$/.test(part)) continue;
      if (!part) continue;

      let code = part;
      if (source === "jquants" && /^\d{4}$/.test(code)) {
        code = `${code}.T`;
      }

      if (!seen.has(code)) {
        seen.add(code);
        result.push({ code, name: code.replace(/\.T$/, "") });
      }
    }
  }
  return result;
}

function exportAsTxt(tickers: Ticker[], listName?: string) {
  const lines = tickers.map((t) => {
    const code = t.code.replace(/\.T$/, "");
    return /^\d{4}$/.test(code) ? `TSE:${code}` : code;
  });
  const text = lines.join(",\n") + "\n";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${listName || "watchlist"}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function WatchlistPanel({ currentTickers, source, onLoad }: Props) {
  const [watchlists, setWatchlists] = useState<Watchlist[]>(loadWatchlists);
  const [isOpen, setIsOpen] = useState(true);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (lists: Watchlist[]) => {
    setWatchlists(lists);
    persistWatchlists(lists);
  };

  const handleSave = () => {
    if (!saveName.trim() || currentTickers.length === 0) return;
    const w: Watchlist = {
      id: Date.now().toString(36),
      name: saveName.trim(),
      tickers: [...currentTickers],
      createdAt: new Date().toISOString().slice(0, 10),
    };
    update([w, ...watchlists]);
    setSaveName("");
    setShowSaveInput(false);
  };

  const handleDelete = (id: string) => {
    update(watchlists.filter((w) => w.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    update(watchlists.map((w) => (w.id === id ? { ...w, name: editName.trim() } : w)));
    setEditingId(null);
    setEditName("");
  };

  const handleOverwrite = (id: string) => {
    if (currentTickers.length === 0) return;
    update(
      watchlists.map((w) =>
        w.id === id
          ? { ...w, tickers: [...currentTickers], createdAt: new Date().toISOString().slice(0, 10) }
          : w
      )
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const tickers = parseTxt(text, source);
      if (tickers.length > 0) {
        onLoad(tickers);
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImportAsWatchlist = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const tickers = parseTxt(text, source);
      if (tickers.length > 0) {
        const name = file.name.replace(/\.[^.]+$/, "") || "インポート";
        const w: Watchlist = {
          id: Date.now().toString(36),
          name,
          tickers,
          createdAt: new Date().toISOString().slice(0, 10),
        };
        update([w, ...watchlists]);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const importWatchlistRef = useRef<HTMLInputElement>(null);

  return (
    <div className="panel wl-panel">
      <div className="wl-header" onClick={() => setIsOpen(!isOpen)}>
        <h2 style={{ margin: 0, cursor: "pointer", userSelect: "none" }}>
          <span className="wl-arrow">{isOpen ? "▾" : "▸"}</span>
          ウォッチリスト
          <span className="wl-badge">{watchlists.length}</span>
        </h2>
      </div>

      {isOpen && (
        <div className="wl-body">
          {/* アクションバー */}
          <div className="wl-actions">
            <label className="wl-file-btn">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.csv"
                onChange={handleFileChange}
                hidden
              />
              TXTを選択に読込
            </label>
            <label className="wl-file-btn">
              <input
                ref={importWatchlistRef}
                type="file"
                accept=".txt,.csv"
                onChange={handleImportAsWatchlist}
                hidden
              />
              TXTをリストに保存
            </label>
            {currentTickers.length > 0 && !showSaveInput && (
              <button
                type="button"
                className="secondary"
                onClick={() => setShowSaveInput(true)}
              >
                現在の銘柄を保存
              </button>
            )}
            {currentTickers.length > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={() => exportAsTxt(currentTickers)}
              >
                TXTエクスポート
              </button>
            )}
          </div>

          {/* 保存入力 */}
          {showSaveInput && (
            <div className="wl-save-row">
              <input
                type="text"
                placeholder="ウォッチリスト名..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setShowSaveInput(false);
                }}
                autoFocus
              />
              <button type="button" onClick={handleSave} disabled={!saveName.trim()}>
                保存
              </button>
              <button type="button" className="secondary" onClick={() => setShowSaveInput(false)}>
                取消
              </button>
            </div>
          )}

          {/* ウォッチリスト一覧 */}
          {watchlists.length === 0 ? (
            <p className="wl-empty">
              保存されたウォッチリストはありません。
              TXTファイルのインポートまたは検索した銘柄の保存ができます。
            </p>
          ) : (
            <div className="wl-list">
              {watchlists.map((w) => (
                <div key={w.id} className="wl-item">
                  <div className="wl-item-top">
                    <div
                      className="wl-item-info"
                      onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                    >
                      <span className="wl-item-expand">{expandedId === w.id ? "▾" : "▸"}</span>
                      {editingId === w.id ? (
                        <input
                          className="wl-rename-input"
                          type="text"
                          value={editName}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") handleRename(w.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span className="wl-item-name">{w.name}</span>
                      )}
                      <span className="wl-item-meta">
                        {w.tickers.length}銘柄 · {w.createdAt}
                      </span>
                    </div>
                    <div className="wl-item-btns">
                      {editingId === w.id ? (
                        <>
                          <button type="button" onClick={() => handleRename(w.id)}>OK</button>
                          <button type="button" className="secondary" onClick={() => setEditingId(null)}>取消</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => onLoad(w.tickers)}>読込</button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => { setEditingId(w.id); setEditName(w.name); }}
                          >
                            編集
                          </button>
                          {currentTickers.length > 0 && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => handleOverwrite(w.id)}
                              title="現在の選択で上書き"
                            >
                              上書
                            </button>
                          )}
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => exportAsTxt(w.tickers, w.name)}
                            title="TXTエクスポート"
                          >
                            ↓
                          </button>
                          <button type="button" className="danger" onClick={() => handleDelete(w.id)}>
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* 展開時: 銘柄一覧プレビュー */}
                  {expandedId === w.id && (
                    <div className="wl-item-tickers">
                      {w.tickers.map((t) => (
                        <span key={t.code} className="wl-ticker-tag">
                          {t.code}
                          {t.name !== t.code && t.name !== t.code.replace(/\.T$/, "") && (
                            <span className="wl-ticker-name">{t.name}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
