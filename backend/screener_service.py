"""スクリーニングエンジン - 条件に基づく銘柄フィルタリング（JP/US対応）"""

from __future__ import annotations

import operator
from typing import Optional

import master
import us_master
import fundamentals_cache

OPERATOR_MAP = {
    "==": operator.eq,
    "!=": operator.ne,
    ">=": operator.ge,
    "<=": operator.le,
    ">": operator.gt,
    "<": operator.lt,
    "contains": lambda a, b: b in str(a) if a else False,
}

JP_MASTER_FIELDS = {"sector33", "sector17", "market", "scale", "sector33_code", "sector17_code", "scale_code"}
US_MASTER_FIELDS = {"sector", "indices", "exchange", "sub_industry"}
FUNDAMENTAL_FIELDS = set(fundamentals_cache._FIELDS)

SCREENER_FIELDS_JP = {
    "per":              {"label": "PER",           "type": "number", "group": "valuation"},
    "forward_per":      {"label": "予想PER",        "type": "number", "group": "valuation"},
    "pbr":              {"label": "PBR",           "type": "number", "group": "valuation"},
    "eps":              {"label": "EPS",           "type": "number", "group": "valuation"},
    "roe":              {"label": "ROE",           "type": "number", "group": "profitability"},
    "roa":              {"label": "ROA",           "type": "number", "group": "profitability"},
    "dividend_yield":   {"label": "配当利回り",     "type": "number", "group": "dividend"},
    "payout_ratio":     {"label": "配当性向",       "type": "number", "group": "dividend"},
    "market_cap":       {"label": "時価総額",       "type": "number", "group": "size"},
    "profit_margin":    {"label": "利益率",         "type": "number", "group": "profitability"},
    "operating_margin": {"label": "営業利益率",     "type": "number", "group": "profitability"},
    "beta":             {"label": "ベータ",         "type": "number", "group": "risk"},
    "avg_volume":       {"label": "平均出来高",     "type": "number", "group": "liquidity"},
    "sector33":         {"label": "33業種区分",     "type": "string", "group": "classification"},
    "sector17":         {"label": "17業種区分",     "type": "string", "group": "classification"},
    "market":           {"label": "市場区分",       "type": "string", "group": "classification"},
    "scale":            {"label": "規模区分",       "type": "string", "group": "classification"},
    "recommendation":   {"label": "推奨",          "type": "string", "group": "analyst"},
}

SCREENER_FIELDS_US = {
    "per":              {"label": "P/E Ratio",      "type": "number", "group": "valuation"},
    "forward_per":      {"label": "Forward P/E",    "type": "number", "group": "valuation"},
    "pbr":              {"label": "P/B Ratio",      "type": "number", "group": "valuation"},
    "eps":              {"label": "EPS",            "type": "number", "group": "valuation"},
    "roe":              {"label": "ROE",            "type": "number", "group": "profitability"},
    "roa":              {"label": "ROA",            "type": "number", "group": "profitability"},
    "dividend_yield":   {"label": "Dividend Yield", "type": "number", "group": "dividend"},
    "payout_ratio":     {"label": "Payout Ratio",   "type": "number", "group": "dividend"},
    "market_cap":       {"label": "Market Cap",     "type": "number", "group": "size"},
    "profit_margin":    {"label": "Profit Margin",  "type": "number", "group": "profitability"},
    "operating_margin": {"label": "Operating Margin","type": "number", "group": "profitability"},
    "beta":             {"label": "Beta",           "type": "number", "group": "risk"},
    "avg_volume":       {"label": "Avg Volume",     "type": "number", "group": "liquidity"},
    "sector":           {"label": "Sector",         "type": "string", "group": "classification"},
    "sub_industry":     {"label": "Sub-Industry",   "type": "string", "group": "classification"},
    "indices":          {"label": "Index",          "type": "string", "group": "classification"},
    "exchange":         {"label": "Exchange",       "type": "string", "group": "classification"},
    "recommendation":   {"label": "Recommendation", "type": "string", "group": "analyst"},
}

# backward compat
SCREENER_FIELDS = SCREENER_FIELDS_JP


def _get_field_value(entry: dict, funda: Optional[dict], field: str, master_fields: set):
    if field in master_fields:
        return entry.get(field)
    if funda and field in FUNDAMENTAL_FIELDS:
        return funda.get(field)
    return None


