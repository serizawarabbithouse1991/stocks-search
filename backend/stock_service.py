"""株価データ取得サービス - yfinance & J-Quants"""

import yfinance as yf
import pandas as pd
from typing import Optional
from jquants_client import JQuantsClient


def get_stock_data_yfinance(
    ticker: str, start: str, end: str
) -> Optional[dict]:
    """yfinanceから株価データを取得"""
    try:
        df = yf.download(ticker, start=start, end=end, progress=False)
        if df.empty:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        records = []
        for idx, row in df.iterrows():
            records.append({
                "date": idx.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 1),
                "high": round(float(row["High"]), 1),
                "low": round(float(row["Low"]), 1),
                "close": round(float(row["Close"]), 1),
                "volume": int(row["Volume"]),
            })

        close_vals = df["Close"]
        return {
            "ticker": ticker,
            "count": len(records),
            "first_close": round(float(close_vals.iloc[0]), 1),
            "last_close": round(float(close_vals.iloc[-1]), 1),
            "high_max": round(float(df["High"].max()), 1),
            "high_max_date": df["High"].idxmax().strftime("%Y-%m-%d"),
            "low_min": round(float(df["Low"].min()), 1),
            "low_min_date": df["Low"].idxmin().strftime("%Y-%m-%d"),
            "change_pct": round(
                (float(close_vals.iloc[-1]) / float(close_vals.iloc[0]) - 1) * 100, 2
            ),
            "data": records,
        }
    except Exception as e:
        print(f"yfinance error for {ticker}: {e}")
        return None


def get_stock_data_jquants(
    client: JQuantsClient, code: str, start: str, end: str
) -> Optional[dict]:
    """J-Quants APIから株価データを取得"""
    try:
        quotes = client.get_daily_quotes(code, start, end)
        if not quotes:
            return None

        records = []
        for q in quotes:
            records.append({
                "date": q.get("Date", ""),
                "open": q.get("Open"),
                "high": q.get("High"),
                "low": q.get("Low"),
                "close": q.get("Close"),
                "volume": q.get("Volume"),
            })

        records.sort(key=lambda x: x["date"])
        closes = [r["close"] for r in records if r["close"] is not None]
        highs = [r for r in records if r["high"] is not None]
        lows = [r for r in records if r["low"] is not None]

        if not closes:
            return None

        high_max_rec = max(highs, key=lambda x: x["high"])
        low_min_rec = min(lows, key=lambda x: x["low"])

        return {
            "ticker": code,
            "count": len(records),
            "first_close": closes[0],
            "last_close": closes[-1],
            "high_max": high_max_rec["high"],
            "high_max_date": high_max_rec["date"],
            "low_min": low_min_rec["low"],
            "low_min_date": low_min_rec["date"],
            "change_pct": round((closes[-1] / closes[0] - 1) * 100, 2),
            "data": records,
        }
    except Exception as e:
        print(f"J-Quants error for {code}: {e}")
        return None


def normalize_for_comparison(stocks_data: list[dict]) -> list[dict]:
    """複数銘柄の終値を基準日=100に正規化して比較用データを作成"""
    if not stocks_data:
        return []

    # 全銘柄の日付を収集
    all_dates = set()
    for sd in stocks_data:
        for r in sd["data"]:
            all_dates.add(r["date"])

    sorted_dates = sorted(all_dates)
    result = []

    for date in sorted_dates:
        entry = {"date": date}
        for sd in stocks_data:
            ticker = sd["ticker"]
            day_data = next((r for r in sd["data"] if r["date"] == date), None)
            if day_data and day_data["close"] is not None:
                base = sd["first_close"]
                if base and base > 0:
                    entry[ticker] = round(day_data["close"] / base * 100, 2)
        result.append(entry)

    return result
