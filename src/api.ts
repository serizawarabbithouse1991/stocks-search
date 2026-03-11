const API_BASE =
  (typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_BASE) ||
  "http://127.0.0.1:8001";

export async function searchStocks(query: string, source: string = "jquants") {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}&source=${source}`);
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  return res.json();
}

export async function fetchStocks(tickers: string[], start: string, end: string, source: string = "yfinance") {
  const res = await fetch(`${API_BASE}/api/stocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers, start, end, source }),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
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
