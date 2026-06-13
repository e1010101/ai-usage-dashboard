"""Tests for the provider limit-snapshot history used by burn-down analytics."""

from __future__ import annotations

import json
from pathlib import Path

from codex_usage_tracker.allowance import AllowanceWindow
from codex_usage_tracker.dynamic_allowance import write_claude_statusline_snapshot
from codex_usage_tracker.limit_history import (
    LIMIT_HISTORY_SCHEMA,
    load_limit_history,
    record_limit_history,
)


def _window(percent: float, *, key: str = "five_hour", reset_at: str | None = None) -> AllowanceWindow:
    return AllowanceWindow(
        key=key,
        label="5h" if key == "five_hour" else "Weekly",
        remaining_percent=percent,
        reset_at=reset_at,
    )


def test_record_limit_history_appends_and_roundtrips(tmp_path: Path) -> None:
    path = tmp_path / "limit-history.json"

    record_limit_history(
        "openai",
        [_window(0.8, reset_at="2026-06-13T05:00:00Z")],
        captured_at="2026-06-13T00:00:00Z",
        path=path,
    )
    record_limit_history(
        "openai",
        [_window(0.7, reset_at="2026-06-13T05:00:00Z")],
        captured_at="2026-06-13T01:00:00Z",
        path=path,
    )

    raw = json.loads(path.read_text(encoding="utf-8"))
    entries = load_limit_history(path)

    assert raw["schema"] == LIMIT_HISTORY_SCHEMA
    assert len(entries) == 2
    assert entries[0]["captured_at"] == "2026-06-13T00:00:00Z"
    assert entries[1]["windows"][0]["remaining_percent"] == 0.7
    assert entries[1]["windows"][0]["reset_at"] == "2026-06-13T05:00:00Z"


def test_record_limit_history_skips_consecutive_duplicates(tmp_path: Path) -> None:
    path = tmp_path / "limit-history.json"

    for captured_at in ("2026-06-13T00:00:00Z", "2026-06-13T00:05:00Z"):
        record_limit_history(
            "anthropic",
            [_window(0.5, reset_at="2026-06-13T05:00:00Z")],
            captured_at=captured_at,
            path=path,
        )

    assert len(load_limit_history(path)) == 1

    # A different provider with the same window values is still recorded.
    record_limit_history(
        "openai",
        [_window(0.5, reset_at="2026-06-13T05:00:00Z")],
        captured_at="2026-06-13T00:06:00Z",
        path=path,
    )
    assert len(load_limit_history(path)) == 2


def test_record_limit_history_caps_entries(tmp_path: Path) -> None:
    path = tmp_path / "limit-history.json"

    for index in range(6):
        record_limit_history(
            "openai",
            [_window(round(1 - index * 0.1, 2))],
            captured_at=f"2026-06-13T0{index}:00:00Z",
            path=path,
            max_entries=4,
        )

    entries = load_limit_history(path)
    assert len(entries) == 4
    assert entries[0]["captured_at"] == "2026-06-13T02:00:00Z"
    assert entries[-1]["captured_at"] == "2026-06-13T05:00:00Z"


def test_record_limit_history_ignores_windows_without_percent(tmp_path: Path) -> None:
    path = tmp_path / "limit-history.json"

    result = record_limit_history(
        "openai",
        [AllowanceWindow(key="five_hour", label="5h", total_credits=300.0)],
        captured_at="2026-06-13T00:00:00Z",
        path=path,
    )

    assert result is None
    assert not path.exists()


def test_load_limit_history_trims_to_max_entries(tmp_path: Path) -> None:
    path = tmp_path / "limit-history.json"
    for index in range(5):
        record_limit_history(
            "openai",
            [_window(round(1 - index * 0.1, 2))],
            captured_at=f"2026-06-13T0{index}:00:00Z",
            path=path,
        )

    trimmed = load_limit_history(path, max_entries=2)
    assert len(trimmed) == 2
    assert trimmed[-1]["captured_at"] == "2026-06-13T04:00:00Z"


def test_claude_statusline_snapshot_records_limit_history(tmp_path: Path) -> None:
    limits_path = tmp_path / "claude-limits.json"

    write_claude_statusline_snapshot(
        {
            "session_id": "claude-session-1",
            "rate_limits": {
                "five_hour": {"used_percentage": 25, "resets_at": 1774686045},
                "seven_day": {"used_percentage": 60, "resets_at": 1775000000},
            },
        },
        path=limits_path,
        captured_at="2026-06-13T00:00:00Z",
    )

    history = load_limit_history(tmp_path / "limit-history.json")
    assert len(history) == 1
    entry = history[0]
    assert entry["provider"] == "anthropic"
    assert entry["captured_at"] == "2026-06-13T00:00:00Z"
    keys = {window["key"]: window for window in entry["windows"]}
    assert keys["five_hour"]["remaining_percent"] == 0.75
    assert keys["weekly"]["remaining_percent"] == 0.4
