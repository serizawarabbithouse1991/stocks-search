"""ファンダメンタルズキャッシュ - DB に 24h TTL で保存"""

from __future__ import annotations

import json
import time
from typing import Optional

import yfinance as yf
from sqlalchemy import text

from database import engine

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


def init_fundamentals_table():
    """fundamentals テーブルが存在しなければ作成（FastAPI lifespan から呼ぶ）"""
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS fundamentals (
                ticker VARCHAR(32) PRIMARY KEY,
                data TEXT NOT NULL,
                fetched_at DOUBLE PRECISION NOT NULL
            )
        """))


def get_cached(ticker: str) -> Optional[dict]:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT data, fetched_at FROM fundamentals WHERE ticker = :t"),
            {"t": ticker},
        ).fetchone()
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

        with engine.begin() as conn:
            # PostgreSQL: ON CONFLICT, SQLite: INSERT OR REPLACE 両対応
            conn.execute(
                text("""
                    INSERT INTO fundamentals (ticker, data, fetched_at)
                    VALUES (:ticker, :data, :fetched_at)
                    ON CONFLICT (ticker) DO UPDATE
                    SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at
                """),
                {"ticker": ticker, "data": json.dumps(data), "fetched_at": time.time()},
            )
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
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM fundamentals WHERE fetched_at < :cutoff"),
            {"cutoff": time.time() - _TTL_SECONDS},
        )
