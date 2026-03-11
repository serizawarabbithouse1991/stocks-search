"""FastAPI バックエンド - StocksView API"""

import csv
import io
from typing import Optional

import yfinance as yf
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import master
import llm_service
from stock_service import (
    get_stock_data_yfinance,
    get_stock_data_batch,
    get_latest_price_yfinance,
    normalize_for_comparison,
)
from database import init_db
from routers.auth_router import router as auth_router
from routers.sync_router import router as sync_router
from routers.portfolio_router import router as portfolio_router
from routers.moomoo_router import router as moomoo_router

app = FastAPI(title="StocksView API", version="1.2.0")

app.include_router(auth_router)
app.include_router(sync_router)
app.include_router(portfolio_router)
app.include_router(moomoo_router)


@app.on_event("startup")
def on_startup():
    init_db()
    _migrate_portfolio_column()


def _migrate_portfolio_column():
    """既存DBに portfolio_data カラムがなければ追加"""
    from sqlalchemy import text, inspect as sa_inspect
    from database import engine
    insp = sa_inspect(engine)
    cols = [c["name"] for c in insp.get_columns("user_settings")]
    if "portfolio_data" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE user_settings ADD COLUMN portfolio_data TEXT DEFAULT '[]'"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
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
    return {"status": "ok", "message": "StocksView API"}


@app.get("/api/search")
def search_stocks(
    q: str = Query(..., min_length=1, description="銘柄コードまたは銘柄名"),
    source: str = Query("yfinance"),
    fuzzy: bool = Query(True),
    limit: int = Query(20, ge=1, le=100),
):
    """銘柄検索 - マスタ優先、フォールバックで yfinance"""
    try:
        query = q.strip()

        master_hits = master.search(query, limit=limit, fuzzy=fuzzy)
        if master_hits:
            results = [
                {
                    "code": h["code_t"],
                    "name": h["name"],
                    "name_en": "",
                    "sector": h["sector33"],
                    "market": h["market"],
                    "sector33": h["sector33"],
                    "sector33_code": h.get("sector33_code", ""),
                    "sector17": h.get("sector17", ""),
                    "sector17_code": h.get("sector17_code", ""),
                    "scale": h.get("scale", ""),
                    "scale_code": h.get("scale_code", ""),
                }
                for h in master_hits
            ]
            return {"source": "master", "results": results}

        import re
        if re.match(r'^\d{3,4}[A-Z]?$', query):
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
    """複数銘柄の株価データを取得（バッチ一括ダウンロード）"""
    results, errors = get_stock_data_batch(
        query.tickers, query.start, query.end, query.interval
    )
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


# --- マスタ管理 ---
@app.get("/api/master/status")
def master_status():
    """銘柄マスタの状態を返す"""
    return master.status()


@app.get("/api/master/meta")
def master_meta(
    tickers: str = Query(..., description="カンマ区切りティッカー"),
):
    """複数ティッカーのマスタメタデータを一括返却"""
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    result = {}
    for t in ticker_list:
        entry = master.get_entry(t)
        if entry:
            result[t] = {
                "name": entry["name"],
                "market": entry["market"],
                "sector33": entry["sector33"],
                "sector33_code": entry.get("sector33_code", ""),
                "sector17": entry.get("sector17", ""),
                "sector17_code": entry.get("sector17_code", ""),
                "scale": entry.get("scale", ""),
                "scale_code": entry.get("scale_code", ""),
            }
    return result


@app.get("/api/master/tags")
def master_tags():
    """タグ一覧（sector33, sector17, market, scale）を返す"""
    return master.list_tags()


@app.get("/api/master/filter")
def master_filter(
    field: str = Query(..., description="フィールド名: sector33, sector17, market, scale"),
    value: str = Query(..., description="フィルタ値"),
    limit: int = Query(500, ge=1, le=2000),
):
    """タグでフィルタし、該当銘柄一覧を返す"""
    allowed = {"sector33", "sector17", "market", "scale"}
    if field not in allowed:
        raise HTTPException(status_code=400, detail=f"field は {allowed} のいずれか")
    entries = master.filter_by_tag(field, value, limit)
    return {
        "field": field,
        "value": value,
        "count": len(entries),
        "tickers": [
            {"code": e["code_t"], "name": e["name"]}
            for e in entries
        ],
    }


@app.post("/api/master/reload")
def master_reload(path: Optional[str] = None):
    """銘柄マスタを再読み込みする"""
    try:
        count = master.load(path)
        return {"ok": True, "count": count, **master.status()}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Fundamentals ---
