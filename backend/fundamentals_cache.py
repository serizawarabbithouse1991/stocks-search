"""ファンダメンタルズキャッシュ - SQLite に 24h TTL で保存"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional

import sqlite3
import yfinance as yf

_DB_PATH = Path(__file__).parent / "data" / "fundamentals_cache.db"
_TTL_SECONDS = 24 * 60 * 60

_FIELDS = [
    "per", "forward_per", "pbr", "eps", "roe", "roa",
    "dividend_yield", "dividend_rate", "payout_ratio",
    "market_cap", "enterprise_value",
    "profit_margin", "operating_margin",
    "revenue", "net_income",
    "total_debt", "total_cash", "book_value",
    "beta", "avg_volume",
    "fifty_two_week_high", "fifty_two_week_low",
    "recommendation",
]

_YF_MAP = {
    "per": "trailingPE",
    "forward_per": "forwardPE",
    "pbr": "priceToBook",
    "eps": "trailingEps",
    "roe": "returnOnEquity",
    "roa": "returnOnAssets",
    "dividend_yield": "dividendYield",
    "dividend_rate": "dividendRate",
    "payout_ratio": "payoutRatio",
    "market_cap": "marketCap",
    "enterprise_value": "enterpriseValue",
    "profit_margin": "profitMargins",
    "operating_margin": "operatingMargins",
    "revenue": "totalRevenue",
    "net_income": "netIncomeToCommon",
    "total_debt": "totalDebt",
    "total_cash": "totalCash",
    "book_value": "bookValue",
    "beta": "beta",
    "avg_volume": "averageVolume",
    "fifty_two_week_high": "fiftyTwoWeekHigh",
    "fifty_two_week_low": "fiftyTwoWeekLow",
    "recommendation": "recommendationKey",
}


def _get_conn() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS fundamentals (
            ticker TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            fetched_at REAL NOT NULL
        )
    """)
    return conn


def get_cached(ticker: str) -> Optional[dict]:
    conn = _get_conn()
    row = conn.execute(
        "SELECT data, fetched_at FROM fundamentals WHERE ticker = ?", (ticker,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    if time.time() - row[1] > _TTL_SECONDS:
        return None
    try:
        return json.loads(row[0])
    except (json.JSONDecodeError, TypeError):
        return None


def fetch_and_cache(ticker: str) -> Optional[dict]:
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        if not info.get("symbol"):
            return None

        data: dict = {}
        for our_key, yf_key in _YF_MAP.items():
            v = info.get(yf_key)
            if v is not None and v != "":
                data[our_key] = v
            else:
                data[our_key] = None

        conn = _get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO fundamentals (ticker, data, fetched_at) VALUES (?, ?, ?)",
            (ticker, json.dumps(data), time.time()),
        )
        conn.commit()
        conn.close()
        return data
    except Exception as e:
        print(f"[fundamentals_cache] Error fetching {ticker}: {e}")
        return None


def get_or_fetch(ticker: str) -> Optional[dict]:
    cached = get_cached(ticker)
    if cached is not None:
        return cached
    return fetch_and_cache(ticker)


def get_batch(tickers: list[str]) -> dict[str, dict]:
    result = {}
    to_fetch = []
    for t in tickers:
        cached = get_cached(t)
        if cached is not None:
            result[t] = cached
        else:
            to_fetch.append(t)

    for t in to_fetch:
        data = fetch_and_cache(t)
        if data:
            result[t] = data

    return result


def clear_expired():
    conn = _get_conn()
    conn.execute(
        "DELETE FROM fundamentals WHERE fetched_at < ?",
        (time.time() - _TTL_SECONDS,),
    )
    conn.commit()
    conn.close()
