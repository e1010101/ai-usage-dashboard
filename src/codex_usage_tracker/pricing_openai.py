"""OpenAI pricing source fetching, parsing, and cache updates."""

from __future__ import annotations

import json
import re
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

from codex_usage_tracker import __version__
from codex_usage_tracker.paths import DEFAULT_PRICING_PATH
from codex_usage_tracker.pricing_anthropic import (
    ANTHROPIC_COMPATIBILITY_ALIASES,
    ANTHROPIC_PRICING_SOURCE_NAME,
    ANTHROPIC_PRICING_URL,
    parse_anthropic_pricing_markdown,
)
from codex_usage_tracker.pricing_config import PRICING_SCHEMA, load_existing_aliases
from codex_usage_tracker.pricing_deepseek import (
    DEEPSEEK_COMPATIBILITY_ALIASES,
    DEEPSEEK_PRICING_SOURCE_NAME,
    DEEPSEEK_PRICING_URL,
    parse_deepseek_pricing_html,
)
from codex_usage_tracker.pricing_estimates import ESTIMATED_MODEL_PRICES, estimated_model_prices

OPENAI_PRICING_MD_URL = "https://developers.openai.com/api/docs/pricing.md"
VALID_PRICING_TIERS = ("standard", "batch", "flex", "priority")


class PricingParseError(ValueError):
    """Raised when the OpenAI pricing Markdown structure cannot be parsed."""


@dataclass(frozen=True)
class PricingUpdateResult:
    """Result from refreshing the local pricing cache."""

    path: Path
    source_url: str
    tier: str
    fetched_at: str
    model_count: int
    estimated_model_count: int = 0
    deepseek_model_count: int = 0
    anthropic_model_count: int = 0
    alias_count: int = 0
    source_urls: tuple[str, ...] = ()
    backup_path: Path | None = None


def update_pricing_from_openai_docs(
    path: Path = DEFAULT_PRICING_PATH,
    *,
    tier: str = "standard",
    source_url: str = OPENAI_PRICING_MD_URL,
    fetch_text: Callable[[str], str] | None = None,
    include_estimates: bool = True,
    include_deepseek: bool = False,
    deepseek_source_url: str = DEEPSEEK_PRICING_URL,
    fetch_deepseek_text: Callable[[str], str] | None = None,
    include_anthropic: bool = False,
    anthropic_source_url: str = ANTHROPIC_PRICING_URL,
    fetch_anthropic_text: Callable[[str], str] | None = None,
) -> PricingUpdateResult:
    """Fetch source-published pricing rows and cache them in the local config."""

    if tier not in VALID_PRICING_TIERS:
        raise ValueError(
            f"unknown pricing tier {tier!r}; expected one of {', '.join(VALID_PRICING_TIERS)}"
        )
    fetcher = fetch_text or _fetch_text
    text = fetcher(source_url)
    parsed_models = parse_openai_pricing_markdown(text, tier=tier)
    if not parsed_models:
        raise PricingParseError(
            f"pricing source schema changed: no text-token pricing rows were parsed "
            f"from {source_url} for tier {tier!r}"
        )
    models: dict[str, dict[str, Any]] = {
        model: dict(rates) for model, rates in parsed_models.items()
    }
    source_urls = [source_url]
    source_entries: list[dict[str, Any]] = [
        {
            "name": "OpenAI Developers pricing docs",
            "url": source_url,
            "tier": tier,
            "model_count": len(parsed_models),
        }
    ]
    aliases = load_existing_aliases(path)
    deepseek_model_count = 0
    if include_deepseek:
        deepseek_fetcher = fetch_deepseek_text or fetcher
        deepseek_models = parse_deepseek_pricing_html(deepseek_fetcher(deepseek_source_url))
        models.update({model: dict(rates) for model, rates in deepseek_models.items()})
        aliases = {**DEEPSEEK_COMPATIBILITY_ALIASES, **aliases}
        deepseek_model_count = len(deepseek_models)
        source_urls.append(deepseek_source_url)
        source_entries.append(
            {
                "name": DEEPSEEK_PRICING_SOURCE_NAME,
                "url": deepseek_source_url,
                "model_count": deepseek_model_count,
                "alias_count": len(DEEPSEEK_COMPATIBILITY_ALIASES),
            }
        )
    anthropic_model_count = 0
    if include_anthropic:
        anthropic_fetcher = fetch_anthropic_text or fetcher
        anthropic_models = parse_anthropic_pricing_markdown(
            anthropic_fetcher(anthropic_source_url)
        )
        models.update({model: dict(rates) for model, rates in anthropic_models.items()})
        aliases = {**ANTHROPIC_COMPATIBILITY_ALIASES, **aliases}
        anthropic_model_count = len(anthropic_models)
        source_urls.append(anthropic_source_url)
        source_entries.append(
            {
                "name": ANTHROPIC_PRICING_SOURCE_NAME,
                "url": anthropic_source_url,
                "model_count": anthropic_model_count,
                "alias_count": len(ANTHROPIC_COMPATIBILITY_ALIASES),
            }
        )
    estimated_model_count = 0
    if include_estimates:
        models.update(estimated_model_prices())
        estimated_model_count = len(ESTIMATED_MODEL_PRICES)

    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    source: dict[str, Any] = {
        "name": _source_display_name(
            include_deepseek=include_deepseek, include_anthropic=include_anthropic
        ),
        "url": source_url,
        "tier": tier,
        "fetched_at": fetched_at,
        "model_count": len(models),
        "official_model_count": len(models) - estimated_model_count,
        "estimated_model_count": estimated_model_count,
    }
    if len(source_entries) > 1:
        source["sources"] = source_entries
    payload = {
        "_schema": PRICING_SCHEMA,
        "_source": source,
        "models": models,
    }
    if aliases:
        payload["aliases"] = aliases
    path.parent.mkdir(parents=True, exist_ok=True)
    backup_path = _backup_existing_pricing(path)
    tmp_path = path.with_name(f"{path.name}.tmp")
    tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp_path.replace(path)
    return PricingUpdateResult(
        path=path,
        source_url=source_url,
        tier=tier,
        fetched_at=fetched_at,
        model_count=len(models),
        estimated_model_count=estimated_model_count,
        deepseek_model_count=deepseek_model_count,
        anthropic_model_count=anthropic_model_count,
        alias_count=len(aliases),
        source_urls=tuple(source_urls),
        backup_path=backup_path,
    )


