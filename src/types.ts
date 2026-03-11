export interface StockRecord {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockData {
  ticker: string;
  name?: string;
  count: number;
  first_close: number;
  last_close: number;
  high_max: number;
  high_max_date: string;
  low_min: number;
  low_min_date: string;
  change_pct: number;
  data: StockRecord[];
}

export interface ComparisonPoint {
  date: string;
  [ticker: string]: string | number;
}

export interface StocksResponse {
  stocks: StockData[];
  comparison: ComparisonPoint[];
  errors: string[];
}

export interface SearchResult {
  code: string;
  name: string;
  name_en: string;
  sector: string;
  market: string;
  sector33?: string;
  sector33_code?: string;
  sector17?: string;
  sector17_code?: string;
  scale?: string;
  scale_code?: string;
}
