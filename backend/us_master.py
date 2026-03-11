"""米国株マスタ管理 - Wikipedia から S&P500 / NASDAQ-100 / Dow30 を取得"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

_DATA_DIR = Path(__file__).parent / "data"
_CACHE_PATH = _DATA_DIR / "us_master_cache.json"
_TTL_SECONDS = 7 * 24 * 60 * 60  # 1 week

_lock = threading.Lock()
_entries: list[dict] = []
_ticker_index: dict[str, dict] = {}
_loaded_at: Optional[str] = None


def _wiki_read_html(url: str):
    """Wikipedia をUser-Agent付きで取得し pandas.read_html に渡す"""
    import pandas as pd
    import urllib.request
    from io import StringIO
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (StocksView/1.0)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8")
    return pd.read_html(StringIO(html))


def _fetch_sp500() -> list[dict]:
    """Wikipedia から S&P 500 構成銘柄を取得"""
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    tables = _wiki_read_html(url)
    df = tables[0]
    rows = []
    for _, r in df.iterrows():
        symbol = str(r.get("Symbol", "")).strip()
        if not symbol:
            continue
        rows.append({
            "ticker": symbol,
            "name": str(r.get("Security", symbol)).strip(),
            "sector": str(r.get("GICS Sector", "")).strip(),
            "sub_industry": str(r.get("GICS Sub-Industry", "")).strip(),
            "index": "S&P 500",
            "exchange": str(r.get("Founded", "")).strip() if "Founded" in df.columns else "",
        })
    return rows


def _fetch_nasdaq100() -> list[dict]:
    """Wikipedia から NASDAQ-100 構成銘柄を取得"""
    url = "https://en.wikipedia.org/wiki/Nasdaq-100"
    tables = _wiki_read_html(url)
    for tbl in tables:
        cols_lower = [str(c).lower() for c in tbl.columns]
        if "ticker" in cols_lower or "symbol" in cols_lower:
            df = tbl
            break
    else:
        return []

    cols_map = {str(c).lower(): c for c in df.columns}
    ticker_col = cols_map.get("ticker") or cols_map.get("symbol")
    name_col = cols_map.get("company") or cols_map.get("security") or cols_map.get("name")
    sector_col = cols_map.get("gics sector") or cols_map.get("sector")

    rows = []
    for _, r in df.iterrows():
        symbol = str(r[ticker_col]).strip() if ticker_col else ""
        if not symbol:
            continue
        rows.append({
            "ticker": symbol,
            "name": str(r[name_col]).strip() if name_col else symbol,
            "sector": str(r[sector_col]).strip() if sector_col else "",
            "sub_industry": "",
            "index": "NASDAQ-100",
            "exchange": "NASDAQ",
        })
    return rows


def _fetch_dow30() -> list[dict]:
    """Wikipedia から Dow Jones 30 構成銘柄を取得"""
    url = "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average"
    tables = _wiki_read_html(url)
    for tbl in tables:
        cols_lower = [str(c).lower() for c in tbl.columns]
        if "symbol" in cols_lower or "ticker" in cols_lower:
            df = tbl
            break
    else:
        return []

    cols_map = {str(c).lower(): c for c in df.columns}
    ticker_col = cols_map.get("symbol") or cols_map.get("ticker")
    name_col = cols_map.get("company") or cols_map.get("security") or cols_map.get("name")
    sector_col = cols_map.get("industry")

    rows = []
    for _, r in df.iterrows():
        symbol = str(r[ticker_col]).strip() if ticker_col else ""
        if not symbol:
            continue
        rows.append({
            "ticker": symbol,
            "name": str(r[name_col]).strip() if name_col else symbol,
            "sector": str(r[sector_col]).strip() if sector_col else "",
            "sub_industry": "",
            "index": "Dow 30",
            "exchange": "NYSE/NASDAQ",
        })
    return rows


def _merge_and_dedup(sp500: list[dict], nasdaq100: list[dict], dow30: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for lst in [sp500, nasdaq100, dow30]:
        for entry in lst:
            ticker = entry["ticker"]
            if ticker in seen:
                existing = seen[ticker]
                idx_set = set(existing.get("indices", "").split(", "))
                idx_set.add(entry["index"])
                existing["indices"] = ", ".join(sorted(idx_set))
            else:
                entry["indices"] = entry.pop("index")
                seen[ticker] = entry
    return sorted(seen.values(), key=lambda x: x["ticker"])


def _save_cache(entries: list[dict]):
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump({"fetched_at": time.time(), "entries": entries}, f, ensure_ascii=False, indent=1)


def _load_cache() -> Optional[list[dict]]:
    if not _CACHE_PATH.exists():
        return None
    try:
        with open(_CACHE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if time.time() - data.get("fetched_at", 0) > _TTL_SECONDS:
            return None
        return data.get("entries", [])
    except Exception:
        return None


def refresh(force: bool = False) -> int:
    """US株マスタを(再)取得する。キャッシュがあり force=False ならキャッシュを使う"""
    global _entries, _ticker_index, _loaded_at

    if not force:
        cached = _load_cache()
        if cached:
            with _lock:
                _entries = cached
                _ticker_index = {e["ticker"]: e for e in cached}
                _loaded_at = datetime.now().isoformat(timespec="seconds")
            return len(cached)

    try:
        sp500 = _fetch_sp500()
        nasdaq100 = _fetch_nasdaq100()
        dow30 = _fetch_dow30()
        merged = _merge_and_dedup(sp500, nasdaq100, dow30)
        _save_cache(merged)

        with _lock:
            _entries = merged
            _ticker_index = {e["ticker"]: e for e in merged}
            _loaded_at = datetime.now().isoformat(timespec="seconds")

        print(f"[us_master] US株マスタ取得完了: {len(merged)} 件 (S&P500={len(sp500)}, NASDAQ100={len(nasdaq100)}, Dow30={len(dow30)})")
        return len(merged)
    except Exception as e:
        print(f"[us_master] US株マスタ取得失敗: {e}")
        cached = _load_cache()
        if cached:
            with _lock:
                _entries = cached
                _ticker_index = {e["ticker"]: e for e in cached}
                _loaded_at = datetime.now().isoformat(timespec="seconds")
            return len(cached)
        return 0


def status() -> dict:
    return {
        "loaded": len(_entries) > 0,
        "count": len(_entries),
        "loaded_at": _loaded_at,
    }


def get_entries() -> list[dict]:
    with _lock:
        return list(_entries)


def get_entry(ticker: str) -> Optional[dict]:
    with _lock:
        return _ticker_index.get(ticker)


def search(query: str, limit: int = 20) -> list[dict]:
    q = query.strip().upper()
    if not q:
        return []

    with _lock:
        entries = list(_entries)

    exact = []
    prefix = []
    contains = []

    for entry in entries:
        ticker = entry["ticker"].upper()
        name = entry["name"].upper()
        if ticker == q:
            exact.append(entry)
        elif ticker.startswith(q):
            prefix.append(entry)
        elif q in name or q in ticker:
            contains.append(entry)

    results = exact + prefix + contains
    return results[:limit]


def list_tags() -> dict[str, list[str]]:
    with _lock:
        entries = list(_entries)
    tags: dict[str, set[str]] = {"sector": set(), "indices": set(), "exchange": set()}
    for e in entries:
        for key in tags:
            val = e.get(key, "")
            if val:
                for v in val.split(", "):
                    if v.strip():
                        tags[key].add(v.strip())
    return {k: sorted(v) for k, v in tags.items()}


def filter_by_tag(field: str, value: str, limit: int = 500) -> list[dict]:
    with _lock:
        entries = list(_entries)
    results = [e for e in entries if value in e.get(field, "")]
    return results[:limit]


def _auto_load():
    count = refresh(force=False)
    if count > 0:
        print(f"[us_master] US株マスタ読み込み完了: {count} 件")
    else:
        print("[us_master] US株マスタ未取得（初回はAPIアクセス時に自動取得）")


_auto_load()
