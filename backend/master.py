"""銘柄マスタ管理 - JPX data_j.xls ベース"""

from __future__ import annotations

import os
import re
import threading
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

import xlrd

_MASTER_PATH = Path(__file__).parent / "data" / "data_j.xls"

_lock = threading.Lock()
_entries: list[dict] = []
_code_index: dict[str, dict] = {}
_loaded_at: Optional[str] = None


def _read_xls(path: str | Path) -> list[dict]:
    wb = xlrd.open_workbook(str(path))
    ws = wb.sheet_by_index(0)
    headers = [ws.cell_value(0, c) for c in range(ws.ncols)]

    col_map = {}
    for i, h in enumerate(headers):
        col_map[h] = i

    rows: list[dict] = []
    for r in range(1, ws.nrows):
        code_raw = ws.cell_value(r, col_map["コード"])
        code = str(int(code_raw)) if isinstance(code_raw, float) else str(code_raw).strip()
        if not code:
            continue

        name = str(ws.cell_value(r, col_map["銘柄名"])).strip()
        market = str(ws.cell_value(r, col_map["市場・商品区分"])).strip()
        sector33 = str(ws.cell_value(r, col_map.get("33業種区分", ""))).strip() if "33業種区分" in col_map else ""
        sector17 = str(ws.cell_value(r, col_map.get("17業種区分", ""))).strip() if "17業種区分" in col_map else ""
        scale = str(ws.cell_value(r, col_map.get("規模区分", ""))).strip() if "規模区分" in col_map else ""

        rows.append({
            "code": code,
            "code_t": f"{code}.T",
            "name": name,
            "market": market,
            "sector33": sector33,
            "sector17": sector17,
            "scale": scale,
        })

    return rows


def load(path: str | Path | None = None) -> int:
    """マスタを(再)読み込みする。読み込み件数を返す。"""
    global _entries, _code_index, _loaded_at
    target = Path(path) if path else _MASTER_PATH
    if not target.exists():
        raise FileNotFoundError(f"マスタファイルが見つかりません: {target}")

    rows = _read_xls(target)
    idx: dict[str, dict] = {}
    for row in rows:
        idx[row["code"]] = row
        idx[row["code_t"]] = row

    with _lock:
        _entries = rows
        _code_index = idx
        _loaded_at = datetime.now().isoformat(timespec="seconds")

    return len(rows)


def status() -> dict:
    """マスタの現在の状態を返す。"""
    return {
        "loaded": len(_entries) > 0,
        "count": len(_entries),
        "loaded_at": _loaded_at,
        "path": str(_MASTER_PATH),
    }


def resolve_name(ticker: str) -> Optional[str]:
    """ティッカーからマスタ上の銘柄名を返す。見つからなければ None。"""
    with _lock:
        entry = _code_index.get(ticker)
    if entry:
        return entry["name"]
    code = ticker.replace(".T", "")
    with _lock:
        entry = _code_index.get(code)
    return entry["name"] if entry else None


def get_entry(ticker: str) -> Optional[dict]:
    """ティッカーから全情報を返す。"""
    with _lock:
        entry = _code_index.get(ticker)
    if entry:
        return entry
    code = ticker.replace(".T", "")
    with _lock:
        return _code_index.get(code)


def search(query: str, limit: int = 20, fuzzy: bool = True) -> list[dict]:
    """マスタ内を検索する。コード前方一致 → 銘柄名部分一致 → あいまい検索の順。"""
    q = query.strip()
    if not q:
        return []

    q_upper = q.upper()
    q_digits = re.sub(r"\D", "", q)

    with _lock:
        entries = list(_entries)

    exact: list[dict] = []
    prefix: list[dict] = []
    contains: list[dict] = []
    fuzzy_hits: list[tuple[float, dict]] = []

    for entry in entries:
        code = entry["code"]
        name = entry["name"]

        if code == q_digits or entry["code_t"].upper() == q_upper:
            exact.append(entry)
            continue

        if q_digits and code.startswith(q_digits):
            prefix.append(entry)
            continue

        if q in name or q_upper in name.upper():
            contains.append(entry)
            continue

        if fuzzy and len(q) >= 2:
            ratio = SequenceMatcher(None, q, name).ratio()
            if ratio >= 0.4:
                fuzzy_hits.append((ratio, entry))

    fuzzy_hits.sort(key=lambda x: x[0], reverse=True)
    fuzzy_results = [hit[1] for hit in fuzzy_hits]

    results = exact + prefix + contains + fuzzy_results
    seen = set()
    deduped = []
    for r in results:
        if r["code"] not in seen:
            seen.add(r["code"])
            deduped.append(r)
        if len(deduped) >= limit:
            break

    return deduped


def _auto_load():
    """モジュール読み込み時に自動ロードを試行する。"""
    if _MASTER_PATH.exists():
        try:
            count = load()
            print(f"[master] 銘柄マスタ読み込み完了: {count} 件 ({_MASTER_PATH})")
        except Exception as e:
            print(f"[master] 銘柄マスタ読み込み失敗: {e}")
    else:
        print(f"[master] マスタファイルが未配置: {_MASTER_PATH}")


_auto_load()
