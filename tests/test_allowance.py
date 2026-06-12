from __future__ import annotations

import json
from pathlib import Path

from codex_usage_tracker.allowance import (
    AllowanceWindow,
    annotate_rows_with_allowance,
    load_allowance_config,
    parse_allowance_text,
    summarize_allowance_usage,
    update_rate_card,
    write_allowance_from_text,
    write_allowance_template,
)
from codex_usage_tracker.dynamic_allowance import (
    load_dynamic_claude_limit_snapshot,
    load_dynamic_codex_allowance_snapshot,
    parse_claude_rate_limit_windows,
    parse_codex_rate_limit_windows,
    write_claude_statusline_snapshot,
)


def test_allowance_estimates_exact_codex_credit_usage() -> None:
    rows = annotate_rows_with_allowance(
        [
            {
                "model": "gpt-5.5",
                "input_tokens": 1000,
                "cached_input_tokens": 200,
                "uncached_input_tokens": 800,
                "output_tokens": 100,
                "total_tokens": 1100,
            }
        ]
    )

    assert rows[0]["usage_credit_model"] == "gpt-5.5"
    assert rows[0]["usage_credit_confidence"] == "exact"
    assert rows[0]["usage_credit_source_url"] == "https://help.openai.com/en/articles/20001106-codex-rate-card"
    assert rows[0]["usage_credit_fetched_at"] == "2026-06-03"
    assert rows[0]["usage_credit_tier"] == "standard"
    assert rows[0]["usage_credits"] == 0.1775


def test_allowance_marks_inferred_auto_review_mapping() -> None:
    rows = annotate_rows_with_allowance(
        [
            {
                "model": "codex-auto-review",
                "input_tokens": 1000,
                "cached_input_tokens": 500,
                "uncached_input_tokens": 500,
                "output_tokens": 100,
                "total_tokens": 1100,
            }
        ]
    )

    assert rows[0]["usage_credit_model"] == "gpt-5.3-codex"
    assert rows[0]["usage_credit_confidence"] == "estimated"
    assert rows[0]["usage_credit_source_url"] == "https://help.openai.com/en/articles/20001106-codex-rate-card"
    assert rows[0]["usage_credits"] == 0.0590625


def test_allowance_does_not_apply_codex_credits_to_claude_rows() -> None:
    config = load_allowance_config(Path("missing-allowance.json"))
    rows = [
        {
            "source_provider": "anthropic",
            "source_app": "claude-code",
            "model": "gpt-5.3-codex",
            "input_tokens": 100,
            "cached_input_tokens": 0,
            "uncached_input_tokens": 100,
            "output_tokens": 20,
            "total_tokens": 120,
        }
    ]

    annotated = annotate_rows_with_allowance(rows, config)

    assert annotated[0]["usage_credits"] is None
    assert annotated[0]["usage_credit_confidence"] == "not_applicable"
    assert "only apply to Codex" in annotated[0]["usage_credit_note"]


def test_allowance_config_loads_windows_and_local_aliases(tmp_path: Path) -> None:
    path = tmp_path / "allowance.json"
    path.write_text(
        json.dumps(
            {
                "windows": {
                    "five_hour": {
                        "label": "5h",
                        "remaining_percent": 79,
                        "reset_at": "2026-06-03T18:50:00-04:00",
                    }
                },
                "aliases": {
                    "local-codex": {
                        "model": "gpt-5.4-mini",
                        "confidence": "estimated",
                        "note": "Local test alias.",
                    }
                },
            }
        ),
        encoding="utf-8",
    )

    config = load_allowance_config(path)
    rows = annotate_rows_with_allowance(
        [
            {
                "model": "local-codex",
                "input_tokens": 1000,
                "cached_input_tokens": 0,
                "uncached_input_tokens": 1000,
                "output_tokens": 100,
                "total_tokens": 1100,
            }
        ],
        config,
    )

    assert config.loaded is True
    assert config.windows[0].remaining_percent == 0.79
    assert config.windows[0].reset_at == "2026-06-03T18:50:00-04:00"
    assert rows[0]["usage_credit_model"] == "gpt-5.4-mini"
    assert rows[0]["usage_credit_note"] == "Local test alias."


