import { useState } from "react";
import type { StocksResponse, SearchResult } from "./types";
import { searchStocks, fetchStocks, exportCsv } from "./api";
import StockChart from "./components/StockChart";
import StockTable from "./components/StockTable";
import StatsCards from "./components/StatsCards";

type Tab = "chart" | "table" | "compare";

function App() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"yfinance" | "jquants">("jquants");
  const [selectedTickers, setSelectedTickers] = useState<{ code: string; name: string }[]>([]);
  const [startDate, setStartDate] = useState("2025-01-01");
  const [endDate, setEndDate] = useState("2026-03-11");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [stocksData, setStocksData] = useState<StocksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("chart");

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchStocks(query, source);
      setSearchResults(res.results || []);
      setShowResults(true);
    } catch (e: any) {
      setErrors([e.message]);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const addTicker = (result: SearchResult) => {
    const tickerCode = source === "yfinance" ? result.code : `${result.code}.T`;
    if (!selectedTickers.find((t) => t.code === tickerCode)) {
      setSelectedTickers([...selectedTickers, { code: tickerCode, name: result.name }]);
    }
    setShowResults(false);
    setQuery("");
  };

  const removeTicker = (code: string) => {
    setSelectedTickers(selectedTickers.filter((t) => t.code !== code));
  };

  const handleFetch = async () => {
    if (selectedTickers.length === 0) return;
    setLoading(true);
    setErrors([]);
    try {
      const codes = selectedTickers.map((t) => t.code);
      const res: StocksResponse = await fetchStocks(codes, startDate, endDate, source);
      setStocksData(res);
      if (res.errors?.length) setErrors(res.errors);
    } catch (e: any) {
      setErrors([e.message]);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    const codes = selectedTickers.map((t) => t.code);
    await exportCsv(codes, startDate, endDate, source);
  };

  const tickerNames: Record<string, string> = {};
  selectedTickers.forEach((t) => {
    tickerNames[t.code] = t.name;
  });

  return (
    <>
      <h1>Stock Screener - 株式銘柄比較ツール</h1>

      {/* 検索パネル */}
      <div className="panel">
        <h2>銘柄検索</h2>
        <div className="search-bar">
          <select value={source} onChange={(e) => setSource(e.target.value as any)}>
            <option value="jquants">J-Quants (日本株)</option>
            <option value="yfinance">Yahoo Finance (日米株)</option>
          </select>
          <input
            type="text"
            placeholder="銘柄コードまたは銘柄名を入力..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={handleSearch} disabled={searching}>
            {searching ? "検索中..." : "検索"}
          </button>
        </div>

        {/* 検索結果 */}
        {showResults && searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((r) => (
              <div key={r.code} className="search-result-item" onClick={() => addTicker(r)}>
                <span className="code">{r.code}</span>
                <span className="name">{r.name}</span>
                <span className="sector">{r.sector}</span>
              </div>
            ))}
          </div>
        )}
        {showResults && searchResults.length === 0 && !searching && (
          <div style={{ color: "#8b949e", padding: "8px" }}>該当する銘柄が見つかりません</div>
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
          </div>
        )}

        {/* 期間設定 & 実行 */}
        <div className="search-bar">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span style={{ color: "#8b949e", alignSelf: "center" }}>〜</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <button onClick={handleFetch} disabled={loading || selectedTickers.length === 0}>
            {loading ? "取得中..." : "データ取得"}
          </button>
          {stocksData && (
            <button className="secondary" onClick={handleExport}>
              CSV出力
            </button>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {errors.length > 0 && (
        <div className="error">
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      {/* ローディング */}
      {loading && <div className="loading">データを取得しています...</div>}

      {/* 結果表示 */}
      {stocksData && !loading && (
        <>
          {/* サマリーカード */}
          <StatsCards stocks={stocksData.stocks} tickerNames={tickerNames} />

          {/* タブ切替 */}
          <div className="panel">
            <div className="tab-bar">
              <button className={`tab ${tab === "chart" ? "active" : ""}`} onClick={() => setTab("chart")}>
                比較チャート
              </button>
              <button className={`tab ${tab === "table" ? "active" : ""}`} onClick={() => setTab("table")}>
                データテーブル
              </button>
            </div>

            {tab === "chart" && (
              <StockChart comparison={stocksData.comparison} tickerNames={tickerNames} />
            )}
            {tab === "table" && (
              <StockTable stocks={stocksData.stocks} tickerNames={tickerNames} />
            )}
          </div>
        </>
      )}
    </>
  );
}

export default App;
