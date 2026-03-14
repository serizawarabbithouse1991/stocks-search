"""株価データ取得サービス - J-Quants（日本株）/ yfinance（米国株）"""

import yfinance as yf
import pandas as pd
from typing import Optional

import master
import jquants_client

VALID_INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo"}

_name_cache: dict[str, str] = {}


def resolve_name(ticker: str) -> str:
    if ticker in _name_cache:
        return _name_cache[ticker]
    master_name = master.resolve_name(ticker)
    if master_name:
        _name_cache[ticker] = master_name
        return master_name
    if not jquants_client.is_jp_ticker(ticker):
        try:
            info = yf.Ticker(ticker).info
            name = info.get("longName") or info.get("shortName") or ticker
            _name_cache[ticker] = name
        except Exception:
            _name_cache[ticker] = ticker
    else:
        _name_cache[ticker] = ticker
    return _name_cache[ticker]


_MAX_PERIOD_DAYS = {
    "1m": 7, "2m": 60, "5m": 60, "15m": 60, "30m": 60,
    "60m": 730, "90m": 60, "1h": 730,
}


def _use_jquants(ticker: str, interval: str) -> bool:
    """J-Quants を使うべきか判定"""
    if not jquants_client.is_jp_ticker(ticker):
        return False
    if not jquants_client.is_configured():
        return False
    # J-Quants は日足のみ対応
    if interval not in ("1d", "5d", "1wk", "1mo"):
        return False
    return True


def get_stock_data_jquants(
    ticker: str, start: str, end: str, interval: str = "1d"
) -> Optional[dict]:
    """J-Quants から日本株の株価データを取得"""
    try:
        records = jquants_client.get_daily_quotes(ticker, start, end)
        if not records:
            return None

        # 週足・月足の場合はリサンプリング
        if interval in ("1wk", "1mo"):
            records = _resample(records, interval)

        if not records:
            return None

        fmt = "%Y-%m-%d"
        name = resolve_name(ticker)
        first_close = records[0]["close"]
        last_close = records[-1]["close"]
        high_max = max(r["high"] for r in records)
        high_max_date = next(r["date"] for r in records if r["high"] == high_max)
        low_min = min(r["low"] for r in records)
        low_min_date = next(r["date"] for r in records if r["low"] == low_min)

        return {
            "ticker": ticker,
            "name": name,
            "interval": interval,
            "count": len(records),
            "first_close": round(float(first_close), 1),
            "last_close": round(float(last_close), 1),
            "high_max": round(float(high_max), 1),
            "high_max_date": high_max_date,
            "low_min": round(float(low_min), 1),
            "low_min_date": low_min_date,
            "change_pct": round(
                (float(last_close) / float(first_close) - 1) * 100, 2
            ) if first_close and first_close > 0 else 0,
            "data": [
                {
                    "date": r["date"],
                    "open": round(float(r["open"]), 1),
                    "high": round(float(r["high"]), 1),
                    "low": round(float(r["low"]), 1),
                    "close": round(float(r["close"]), 1),
                    "volume": int(r["volume"]),
                }
                for r in records
            ],
        }
    except Exception as e:
        print(f"J-Quants error for {ticker}: {e}")
        return None


def _resample(records: list[dict], interval: str) -> list[dict]:
    """日足データを週足/月足にリサンプリング"""
    if not records:
        return []

    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date")

    rule = "W" if interval == "1wk" else "ME"
    resampled = df.resample(rule).agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
    }).dropna()

    result = []
    for idx, row in resampled.iterrows():
        result.append({
            "date": idx.strftime("%Y-%m-%d"),
            "open": row["open"],
            "high": row["high"],
            "low": row["low"],
            "close": row["close"],
            "volume": int(row["volume"]),
        })
    return result


