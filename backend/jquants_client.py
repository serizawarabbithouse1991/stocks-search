"""J-Quants API クライアント - 日本株データ取得"""

from __future__ import annotations

import os
import time
from typing import Optional

import httpx

BASE_URL = "https://api.jquants.com/v1"
_TIMEOUT = 30.0

# トークンキャッシュ
_refresh_token: Optional[str] = None
_refresh_token_from_api_key: bool = False  # JQUANTS_API_KEY 由来かどうか
_id_token: Optional[str] = None
_id_token_expires: float = 0  # unix timestamp


def is_configured() -> bool:
    """J-Quants の認証情報が設定されているか"""
    if os.getenv("JQUANTS_API_KEY"):
        return True
    return bool(os.getenv("JQUANTS_MAIL_ADDRESS") and os.getenv("JQUANTS_PASSWORD"))


def is_jp_ticker(ticker: str) -> bool:
    """日本株ティッカーかどうか判定"""
    return ticker.endswith(".T")


def _to_jquants_code(ticker: str) -> str:
    """7203.T → 72030 (5桁コード) に変換"""
    code = ticker.replace(".T", "")
    if len(code) == 4 and code.isdigit():
        return code + "0"
    return code


def _get_refresh_token() -> str:
    """refresh_token を取得。JQUANTS_API_KEY 優先、なければ mail/password で取得"""
    global _refresh_token, _refresh_token_from_api_key

    if _refresh_token:
        return _refresh_token

    # 1. JQUANTS_API_KEY（= refresh_token そのもの）
    api_key = os.getenv("JQUANTS_API_KEY", "").strip()
    if api_key:
        _refresh_token = api_key
        _refresh_token_from_api_key = True
        return _refresh_token

    # 2. mail + password で取得
    mail = os.getenv("JQUANTS_MAIL_ADDRESS", "")
    password = os.getenv("JQUANTS_PASSWORD", "")
    if not mail or not password:
        raise ValueError(
            "J-Quants 認証情報が未設定です。"
            "JQUANTS_API_KEY または JQUANTS_MAIL_ADDRESS + JQUANTS_PASSWORD を設定してください"
        )

    resp = httpx.post(
        f"{BASE_URL}/token/auth_user",
        json={"mailaddress": mail, "password": password},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    _refresh_token = resp.json()["refreshToken"]
    _refresh_token_from_api_key = False
    return _refresh_token


def _get_id_token() -> str:
    """refresh_token から id_token を取得（24時間キャッシュ）"""
    global _id_token, _id_token_expires

    if _id_token and time.time() < _id_token_expires:
        return _id_token

    refresh = _get_refresh_token()
    resp = httpx.post(
        f"{BASE_URL}/token/auth_refresh?refreshtoken={refresh}",
        timeout=_TIMEOUT,
    )
    if resp.status_code == 401:
        global _refresh_token, _refresh_token_from_api_key
        if _refresh_token_from_api_key:
            # JQUANTS_API_KEY 由来 → 自動再取得不可
            print(
                "[jquants] ERROR: JQUANTS_API_KEY (refresh_token) が期限切れです（有効期限: 1週間）。"
                "J-Quants マイページで新しい refresh_token を取得し、環境変数を更新してください。"
            )
            raise ValueError(
                "JQUANTS_API_KEY (refresh_token) が期限切れです。"
                "J-Quants マイページで再発行してください。"
            )
        # mail/password 由来 → 再取得を試行
        _refresh_token = None
        refresh = _get_refresh_token()
        resp = httpx.post(
            f"{BASE_URL}/token/auth_refresh?refreshtoken={refresh}",
            timeout=_TIMEOUT,
        )
    resp.raise_for_status()
    _id_token = resp.json()["idToken"]
    _id_token_expires = time.time() + 23 * 3600  # 23時間（余裕を持たせる）
    return _id_token


def _headers() -> dict:
    return {"Authorization": f"Bearer {_get_id_token()}"}


def _api_get(path: str, params: Optional[dict] = None, retries: int = 2) -> dict:
    """GET リクエスト（リトライ付き）"""
    for attempt in range(retries + 1):
        try:
            resp = httpx.get(
                f"{BASE_URL}{path}",
                params=params,
                headers=_headers(),
                timeout=_TIMEOUT,
            )
            if resp.status_code == 401 and attempt < retries:
                # トークン無効 → リフレッシュして再試行
                global _id_token
                _id_token = None
                continue
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError:
            if attempt < retries:
                time.sleep(1)
                continue
            raise
        except httpx.RequestError as e:
            if attempt < retries:
                time.sleep(1)
                continue
            raise ValueError(f"J-Quants API request failed: {e}")
    return {}


def get_daily_quotes(ticker: str, date_from: str, date_to: str) -> list[dict]:
    """日足株価データを取得

    Returns: [{"Date": ..., "Open": ..., "High": ..., "Low": ..., "Close": ..., "Volume": ...}, ...]
    """
    code = _to_jquants_code(ticker)
    data = _api_get("/prices/daily_quotes", {
        "code": code,
        "from": date_from,
        "to": date_to,
    })
    quotes = data.get("daily_quotes", [])
    return [
        {
            "date": q["Date"],
            "open": q.get("Open") or q.get("AdjustmentOpen", 0),
            "high": q.get("High") or q.get("AdjustmentHigh", 0),
            "low": q.get("Low") or q.get("AdjustmentLow", 0),
            "close": q.get("Close") or q.get("AdjustmentClose", 0),
            "volume": q.get("Volume", 0),
        }
        for q in quotes
        if q.get("Close") is not None or q.get("AdjustmentClose") is not None
    ]


def get_latest_quote(ticker: str) -> Optional[dict]:
    """直近の株価データを取得"""
    code = _to_jquants_code(ticker)
    # 直近5営業日分を取得して最新を返す
    from datetime import datetime, timedelta
    today = datetime.now().strftime("%Y-%m-%d")
    week_ago = (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")

    try:
        quotes = get_daily_quotes(ticker, week_ago, today)
        if not quotes:
            return None
        latest = quotes[-1]
        prev = quotes[-2] if len(quotes) >= 2 else latest
        price = latest["close"]
        prev_close = prev["close"]
        change_pct = None
        if prev_close and prev_close > 0:
            change_pct = round((price / prev_close - 1) * 100, 2)
        return {
            "ticker": ticker,
            "price": round(float(price), 1),
            "prev_close": round(float(prev_close), 1),
            "change_pct": change_pct,
        }
    except Exception as e:
        print(f"[jquants] latest quote error for {ticker}: {e}")
        return None


def get_fins_statements(ticker: str) -> Optional[dict]:
    """財務データを取得して fundamentals 互換形式に変換"""
    code = _to_jquants_code(ticker)
    try:
        data = _api_get("/fins/statements", {"code": code})
        statements = data.get("statements", [])
        if not statements:
            return None

        # 最新の決算データを使用
        latest = statements[-1]

        def safe_float(key: str) -> Optional[float]:
            v = latest.get(key)
            if v is None or v == "":
                return None
            try:
                return float(v)
            except (ValueError, TypeError):
                return None

        result: dict = {}

        # EPS
        eps = safe_float("EarningsPerShare")
        result["eps"] = eps

        # BPS → PBR は株価が必要なので後で計算
        bps = safe_float("BookValuePerShare")
        result["book_value"] = bps

        # 配当
        result["dividend_rate"] = safe_float("DividendPerShare")

        # ROE
        roe = safe_float("ReturnOnEquity")
        result["roe"] = roe

        # 売上・利益
        result["revenue"] = safe_float("NetSales")
        result["net_income"] = safe_float("Profit")
        result["operating_margin"] = None
        operating_profit = safe_float("OperatingProfit")
        net_sales = safe_float("NetSales")
        if operating_profit is not None and net_sales and net_sales > 0:
            result["operating_margin"] = round(operating_profit / net_sales, 4)

        profit = safe_float("Profit")
        if profit is not None and net_sales and net_sales > 0:
            result["profit_margin"] = round(profit / net_sales, 4)
        else:
            result["profit_margin"] = None

        result["total_debt"] = safe_float("TotalAssets")
        result["total_cash"] = None

        # PER/PBR/配当利回りは株価が必要 → get_latest_quote と組み合わせて計算
        result["per"] = safe_float("PriceEarningsRatio") if "PriceEarningsRatio" in latest else None
        result["pbr"] = None
        result["forward_per"] = None
        result["roa"] = None
        result["payout_ratio"] = safe_float("PayoutRatio") if "PayoutRatio" in latest else None
        result["dividend_yield"] = None
        result["market_cap"] = safe_float("MarketCapitalization") if "MarketCapitalization" in latest else None
        result["enterprise_value"] = None
        result["beta"] = None
        result["avg_volume"] = None
        result["fifty_two_week_high"] = None
        result["fifty_two_week_low"] = None
        result["recommendation"] = None

        return result
    except Exception as e:
        print(f"[jquants] fins error for {ticker}: {e}")
        return None
