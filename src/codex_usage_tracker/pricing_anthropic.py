"""Anthropic pricing source parsing."""

from __future__ import annotations

import re

ANTHROPIC_PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing.md"
ANTHROPIC_PRICING_SOURCE_NAME = "Anthropic pricing docs"
ANTHROPIC_COMPATIBILITY_ALIASES = {
    "claude-3-5-haiku-20241022": "claude-haiku-3-5",
    "claude-haiku-4-5-20251001": "claude-haiku-4-5",
    "claude-opus-4-0": "claude-opus-4",
    "claude-opus-4-1-20250805": "claude-opus-4-1",
    "claude-opus-4-20250514": "claude-opus-4",
    "claude-opus-4-5-20251101": "claude-opus-4-5",
    "claude-sonnet-4-0": "claude-sonnet-4",
    "claude-sonnet-4-20250514": "claude-sonnet-4",
    "claude-sonnet-4-5-20250929": "claude-sonnet-4-5",
}


class AnthropicPricingParseError(ValueError):
    """Raised when the Anthropic pricing markdown structure cannot be parsed."""


def parse_anthropic_pricing_markdown(source: str) -> dict[str, dict[str, float]]:
    """Parse base-input, cache-read, and output rates from Anthropic pricing docs."""

    header_cells, body_rows = _find_model_pricing_table(source)
    input_index = _column_index(header_cells, "BASE INPUT")
    cached_index = _column_index(header_cells, "CACHE HITS")
    output_index = _column_index(header_cells, "OUTPUT")
    models: dict[str, dict[str, float]] = {}
    for cells in body_rows:
        if len(cells) != len(header_cells):
            continue
        model = _normalize_model_id(cells[0])
        if model is None:
            continue
        # Duplicate display names (e.g. introductory vs standard Sonnet 5 rows)
        # keep the first row, which the docs list as the currently effective price.
        if model in models:
            continue
        models[model] = {
            "input_per_million": _parse_price(cells[input_index]),
            "cached_input_per_million": _parse_price(cells[cached_index]),
            "output_per_million": _parse_price(cells[output_index]),
        }
    if not models:
        raise AnthropicPricingParseError(
            "pricing source schema changed: model pricing table contained no Claude rows"
        )
    return models


def _find_model_pricing_table(source: str) -> tuple[list[str], list[list[str]]]:
    lines = source.splitlines()
    for index, line in enumerate(lines):
        if "|" not in line:
            continue
        cells = _split_row(line)
        upper = [cell.upper() for cell in cells]
        if not any("BASE INPUT" in cell for cell in upper):
            continue
        if not any("OUTPUT" in cell for cell in upper):
            continue
        body: list[list[str]] = []
        for row_line in lines[index + 1 :]:
            if "|" not in row_line:
                break
            if _is_separator_row(row_line):
                continue
            body.append(_split_row(row_line))
        return cells, body
    raise AnthropicPricingParseError(
        "pricing source schema changed: could not find the model pricing table header"
    )


def _split_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _is_separator_row(line: str) -> bool:
    return re.fullmatch(r"[\s|:\-]+", line) is not None


def _column_index(header_cells: list[str], needle: str) -> int:
    for index, cell in enumerate(header_cells):
        if needle in cell.upper():
            return index
    raise AnthropicPricingParseError(
        f"pricing source schema changed: could not find the {needle.lower()} column"
    )


def _normalize_model_id(value: str) -> str | None:
    without_links = re.sub(r"\[[^\]]*\]\([^)]*\)", "", value)
    without_parens = re.sub(r"\(\s*\)", "", without_links)
    name = re.sub(r"\s+", " ", without_parens).strip()
    # Effective-date qualifiers appear as plain text (e.g. "starting September 1, 2026").
    name = re.sub(r"\s+(?:starting|through|until|effective)\s.*$", "", name, flags=re.IGNORECASE)
    model = name.lower().replace(".", "-").replace(" ", "-")
    if re.fullmatch(r"claude-[a-z0-9-]+", model) is None:
        return None
    return model


def _parse_price(value: str) -> float:
    match = re.search(r"\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)", value)
    if not match:
        raise AnthropicPricingParseError(
            f"pricing source schema changed: could not parse Anthropic price {value!r}"
        )
    return float(match.group(1).replace(",", ""))
