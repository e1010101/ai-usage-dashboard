from __future__ import annotations

import json
from pathlib import Path

from codex_usage_tracker import pricing as pricing_module
from codex_usage_tracker.pricing import (
    ANTHROPIC_PRICING_URL,
    ESTIMATED_MODEL_PRICES,
    OPENAI_PRICING_MD_URL,
    PRICING_SCHEMA,
    AnthropicPricingParseError,
    PricingParseError,
    load_pricing_config,
    parse_anthropic_pricing_markdown,
    parse_openai_pricing_markdown,
    summarize_pricing_coverage,
    update_pricing_from_openai_docs,
)

OPENAI_PRICING_FIXTURE = """
<TextTokenPricingTables
  client:load
  tier="standard"
  rows={[
    ["gpt-5.5 (<272K context length)", 5, 0.5, 30],
    ["gpt-5.4-mini", 0.75, 0.075, 4.5],
    ["gpt-5-pro", 15, null, 120],
  ]}
/>
<TextTokenPricingTables
  client:load
  tier="batch"
  rows={[
    ["gpt-5.5 (<272K context length)", 2.5, 0.25, 15],
  ]}
/>
"""

OPENAI_PRICING_TABLE_FIXTURE = """
# Pricing

Standard

### Standard pricing data

| Model | Short context input | Short context cached input | Short context cache writes | Short context output | Long context input | Long context cached input | Long context cache writes | Long context output |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.6-sol | $5.00 | $0.50 | $6.25 | $30.00 | $10.00 | $1.00 | $12.50 | $45.00 |
| gpt-5.5 (<272K context length) | $5.00 | $0.50 | - | $30.00 | $10.00 | $1.00 | - | $45.00 |
| gpt-5.4-mini | $0.75 | $0.075 | - | $4.50 | - | - | - | - |
| gpt-5-pro | $15.00 | - | - | $120.00 | - | - | - | - |
| omni-moderation-latest | Free | - | - | - | - | - | - | - |

Priority processing was renamed Fast mode on July 30, 2026.

### Batch pricing data

| Model | Short context input | Short context cached input | Short context cache writes | Short context output | Long context input | Long context cached input | Long context cache writes | Long context output |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.5 (<272K context length) | $2.50 | $0.25 | - | $15.00 | $5.00 | $0.50 | - | $22.50 |

Fast mode

### Fast pricing data

| Model | Short context input | Short context cached input | Short context cache writes | Short context output | Long context input | Long context cached input | Long context cache writes | Long context output |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.6-sol | $10.00 | $1.00 | $12.50 | $60.00 | $20.00 | $2.00 | $25.00 | $90.00 |

### Grouped Pricing Table data

| Model | Modality | Input | Cached input | Output / cost |
| --- | --- | --- | --- | --- |
| gpt-realtime-2.1 | Audio | $32.00 | $0.40 | $64.00 |
"""

DEEPSEEK_PRICING_FIXTURE = """
<table>
  <tr>
    <td colspan="2">MODEL</td>
    <td>deepseek-v4-flash<sup>(1)</sup></td>
    <td>deepseek-v4-pro</td>
  </tr>
  <tr>
    <td rowspan="3">PRICING</td>
    <td>1M INPUT TOKENS (CACHE HIT)</td>
    <td>$0.0028</td>
    <td>$0.003625</td>
  </tr>
  <tr>
    <td>1M INPUT TOKENS (CACHE MISS)</td>
    <td>$0.14</td>
    <td>$0.435</td>
  </tr>
  <tr>
    <td>1M OUTPUT TOKENS</td>
    <td>$0.28</td>
    <td>$0.87</td>
  </tr>
</table>
"""


