"""株価データ取得サービス - yfinance & J-Quants"""

import yfinance as yf
import pandas as pd
from typing import Optional
from jquants_client import JQuantsClient


VALID_INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo"}

# yfinance の interval ごとに取得可能な最大期間（日）
_MAX_PERIOD_DAYS = {
    "1m": 7, "2m": 60, "5m": 60, "15m": 60, "30m": 60,
    "60m": 730, "90m": 60, "1h": 730,
}


def get_stock_data_yfinance(
    ticker: str, start: str, end: str, interval: str = "1d"
) -> Optional[dict]:
    """yfinanceから株価データを取得（interval: 1m,5m,15m,30m,60m,1h,1d 等）"""
    if interval not in VALID_INTERVALS:
        interval = "1d"
    try:
        is_intraday = interval not in ("1d", "5d", "1wk", "1mo")
        fmt = "%Y-%m-%d %H:%M" if is_intraday else "%Y-%m-%d"

        if is_intraday:
            max_days = _MAX_PERIOD_DAYS.get(interval, 60)
            from datetime import datetime, timedelta
            start_dt = datetime.strptime(start, "%Y-%m-%d")
            end_dt = datetime.strptime(end, "%Y-%m-%d")
            if (end_dt - start_dt).days > max_days:
                start_dt = end_dt - timedelta(days=max_days)
                start = start_dt.strftime("%Y-%m-%d")

        df = yf.download(ticker, start=start, end=end, interval=interval, progress=False)
        if df.empty:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        records = []
        for idx, row in df.iterrows():
            records.append({
                "date": idx.strftime(fmt),
                "open": round(float(row["Open"]), 1),
                "high": round(float(row["High"]), 1),
                "low": round(float(row["Low"]), 1),
                "close": round(float(row["Close"]), 1),
                "volume": int(row["Volume"]),
            })

        close_vals = df["Close"]
        return {
            "ticker": ticker,
            "interval": interval,
            "count": len(records),
            "first_close": round(float(close_vals.iloc[0]), 1),
            "last_close": round(float(close_vals.iloc[-1]), 1),
            "high_max": round(float(df["High"].max()), 1),
            "high_max_date": df["High"].idxmax().strftime(fmt),
            "low_min": round(float(df["Low"].min()), 1),
            "low_min_date": df["Low"].idxmin().strftime(fmt),
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


def get_latest_price_yfinance(ticker: str) -> Optional[dict]:
    """yfinance で直近価格を取得（数分〜20分遅延あり）"""
    try:
        t = yf.Ticker(ticker)
        fast = getattr(t, "fast_info", None)
        if fast is not None:
            last_price = getattr(fast, "last_price", None)
            prev_close = getattr(fast, "previous_close", None)
            if last_price is not None:
                change_pct = None
                if prev_close and prev_close > 0:
                    change_pct = round((float(last_price) / float(prev_close) - 1) * 100, 2)
                return {
                    "ticker": ticker,
                    "price": round(float(last_price), 1),
                    "prev_close": round(float(prev_close), 1) if prev_close else None,
                    "change_pct": change_pct,
                }
        df = yf.download(ticker, period="5d", progress=False, auto_adjust=True)
        if df.empty or "Close" not in df.columns:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df = df.copy()
            df.columns = df.columns.get_level_values(0)
        last = df["Close"].iloc[-1]
        prev = df["Close"].iloc[-2] if len(df) >= 2 else last
        return {
            "ticker": ticker,
            "price": round(float(last), 1),
            "prev_close": round(float(prev), 1),
            "change_pct": round((float(last) / float(prev) - 1) * 100, 2),
        }
    except Exception as e:
        print(f"yfinance latest error for {ticker}: {e}")
        return None


def get_latest_price_jquants(client: JQuantsClient, code: str) -> Optional[dict]:
    """J-Quants で直近の終値を取得（日次更新）"""
    try:
        from datetime import datetime, timedelta
        end = datetime.now()
        start = end - timedelta(days=10)
        quotes = client.get_daily_quotes(
            code, start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
        )
        if not quotes:
            return None
        # 日付でソートし最新を取得
        quotes_sorted = sorted(quotes, key=lambda q: q.get("Date", ""), reverse=True)
        q = quotes_sorted[0]
        close = q.get("Close")
        if close is None:
            return None
        prev_close = quotes_sorted[1].get("Close") if len(quotes_sorted) >= 2 else close
        change_pct = None
        if prev_close and float(prev_close) > 0:
            change_pct = round((float(close) / float(prev_close) - 1) * 100, 2)
        return {
            "ticker": code,
            "price": round(float(close), 1),
            "prev_close": round(float(prev_close), 1) if prev_close else None,
            "change_pct": change_pct,
        }
    except Exception as e:
        print(f"J-Quants latest error for {code}: {e}")
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
