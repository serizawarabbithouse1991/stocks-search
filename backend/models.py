"""SQLAlchemy models for user accounts and synced data."""

import json
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    watchlists = relationship("UserWatchlist", back_populates="user", cascade="all, delete-orphan")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    theme = Column(String(16), default="dark")
    locale = Column(String(8), default="ja")
    selected_tickers = Column(Text, default="[]")
    portfolio_data = Column(Text, default="[]")

    user = relationship("User", back_populates="settings")

    def get_tickers(self) -> list:
        try:
            return json.loads(self.selected_tickers or "[]")
        except (json.JSONDecodeError, TypeError):
            return []

    def set_tickers(self, tickers: list):
        self.selected_tickers = json.dumps(tickers, ensure_ascii=False)


class UserWatchlist(Base):
    __tablename__ = "user_watchlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    wl_id = Column(String(32), nullable=False)
    name = Column(String(128), nullable=False)
    tickers = Column(Text, default="[]")
    created_at = Column(String(16), default="")

    user = relationship("User", back_populates="watchlists")

    def get_tickers(self) -> list:
        try:
            return json.loads(self.tickers or "[]")
        except (json.JSONDecodeError, TypeError):
            return []

    def set_tickers(self, tickers: list):
        self.tickers = json.dumps(tickers, ensure_ascii=False)