ANTHROPIC_PRICING_FIXTURE = """
## Model pricing

The following table shows pricing for all Claude models:

| Model                                                                                                         | Base Input Tokens | 5m Cache Writes | 1h Cache Writes | Cache Hits & Refreshes | Output Tokens |
| ------------------------------------------------------------------------------------------------------------- | ----------------- | --------------- | --------------- | ---------------------- | ------------- |
| Claude Fable 5                                                                                                | $10 / MTok        | $12.50 / MTok   | $20 / MTok      | $1 / MTok              | $50 / MTok    |
| Claude Mythos 5 ([limited availability](https://anthropic.com/glasswing))                                     | $10 / MTok        | $12.50 / MTok   | $20 / MTok      | $1 / MTok              | $50 / MTok    |
| Claude Opus 4.8                                                                                               | $5 / MTok         | $6.25 / MTok    | $10 / MTok      | $0.50 / MTok           | $25 / MTok    |
| Claude Opus 4.1 ([deprecated](/docs/en/about-claude/model-deprecations))                                      | $15 / MTok        | $18.75 / MTok   | $30 / MTok      | $1.50 / MTok           | $75 / MTok    |
| Claude Sonnet 5 [through August 31, 2026](/docs/en/about-claude/pricing#claude-sonnet-5-introductory-pricing) | $2 / MTok         | $2.50 / MTok    | $4 / MTok       | $0.20 / MTok           | $10 / MTok    |
| Claude Sonnet 5 starting September 1, 2026                                                                    | $3 / MTok         | $3.75 / MTok    | $6 / MTok       | $0.30 / MTok           | $15 / MTok    |
| Claude Sonnet 4.5                                                                                             | $3 / MTok         | $3.75 / MTok    | $6 / MTok       | $0.30 / MTok           | $15 / MTok    |
| Claude Haiku 4.5                                                                                              | $1 / MTok         | $1.25 / MTok    | $2 / MTok       | $0.10 / MTok           | $5 / MTok     |

## Feature-specific pricing

| Cache operation      | Multiplier             | Duration                  |
| -------------------- | ---------------------- | ------------------------- |
| 5-minute cache write | 1.25x base input price | Cache valid for 5 minutes |
"""


def test_parse_openai_pricing_markdown_for_selected_tier() -> None:
    models = parse_openai_pricing_markdown(OPENAI_PRICING_FIXTURE, tier="standard")

    assert models["gpt-5.5"]["input_per_million"] == 5
    assert models["gpt-5.5"]["cached_input_per_million"] == 0.5
    assert models["gpt-5.5"]["output_per_million"] == 30
    assert models["gpt-5.4-mini"]["output_per_million"] == 4.5
    assert models["gpt-5-pro"]["cached_input_per_million"] == 15


def test_parse_openai_pricing_markdown_uses_requested_tier() -> None:
    models = parse_openai_pricing_markdown(OPENAI_PRICING_FIXTURE, tier="batch")

    assert models == {
        "gpt-5.5": {
            "input_per_million": 2.5,
            "cached_input_per_million": 0.25,
            "output_per_million": 15.0,
        }
    }


def test_parse_openai_pricing_markdown_handles_cache_write_columns() -> None:
    fixture = """
<TextTokenPricingTables
  client:load
  tier="standard"
  rows={[
    ["gpt-5.6-sol", 5, 0.5, 6.25, 30],
    ["gpt-5.6-luna", 1, 0.1, 1.25, 6],
    ["gpt-5.5 (<272K context length)", 5, 0.5, "-", 30],
    ["gpt-5.5-pro (<272K context length)", 30, "-", "-", 180],
    ["gpt-5.2", 1.75, 0.175, 14],
  ]}
/>
"""

    models = parse_openai_pricing_markdown(fixture, tier="standard")

    # Five-value rows carry a cache-write column; output stays last.
    assert models["gpt-5.6-sol"] == {
        "input_per_million": 5.0,
        "cached_input_per_million": 0.5,
        "output_per_million": 30.0,
    }
    assert models["gpt-5.6-luna"]["output_per_million"] == 6.0
    assert models["gpt-5.5"]["output_per_million"] == 30.0
    assert models["gpt-5.5-pro"] == {
        "input_per_million": 30.0,
        "cached_input_per_million": 30.0,
        "output_per_million": 180.0,
    }
    # Legacy three-value rows keep working unchanged.
    assert models["gpt-5.2"]["cached_input_per_million"] == 0.175


