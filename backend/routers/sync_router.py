"""Data sync endpoints: settings and watchlists CRUD."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserSettings, UserWatchlist
from auth import get_current_user

router = APIRouter(prefix="/api/sync", tags=["sync"])


# ── Settings ────────────────────────────────────────────

class SettingsPayload(BaseModel):
    theme: str = "dark"
    locale: str = "ja"
    selected_tickers: list = []


@router.get("/settings")
def get_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if not s:
        s = UserSettings(user_id=user.id)
        db.add(s)
        db.commit()
        db.refresh(s)
    return {
        "theme": s.theme,
        "locale": s.locale,
        "selected_tickers": s.get_tickers(),
    }


@router.put("/settings")
def put_settings(
    body: SettingsPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if not s:
        s = UserSettings(user_id=user.id)
        db.add(s)

    s.theme = body.theme
    s.locale = body.locale
    s.set_tickers(body.selected_tickers)
    db.commit()
    db.refresh(s)
    return {"ok": True}


# ── Watchlists ──────────────────────────────────────────

class WatchlistItem(BaseModel):
    id: str
    name: str
    tickers: list
    createdAt: str = ""


class WatchlistsPayload(BaseModel):
    watchlists: list[WatchlistItem]


@router.get("/watchlists")
def get_watchlists(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(UserWatchlist).filter(UserWatchlist.user_id == user.id).all()
    return {
        "watchlists": [
            {
                "id": w.wl_id,
                "name": w.name,
                "tickers": w.get_tickers(),
                "createdAt": w.created_at,
            }
            for w in rows
        ]
    }


@router.put("/watchlists")
def put_watchlists(
    body: WatchlistsPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(UserWatchlist).filter(UserWatchlist.user_id == user.id).delete()

    for wl in body.watchlists:
        row = UserWatchlist(
            user_id=user.id,
            wl_id=wl.id,
            name=wl.name,
            created_at=wl.createdAt,
        )
        row.set_tickers(wl.tickers)
        db.add(row)

    db.commit()
    return {"ok": True, "count": len(body.watchlists)}