def get_stock_data_yfinance(
    ticker: str, start: str, end: str, interval: str = "1d"
) -> Optional[dict]:
    """yfinanceから株価データを取得"""
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
            df.columns = df.columns.get_level_values(-1)

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
        name = resolve_name(ticker)
        return {
            "ticker": ticker,
            "name": name,
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


def get_stock_data(
    ticker: str, start: str, end: str, interval: str = "1d"
) -> Optional[dict]:
    """統合株価取得: 日本株→J-Quants、米国株→yfinance"""
    if _use_jquants(ticker, interval):
        result = get_stock_data_jquants(ticker, start, end, interval)
        if result:
            return result
        # J-Quants 失敗時は yfinance にフォールバック
        print(f"[stock_service] J-Quants failed for {ticker}, falling back to yfinance")
    return get_stock_data_yfinance(ticker, start, end, interval)


def get_latest_price(ticker: str) -> Optional[dict]:
    """統合最新価格取得: 日本株→J-Quants、米国株→yfinance"""
    if jquants_client.is_jp_ticker(ticker) and jquants_client.is_configured():
        result = jquants_client.get_latest_quote(ticker)
        if result:
            return result
    return get_latest_price_yfinance(ticker)


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
        if df.empty:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df = df.copy()
            df.columns = df.columns.get_level_values(-1)
        if "Close" not in df.columns:
            return None
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


def get_stock_data_batch(
    tickers: list[str], start: str, end: str, interval: str = "1d"
) -> tuple[list[dict], list[str]]:
    """複数銘柄の株価データを取得。
    日本株はJ-Quants（個別取得）、米国株はyfinance（バッチ取得）。
    Returns (results, errors)."""
    if interval not in VALID_INTERVALS:
        interval = "1d"

    results: list[dict] = []
    errors: list[str] = []

    # 日本株と米国株を分離
    jp_tickers = []
    us_tickers = []
    for t in tickers:
        if _use_jquants(t, interval):
            jp_tickers.append(t)
        else:
            us_tickers.append(t)

    # 日本株: J-Quants で個別取得
    for t in jp_tickers:
        data = get_stock_data(t, start, end, interval)
        if data:
            results.append(data)
        else:
            errors.append(f"{t}: データ取得失敗")

    # 米国株: yfinance でバッチ取得
    if us_tickers:
        us_results, us_errors = _batch_yfinance(us_tickers, start, end, interval)
        results.extend(us_results)
        errors.extend(us_errors)

    return results, errors


def _batch_yfinance(
    tickers: list[str], start: str, end: str, interval: str
) -> tuple[list[dict], list[str]]:
    """yfinance バッチダウンロード（米国株用）"""
    is_intraday = interval not in ("1d", "5d", "1wk", "1mo")
    fmt = "%Y-%m-%d %H:%M" if is_intraday else "%Y-%m-%d"

    actual_start = start
    if is_intraday:
        max_days = _MAX_PERIOD_DAYS.get(interval, 60)
        from datetime import datetime, timedelta
        start_dt = datetime.strptime(start, "%Y-%m-%d")
        end_dt = datetime.strptime(end, "%Y-%m-%d")
        if (end_dt - start_dt).days > max_days:
            actual_start = (end_dt - timedelta(days=max_days)).strftime("%Y-%m-%d")

    results: list[dict] = []
    errors: list[str] = []

    BATCH_SIZE = 20
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i : i + BATCH_SIZE]
        try:
            df = yf.download(
                batch,
                start=actual_start,
                end=end,
                interval=interval,
                progress=False,
                group_by="ticker",
                threads=True,
            )
        except Exception as e:
            print(f"yfinance batch error: {e}")
            for t in batch:
                errors.append(f"{t}: データ取得失敗")
            continue

        if df.empty:
            for t in batch:
                errors.append(f"{t}: データ取得失敗")
            continue

        for ticker in batch:
            try:
                if isinstance(df.columns, pd.MultiIndex):
                    if ticker in df.columns.get_level_values(0):
                        tdf = df[ticker].copy()
                    elif len(batch) == 1:
                        tdf = df.copy()
                        tdf.columns = df.columns.get_level_values(-1)
                    else:
                        errors.append(f"{ticker}: データ取得失敗")
                        continue
                else:
                    tdf = df.copy()

                tdf = tdf.dropna(subset=["Close"])
                if tdf.empty:
                    errors.append(f"{ticker}: データ取得失敗")
                    continue

                records = []
                for idx, row in tdf.iterrows():
                    records.append({
                        "date": idx.strftime(fmt),
                        "open": round(float(row["Open"]), 1),
                        "high": round(float(row["High"]), 1),
                        "low": round(float(row["Low"]), 1),
                        "close": round(float(row["Close"]), 1),
                        "volume": int(row["Volume"]) if pd.notna(row["Volume"]) else 0,
                    })

                if not records:
                    errors.append(f"{ticker}: データ取得失敗")
                    continue

                close_vals = tdf["Close"]
                name = resolve_name(ticker)
                results.append({
                    "ticker": ticker,
                    "name": name,
                    "interval": interval,
                    "count": len(records),
                    "first_close": round(float(close_vals.iloc[0]), 1),
                    "last_close": round(float(close_vals.iloc[-1]), 1),
                    "high_max": round(float(tdf["High"].max()), 1),
                    "high_max_date": tdf["High"].idxmax().strftime(fmt),
                    "low_min": round(float(tdf["Low"].min()), 1),
                    "low_min_date": tdf["Low"].idxmin().strftime(fmt),
                    "change_pct": round(
                        (float(close_vals.iloc[-1]) / float(close_vals.iloc[0]) - 1) * 100, 2
                    ),
                    "data": records,
                })
            except Exception as e:
                print(f"yfinance parse error for {ticker}: {e}")
                errors.append(f"{ticker}: データ取得失敗")

    return results, errors


def normalize_for_comparison(stocks_data: list[dict]) -> list[dict]:
    """複数銘柄の終値を基準日=100に正規化して比較用データを作成"""
    if not stocks_data:
        return []

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