def test_parse_openai_pricing_markdown_reports_schema_changes() -> None:
    missing_tier = OPENAI_PRICING_FIXTURE.replace('tier="standard"', 'tier="other"')
    missing_rows = OPENAI_PRICING_FIXTURE.replace("rows={[", "items={[", 1)
    malformed_rows = """
<TextTokenPricingTables
  tier="standard"
  rows={[
    ["not-parseable"]
  ]}
/>
"""

    for source, expected in [
        (missing_tier, "tier marker"),
        (missing_rows, "rows"),
        (malformed_rows, "no parseable text-token pricing rows"),
    ]:
        try:
            parse_openai_pricing_markdown(source, tier="standard")
        except PricingParseError as exc:
            assert expected in str(exc)
        else:
            raise AssertionError("expected PricingParseError")


def test_parse_openai_pricing_markdown_parses_markdown_tables() -> None:
    models = parse_openai_pricing_markdown(OPENAI_PRICING_TABLE_FIXTURE, tier="standard")

    # Short-context rates only: gpt-5.6-sol's long-context band ($10/$1/$45)
    # must not leak in, and the context-length suffix is stripped.
    assert models["gpt-5.6-sol"] == {
        "input_per_million": 5.0,
        "cached_input_per_million": 0.5,
        "output_per_million": 30.0,
    }
    assert models["gpt-5.5"] == {
        "input_per_million": 5.0,
        "cached_input_per_million": 0.5,
        "output_per_million": 30.0,
    }
    assert models["gpt-5.4-mini"]["output_per_million"] == 4.5
    # A dash in the cached column falls back to the input rate.
    assert models["gpt-5-pro"]["cached_input_per_million"] == 15.0
    # Rows without a numeric input/output pair are skipped, not fatal.
    assert "omni-moderation-latest" not in models


def test_parse_openai_pricing_markdown_markdown_tables_use_requested_tier() -> None:
    models = parse_openai_pricing_markdown(OPENAI_PRICING_TABLE_FIXTURE, tier="batch")

    assert models == {
        "gpt-5.5": {
            "input_per_million": 2.5,
            "cached_input_per_million": 0.25,
            "output_per_million": 15.0,
        }
    }


def test_parse_openai_pricing_markdown_accepts_fast_heading_for_priority_tier() -> None:
    models = parse_openai_pricing_markdown(OPENAI_PRICING_TABLE_FIXTURE, tier="priority")

    assert models == {
        "gpt-5.6-sol": {
            "input_per_million": 10.0,
            "cached_input_per_million": 1.0,
            "output_per_million": 60.0,
        }
    }


def test_parse_openai_pricing_markdown_matches_columns_by_header_name() -> None:
    reordered = """
### Standard pricing data

| Model | Long context input | Long context output | Short context output | Short context cached input | Short context input |
| --- | --- | --- | --- | --- | --- |
| gpt-5.6-sol | $10.00 | $45.00 | $30.00 | $0.50 | $5.00 |
"""
    models = parse_openai_pricing_markdown(reordered, tier="standard")
    assert models["gpt-5.6-sol"] == {
        "input_per_million": 5.0,
        "cached_input_per_million": 0.5,
        "output_per_million": 30.0,
    }

    missing_columns = """
### Standard pricing data

| Model | Long context input | Long context output |
| --- | --- | --- |
| gpt-5.6-sol | $10.00 | $45.00 |
"""
    try:
        parse_openai_pricing_markdown(missing_columns, tier="standard")
    except PricingParseError as exc:
        assert "short-context input/output columns" in str(exc)
    else:
        raise AssertionError("expected PricingParseError")


