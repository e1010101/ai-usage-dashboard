"""DeepSeek pricing source parsing."""

from __future__ import annotations

import html
import re

DEEPSEEK_PRICING_URL = "https://api-docs.deepseek.com/quick_start/pricing"
DEEPSEEK_PRICING_SOURCE_NAME = "DeepSeek API pricing docs"
DEEPSEEK_COMPATIBILITY_ALIASES = {
    "deepseek-chat": "deepseek-v4-flash",
    "deepseek-reasoner": "deepseek-v4-flash",
}


class DeepSeekPricingParseError(ValueError):
    """Raised when the DeepSeek pricing HTML structure cannot be parsed."""


def parse_deepseek_pricing_html(source: str) -> dict[str, dict[str, float]]:
    """Parse DeepSeek API cache-hit, cache-miss, and output pricing rows."""

    rows = [_extract_cells(match.group("row")) for match in _ROW_RE.finditer(source)]
    rows = [cells for cells in rows if cells]
    model_row = next((cells for cells in rows if cells[0].upper() == "MODEL"), None)
    if model_row is None or len(model_row) < 2:
        raise DeepSeekPricingParseError(
            "pricing source schema changed: could not find DeepSeek model row"
        )
    models = [_normalize_model_name(cell) for cell in model_row[1:]]
    models = [model for model in models if model.startswith("deepseek-")]
    if not models:
        raise DeepSeekPricingParseError(
            "pricing source schema changed: DeepSeek model row contained no model ids"
        )

    price_rows: dict[str, list[float]] = {}
    for cells in rows:
        label_index = _price_label_index(cells)
        if label_index is None:
            continue
        label = cells[label_index].upper()
        values = cells[label_index + 1 : label_index + 1 + len(models)]
        if len(values) != len(models):
            raise DeepSeekPricingParseError(
                f"pricing source schema changed: row {cells[label_index]!r} "
                "does not match model count"
            )
        price_rows[label] = [_parse_price(value) for value in values]

    cached_rates = _find_price_row(price_rows, "CACHE HIT")
    input_rates = _find_price_row(price_rows, "CACHE MISS")
    output_rates = _find_price_row(price_rows, "OUTPUT")
    return {
        model: {
            "input_per_million": input_rates[index],
            "cached_input_per_million": cached_rates[index],
            "output_per_million": output_rates[index],
        }
        for index, model in enumerate(models)
    }


_ROW_RE = re.compile(r"<tr\b[^>]*>(?P<row>.*?)</tr>", re.IGNORECASE | re.DOTALL)
_CELL_RE = re.compile(r"<t[dh]\b[^>]*>(?P<cell>.*?)</t[dh]>", re.IGNORECASE | re.DOTALL)


def _extract_cells(row: str) -> list[str]:
    return [_cell_text(match.group("cell")) for match in _CELL_RE.finditer(row)]


def _cell_text(value: str) -> str:
    without_sup = re.sub(
        r"<sup\b[^>]*>.*?</sup>", "", value, flags=re.IGNORECASE | re.DOTALL
    )
    without_tags = re.sub(r"<[^>]+>", " ", without_sup)
    return re.sub(r"\s+", " ", html.unescape(without_tags)).strip()


def _normalize_model_name(value: str) -> str:
    return re.sub(r"\(\d+\)$", "", value).strip()


def _price_label_index(cells: list[str]) -> int | None:
    for index, cell in enumerate(cells):
        normalized = cell.upper()
        if "1M INPUT TOKENS" in normalized or "1M OUTPUT TOKENS" in normalized:
            return index
    return None


def _find_price_row(price_rows: dict[str, list[float]], needle: str) -> list[float]:
    for label, values in price_rows.items():
        if needle in label:
            return values
    raise DeepSeekPricingParseError(
        f"pricing source schema changed: could not find DeepSeek {needle.lower()} row"
    )


def _parse_price(value: str) -> float:
    match = re.search(r"\d+(?:\.\d+)?", value.replace(",", ""))
    if not match:
        raise DeepSeekPricingParseError(
            f"pricing source schema changed: could not parse DeepSeek price {value!r}"
        )
    return float(match.group(0))
