"""moomoo証券 OpenD API 連携"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/moomoo", tags=["moomoo"])


class MoomooConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 11111


@router.get("/status")
def moomoo_status():
    """moomoo OpenD 接続状態を確認"""
    try:
        from moomoo import OpenSecTradeContext, TrdEnv, TrdMarket
        ctx = OpenSecTradeContext(
            host=os.getenv("MOOMOO_HOST", "127.0.0.1"),
            port=int(os.getenv("MOOMOO_PORT", "11111")),
        )
        ret, data = ctx.get_acc_list()
        ctx.close()
        if ret == 0:
            accounts = data.to_dict("records") if hasattr(data, "to_dict") else []
            return {"connected": True, "accounts": accounts}
        return {"connected": False, "error": str(data)}
    except ImportError:
        return {"connected": False, "error": "moomoo-api パッケージ未インストール (pip install moomoo-api)"}
    except Exception as e:
        return {"connected": False, "error": str(e)}


@router.get("/positions")
def moomoo_positions(
    market: str = Query("JP", description="JP or US"),
):
    """moomoo口座の保有銘柄を取得"""
    try:
        from moomoo import OpenSecTradeContext, TrdEnv, TrdMarket
        market_map = {
            "JP": TrdMarket.JP,
            "US": TrdMarket.US,
            "HK": TrdMarket.HK,
        }
        trd_market = market_map.get(market.upper(), TrdMarket.JP)
        ctx = OpenSecTradeContext(
            host=os.getenv("MOOMOO_HOST", "127.0.0.1"),
            port=int(os.getenv("MOOMOO_PORT", "11111")),
        )
        ret, data = ctx.position_list_query(trd_market=trd_market, trd_env=TrdEnv.REAL)
        ctx.close()

        if ret != 0:
            raise HTTPException(status_code=502, detail=str(data))

        positions = []
        if hasattr(data, "iterrows"):
            for _, row in data.iterrows():
                code = str(row.get("code", ""))
                ticker = code
                if code.startswith("JP."):
                    raw = code.replace("JP.", "").split(".")[0]
                    ticker = f"{raw}.T"

                positions.append({
                    "ticker": ticker,
                    "name": str(row.get("stock_name", "")),
                    "quantity": float(row.get("qty", 0)),
                    "avg_price": float(row.get("cost_price", 0)),
                    "market_price": float(row.get("price", 0)),
                    "market_value": float(row.get("market_val", 0)),
                    "pnl": float(row.get("pl_val", 0)),
                    "pnl_pct": float(row.get("pl_ratio", 0)) * 100,
                    "broker": "moomoo",
                })

        return {"positions": positions, "count": len(positions)}

    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="moomoo-api 未インストール。pip install moomoo-api を実行してください",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