def test_parse_openai_pricing_markdown_reports_unparseable_markdown_rows() -> None:
    no_rows = """
### Standard pricing data

| Model | Short context input | Short context cached input | Short context output |
| --- | --- | --- | --- |
| gpt-5.6-sol | - | - | - |
"""
    junk_price = no_rows.replace("| gpt-5.6-sol | - | - | - |", "| gpt-5.6-sol | call us | - | - |")
    missing_table = "### Standard pricing data\n\nno table here\n"

    for source, expected in [
        (no_rows, "no parseable text-token pricing rows"),
        (junk_price, "price cell"),
        (missing_table, "not followed by a Markdown table"),
    ]:
        try:
            parse_openai_pricing_markdown(source, tier="standard")
        except PricingParseError as exc:
            assert expected in str(exc)
        else:
            raise AssertionError("expected PricingParseError")


def test_parse_deepseek_pricing_html() -> None:
    models = pricing_module.parse_deepseek_pricing_html(DEEPSEEK_PRICING_FIXTURE)

    assert models["deepseek-v4-flash"] == {
        "input_per_million": 0.14,
        "cached_input_per_million": 0.0028,
        "output_per_million": 0.28,
    }
    assert models["deepseek-v4-pro"] == {
        "input_per_million": 0.435,
        "cached_input_per_million": 0.003625,
        "output_per_million": 0.87,
    }


def test_parse_anthropic_pricing_markdown() -> None:
    models = parse_anthropic_pricing_markdown(ANTHROPIC_PRICING_FIXTURE)

    assert models["claude-fable-5"] == {
        "input_per_million": 10.0,
        "cached_input_per_million": 1.0,
        "output_per_million": 50.0,
    }
    assert models["claude-opus-4-8"] == {
        "input_per_million": 5.0,
        "cached_input_per_million": 0.5,
        "output_per_million": 25.0,
    }
    assert models["claude-haiku-4-5"]["cached_input_per_million"] == 0.1
    # Qualifier links and parentheticals are stripped from display names.
    assert models["claude-mythos-5"]["input_per_million"] == 10.0
    assert models["claude-opus-4-1"]["output_per_million"] == 75.0
    # Duplicate Sonnet 5 rows keep the first (currently effective) price.
    assert models["claude-sonnet-5"]["input_per_million"] == 2.0
    assert "claude-sonnet-5-starting-september-1,-2026" not in models


def test_parse_anthropic_pricing_markdown_reports_schema_changes() -> None:
    missing_header = ANTHROPIC_PRICING_FIXTURE.replace("Base Input Tokens", "Input Rates")
    missing_cached = ANTHROPIC_PRICING_FIXTURE.replace("Cache Hits & Refreshes", "Cache Reads")
    unparseable_price = ANTHROPIC_PRICING_FIXTURE.replace("$10 / MTok", "contact sales", 1)

    for source, expected in [
        (missing_header, "model pricing table header"),
        (missing_cached, "cache hits column"),
        (unparseable_price, "could not parse Anthropic price"),
    ]:
        try:
            parse_anthropic_pricing_markdown(source)
        except AnthropicPricingParseError as exc:
            assert expected in str(exc)
        else:
            raise AssertionError("expected AnthropicPricingParseError")