def _source_display_name(*, include_deepseek: bool, include_anthropic: bool) -> str:
    if include_deepseek and include_anthropic:
        return "OpenAI, DeepSeek, and Anthropic pricing docs"
    if include_deepseek:
        return "OpenAI and DeepSeek pricing docs"
    if include_anthropic:
        return "OpenAI and Anthropic pricing docs"
    return "OpenAI Developers pricing docs"


def parse_openai_pricing_markdown(
    markdown: str, *, tier: str = "standard"
) -> dict[str, dict[str, float]]:
    """Parse text-token rows from OpenAI's pricing markdown for one service tier."""

    if tier not in VALID_PRICING_TIERS:
        raise ValueError(
            f"unknown pricing tier {tier!r}; expected one of {', '.join(VALID_PRICING_TIERS)}"
        )
    rows_block = _extract_text_token_rows_block(markdown, tier)
    models: dict[str, dict[str, float]] = {}
    for match in _OPENAI_PRICE_ROW_RE.finditer(rows_block):
        model = _normalize_model_name(match.group("model"))
        input_rate = _parse_openai_price_value(match.group("input"))
        cached_rate = _parse_openai_price_value(match.group("cached"))
        output_rate = _parse_openai_price_value(match.group("output"))
        if not model or input_rate is None or output_rate is None:
            continue
        if cached_rate is None:
            cached_rate = input_rate
        models[model] = {
            "input_per_million": input_rate,
            "cached_input_per_million": cached_rate,
            "output_per_million": output_rate,
        }
    if not models:
        raise PricingParseError(
            f"pricing source schema changed: tier {tier!r} rows block contained no "
            "parseable text-token pricing rows"
        )
    return models


_OPENAI_PRICE_ROW_RE = re.compile(
    r"""\[
        \s*"(?P<model>[^"]+)"\s*,
        \s*(?P<input>[^,\]\n]+)\s*,
        \s*(?P<cached>[^,\]\n]+)\s*,
        \s*(?P<output>[^,\]\n]+)\s*
    \]""",
    re.VERBOSE,
)


def _fetch_text(url: str) -> str:
    request = Request(
        url,
        headers={
            "Accept": "text/markdown,text/plain;q=0.9,*/*;q=0.1",
            "User-Agent": f"codex-usage-tracker/{__version__}",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8")
    except URLError as exc:
        raise RuntimeError(f"could not fetch pricing source {url}: {exc}") from exc


def _backup_existing_pricing(path: Path) -> Path | None:
    if not path.exists():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = path.with_name(f"{path.name}.{stamp}.bak")
    shutil.copy2(path, backup_path)
    return backup_path


def _extract_text_token_rows_block(markdown: str, tier: str) -> str:
    tier_marker = f'tier="{tier}"'
    tier_index = markdown.find(tier_marker)
    if tier_index == -1:
        raise PricingParseError(
            f"pricing source schema changed: could not find text-token tier marker {tier_marker!r}"
        )
    search_end = _pricing_component_end(markdown, tier_index)
    rows_marker_index = markdown.find("rows={[", tier_index, search_end)
    if rows_marker_index == -1:
        raise PricingParseError(
            f"pricing source schema changed: tier {tier!r} does not contain a rows={{[ block"
        )
    bracket_index = markdown.find("[", rows_marker_index, search_end)
    if bracket_index == -1:
        raise PricingParseError(
            f"pricing source schema changed: tier {tier!r} has a malformed rows block"
        )
    end_index = _find_matching_bracket(markdown, bracket_index)
    if end_index > search_end:
        raise PricingParseError(
            f"pricing source schema changed: tier {tier!r} rows block extends past its component"
        )
    return markdown[bracket_index + 1 : end_index]


def _pricing_component_end(markdown: str, tier_index: int) -> int:
    candidates = [
        index
        for index in (
            markdown.find("/>", tier_index),
            markdown.find("</TextTokenPricingTables>", tier_index),
            markdown.find("<TextTokenPricingTables", tier_index + 1),
        )
        if index != -1
    ]
    return min(candidates) if candidates else len(markdown)


def _find_matching_bracket(text: str, start_index: int) -> int:
    depth = 0
    quote: str | None = None
    escaped = False
    for index in range(start_index, len(text)):
        char = text[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {'"', "'", "`"}:
            quote = char
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return index
    raise PricingParseError("pricing source schema changed: rows block is unterminated")


def _normalize_model_name(model: str) -> str:
    return re.sub(r"\s+\([^)]*context length[^)]*\)\s*$", "", model.strip(), flags=re.I)


def _parse_openai_price_value(value: str) -> float | None:
    normalized = value.strip()
    if normalized in {"", "null", "undefined", "-", '""', "''", '"-"', "'-'"}:
        return None
    if (
        len(normalized) >= 2
        and normalized[0] == normalized[-1]
        and normalized[0] in {'"', "'"}
    ):
        normalized = normalized[1:-1].strip()
    if normalized in {"", "-", "Free"}:
        return None
    return float(normalized.replace("_", ""))
