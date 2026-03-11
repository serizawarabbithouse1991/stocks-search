import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { StocksResponse, SearchResult } from "./types";
import { searchStocks, fetchStocks, exportCsv, fetchLatestPrices, fetchMeta, fetchTags, filterByTag, type LatestPrice, type TickerMeta, type TagsResponse } from "./api";
import { calcSignal, type OHLCV, type SignalResult } from "./indicators";
import { useLocale } from "./i18n";
import { useAuth } from "./auth/AuthContext";
import { putSettings, getSettings } from "./auth/api";

import StockChart from "./components/StockChart";
import StockTable from "./components/StockTable";
import StatsCards from "./components/StatsCards";
import IndividualCharts from "./components/IndividualCharts";
import WatchlistPanel from "./components/WatchlistPanel";
import AIPanel from "./components/AIPanel";
import LegalModal, { PrivacyPolicy, TermsOfService } from "./components/LegalModal";
import SettingsPanel from "./components/SettingsPanel";
import AuthModal from "./components/AuthModal";

const SUGGEST_DEBOUNCE_MS = 300;

type Tab = "chart" | "individual" | "table";

function App() {
  const { t } = useLocale();
  const { user, token } = useAuth();
  const [query, setQuery] = useState("");
  const [selectedTickers, setSelectedTickers] = useState<{ code: string; name: string }[]>([]);
  const [startDate, setStartDate] = useState("2025-01-01");
  const [endDate, setEndDate] = useState("2026-03-11");
  const [timeInterval, setTimeInterval] = useState("1d");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [stocksData, setStocksData] = useState<StocksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("chart");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [latestPrices, setLatestPrices] = useState<LatestPrice[]>([]);
  const suggestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const latestPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [legalModal, setLegalModal] = useState<"privacy" | "terms" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tickerMeta, setTickerMeta] = useState<Record<string, TickerMeta>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<TagsResponse | null>(null);
  const [tagLoading, setTagLoading] = useState(false);

  const runSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }
      searchAbortRef.current?.abort();
      const ac = new AbortController();
      searchAbortRef.current = ac;
      setSearching(true);
      setErrors([]);
      try {
        const res = await searchStocks(q, true, ac.signal);
        setSearchResults(res.results || []);
        setShowResults(true);
        setHighlightIndex(-1);
      } catch (e: any) {
        if (e.name === "AbortError") return;
        setErrors([e.message]);
        setSearchResults([]);
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    },
    []
  );

  useEffect(() => {
    if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
    if (!query.trim()) {
      setShowResults(false);
      setSearchResults([]);
      return;
    }
    suggestTimeoutRef.current = setTimeout(() => runSearch(query), SUGGEST_DEBOUNCE_MS);
    return () => {
      if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
    };
  }, [query, runSearch]);

  useEffect(() => {
    const tickers = selectedTickers.map((t) => t.code);
    if (tickers.length === 0) {
      setLatestPrices([]);
      if (latestPollRef.current) {
        clearInterval(latestPollRef.current);
        latestPollRef.current = null;
      }
      return;
    }
    const fetchPrices = () => {
      fetchLatestPrices(tickers)
        .then((r) => setLatestPrices(r.prices))
        .catch(() => setLatestPrices([]));
    };
    fetchPrices();
    latestPollRef.current = setInterval(fetchPrices, 60 * 1000);
    return () => {
      if (latestPollRef.current) clearInterval(latestPollRef.current);
    };
  }, [selectedTickers]);

  const handleSearch = () => runSearch(query);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (showResults && searchResults.length > 0 && highlightIndex >= 0) {
        addTicker(searchResults[highlightIndex]);
        return;
      }
      handleSearch();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i < searchResults.length - 1 ? i + 1 : i));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : -1));
      return;
    }
    if (e.key === "Escape") {
      setShowResults(false);
      setHighlightIndex(-1);
    }
  };

  const addTicker = (result: SearchResult) => {
    const tickerCode = result.code;
    if (!selectedTickers.find((t) => t.code === tickerCode)) {
      setSelectedTickers([...selectedTickers, { code: tickerCode, name: result.name }]);
    }
    if (result.sector33 || result.sector17 || result.scale || result.market) {
      setTickerMeta((prev) => ({
        ...prev,
        [tickerCode]: {
          name: result.name,
          market: result.market || "",
          sector33: result.sector33 || result.sector || "",
          sector33_code: result.sector33_code || "",
          sector17: result.sector17 || "",
          sector17_code: result.sector17_code || "",
          scale: result.scale || "",
          scale_code: result.scale_code || "",
        },
      }));
    }
    setShowResults(false);
    setQuery("");
    setHighlightIndex(-1);
  };

  const removeTicker = (code: string) => {
    setSelectedTickers(selectedTickers.filter((t) => t.code !== code));
  };

  const openTagPicker = async () => {
    setTagPickerOpen(true);
    if (!availableTags) {
      const tags = await fetchTags();
      setAvailableTags(tags);
    }
  };

  const handleTagSelect = async (field: string, value: string) => {
    setTagLoading(true);
    try {
      const result = await filterByTag(field, value);
      if (result.tickers.length > 0) {
        const existing = new Set(selectedTickers.map((t) => t.code));
        const newTickers = result.tickers.filter((t) => !existing.has(t.code));
        if (newTickers.length > 0) {
          setSelectedTickers((prev) => [...prev, ...newTickers]);
        }
      }
      setTagPickerOpen(false);
    } catch {
      // ignore
    } finally {
      setTagLoading(false);
    }
  };

  const handleFetch = async (range?: { start: string; end: string }) => {
    if (selectedTickers.length === 0) return;
    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;
    const [s, e] = range ? [range.start, range.end] : [startDate, endDate];
    if (range) {
      setStartDate(s);
      setEndDate(e);
    }
    setLoading(true);
    setErrors([]);
    try {
      const codes = selectedTickers.map((t) => t.code);
      const res: StocksResponse = await fetchStocks(codes, s, e, timeInterval, ac.signal);
      setStocksData(res);
      if (res.stocks?.length) {
        setSelectedTickers((prev) =>
          prev.map((t) => {
            const sd = res.stocks.find((st) => st.ticker === t.code);
            if (sd?.name && sd.name !== sd.ticker) return { ...t, name: sd.name };
            return t;
          })
        );
      }
      if (res.errors?.length) setErrors(res.errors);
    } catch (err: any) {
      if (err.name === "AbortError") {
        setErrors([t("action.fetchCancelled")]);
        return;
      }
      setErrors([err.message]);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  };

  const handleCancelFetch = () => {
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = null;
    setLoading(false);
  };

  const handlePeriodChange = (start: string, end: string) => {
    handleFetch({ start, end });
  };

  const handleExport = async () => {
    const codes = selectedTickers.map((t) => t.code);
    await exportCsv(codes, startDate, endDate);
  };

  // Sync: load settings from server on login
  useEffect(() => {
    if (!token) return;
    getSettings(token)
      .then((s) => {
        if (s.selected_tickers?.length) {
          setSelectedTickers(s.selected_tickers);
        }
      })
      .catch(() => {});
  }, [token]);

  // Sync: save selected tickers to server on change (debounced)
  useEffect(() => {
    if (!token) return;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => {
      const theme = document.documentElement.getAttribute("data-theme") || "dark";
      const locale = localStorage.getItem("app-locale") || "ja";
      putSettings(token, { theme, locale, selected_tickers: selectedTickers }).catch(() => {});
    }, 2000);
    return () => {
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    };
  }, [selectedTickers, token]);

  useEffect(() => {
    const missing = selectedTickers
      .map((t) => t.code)
      .filter((c) => !tickerMeta[c]);
    if (missing.length === 0) return;
    fetchMeta(missing)
      .then((data) => {
        if (Object.keys(data).length > 0) {
          setTickerMeta((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});
  }, [selectedTickers]);

  const tickerNames: Record<string, string> = {};
  selectedTickers.forEach((t) => {
    tickerNames[t.code] = t.name;
  });

  const tickerSignals = useMemo<Record<string, SignalResult>>(() => {
    const m: Record<string, SignalResult> = {};
    if (!stocksData?.stocks) return m;
    for (const s of stocksData.stocks) {
      if (s.data?.length) {
        const ohlcv: OHLCV[] = s.data.map((r) => ({
          date: r.date,
          open: Number(r.open) || 0,
          high: Number(r.high) || 0,
          low: Number(r.low) || 0,
          close: Number(r.close) || 0,
          volume: Number(r.volume) || 0,
        }));
        m[s.ticker] = calcSignal(ohlcv);
      }
    }
    return m;
  }, [stocksData]);

  return (
    <>
      <header className="app-header">
        <button
          className="hamburger-btn"
          onClick={() => setSettingsOpen(true)}
          title={t("header.settingsMenu")}
          aria-label={t("header.settingsMenu")}
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
        <div className="header-center">
          <h1>StocksView</h1>
          <span className="header-subtitle">{t("header.subtitle")}</span>
        </div>
        <div className="header-right">
          {user ? (
            <span className="header-user">{user.username}</span>
          ) : (
            <button className="header-login-btn" onClick={() => setAuthModalOpen(true)}>
              {t("auth.login")}
            </button>
          )}
        </div>
      </header>

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenLegal={(type) => setLegalModal(type)}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* 検索パネル */}
      <div className="panel">
        <h2>{t("search.title")}</h2>
        <div className="search-bar">
          <input
            type="text"
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={handleSearch} disabled={searching}>
            {searching ? t("search.searching") : t("search.button")}
          </button>
          <button className="secondary" onClick={openTagPicker} title="業種・市場・規模で一括追加">
            タグ追加
          </button>
        </div>

        {/* タグ一括追加ピッカー */}
        {tagPickerOpen && (
          <div className="tag-picker-overlay" onClick={() => setTagPickerOpen(false)}>
            <div className="tag-picker" onClick={(e) => e.stopPropagation()}>
              <div className="tag-picker-header">
                <h3>タグで銘柄を一括追加</h3>
                <button className="tag-picker-close" onClick={() => setTagPickerOpen(false)}>&times;</button>
              </div>
              {tagLoading && <p className="tag-picker-loading">読み込み中...</p>}
              {availableTags && !tagLoading && (
                <div className="tag-picker-body">
                  <div className="tag-picker-section">
                    <h4>33業種区分</h4>
                    <div className="tag-picker-chips">
                      {availableTags.sector33.map((v) => (
                        <button key={v} className="tag-picker-chip" onClick={() => handleTagSelect("sector33", v)}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <div className="tag-picker-section">
                    <h4>17業種区分</h4>
                    <div className="tag-picker-chips">
                      {availableTags.sector17.map((v) => (
                        <button key={v} className="tag-picker-chip" onClick={() => handleTagSelect("sector17", v)}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <div className="tag-picker-section">
                    <h4>市場区分</h4>
                    <div className="tag-picker-chips">
                      {availableTags.market.map((v) => (
                        <button key={v} className="tag-picker-chip" onClick={() => handleTagSelect("market", v)}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <div className="tag-picker-section">
                    <h4>規模区分</h4>
                    <div className="tag-picker-chips">
                      {availableTags.scale.map((v) => (
                        <button key={v} className="tag-picker-chip" onClick={() => handleTagSelect("scale", v)}>{v}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 検索結果（提案ドロップダウン） */}
        {showResults && searchResults.length > 0 && (
          <div className="search-results" ref={resultsRef}>
            {searchResults.map((r, i) => (
              <div
                key={`${r.code}-${i}`}
                className={`search-result-item ${i === highlightIndex ? "highlight" : ""}`}
                onClick={() => addTicker(r)}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                <span className="code">{r.code}</span>
                <span className="name">{r.name}</span>
                {r.sector && <span className="sector">{r.sector}</span>}
                {r.market && <span className="market">{r.market}</span>}
                {r.scale && <span className="scale">{r.scale}</span>}
              </div>
            ))}
          </div>
        )}
        {showResults && searchResults.length === 0 && !searching && query.trim() && (
          <div className="search-results search-results-empty">
            {t("search.noResults")}
          </div>
        )}

        {/* メタデータタグフィルター */}
        {selectedTickers.length > 0 && (() => {
          const allTags = new Set<string>();
          selectedTickers.forEach((tk) => {
            const m = tickerMeta[tk.code];
            if (m?.sector33) allTags.add(m.sector33);
            if (m?.market) allTags.add(m.market);
            if (m?.scale) allTags.add(m.scale);
          });
          return allTags.size > 0 ? (
            <div className="meta-filter-bar">
              <button
                className={`meta-filter-chip ${activeFilter === null ? "active" : ""}`}
                onClick={() => setActiveFilter(null)}
              >{t("search.all") || "すべて"}</button>
              {Array.from(allTags).sort().map((tag) => (
                <button
                  key={tag}
                  className={`meta-filter-chip ${activeFilter === tag ? "active" : ""}`}
                  onClick={() => setActiveFilter(activeFilter === tag ? null : tag)}
                >{tag}</button>
              ))}
            </div>
          ) : null;
        })()}

        {/* 選択中の銘柄タグ */}
        {selectedTickers.length > 0 && (
          <div className="tags">
            {selectedTickers
              .filter((tk) => {
                if (!activeFilter) return true;
                const m = tickerMeta[tk.code];
                if (!m) return true;
                return m.sector33 === activeFilter || m.market === activeFilter || m.scale === activeFilter;
              })
              .map((tk) => {
                const m = tickerMeta[tk.code];
                return (
                  <span key={tk.code} className="tag tag-with-meta">
                    <span className="tag-main">{tk.code} {tk.name}</span>
                    {m && (
                      <span className="tag-badges">
                        {m.sector33 && <span className="tag-badge badge-sector">{m.sector33}</span>}
                        {m.market && <span className="tag-badge badge-market">{m.market}</span>}
                        {m.scale && <span className="tag-badge badge-scale">{m.scale}</span>}
                      </span>
                    )}
                    <button onClick={() => removeTicker(tk.code)}>&times;</button>
                  </span>
                );
              })}
            <button
              className="danger"
              style={{ padding: "4px 12px", fontSize: "0.82rem" }}
              onClick={() => { setSelectedTickers([]); setStocksData(null); setActiveFilter(null); }}
            >
              {t("search.deleteAll")}
            </button>
          </div>
        )}

        {latestPrices.length > 0 && (
          <div className="latest-prices">
            <h3>{t("latest.title")}</h3>
            <div className="latest-prices-grid">
              {latestPrices.map((p) => {
                const sig = tickerSignals[p.ticker];
                return (
                  <div key={p.ticker} className="latest-price-card">
                    <span className="lp-name">{tickerNames[p.ticker] || tickerNames[p.ticker + ".T"] || p.ticker}</span>
                    <span className="lp-price">{p.price.toLocaleString()}</span>
                    {p.change_pct != null && (
                      <span className={`lp-change ${p.change_pct >= 0 ? "positive" : "negative"}`}>
                        {p.change_pct >= 0 ? "+" : ""}{p.change_pct}%
                      </span>
                    )}
                    {sig && sig.level !== "neutral" && (
                      <span className={`signal-badge signal-badge-sm signal-${sig.level}`}>
                        <span className="signal-dot" />
                        {sig.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="latest-prices-note">
              {t("latest.note")}
            </p>
          </div>
        )}

        <div className="search-bar">
          <select
            value={timeInterval}
            onChange={(e) => setTimeInterval(e.target.value)}
            title={t("interval.minutes")}
          >
            <optgroup label={t("interval.minutes")}>
              <option value="1m">{t("interval.1m")}</option>
              <option value="5m">{t("interval.5m")}</option>
              <option value="15m">{t("interval.15m")}</option>
              <option value="30m">{t("interval.30m")}</option>
            </optgroup>
            <optgroup label={t("interval.hours")}>
              <option value="60m">{t("interval.60m")}</option>
            </optgroup>
            <optgroup label={t("interval.daily")}>
              <option value="1d">{t("interval.1d")}</option>
              <option value="1wk">{t("interval.1wk")}</option>
              <option value="1mo">{t("interval.1mo")}</option>
            </optgroup>
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className="date-separator">〜</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          {loading ? (
            <button className="danger" onClick={handleCancelFetch}>
              {t("action.cancel")}
            </button>
          ) : (
            <button onClick={() => handleFetch()} disabled={selectedTickers.length === 0}>
              {t("action.fetch")}
            </button>
          )}
          {stocksData && (
            <button className="secondary" onClick={handleExport}>
              {t("action.exportCsv")}
            </button>
          )}
        </div>
      </div>

      {/* ウォッチリスト */}
      <WatchlistPanel
        currentTickers={selectedTickers}
        onLoad={(tickers) => setSelectedTickers(tickers)}
        tickerMeta={tickerMeta}
      />

      {/* AI分析 */}
      <AIPanel
        currentTickers={selectedTickers}
        onAddTickers={(tickers) =>
          setSelectedTickers((prev) => {
            const existing = new Set(prev.map((t) => t.code));
            const newOnes = tickers.filter((t) => !existing.has(t.code));
            return [...prev, ...newOnes];
          })
        }
      />

      {/* エラー表示 */}
      {errors.length > 0 && (
        <div className="error">
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      {loading && (
        <div className="loading">
          {t("action.loading")}
          <button className="danger" onClick={handleCancelFetch} style={{ marginLeft: 16 }}>
            {t("action.cancel")}
          </button>
        </div>
      )}

      {/* 結果表示 */}
      {stocksData && !loading && (
        <>
          {/* サマリーカード */}
          <StatsCards stocks={stocksData.stocks ?? []} tickerNames={tickerNames} />

          <div className="panel">
            <div className="tab-bar">
              <button className={`tab ${tab === "chart" ? "active" : ""}`} onClick={() => setTab("chart")}>
                {t("tab.comparison")}
              </button>
              <button className={`tab ${tab === "individual" ? "active" : ""}`} onClick={() => setTab("individual")}>
                {t("tab.individual")}
              </button>
              <button className={`tab ${tab === "table" ? "active" : ""}`} onClick={() => setTab("table")}>
                {t("tab.table")}
              </button>
            </div>

            {tab === "chart" && (
              <StockChart
                comparison={stocksData.comparison ?? []}
                stocks={stocksData.stocks ?? []}
                tickerNames={tickerNames}
                startDate={startDate}
                endDate={endDate}
                onPeriodChange={handlePeriodChange}
              />
            )}
            {tab === "individual" && (
              <IndividualCharts stocks={stocksData.stocks ?? []} tickerNames={tickerNames} />
            )}
            {tab === "table" && (
              <StockTable stocks={stocksData.stocks ?? []} tickerNames={tickerNames} />
            )}
          </div>
        </>
      )}

      <footer className="app-footer">
        <span>&copy; {new Date().getFullYear()} StocksView</span>
        <span className="footer-sep">&middot;</span>
        <button className="footer-link" onClick={() => setLegalModal("terms")}>{t("footer.terms")}</button>
        <span className="footer-sep">&middot;</span>
        <button className="footer-link" onClick={() => setLegalModal("privacy")}>{t("footer.privacy")}</button>
      </footer>

      <LegalModal
        isOpen={legalModal === "privacy"}
        onClose={() => setLegalModal(null)}
        title={t("legal.privacyTitle")}
      >
        <PrivacyPolicy />
      </LegalModal>
      <LegalModal
        isOpen={legalModal === "terms"}
        onClose={() => setLegalModal(null)}
        title={t("legal.termsTitle")}
      >
        <TermsOfService />
      </LegalModal>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  );
}

export default App;