def test_update_pricing_from_openai_docs_writes_source_metadata(tmp_path: Path) -> None:
    pricing_path = tmp_path / "pricing.json"

    result = update_pricing_from_openai_docs(
        pricing_path,
        fetch_text=lambda url: OPENAI_PRICING_FIXTURE,
    )
    raw = json.loads(pricing_path.read_text(encoding="utf-8"))
    config = load_pricing_config(pricing_path)

    assert result.model_count == 5
    assert result.estimated_model_count == 2
    assert result.source_url == OPENAI_PRICING_MD_URL
    assert raw["_schema"] == PRICING_SCHEMA
    assert raw["_source"]["url"] == OPENAI_PRICING_MD_URL
    assert raw["_source"]["tier"] == "standard"
    assert raw["_source"]["estimated_model_count"] == 2
    assert raw["models"]["codex-auto-review"] == ESTIMATED_MODEL_PRICES["codex-auto-review"]
    assert raw["models"]["gpt-5.3-codex-spark"] == ESTIMATED_MODEL_PRICES["gpt-5.3-codex-spark"]
    assert config.loaded
    assert config.source and config.source["name"] == "OpenAI Developers pricing docs"
    assert config.models["gpt-5.5"]["output_per_million"] == 30
    assert config.models["codex-auto-review"]["input_per_million"] == 1.5
    assert config.is_estimated_model("codex-auto-review")
    assert config.models["gpt-5.3-codex-spark"]["input_per_million"] == 1.75
    assert config.is_estimated_model("gpt-5.3-codex-spark")


def test_update_pricing_from_openai_docs_can_include_deepseek_docs(tmp_path: Path) -> None:
    pricing_path = tmp_path / "pricing.json"

    result = update_pricing_from_openai_docs(
        pricing_path,
        fetch_text=lambda url: (
            OPENAI_PRICING_FIXTURE if url == OPENAI_PRICING_MD_URL else DEEPSEEK_PRICING_FIXTURE
        ),
        include_deepseek=True,
    )
    raw = json.loads(pricing_path.read_text(encoding="utf-8"))
    config = load_pricing_config(pricing_path)
    coverage = summarize_pricing_coverage(
        [
            {
                "group_key": "deepseek-chat",
                "total_tokens": 2_000_000,
                "input_tokens": 1_000_000,
                "cached_input_tokens": 250_000,
                "uncached_input_tokens": 750_000,
                "output_tokens": 1_000_000,
            }
        ],
        pricing=config,
    )

    assert result.model_count == 7
    assert result.deepseek_model_count == 2
    assert result.source_urls == (OPENAI_PRICING_MD_URL, pricing_module.DEEPSEEK_PRICING_URL)
    assert raw["_source"]["sources"][1]["name"] == "DeepSeek API pricing docs"
    assert raw["aliases"]["deepseek-chat"] == "deepseek-v4-flash"
    assert raw["aliases"]["deepseek-reasoner"] == "deepseek-v4-flash"
    assert config.priced_as("deepseek-reasoner") == "deepseek-v4-flash"
    assert coverage["priced_model_count"] == 1
    assert coverage["rows"][0]["priced_as"] == "deepseek-v4-flash"
    assert coverage["rows"][0]["pricing_estimated"] is False
    assert coverage["estimated_cost_usd"] == 0.3857


def test_update_pricing_from_openai_docs_can_skip_estimates(tmp_path: Path) -> None:
    pricing_path = tmp_path / "pricing.json"

    result = update_pricing_from_openai_docs(
        pricing_path,
        fetch_text=lambda url: OPENAI_PRICING_FIXTURE,
        include_estimates=False,
    )
    raw = json.loads(pricing_path.read_text(encoding="utf-8"))

    assert result.model_count == 3
    assert result.estimated_model_count == 0
    assert "codex-auto-review" not in raw["models"]
    assert "gpt-5.3-codex-spark" not in raw["models"]


def test_update_pricing_estimates_do_not_override_published_rows(tmp_path: Path) -> None:
    pricing_path = tmp_path / "pricing.json"
    fixture = OPENAI_PRICING_FIXTURE.replace(
        '["gpt-5.4-mini", 0.75, 0.075, 4.5],',
        '["gpt-5.4-mini", 0.75, 0.075, 4.5],\n    ["gpt-5.3-codex-spark", 2, 0.2, 8],',
    )

    result = update_pricing_from_openai_docs(
        pricing_path,
        fetch_text=lambda url: fixture,
    )
    raw = json.loads(pricing_path.read_text(encoding="utf-8"))
    config = load_pricing_config(pricing_path)

    # The published gpt-5.3-codex-spark row wins over the internal estimate.
    assert raw["models"]["gpt-5.3-codex-spark"] == {
        "input_per_million": 2.0,
        "cached_input_per_million": 0.2,
        "output_per_million": 8.0,
    }
    assert not config.is_estimated_model("gpt-5.3-codex-spark")
    assert result.estimated_model_count == 1
    assert raw["_source"]["estimated_model_count"] == 1
    assert config.is_estimated_model("codex-auto-review")


