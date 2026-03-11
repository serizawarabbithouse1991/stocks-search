"""J-Quants API クライアント"""

import os
import time
import requests
import difflib
from typing import Optional

JQUANTS_API_BASE = "https://api.jquants.com/v2"


class JQuantsClient:
    def __init__(
        self,
        refresh_token: Optional[str] = None,
        email: Optional[str] = None,
        password: Optional[str] = None,
    ):
        self._email = email or os.getenv("JQUANTS_EMAIL", "")
        self._password = password or os.getenv("JQUANTS_PASSWORD", "")
        self._refresh_token = refresh_token or os.getenv("JQUANTS_REFRESH_TOKEN", "")
        self._id_token: Optional[str] = None
        self._id_token_expires: float = 0
        self._refresh_token_expires: float = 0

    def _get_refresh_token(self) -> str:
        """リフレッシュトークンを返す（未設定 or 期限切れの場合はメール+パスワードで取得）"""
        if self._refresh_token:
            if self._refresh_token_expires == 0 or time.time() < self._refresh_token_expires:
                return self._refresh_token

        if not self._email or not self._password:
            raise RuntimeError(
                "J-Quants認証情報が未設定です。JQUANTS_EMAIL / JQUANTS_PASSWORD を .env に設定してください"
            )

        resp = requests.post(
            f"{JQUANTS_API_BASE}/token/auth_user",
            json={"mailaddress": self._email, "password": self._password},
            timeout=30,
        )
        resp.raise_for_status()
        self._refresh_token = resp.json()["refreshToken"]
        self._refresh_token_expires = time.time() + 7 * 24 * 3600  # 1週間有効
        return self._refresh_token

    def _get_id_token(self) -> str:
        if self._id_token and time.time() < self._id_token_expires:
            return self._id_token

        refresh_token = self._get_refresh_token()
        resp = requests.post(
            f"{JQUANTS_API_BASE}/token/auth_refresh",
            params={"refreshtoken": refresh_token},
            timeout=30,
        )
        if resp.status_code == 403:
            # リフレッシュトークンが無効 or 期限切れ
            if not self._email or not self._password:
                raise RuntimeError(
                    "リフレッシュトークンが無効または期限切れです。"
                    "J-Quants (https://jpx-jquants.com/) で新しいトークンを取得して .env の JQUANTS_REFRESH_TOKEN を更新するか、"
                    "JQUANTS_EMAIL / JQUANTS_PASSWORD を .env に設定してください"
                )
            self._refresh_token = ""
            self._refresh_token_expires = 0
            refresh_token = self._get_refresh_token()
            resp = requests.post(
                f"{JQUANTS_API_BASE}/token/auth_refresh",
                params={"refreshtoken": refresh_token},
                timeout=30,
            )
        resp.raise_for_status()
        self._id_token = resp.json()["idToken"]
        self._id_token_expires = time.time() + 23 * 3600
        return self._id_token

    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        token = self._get_id_token()
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{JQUANTS_API_BASE}{path}",
            headers=headers,
            params=params or {},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def list_stocks(self) -> list[dict]:
        """上場銘柄一覧を取得"""
        data = self._get("/listed/info")
        return data.get("info", [])

    def search_stocks(self, query: str, fuzzy: bool = False) -> list[dict]:
        """銘柄コードまたは銘柄名で検索。fuzzy=True であいまい検索（ typo 許容）"""
        all_stocks = self.list_stocks()
        query_stripped = query.strip()
        if not query_stripped:
            return []
        query_upper = query_stripped.upper()
        exact_matches = []
        fuzzy_candidates = []  # (score, stock)

        for s in all_stocks:
            code = s.get("Code", "")
            name = s.get("CompanyName", "")
            name_en = (s.get("CompanyNameEnglish", "") or "").upper()
            if (
                query_upper in code
                or query_stripped in name
                or query_upper in name_en
            ):
                exact_matches.append(s)
                continue
            if fuzzy:
                score = max(
                    difflib.SequenceMatcher(None, query_upper, code.upper()).ratio(),
                    difflib.SequenceMatcher(None, query_stripped, name).ratio(),
                    difflib.SequenceMatcher(None, query_upper, name_en).ratio() if name_en else 0,
                )
                if score >= 0.4:
                    fuzzy_candidates.append((score, s))

        if exact_matches:
            return (exact_matches + [s for _, s in sorted(fuzzy_candidates, key=lambda x: -x[0])])[:50]
        if fuzzy and fuzzy_candidates:
            return [s for _, s in sorted(fuzzy_candidates, key=lambda x: -x[0])][:50]
        return exact_matches[:50]

    def get_daily_quotes(self, code: str, date_from: str, date_to: str) -> list[dict]:
        """日次株価を取得"""
        date_from = date_from.replace("-", "")
        date_to = date_to.replace("-", "")
        params = {"code": code, "from": date_from, "to": date_to}
        data = self._get("/prices/daily_quotes", params)
        return data.get("daily_quotes", [])

    def get_financial_statements(self, code: str) -> list[dict]:
        """財務情報を取得"""
        data = self._get("/fins/statements", {"code": code})
        return data.get("statements", [])
