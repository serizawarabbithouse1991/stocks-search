import { useState, useEffect, useRef, useCallback } from "react";
import type { StocksResponse, SearchResult } from "./types";
import { searchStocks, fetchStocks, exportCsv, fetchLatestPrices, type LatestPrice } from "./api";

import { useTheme } from "./ThemeContext";
import StockChart from "./components/StockChart";
import StockTable from "./components/StockTable";
import StatsCards from "./components/StatsCards";
import IndividualCharts from "./components/IndividualCharts";
import WatchlistPanel from "./components/WatchlistPanel";

const SUGGEST_DEBOUNCE_MS = 300;

type Tab = "chart" | "individual" | "table";

function App() {
  const { theme, toggle: toggleTheme } = useTheme();
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
    setShowResults(false);
    setQuery("");
    setHighlightIndex(-1);
  };

  const removeTicker = (code: string) => {
    setSelectedTickers(selectedTickers.filter((t) => t.code !== code));
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
        setErrors(["データ取得を中止しました"]);
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

  const tickerNames: Record<string, string> = {};
  selectedTickers.forEach((t) => {
    tickerNames[t.code] = t.name;
  });

  return (
    <>
      <header className="app-header">
        <h1>Stock Screener - 株式銘柄比較ツール</h1>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? "ライトモードに切替" : "ダークモードに切替"}
        >
          {theme === "dark" ? "\u2600" : "\u263E"}
        </button>
      </header>

      {/* 検索パネル */}
      <div className="panel">
        <h2>銘柄検索</h2>
        <div className="search-bar">
          <input
            type="text"
            placeholder="銘柄コード（例: 7203.T, AAPL）を入力..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={handleSearch} disabled={searching}>
            {searching ? "検索中..." : "検索"}
          </button>
        </div>

        {/* 検索結果（提案ドロップダウン） */}
        {showResults && searchResults.length > 0 && (
          <div className="search-results" ref={resultsRef}>
            {searchResults.map((r, i) => (
              <div
                key={r.code}
                className={`search-result-item ${i === highlightIndex ? "highlight" : ""}`}
                onClick={() => addTicker(r)}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                <span className="code">{r.code}</span>
                <span className="name">{r.name}</span>
                <span className="sector">{r.sector}</span>
              </div>
            ))}
          </div>
        )}
        {showResults && searchResults.length === 0 && !searching && query.trim() && (
          <div className="search-results search-results-empty">
            該当する銘柄が見つかりません（あいまい検索で typo も許容しています）
          </div>
        )}

        {/* 選択中の銘柄タグ */}
        {selectedTickers.length > 0 && (
          <div className="tags">
            {selectedTickers.map((t) => (
              <span key={t.code} className="tag">
                {t.code} {t.name}
                <button onClick={() => removeTicker(t.code)}>&times;</button>
              </span>
            ))}
            <button
              className="danger"
              style={{ padding: "4px 12px", fontSize: "0.82rem" }}
              onClick={() => { setSelectedTickers([]); setStocksData(null); }}
            >
              全て削除
            </button>
          </div>
        )}

        {/* 直近価格（リアルタイム表示・約1分ごと更新） */}
        {latestPrices.length > 0 && (
          <div className="latest-prices">
            <h3>直近価格</h3>
            <div className="latest-prices-grid">
              {latestPrices.map((p) => (
                <div key={p.ticker} className="latest-price-card">
                  <span className="lp-name">{tickerNames[p.ticker] || tickerNames[p.ticker + ".T"] || p.ticker}</span>
                  <span className="lp-price">{p.price.toLocaleString()}</span>
                  {p.change_pct != null && (
                    <span className={`lp-change ${p.change_pct >= 0 ? "positive" : "negative"}`}>
                      {p.change_pct >= 0 ? "+" : ""}{p.change_pct}%
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="latest-prices-note">
              Yahoo Finance（数分遅延） · 60秒ごと自動更新
            </p>
          </div>
        )}

        {/* 期間設定 & 実行 */}
        <div className="search-bar">
          <select
            value={timeInterval}
            onChange={(e) => setTimeInterval(e.target.value)}
            title="時間足"
          >
            <optgroup label="分足">
              <option value="1m">1分</option>
              <option value="5m">5分</option>
              <option value="15m">15分</option>
              <option value="30m">30分</option>
            </optgroup>
            <optgroup label="時間足">
              <option value="60m">1時間</option>
            </optgroup>
            <optgroup label="日足以上">
              <option value="1d">1日</option>
              <option value="1wk">1週</option>
              <option value="1mo">1月</option>
            </optgroup>
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className="date-separator">〜</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          {loading ? (
            <button className="danger" onClick={handleCancelFetch}>
              中止
            </button>
          ) : (
            <button onClick={() => handleFetch()} disabled={selectedTickers.length === 0}>
              データ取得
            </button>
          )}
          {stocksData && (
            <button className="secondary" onClick={handleExport}>
              CSV出力
            </button>
          )}
        </div>
      </div>

      {/* ウォッチリスト */}
      <WatchlistPanel
        currentTickers={selectedTickers}
        onLoad={(tickers) => setSelectedTickers(tickers)}
      />

      {/* エラー表示 */}
      {errors.length > 0 && (
        <div className="error">
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="loading">
          データを取得しています...
          <button className="danger" onClick={handleCancelFetch} style={{ marginLeft: 16 }}>
            中止
          </button>
        </div>
      )}

      {/* 結果表示 */}
      {stocksData && !loading && (
        <>
          {/* サマリーカード */}
          <StatsCards stocks={stocksData.stocks ?? []} tickerNames={tickerNames} />

          {/* タブ切替 */}
          <div className="panel">
            <div className="tab-bar">
              <button className={`tab ${tab === "chart" ? "active" : ""}`} onClick={() => setTab("chart")}>
                比較チャート
              </button>
              <button className={`tab ${tab === "individual" ? "active" : ""}`} onClick={() => setTab("individual")}>
                個別チャート
              </button>
              <button className={`tab ${tab === "table" ? "active" : ""}`} onClick={() => setTab("table")}>
                データテーブル
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
    </>
  );
}

export default App;