def test_update_pricing_from_openai_docs_can_include_anthropic_docs(tmp_path: Path) -> None:
    pricing_path = tmp_path / "pricing.json"

    result = update_pricing_from_openai_docs(
        pricing_path,
        fetch_text=lambda url: (
            OPENAI_PRICING_FIXTURE if url == OPENAI_PRICING_MD_URL else ANTHROPIC_PRICING_FIXTURE
        ),
        include_anthropic=True,
    )
    raw = json.loads(pricing_path.read_text(encoding="utf-8"))
    config = load_pricing_config(pricing_path)
    coverage = summarize_pricing_coverage(
        [
            {
                "group_key": "claude-sonnet-4-5-20250929",
                "total_tokens": 2_000_000,
                "input_tokens": 1_000_000,
                "cached_input_tokens": 250_000,
                "uncached_input_tokens": 750_000,
                "output_tokens": 1_000_000,
            }
        ],
        pricing=config,
    )

    assert result.anthropic_model_count == 7
    assert result.model_count == 12
    assert result.source_urls == (OPENAI_PRICING_MD_URL, ANTHROPIC_PRICING_URL)
    assert raw["_source"]["name"] == "OpenAI and Anthropic pricing docs"
    assert raw["_source"]["sources"][1]["name"] == "Anthropic pricing docs"
    assert raw["aliases"]["claude-sonnet-4-5-20250929"] == "claude-sonnet-4-5"
    assert raw["aliases"]["claude-haiku-4-5-20251001"] == "claude-haiku-4-5"
    assert config.priced_as("claude-sonnet-4-5-20250929") == "claude-sonnet-4-5"
    assert config.models["claude-fable-5"]["output_per_million"] == 50.0
    assert not config.is_estimated_model("claude-fable-5")
    assert coverage["priced_model_count"] == 1
    assert coverage["rows"][0]["priced_as"] == "claude-sonnet-4-5"
    # 750k uncached × $3 + 250k cached × $0.30 + 1M output × $15 = $17.325
    assert coverage["estimated_cost_usd"] == 17.325


def test_pricing_coverage_marks_internal_estimates(tmp_path: Path) -> None:
    pricing_path = tmp_path / "pricing.json"
    update_pricing_from_openai_docs(
        pricing_path,
        fetch_text=lambda url: OPENAI_PRICING_FIXTURE,
    )
    coverage = summarize_pricing_coverage(
        [
            {
                "group_key": "codex-auto-review",
                "total_tokens": 2_000_000,
                "input_tokens": 1_000_000,
                "cached_input_tokens": 500_000,
                "uncached_input_tokens": 500_000,
                "output_tokens": 1_000_000,
            },
            {
                "group_key": "gpt-5.3-codex-spark",
                "total_tokens": 2_000_000,
                "input_tokens": 1_000_000,
                "cached_input_tokens": 500_000,
                "uncached_input_tokens": 500_000,
                "output_tokens": 1_000_000,
            },
        ],
        pricing=load_pricing_config(pricing_path),
    )

    assert coverage["priced_model_count"] == 2
    assert coverage["estimated_cost_usd"] == 21.9
    assert all(row["pricing_estimated"] is True for row in coverage["rows"])
    assert {row["priced_as"] for row in coverage["rows"]} == {
        "codex-auto-review",
        "gpt-5.3-codex-spark",
    }
