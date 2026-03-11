const API_BASE =
  (typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_BASE) ||
  "http://127.0.0.1:8001";

export async function searchStocks(
  query: string,
  source: string = "jquants",
  fuzzy: boolean = true
) {
  const params = new URLSearchParams({ q: query, source, fuzzy: String(fuzzy) });
  const res = await fetch(`${API_BASE}/api/search?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  return res.json();
}

export async function fetchStocks(
  tickers: string[],
  start: string,
  end: string,
  source: string = "yfinance",
  interval: string = "1d"
) {
  const res = await fetch(`${API_BASE}/api/stocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers, start, end, source, interval }),
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
  tickers: string[],
  source: string = "yfinance"
): Promise<{ prices: LatestPrice[] }> {
  if (tickers.length === 0) return { prices: [] };
  const params = new URLSearchParams({ tickers: tickers.join(","), source });
  const res = await fetch(`${API_BASE}/api/latest?${params}`);
  if (!res.ok) throw new Error(`Latest prices failed: ${res.statusText}`);
  return res.json();
}

export async function exportCsv(tickers: string[], start: string, end: string, source: string = "yfinance") {
  const res = await fetch(`${API_BASE}/api/export/csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers, start, end, source }),
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