def _check_condition(value, op_str: str, target) -> bool:
    if value is None:
        return False
    op_func = OPERATOR_MAP.get(op_str)
    if op_func is None:
        return False
    try:
        if isinstance(target, str) or op_str in ("==", "!=", "contains"):
            return op_func(str(value), str(target))
        return op_func(float(value), float(target))
    except (ValueError, TypeError):
        return False


def _get_ticker_key(entry: dict, region: str) -> str:
    if region == "US":
        return entry["ticker"]
    return entry.get("code_t", entry.get("ticker", ""))


def run_screen(
    conditions: list[dict],
    sort_by: Optional[str] = None,
    sort_dir: str = "desc",
    limit: int = 50,
    market_filter: Optional[str] = None,
    region: str = "JP",
) -> dict:
    """
    条件に基づいて全銘柄をスクリーニングする。

    region: "JP" or "US"
    """
    if region == "US":
        if not us_master.get_entries():
            us_master.refresh(force=True)
        entries = us_master.get_entries()
        master_fields = US_MASTER_FIELDS
    else:
        entries = master.filter_by_tag("market", market_filter, 5000) if market_filter else master._entries
        master_fields = JP_MASTER_FIELDS

    if not entries:
        return {"results": [], "total_scanned": 0, "total_matched": 0}

    needs_funda = any(
        c["field"] in FUNDAMENTAL_FIELDS for c in conditions
    ) or (sort_by and sort_by in FUNDAMENTAL_FIELDS)

    master_only_conditions = [c for c in conditions if c["field"] in master_fields]
    funda_conditions = [c for c in conditions if c["field"] not in master_fields]

    candidates = list(entries)
    for cond in master_only_conditions:
        candidates = [
            e for e in candidates
            if _check_condition(e.get(cond["field"]), cond["op"], cond["value"])
        ]

    if not needs_funda and not funda_conditions:
        results = [_build_result(e, None, region) for e in candidates[:limit * 2]]
        if sort_by:
            results = _sort_results(results, sort_by, sort_dir)
        return {
            "results": results[:limit],
            "total_scanned": len(entries),
            "total_matched": len(candidates),
        }

    tickers_to_fetch = [_get_ticker_key(e, region) for e in candidates]

    BATCH_LIMIT = 200
    tickers_to_fetch = tickers_to_fetch[:BATCH_LIMIT]

    funda_data = fundamentals_cache.get_batch(tickers_to_fetch)

    matched = []
    for entry in candidates[:BATCH_LIMIT]:
        ticker = _get_ticker_key(entry, region)
        funda = funda_data.get(ticker)

        all_pass = True
        for cond in funda_conditions:
            val = _get_field_value(entry, funda, cond["field"], master_fields)
            if not _check_condition(val, cond["op"], cond["value"]):
                all_pass = False
                break

        if all_pass:
            matched.append(_build_result(entry, funda, region))

    if sort_by:
        matched = _sort_results(matched, sort_by, sort_dir)

    return {
        "results": matched[:limit],
        "total_scanned": len(entries),
        "total_matched": len(matched),
    }


def _build_result(entry: dict, funda: Optional[dict], region: str = "JP") -> dict:
    if region == "US":
        r = {
            "ticker": entry["ticker"],
            "name": entry["name"],
            "sector": entry.get("sector", ""),
            "indices": entry.get("indices", ""),
            "exchange": entry.get("exchange", ""),
            "sub_industry": entry.get("sub_industry", ""),
        }
    else:
        r = {
            "ticker": entry.get("code_t", entry.get("ticker", "")),
            "name": entry["name"],
            "market": entry.get("market", ""),
            "sector33": entry.get("sector33", ""),
            "scale": entry.get("scale", ""),
        }
    if funda:
        for key in fundamentals_cache._FIELDS:
            r[key] = funda.get(key)
    return r


def _sort_results(results: list[dict], sort_by: str, sort_dir: str) -> list[dict]:
    def sort_key(r):
        v = r.get(sort_by)
        if v is None:
            return float("inf") if sort_dir == "asc" else float("-inf")
        try:
            return float(v)
        except (ValueError, TypeError):
            return str(v)

    return sorted(results, key=sort_key, reverse=(sort_dir == "desc"))


def get_available_fields(region: str = "JP") -> list[dict]:
    fields = SCREENER_FIELDS_US if region == "US" else SCREENER_FIELDS_JP
    return [
        {"field": k, **v}
        for k, v in fields.items()
    ]