@app.get("/api/fundamentals")
def get_fundamentals(ticker: str = Query(...)):
    """yfinance から銘柄のファンダメンタルズ情報を取得"""
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        def safe(key: str, default=None):
            v = info.get(key, default)
            if v is None or v == "":
                return default
            return v

        return {
            "ticker": ticker,
            "name": safe("longName") or safe("shortName") or master.resolve_name(ticker) or ticker,
            "sector": safe("sector", ""),
            "industry": safe("industry", ""),
            "market_cap": safe("marketCap"),
            "enterprise_value": safe("enterpriseValue"),
            "per": safe("trailingPE"),
            "forward_per": safe("forwardPE"),
            "pbr": safe("priceToBook"),
            "eps": safe("trailingEps"),
            "dividend_yield": safe("dividendYield"),
            "dividend_rate": safe("dividendRate"),
            "payout_ratio": safe("payoutRatio"),
            "roe": safe("returnOnEquity"),
            "roa": safe("returnOnAssets"),
            "profit_margin": safe("profitMargins"),
            "operating_margin": safe("operatingMargins"),
            "revenue": safe("totalRevenue"),
            "net_income": safe("netIncomeToCommon"),
            "total_debt": safe("totalDebt"),
            "total_cash": safe("totalCash"),
            "book_value": safe("bookValue"),
            "target_mean_price": safe("targetMeanPrice"),
            "recommendation": safe("recommendationKey", ""),
            "fifty_two_week_high": safe("fiftyTwoWeekHigh"),
            "fifty_two_week_low": safe("fiftyTwoWeekLow"),
            "avg_volume": safe("averageVolume"),
            "beta": safe("beta"),
            "currency": safe("currency", "JPY"),
            "website": safe("website", ""),
            "summary": safe("longBusinessSummary", ""),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- LLM ---
class ThemeRequest(BaseModel):
    theme: str
    provider: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None


class AnalysisRequest(BaseModel):
    tickers: list[str]
    theme: Optional[str] = None
    provider: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None


@app.post("/api/llm/theme")
async def llm_theme(req: ThemeRequest):
    """テーマからLLMが関連銘柄を提案"""
    try:
        tags = master.list_tags()
        sectors = tags.get("sector33", [])
        suggestions = await llm_service.suggest_theme_tickers(
            req.theme, sectors, req.provider, req.api_key, req.model,
        )
        results = []
        for s in suggestions:
            code = s["code"]
            entry = master.get_entry(code) or master.get_entry(f"{code}.T")
            results.append({
                "code": f"{code}.T" if not code.endswith(".T") else code,
                "name": entry["name"] if entry else code,
                "reason": s.get("reason", ""),
                "in_master": entry is not None,
            })
        return {"theme": req.theme, "count": len(results), "suggestions": results}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/llm/analyze")
async def llm_analyze(req: AnalysisRequest):
    """選択中の銘柄群をLLMが比較分析（株価・テクニカルデータを自動補完）"""
    try:
        import fundamentals_cache

        tickers_info = []
        for ticker in req.tickers:
            entry = master.get_entry(ticker)
            info: dict = {"ticker": ticker}
            if entry:
                info["name"] = entry["name"]
                info["sector"] = entry.get("sector33", "")

            funda = fundamentals_cache.get_or_fetch(ticker)
            if funda:
                info["last_close"] = funda.get("market_cap")
                info["rsi"] = "N/A"
                if funda.get("per"):
                    info["per"] = round(funda["per"], 1)
                if funda.get("dividend_yield"):
                    info["dividend_yield"] = f"{round(funda['dividend_yield'] * 100, 2)}%"

            latest = get_latest_price_yfinance(ticker)
            if latest:
                info["last_close"] = latest.get("price", "?")
                info["change_pct"] = latest.get("change_pct", "?")

            tickers_info.append(info)

        report = await llm_service.analyze_stocks(
            tickers_info, req.theme, req.provider, req.api_key, req.model,
        )
        return {"report": report, "ticker_count": len(req.tickers)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/llm/providers")
def llm_providers():
    """利用可能なLLMプロバイダー一覧"""
    import os
    return {
        "providers": [
            {"id": "openai", "name": "OpenAI (GPT-4o)", "configured": bool(os.getenv("OPENAI_API_KEY"))},
            {"id": "anthropic", "name": "Anthropic (Claude)", "configured": bool(os.getenv("ANTHROPIC_API_KEY"))},
            {"id": "gemini", "name": "Google Gemini", "configured": bool(os.getenv("GEMINI_API_KEY"))},
            {"id": "ollama", "name": "Ollama (ローカル)", "configured": True},
        ],
        "default": os.getenv("LLM_PROVIDER", "ollama"),
    }


# --- Screener ---
import screener_service


class ScreenerCondition(BaseModel):
    field: str
    op: str
    value: str | float | int


class ScreenerRequest(BaseModel):
    conditions: list[ScreenerCondition] = []
    sort_by: Optional[str] = None
    sort_dir: str = "desc"
    limit: int = 50
    market_filter: Optional[str] = None


@app.post("/api/screener")
def run_screener(req: ScreenerRequest):
    """スクリーニング条件で銘柄を絞り込む"""
    try:
        conditions = [
            {"field": c.field, "op": c.op, "value": c.value}
            for c in req.conditions
        ]
        result = screener_service.run_screen(
            conditions=conditions,
            sort_by=req.sort_by,
            sort_dir=req.sort_dir,
            limit=req.limit,
            market_filter=req.market_filter,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/screener/fields")
def screener_fields():
    """スクリーニング可能なフィールド一覧"""
    return {"fields": screener_service.get_available_fields()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
