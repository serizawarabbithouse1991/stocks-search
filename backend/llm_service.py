"""LLM サービス - 複数プロバイダー対応の抽象レイヤー"""

from __future__ import annotations

import json
import os
import re
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

PROVIDERS = ("openai", "anthropic", "gemini", "ollama")

_DEFAULT_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")
_OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")


def _build_theme_prompt(theme: str, master_sectors: list[str]) -> str:
    sectors_text = ", ".join(master_sectors[:50])
    return f"""あなたは日本株の投資アナリストです。
以下のテーマに関連する日本の上場企業の銘柄コード（4桁数字）を、関連度が高い順に最大30件提案してください。

テーマ: {theme}

回答は以下のJSON配列形式で、余計な説明なしに返してください:
[{{"code": "7203", "reason": "トヨタ自動車 - EV戦略を推進"}}]

参考: 日本株の業種区分には {sectors_text} などがあります。
コードは4桁の数字（例: 7203）で返してください。"""


def _build_analysis_prompt(
    tickers_info: list[dict], theme: str | None = None
) -> str:
    stocks_text = ""
    for info in tickers_info:
        stocks_text += (
            f"- {info['ticker']} {info.get('name','')}:"
            f" 終値¥{info.get('last_close','?')},"
            f" 変動率{info.get('change_pct','?')}%,"
            f" RSI={info.get('rsi','?')},"
            f" MA25乖離={info.get('ma25_diff','?')}%,"
            f" 業種={info.get('sector','')}\n"
        )

    theme_text = f"\n投資テーマ「{theme}」の観点で分析してください。" if theme else ""

    return f"""あなたは日本株の投資アナリストです。
以下の銘柄群を比較分析し、日本語で簡潔なレポートを作成してください。{theme_text}

銘柄データ:
{stocks_text}

以下の構成で回答してください:
1. **概要** (3行以内)
2. **注目銘柄** (上位3つとその理由)
3. **リスク要因** (2-3点)
4. **総合判断** (1行)

投資助言ではなく分析情報の提供であることを明記してください。"""


async def _call_openai(prompt: str, api_key: str, model: str = "gpt-4o-mini") -> str:
    import openai

    client = openai.AsyncOpenAI(api_key=api_key)
    resp = await client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=2000,
    )
    return resp.choices[0].message.content or ""


async def _call_anthropic(
    prompt: str, api_key: str, model: str = "claude-3-5-haiku-latest"
) -> str:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=api_key)
    resp = await client.messages.create(
        model=model,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.content[0].text if resp.content else ""


async def _call_gemini(
    prompt: str, api_key: str, model: str = "gemini-2.0-flash"
) -> str:
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    gm = genai.GenerativeModel(model)
    resp = await gm.generate_content_async(prompt)
    return resp.text or ""


async def _call_ollama(
    prompt: str, model: Optional[str] = None, base_url: Optional[str] = None
) -> str:
    import httpx

    url = (base_url or _OLLAMA_URL).rstrip("/") + "/api/generate"
    payload = {
        "model": model or _OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.3},
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data.get("response", "")


async def call_llm(
    prompt: str,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    prov = provider or _DEFAULT_PROVIDER
    if prov == "openai":
        key = api_key or os.getenv("OPENAI_API_KEY", "")
        if not key:
            raise ValueError("OpenAI API キーが未設定です")
        return await _call_openai(prompt, key, model or "gpt-4o-mini")
    elif prov == "anthropic":
        key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
        if not key:
            raise ValueError("Anthropic API キーが未設定です")
        return await _call_anthropic(prompt, key, model or "claude-3-5-haiku-latest")
    elif prov == "gemini":
        key = api_key or os.getenv("GEMINI_API_KEY", "")
        if not key:
            raise ValueError("Gemini API キーが未設定です")
        return await _call_gemini(prompt, key, model or "gemini-2.0-flash")
    elif prov == "ollama":
        return await _call_ollama(prompt, model, None)
    else:
        raise ValueError(f"未対応のプロバイダー: {prov}")


def parse_theme_response(text: str) -> list[dict]:
    """LLM応答からJSON配列を抽出する。"""
    match = re.search(r"\[[\s\S]*?\]", text)
    if not match:
        return []
    try:
        data = json.loads(match.group())
        return [
            {"code": str(item.get("code", "")), "reason": str(item.get("reason", ""))}
            for item in data
            if item.get("code")
        ]
    except (json.JSONDecodeError, TypeError):
        return []


async def suggest_theme_tickers(
    theme: str,
    master_sectors: list[str],
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> list[dict]:
    prompt = _build_theme_prompt(theme, master_sectors)
    raw = await call_llm(prompt, provider, api_key, model)
    return parse_theme_response(raw)


async def analyze_stocks(
    tickers_info: list[dict],
    theme: Optional[str] = None,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    prompt = _build_analysis_prompt(tickers_info, theme)
    return await call_llm(prompt, provider, api_key, model)
