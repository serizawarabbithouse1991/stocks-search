import { useState, useEffect } from "react";
import {
  llmThemeSuggest,
  llmAnalyze,
  fetchLLMProviders,
  type ThemeSuggestion,
  type LLMProvider,
} from "../api";

interface Ticker {
  code: string;
  name: string;
}

interface Props {
  currentTickers: Ticker[];
  onAddTickers: (tickers: Ticker[]) => void;
}

const LLM_SETTINGS_KEY = "stocksview-llm-settings";

function loadLLMSettings(): { provider: string; apiKey: string } {
  try {
    const raw = localStorage.getItem(LLM_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { provider: "ollama", apiKey: "" };
}

function saveLLMSettings(provider: string, apiKey: string) {
  localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify({ provider, apiKey }));
}

export default function AIPanel({ currentTickers, onAddTickers }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [tab, setTab] = useState<"theme" | "analyze">("theme");

  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [provider, setProvider] = useState(loadLLMSettings().provider);
  const [apiKey, setApiKey] = useState(loadLLMSettings().apiKey);
  const [showKeyInput, setShowKeyInput] = useState(false);

  const [themeInput, setThemeInput] = useState("");
  const [suggestions, setSuggestions] = useState<ThemeSuggestion[]>([]);
  const [themeLoading, setThemeLoading] = useState(false);
  const [themeError, setThemeError] = useState("");

  const [analysisTheme, setAnalysisTheme] = useState("");
  const [report, setReport] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  useEffect(() => {
    fetchLLMProviders().then((r) => {
      if (r.providers.length) setProviders(r.providers);
    });
  }, []);

  const handleProviderChange = (p: string) => {
    setProvider(p);
    saveLLMSettings(p, apiKey);
  };

  const handleApiKeyChange = (k: string) => {
    setApiKey(k);
    saveLLMSettings(provider, k);
  };

  const handleThemeSearch = async () => {
    if (!themeInput.trim()) return;
    setThemeLoading(true);
    setThemeError("");
    setSuggestions([]);
    try {
      const res = await llmThemeSuggest(
        themeInput.trim(),
        provider,
        apiKey || undefined,
      );
      setSuggestions(res.suggestions);
      if (res.suggestions.length === 0) setThemeError("提案結果がありませんでした");
    } catch (e: any) {
      setThemeError(e.message);
    } finally {
      setThemeLoading(false);
    }
  };

  const handleAddAll = () => {
    const existing = new Set(currentTickers.map((t) => t.code));
    const newTickers = suggestions
      .filter((s) => !existing.has(s.code))
      .map((s) => ({ code: s.code, name: s.name }));
    if (newTickers.length > 0) onAddTickers(newTickers);
  };

  const handleAddOne = (s: ThemeSuggestion) => {
    const existing = new Set(currentTickers.map((t) => t.code));
    if (!existing.has(s.code)) {
      onAddTickers([{ code: s.code, name: s.name }]);
    }
  };

  const handleAnalyze = async () => {
    if (currentTickers.length === 0) return;
    setAnalysisLoading(true);
    setAnalysisError("");
    setReport("");
    try {
      const res = await llmAnalyze(
        currentTickers.map((t) => t.code),
        analysisTheme || undefined,
        provider,
        apiKey || undefined,
      );
      setReport(res.report);
    } catch (e: any) {
      setAnalysisError(e.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const needsKey = provider !== "ollama";

  return (
    <div className="panel ai-panel">
      <div className="wl-header" onClick={() => setIsOpen(!isOpen)}>
        <h2 style={{ margin: 0, cursor: "pointer", userSelect: "none" }}>
          <span className="wl-arrow">{isOpen ? "▾" : "▸"}</span>
          AI分析
          <span className="wl-badge">β</span>
        </h2>
      </div>

      {isOpen && (
        <div className="ai-body">
          {/* プロバイダー設定 */}
          <div className="ai-provider-bar">
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="ai-provider-select"
            >
              {providers.length > 0
                ? providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                : ["ollama", "openai", "anthropic", "gemini"].map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
            </select>
            {needsKey && (
              <button
                className="secondary ai-key-btn"
                onClick={() => setShowKeyInput(!showKeyInput)}
                title="APIキー設定"
              >
                🔑 {apiKey ? "設定済" : "未設定"}
              </button>
            )}
          </div>
          {showKeyInput && needsKey && (
            <div className="ai-key-row">
              <input
                type="password"
                placeholder={`${provider} API Key`}
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
              />
            </div>
          )}

          {/* タブ */}
          <div className="ai-tabs">
            <button
              className={`chart-toolbar-btn ${tab === "theme" ? "active" : ""}`}
              onClick={() => setTab("theme")}
            >
              テーマ→銘柄提案
            </button>
            <button
              className={`chart-toolbar-btn ${tab === "analyze" ? "active" : ""}`}
              onClick={() => setTab("analyze")}
            >
              比較分析
            </button>
          </div>

          {/* テーマ提案タブ */}
          {tab === "theme" && (
            <div className="ai-theme-section">
              <div className="ai-input-row">
                <input
                  type="text"
                  placeholder="投資テーマを入力（例: AI半導体, 再生エネルギー, 高配当）"
                  value={themeInput}
                  onChange={(e) => setThemeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleThemeSearch()}
                />
                <button onClick={handleThemeSearch} disabled={themeLoading || !themeInput.trim()}>
                  {themeLoading ? "分析中..." : "提案"}
                </button>
              </div>

              {themeError && <p className="ai-error">{themeError}</p>}

              {suggestions.length > 0 && (
                <div className="ai-suggestions">
                  <div className="ai-suggestions-header">
                    <span>{suggestions.length}件の提案</span>
                    <button className="secondary" onClick={handleAddAll}>全て追加</button>
                  </div>
                  <div className="ai-suggestion-list">
                    {suggestions.map((s) => {
                      const already = currentTickers.some((t) => t.code === s.code);
                      return (
                        <div key={s.code} className={`ai-suggestion-item ${already ? "added" : ""}`}>
                          <div className="ai-suggestion-main">
                            <span className="ai-suggestion-code">{s.code}</span>
                            <span className="ai-suggestion-name">{s.name}</span>
                            {!already && (
                              <button className="ai-add-btn" onClick={() => handleAddOne(s)}>+</button>
                            )}
                            {already && <span className="ai-added-tag">追加済</span>}
                          </div>
                          {s.reason && <p className="ai-suggestion-reason">{s.reason}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 比較分析タブ */}
          {tab === "analyze" && (
            <div className="ai-analysis-section">
              <div className="ai-input-row">
                <input
                  type="text"
                  placeholder="分析テーマ（任意: AI関連株の成長性 等）"
                  value={analysisTheme}
                  onChange={(e) => setAnalysisTheme(e.target.value)}
                />
                <button
                  onClick={handleAnalyze}
                  disabled={analysisLoading || currentTickers.length === 0}
                >
                  {analysisLoading ? "分析中..." : `分析 (${currentTickers.length}銘柄)`}
                </button>
              </div>

              {currentTickers.length === 0 && (
                <p className="ai-hint">銘柄を選択してから分析を実行してください</p>
              )}

              {analysisError && <p className="ai-error">{analysisError}</p>}

              {report && (
                <div className="ai-report">
                  <div className="ai-report-content">
                    {report.split("\n").map((line, i) => {
                      if (line.startsWith("**") && line.endsWith("**")) {
                        return <h4 key={i}>{line.replace(/\*\*/g, "")}</h4>;
                      }
                      if (line.startsWith("# ")) return <h3 key={i}>{line.slice(2)}</h3>;
                      if (line.startsWith("## ")) return <h4 key={i}>{line.slice(3)}</h4>;
                      if (line.startsWith("- ")) return <li key={i}>{line.slice(2)}</li>;
                      if (line.trim() === "") return <br key={i} />;
                      return <p key={i}>{line}</p>;
                    })}
                  </div>
                  <p className="ai-disclaimer">
                    ※ AI による分析情報であり、投資助言ではありません。投資判断はご自身の責任で行ってください。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
