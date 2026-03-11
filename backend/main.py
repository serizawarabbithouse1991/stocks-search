"""FastAPI バックエンド - 株式銘柄比較ツール"""

import csv
import io
import yfinance as yf
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from stock_service import (
    get_stock_data_yfinance,
    get_latest_price_yfinance,
    normalize_for_comparison,
)

app = FastAPI(title="株式銘柄比較ツール API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Models ---
class StockQuery(BaseModel):
    tickers: list[str]
    start: str
    end: str
    source: str = "yfinance"
    interval: str = "1d"


# --- Endpoints ---
@app.get("/")
def root():
    return {"status": "ok", "message": "株式銘柄比較ツール API"}


@app.get("/api/search")
def search_stocks(
    q: str = Query(..., min_length=1, description="銘柄コードまたは銘柄名"),
    source: str = Query("yfinance"),
    fuzzy: bool = Query(True),
):
    """銘柄検索 (yfinance)"""
    try:
        query = q.strip()
        # 数字4桁なら日本株として .T を付けて検索
        if query.isdigit() and len(query) == 4:
            query = f"{query}.T"

        ticker = yf.Ticker(query)
        info = ticker.info
        if info and info.get("symbol"):
            return {
                "source": "yfinance",
                "results": [
                    {
                        "code": info.get("symbol", query),
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
    source: str = Query("yfinance"),
):
    """選択銘柄の直近価格を取得（数分遅延あり）"""
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        return {"prices": []}
    prices = []
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
        data = get_stock_data_yfinance(ticker, query.start, query.end, query.interval)
        if data:
            results.append(data)

    if not results:
        raise HTTPException(status_code=404, detail="データが取得できませんでした")

    output = io.StringIO()
    writer = csv.writer(output)

    header = ["Date"]
    for r in results:
        t = r["ticker"]
        header.extend([f"{t}_Open", f"{t}_High", f"{t}_Low", f"{t}_Close", f"{t}_Volume"])
    writer.writerow(header)

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
