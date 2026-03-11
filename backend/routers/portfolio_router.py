"""ポートフォリオ管理 API"""

from __future__ import annotations

import csv
import io
import json
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from models import User
import master

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


# --- Pydantic ---
class PositionIn(BaseModel):
    ticker: str
    quantity: float
    avg_price: float
    broker: str = ""  # sbi / rakuten / moomoo / other


class PositionOut(BaseModel):
    id: int
    ticker: str
    quantity: float
    avg_price: float
    broker: str
    name: str
    sector: str
    market: str
    scale: str


class PortfolioSummary(BaseModel):
    total_cost: float
    total_value: float
    total_pnl: float
    total_pnl_pct: float
    positions: list[dict]
    sector_allocation: list[dict]
    broker_allocation: list[dict]


def _load_positions(db: Session, user: User) -> list[dict]:
    from models import UserSettings
    settings = db.query(UserSettings).filter_by(user_id=user.id).first()
    if not settings:
        return []
    try:
        return json.loads(settings.portfolio_data or "[]")
    except (json.JSONDecodeError, TypeError):
        return []


def _save_positions(db: Session, user: User, positions: list[dict]):
    from models import UserSettings
    settings = db.query(UserSettings).filter_by(user_id=user.id).first()
    if not settings:
        settings = UserSettings(user_id=user.id)
        db.add(settings)

    settings.portfolio_data = json.dumps(positions, ensure_ascii=False)
    db.commit()


def _enrich_position(pos: dict) -> dict:
    """マスタからメタデータを付与"""
    ticker = pos.get("ticker", "")
    entry = master.get_entry(ticker)
    pos["name"] = entry["name"] if entry else ticker.replace(".T", "")
    pos["sector"] = entry.get("sector33", "") if entry else ""
    pos["market"] = entry.get("market", "") if entry else ""
    pos["scale"] = entry.get("scale", "") if entry else ""
    return pos


# --- エンドポイント ---
@router.get("/positions")
def get_positions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    positions = _load_positions(db, user)
    return {"positions": [_enrich_position(p) for p in positions]}


@router.post("/positions")
def add_position(
    pos: PositionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    positions = _load_positions(db, user)
    new_id = max((p.get("id", 0) for p in positions), default=0) + 1
    new_pos = {
        "id": new_id,
        "ticker": pos.ticker,
        "quantity": pos.quantity,
        "avg_price": pos.avg_price,
        "broker": pos.broker,
    }
    positions.append(new_pos)
    _save_positions(db, user, positions)
    return _enrich_position(new_pos)


@router.put("/positions/{pos_id}")
def update_position(
    pos_id: int,
    pos: PositionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    positions = _load_positions(db, user)
    for p in positions:
        if p.get("id") == pos_id:
            p["ticker"] = pos.ticker
            p["quantity"] = pos.quantity
            p["avg_price"] = pos.avg_price
            p["broker"] = pos.broker
            _save_positions(db, user, positions)
            return _enrich_position(p)
    raise HTTPException(status_code=404, detail="Position not found")


@router.delete("/positions/{pos_id}")
def delete_position(
    pos_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    positions = _load_positions(db, user)
    positions = [p for p in positions if p.get("id") != pos_id]
    _save_positions(db, user, positions)
    return {"ok": True}


@router.post("/import/csv")
async def import_csv(
    file: UploadFile = File(...),
    broker: str = Query("other"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """CSVインポート (SBI/楽天/汎用形式)"""
    content = await file.read()
    text = content.decode("utf-8-sig")
    positions = _load_positions(db, user)
    new_id = max((p.get("id", 0) for p in positions), default=0) + 1
    added = 0

    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    h_lower = [h.lower().strip() for h in headers]

    for row in reader:
        vals = list(row.values())
        ticker = _find_csv_field(headers, h_lower, vals, ["銘柄コード", "コード", "ticker", "code", "銘柄"])
        qty_str = _find_csv_field(headers, h_lower, vals, ["保有数量", "数量", "quantity", "株数", "保有株数"])
        price_str = _find_csv_field(headers, h_lower, vals, ["取得単価", "平均取得価格", "avg_price", "取得価格", "買付単価"])

        if not ticker:
            continue

        ticker = re.sub(r"[^\dA-Za-z.]", "", ticker.strip())
        if re.match(r"^\d{3,4}[A-Z]?$", ticker):
            ticker = f"{ticker}.T"

        qty = _parse_number(qty_str)
        price = _parse_number(price_str)
        if qty <= 0:
            qty = 0
        if price < 0:
            price = 0

        positions.append({
            "id": new_id,
            "ticker": ticker,
            "quantity": qty,
            "avg_price": price,
            "broker": broker,
        })
        new_id += 1
        added += 1

    _save_positions(db, user, positions)
    return {"ok": True, "added": added, "total": len(positions)}


def _find_csv_field(headers: list, h_lower: list, vals: list, candidates: list) -> str:
    for c in candidates:
        cl = c.lower()
        for i, h in enumerate(h_lower):
            if cl in h and i < len(vals):
                return vals[i]
    return ""


def _parse_number(s: str) -> float:
    if not s:
        return 0
    s = s.replace(",", "").replace("円", "").replace("¥", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0


@router.get("/summary")
def get_summary(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """ポートフォリオサマリー（現在価格はフロントで付与）"""
    positions = _load_positions(db, user)
    enriched = [_enrich_position(p) for p in positions]

    total_cost = sum(p["quantity"] * p["avg_price"] for p in enriched if p["quantity"] > 0)

    sector_map: dict[str, float] = {}
    broker_map: dict[str, float] = {}
    for p in enriched:
        cost = p["quantity"] * p["avg_price"]
        sector = p.get("sector", "") or "不明"
        broker = p.get("broker", "") or "その他"
        sector_map[sector] = sector_map.get(sector, 0) + cost
        broker_map[broker] = broker_map.get(broker, 0) + cost

    return {
        "total_cost": total_cost,
        "positions": enriched,
        "sector_allocation": [
            {"name": k, "value": round(v, 1), "pct": round(v / total_cost * 100, 1) if total_cost else 0}
            for k, v in sorted(sector_map.items(), key=lambda x: -x[1])
        ],
        "broker_allocation": [
            {"name": k, "value": round(v, 1), "pct": round(v / total_cost * 100, 1) if total_cost else 0}
            for k, v in sorted(broker_map.items(), key=lambda x: -x[1])
        ],
    }
