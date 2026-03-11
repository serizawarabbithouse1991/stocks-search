"""FastAPI バックエンド - 株式銘柄比較ツール"""

import os
import csv
import io
import yfinance as yf
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from jquants_client import JQuantsClient
from stock_service import (
    get_stock_data_yfinance,
    get_stock_data_jquants,
    get_latest_price_yfinance,
    get_latest_price_jquants,
    normalize_for_comparison,
)

load_dotenv()

app = FastAPI(title="株式銘柄比較ツール API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# J-Quants クライアント（トークンがあれば初期化）
_jquants: JQuantsClient | None = None


def get_jquants() -> JQuantsClient:
    global _jquants
    if _jquants is None:
        token = os.getenv("JQUANTS_REFRESH_TOKEN", "")
        if not token:
            raise HTTPException(status_code=400, detail="J-Quants refresh token not configured")
        _jquants = JQuantsClient(token)
    return _jquants


# --- Models ---
class StockQuery(BaseModel):
    tickers: list[str]  # e.g. ["7013.T", "7011.T"] or ["AAPL", "MSFT"]
    start: str          # "2025-01-01"
    end: str            # "2026-03-11"
    source: str = "yfinance"  # "yfinance" or "jquants"
    interval: str = "1d"  # "1m","5m","15m","30m","60m","1h","1d" etc.


# --- Endpoints ---
@app.get("/")
def root():
    return {"status": "ok", "message": "株式銘柄比較ツール API"}


@app.get("/api/search")
def search_stocks(
    q: str = Query(..., min_length=1, description="銘柄コードまたは銘柄名"),
    source: str = Query("jquants", description="データソース: jquants or yfinance"),
    fuzzy: bool = Query(True, description="あいまい検索（J-Quants のみ）"),
):
    """銘柄検索"""
    if source == "jquants":
        try:
            client = get_jquants()
            results = client.search_stocks(q, fuzzy=fuzzy)
            return {
                "source": "jquants",
                "results": [
                    {
                        "code": s.get("Code", ""),
                        "name": s.get("CompanyName", ""),
                        "name_en": s.get("CompanyNameEnglish", ""),
                        "sector": s.get("Sector33CodeName", ""),
                        "market": s.get("MarketCodeName", ""),
                    }
                    for s in results
                ],
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        # yfinanceで銘柄検索（Tickerオブジェクトのinfo利用）
        try:
            ticker = yf.Ticker(q)
            info = ticker.info
            if info and info.get("symbol"):
                return {
                    "source": "yfinance",
                    "results": [
                        {
                            "code": info.get("symbol", q),
                            "name": info.get("longName", info.get("shortName", "")),
                            "name_en": info.get("shortName", ""),
                            "sector": info.get("sector", ""),
                            "market": info.get("exchange", ""),
                        }
                    ],
                }
            return {"source": "yfinance", "results": []}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/latest")
def get_latest_prices(
    tickers: str = Query(..., description="カンマ区切り: 7203.T,AAPL など"),
    source: str = Query("yfinance", description="yfinance or jquants"),
):
    """選択銘柄の直近価格を取得（リアルタイムに近い表示用）。yfinance は数分遅延、J-Quants は日次更新。"""
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        return {"prices": []}
    prices = []
    if source == "jquants":
        try:
            client = get_jquants()
            for t in ticker_list:
                code = t.replace(".T", "")
                row = get_latest_price_jquants(client, code)
                if row:
                    prices.append(row)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        for t in ticker_list:
            row = get_latest_price_yfinance(t)
            if row:
                prices.append(row)
    return {"prices": prices}


@app.post("/api/stocks")
def get_stocks(query: StockQuery):
    """複数銘柄の株価データを取得"""
    results = []
    errors = []

    for ticker in query.tickers:
        if query.source == "jquants":
            # J-Quantsは銘柄コード（4桁）を使う
            code = ticker.replace(".T", "")
            client = get_jquants()
            data = get_stock_data_jquants(client, code, query.start, query.end)
        else:
            data = get_stock_data_yfinance(ticker, query.start, query.end, query.interval)

        if data:
            results.append(data)
        else:
            errors.append(f"{ticker}: データ取得失敗")

    comparison = normalize_for_comparison(results)

    return {
        "stocks": results,
        "comparison": comparison,
        "errors": errors,
    }


@app.post("/api/export/csv")
def export_csv(query: StockQuery):
    """株価データをCSVエクスポート"""
    results = []
    for ticker in query.tickers:
        if query.source == "jquants":
            code = ticker.replace(".T", "")
            client = get_jquants()
            data = get_stock_data_jquants(client, code, query.start, query.end)
        else:
            data = get_stock_data_yfinance(ticker, query.start, query.end, query.interval)
        if data:
            results.append(data)

    if not results:
        raise HTTPException(status_code=404, detail="データが取得できませんでした")

    # CSV作成
    output = io.StringIO()
    writer = csv.writer(output)

    # ヘッダー
    header = ["Date"]
    for r in results:
        t = r["ticker"]
        header.extend([f"{t}_Open", f"{t}_High", f"{t}_Low", f"{t}_Close", f"{t}_Volume"])
    writer.writerow(header)

    # 全日付を収集
    all_dates = sorted(set(d["date"] for r in results for d in r["data"]))
    data_map = {}
    for r in results:
        data_map[r["ticker"]] = {d["date"]: d for d in r["data"]}

    for date in all_dates:
        row = [date]
        for r in results:
            d = data_map[r["ticker"]].get(date)
            if d:
                row.extend([d["open"], d["high"], d["low"], d["close"], d["volume"]])
            else:
                row.extend(["", "", "", "", ""])
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=stocks_data.csv"},
    )


@app.get("/api/jquants/listed")
def get_listed_stocks():
    """J-Quants 上場銘柄一覧"""
    client = get_jquants()
    stocks = client.list_stocks()
    return {"count": len(stocks), "stocks": stocks[:100]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