def test_load_allowance_config_uses_dynamic_windows_when_manual_missing(
    tmp_path: Path,
) -> None:
    config = load_allowance_config(
        tmp_path / "missing-allowance.json",
        dynamic_windows=[
            AllowanceWindow(
                key="five_hour",
                label="5h",
                remaining_percent=0.6,
                captured_at="2026-06-09T02:00:00Z",
            )
        ],
        dynamic_source={"name": "Local Codex rate-limit snapshot"},
    )

    assert config.loaded is True
    assert config.windows[0].remaining_percent == 0.6
    assert config.window_source["name"] == "Local Codex rate-limit snapshot"


def test_load_allowance_config_manual_window_overrides_dynamic_window(
    tmp_path: Path,
) -> None:
    path = tmp_path / "allowance.json"
    path.write_text(
        json.dumps(
            {
                "_source": {"name": "Pasted Codex usage text"},
                "windows": [
                    {
                        "key": "five_hour",
                        "label": "5h",
                        "remaining_percent": 0.79,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    config = load_allowance_config(
        path,
        dynamic_windows=[
            AllowanceWindow(key="five_hour", label="5h", remaining_percent=0.6),
            AllowanceWindow(key="weekly", label="Weekly", remaining_percent=0.9),
        ],
        dynamic_source={"name": "Local Codex rate-limit snapshot"},
    )

    assert [(window.key, window.remaining_percent) for window in config.windows] == [
        ("five_hour", 0.79),
        ("weekly", 0.9),
    ]
    assert config.window_source["name"] == "Local allowance config with dynamic Codex fallback"


def test_load_allowance_config_dynamic_fills_empty_manual_window(
    tmp_path: Path,
) -> None:
    path = tmp_path / "allowance.json"
    path.write_text(
        json.dumps(
            {
                "windows": [
                    {
                        "key": "five_hour",
                        "label": "5h",
                        "remaining_percent": None,
                        "remaining_credits": None,
                        "total_credits": None,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    config = load_allowance_config(
        path,
        dynamic_windows=[
            AllowanceWindow(key="five_hour", label="5h", remaining_percent=0.6),
        ],
        dynamic_source={"name": "Local Codex rate-limit snapshot"},
    )

    assert [(window.key, window.remaining_percent) for window in config.windows] == [
        ("five_hour", 0.6),
    ]


def test_allowance_summary_exposes_window_source(tmp_path: Path) -> None:
    config = load_allowance_config(
        tmp_path / "missing-allowance.json",
        dynamic_windows=[
            AllowanceWindow(key="weekly", label="Weekly", remaining_percent=0.9),
        ],
        dynamic_source={"name": "Local Codex rate-limit snapshot"},
    )

    summary = summarize_allowance_usage([], config)

    assert summary["window_source"] == config.window_source


def test_allowance_marks_local_credit_rate_override(tmp_path: Path) -> None:
    path = tmp_path / "allowance.json"
    path.write_text(
        json.dumps(
            {
                "credit_rates": {
                    "local-codex": {
                        "input_per_million": 10,
                        "cached_input_per_million": 1,
                        "output_per_million": 20,
                    }
                }
            }
        ),
        encoding="utf-8",
    )

    rows = annotate_rows_with_allowance(
        [
            {
                "model": "local-codex",
                "input_tokens": 1000,
                "cached_input_tokens": 0,
                "uncached_input_tokens": 1000,
                "output_tokens": 100,
                "total_tokens": 1100,
            }
        ],
        load_allowance_config(path),
    )

    assert rows[0]["usage_credit_confidence"] == "user_override"
    assert rows[0]["usage_credit_source"] == "Local allowance override"


def test_parse_codex_rate_limits_builds_allowance_windows() -> None:
    windows = parse_codex_rate_limit_windows(
        {
            "limit_id": "codex",
            "primary": {
                "used_percent": 25,
                "window_minutes": 300,
                "resets_at": 1774686045,
            },
            "secondary": {
                "used_percent": 4,
                "window_minutes": 10080,
                "resets_at": 1775186466,
            },
        },
        event_timestamp="2026-06-09T00:00:00Z",
    )

    assert [(window.key, window.label) for window in windows] == [
        ("five_hour", "5h"),
        ("weekly", "Weekly"),
    ]
    assert windows[0].remaining_percent == 0.75
    assert windows[1].remaining_percent == 0.96
    assert windows[0].captured_at == "2026-06-09T00:00:00Z"
    assert windows[0].reset_at.endswith("Z")


def test_parse_codex_rate_limits_ignores_model_specific_limits() -> None:
    windows = parse_codex_rate_limit_windows(
        {
            "limit_id": "codex_bengalfox",
            "primary": {
                "used_percent": 25,
                "window_minutes": 300,
            },
        },
        event_timestamp="2026-06-09T00:00:00Z",
    )

    assert windows == []


def test_parse_codex_rate_limits_ignores_malformed_numeric_fields() -> None:
    windows = parse_codex_rate_limit_windows(
        {
            "limit_id": "codex",
            "primary": {
                "used_percent": "not-a-number",
                "window_minutes": "not-a-number",
            },
            "secondary": {
                "used_percent": 4,
                "window_minutes": 10080,
            },
        },
        event_timestamp="2026-06-09T00:00:00Z",
    )

    assert [(window.key, window.label) for window in windows] == [("weekly", "Weekly")]
    assert windows[0].remaining_percent == 0.96


def test_load_dynamic_codex_allowance_snapshot_uses_latest_snapshot(tmp_path: Path) -> None:
    codex_home = tmp_path / ".codex"
    log_dir = codex_home / "sessions" / "2026" / "06" / "09"
    log_dir.mkdir(parents=True)
    log_path = log_dir / "session.jsonl"
    log_path.write_text(
        "\n".join(
            [
                json.dumps(
                    {
                        "timestamp": "2026-06-09T01:00:00Z",
                        "type": "event_msg",
                        "payload": {
                            "type": "token_count",
                            "rate_limits": {
                                "limit_id": "codex",
                                "primary": {
                                    "used_percent": 25,
                                    "window_minutes": 300,
                                },
                            },
                        },
                    }
                ),
                json.dumps(
                    {
                        "timestamp": "2026-06-09T02:00:00Z",
                        "type": "event_msg",
                        "payload": {
                            "type": "token_count",
                            "rate_limits": {
                                "limit_id": "codex",
                                "primary": {
                                    "used_percent": 40,
                                    "window_minutes": 300,
                                },
                                "secondary": {
                                    "used_percent": 10,
                                    "window_minutes": 10080,
                                },
                            },
                        },
                    }
                ),
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    snapshot = load_dynamic_codex_allowance_snapshot(codex_home)

    assert snapshot.windows[0].remaining_percent == 0.6
    assert snapshot.windows[1].remaining_percent == 0.9
    assert snapshot.source["name"] == "Local Codex rate-limit snapshot"
    assert snapshot.source["captured_at"] == "2026-06-09T02:00:00Z"


def test_parse_claude_rate_limits_builds_provider_windows() -> None:
    windows = parse_claude_rate_limit_windows(
        {
            "five_hour": {
                "used_percentage": 76,
                "resets_at": 1774686045,
            },
            "seven_day": {
                "used_percentage": 4,
                "resets_at": 1775186466,
            },
        },
        event_timestamp="2026-06-11T00:00:00Z",
    )

    assert [(window.key, window.label) for window in windows] == [
        ("five_hour", "5h"),
        ("weekly", "7d"),
    ]
    assert windows[0].remaining_percent == 0.24
    assert windows[1].remaining_percent == 0.96
    assert windows[0].captured_at == "2026-06-11T00:00:00Z"
    assert windows[0].reset_at.endswith("Z")


def test_claude_statusline_snapshot_round_trips_sanitized_limits(tmp_path: Path) -> None:
    path = tmp_path / "claude-limits.json"

    write_claude_statusline_snapshot(
        {
            "session_id": "claude-session-1",
            "transcript_path": "/tmp/secret-transcript.jsonl",
            "model": {"id": "claude-sonnet-4-20250514"},
            "rate_limits": {
                "five_hour": {"used_percentage": 25, "resets_at": 1774686045},
                "seven_day": {"used_percentage": 10, "resets_at": 1775186466},
            },
        },
        path=path,
        captured_at="2026-06-11T00:00:00Z",
    )

    raw = json.loads(path.read_text(encoding="utf-8"))
    snapshot = load_dynamic_claude_limit_snapshot(path)

    assert raw["schema"] == "codex-usage-tracker-claude-limits-v1"
    assert "transcript_path" not in json.dumps(raw)
    assert snapshot.windows[0].remaining_percent == 0.75
    assert snapshot.windows[1].remaining_percent == 0.9
    assert snapshot.source["name"] == "Local Claude Code status-line snapshot"
    assert snapshot.source["captured_at"] == "2026-06-11T00:00:00Z"


def test_claude_statusline_snapshot_records_session_effort_meta(tmp_path: Path) -> None:
    from codex_usage_tracker.dynamic_allowance import load_claude_session_meta

    path = tmp_path / "claude-limits.json"

    write_claude_statusline_snapshot(
        {
            "session_id": "claude-session-1",
            "effort": {"level": "xhigh"},
            "model": {"id": "claude-fable-5"},
            "rate_limits": {
                "five_hour": {"used_percentage": 25, "resets_at": 1774686045},
            },
        },
        path=path,
        captured_at="2026-06-12T00:00:00Z",
    )

    meta_path = tmp_path / "claude-session-meta.json"
    raw = json.loads(meta_path.read_text(encoding="utf-8"))
    sessions = load_claude_session_meta(meta_path)

    assert raw["schema"] == "codex-usage-tracker-claude-session-meta-v1"
    assert sessions["claude-session-1"]["effort"] == "xhigh"
    assert sessions["claude-session-1"]["model"] == "claude-fable-5"
    assert sessions["claude-session-1"]["captured_at"] == "2026-06-12T00:00:00Z"


def test_update_claude_session_meta_merges_and_skips_blank_payloads(tmp_path: Path) -> None:
    from codex_usage_tracker.dynamic_allowance import (
        load_claude_session_meta,
        update_claude_session_meta,
    )

    path = tmp_path / "claude-session-meta.json"

    first = update_claude_session_meta(
        {"session_id": "session-a", "effort": {"level": "high"}},
        path=path,
        captured_at="2026-06-12T00:00:00Z",
    )
    second = update_claude_session_meta(
        {"session_id": "session-b", "model": {"id": "claude-fable-5"}},
        path=path,
        captured_at="2026-06-12T00:01:00Z",
    )
    skipped_no_session = update_claude_session_meta(
        {"effort": {"level": "high"}}, path=path
    )
    skipped_no_fields = update_claude_session_meta(
        {"session_id": "session-c"}, path=path
    )
    sessions = load_claude_session_meta(path)

    assert first == path
    assert second == path
    assert skipped_no_session is None
    assert skipped_no_fields is None
    assert sessions["session-a"]["effort"] == "high"
    assert sessions["session-b"]["model"] == "claude-fable-5"
    assert "session-c" not in sessions


def test_parse_allowance_text_reads_status_percentages() -> None:
    windows = parse_allowance_text(
        """
        Usage remaining
        5h 79% 6:50 PM
        Weekly 33% Jun 7
        Upgrade for more usage
        """,
        captured_at="2026-06-05T12:00:00Z",
    )

    assert [(window.key, window.remaining_percent, window.reset_at) for window in windows] == [
        ("five_hour", 0.79, "6:50 PM"),
        ("weekly", 0.33, "Jun 7"),
    ]
    assert windows[0].captured_at == "2026-06-05T12:00:00Z"


def test_write_allowance_from_text_preserves_local_overrides(tmp_path: Path) -> None:
    path = tmp_path / "allowance.json"
    path.write_text(
        json.dumps({"credit_rates": {"local-codex": {"input_per_million": 1, "cached_input_per_million": 1, "output_per_million": 1}}}),
        encoding="utf-8",
    )

    write_allowance_from_text(
        "5h 79% 6:50 PM\nWeekly 33% Jun 7",
        path=path,
        captured_at="2026-06-05T12:00:00Z",
    )

    raw = json.loads(path.read_text(encoding="utf-8"))
    assert raw["credit_rates"]["local-codex"]["input_per_million"] == 1
    assert raw["windows"][0]["remaining_percent"] == 0.79
    assert raw["_source"]["exact_allowance_source"] is False


def test_update_rate_card_writes_bundled_snapshot(tmp_path: Path) -> None:
    path = tmp_path / "rate-card.json"

    result = update_rate_card(path)
    raw = json.loads(path.read_text(encoding="utf-8"))
    config = load_allowance_config(tmp_path / "missing-allowance.json", rate_card_path=path)

    assert result.model_count == 5
    assert result.alias_count == 1
    assert raw["schema"] == "codex-usage-tracker-codex-rate-card-v1"
    assert config.rate_card_loaded is True
    assert config.source["fetched_at"] == "2026-06-03"


def test_write_allowance_template_refuses_to_overwrite(tmp_path: Path) -> None:
    path = write_allowance_template(tmp_path / "allowance.json")

    try:
        write_allowance_template(path)
    except FileExistsError as exc:
        assert "Allowance config already exists" in str(exc)
    else:
        raise AssertionError("expected FileExistsError")
