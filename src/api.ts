const API_BASE =
  (typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_BASE) ||
  "http://127.0.0.1:8002";

export async function searchStocks(query: string, fuzzy: boolean = true, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query, source: "yfinance", fuzzy: String(fuzzy) });
  const res = await fetch(`${API_BASE}/api/search?${params}`, { signal });
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  return res.json();
}

export async function fetchStocks(
  tickers: string[],
  start: string,
  end: string,
  interval: string = "1d",
  signal?: AbortSignal
) {
  const res = await fetch(`${API_BASE}/api/stocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers, start, end, source: "yfinance", interval }),
    signal,
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
  return res.json();
}

export interface LatestPrice {
  ticker: string;
  price: number;
  prev_close: number | null;
  change_pct: number | null;
}

export async function fetchLatestPrices(
  tickers: string[]
): Promise<{ prices: LatestPrice[] }> {
  if (tickers.length === 0) return { prices: [] };
  const params = new URLSearchParams({ tickers: tickers.join(","), source: "yfinance" });
  const res = await fetch(`${API_BASE}/api/latest?${params}`);
  if (!res.ok) throw new Error(`Latest prices failed: ${res.statusText}`);
  return res.json();
}

export interface TickerMeta {
  name: string;
  market: string;
  sector33: string;
  sector33_code: string;
  sector17: string;
  sector17_code: string;
  scale: string;
  scale_code: string;
}

export async function fetchMeta(
  tickers: string[]
): Promise<Record<string, TickerMeta>> {
  if (tickers.length === 0) return {};
  const params = new URLSearchParams({ tickers: tickers.join(",") });
  const res = await fetch(`${API_BASE}/api/master/meta?${params}`);
  if (!res.ok) return {};
  return res.json();
}

export interface TagsResponse {
  sector33: string[];
  sector17: string[];
  market: string[];
  scale: string[];
}

export async function fetchTags(): Promise<TagsResponse> {
  const res = await fetch(`${API_BASE}/api/master/tags`);
  if (!res.ok) return { sector33: [], sector17: [], market: [], scale: [] };
  return res.json();
}

export interface FilterResult {
  field: string;
  value: string;
  count: number;
  tickers: { code: string; name: string }[];
}

export async function filterByTag(field: string, value: string): Promise<FilterResult> {
  const params = new URLSearchParams({ field, value });
  const res = await fetch(`${API_BASE}/api/master/filter?${params}`);
  if (!res.ok) throw new Error("Filter failed");
  return res.json();
}

// --- LLM ---
export interface LLMProvider {
  id: string;
  name: string;
  configured: boolean;
}

export async function fetchLLMProviders(): Promise<{ providers: LLMProvider[]; default: string }> {
  const res = await fetch(`${API_BASE}/api/llm/providers`);
  if (!res.ok) return { providers: [], default: "ollama" };
  return res.json();
}

export interface ThemeSuggestion {
  code: string;
  name: string;
  reason: string;
  in_master: boolean;
}

export async function llmThemeSuggest(
  theme: string, provider?: string, apiKey?: string, model?: string,
): Promise<{ theme: string; count: number; suggestions: ThemeSuggestion[] }> {
  const res = await fetch(`${API_BASE}/api/llm/theme`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme, provider, api_key: apiKey, model }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "LLM theme failed");
  }
  return res.json();
}

export async function llmAnalyze(
  tickers: string[], theme?: string, provider?: string, apiKey?: string, model?: string,
): Promise<{ report: string; ticker_count: number }> {
  const res = await fetch(`${API_BASE}/api/llm/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers, theme, provider, api_key: apiKey, model }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "LLM analysis failed");
  }
  return res.json();
}

// --- Portfolio ---
export interface PortfolioPosition {
  id: number;
  ticker: string;
  quantity: number;
  avg_price: number;
  broker: string;
  name: string;
  sector: string;
  market: string;
  scale: string;
}

export async function getPortfolioPositions(token: string): Promise<{ positions: PortfolioPosition[] }> {
  const res = await fetch(`${API_BASE}/api/portfolio/positions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { positions: [] };
  return res.json();
}

export async function addPortfolioPosition(
  token: string, pos: { ticker: string; quantity: number; avg_price: number; broker: string }
): Promise<PortfolioPosition> {
  const res = await fetch(`${API_BASE}/api/portfolio/positions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(pos),
  });
  if (!res.ok) throw new Error("Failed to add position");
  return res.json();
}

export async function deletePortfolioPosition(token: string, posId: number) {
  await fetch(`${API_BASE}/api/portfolio/positions/${posId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function importPortfolioCsv(token: string, file: File, broker: string) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/portfolio/import/csv?broker=${broker}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error("CSV import failed");
  return res.json();
}

export async function getPortfolioSummary(token: string) {
  const res = await fetch(`${API_BASE}/api/portfolio/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getMoomooStatus() {
  const res = await fetch(`${API_BASE}/api/moomoo/status`);
  if (!res.ok) return { connected: false };
  return res.json();
}

export async function getMoomooPositions(market: string = "JP") {
  const res = await fetch(`${API_BASE}/api/moomoo/positions?market=${market}`);
  if (!res.ok) throw new Error("moomoo fetch failed");
  return res.json();
}

// --- Fundamentals ---
export interface Fundamentals {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  market_cap: number | null;
  enterprise_value: number | null;
  per: number | null;
  forward_per: number | null;
  pbr: number | null;
  eps: number | null;
  dividend_yield: number | null;
  dividend_rate: number | null;
  payout_ratio: number | null;
  roe: number | null;
  roa: number | null;
  profit_margin: number | null;
  operating_margin: number | null;
  revenue: number | null;
  net_income: number | null;
  total_debt: number | null;
  total_cash: number | null;
  book_value: number | null;
  target_mean_price: number | null;
  recommendation: string;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  avg_volume: number | null;
  beta: number | null;
  currency: string;
  website: string;
  summary: string;
}

export async function fetchFundamentals(ticker: string): Promise<Fundamentals | null> {
  const res = await fetch(`${API_BASE}/api/fundamentals?ticker=${encodeURIComponent(ticker)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function exportCsv(tickers: string[], start: string, end: string) {
  const res = await fetch(`${API_BASE}/api/export/csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers, start, end, source: "yfinance" }),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "stocks_data.csv";
  a.click();
  window.URL.revokeObjectURL(url);
}
