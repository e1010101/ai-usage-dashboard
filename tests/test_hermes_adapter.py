from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from codex_usage_tracker.adapters.hermes_state_db import (
    HERMES_STATE_DB_DIAGNOSTIC_KEYS,
    HermesStateDbAdapter,
    compact_hermes_diagnostics,
)


def test_hermes_adapter_parses_session_aggregates_without_text(tmp_path: Path) -> None:
    hermes_home = _make_hermes_home(tmp_path)
    adapter = HermesStateDbAdapter()
    logs = adapter.discover_logs(hermes_home)

    stats: dict[str, int] = {}
    events = adapter.parse_file(logs[0], stats=stats)

    assert [path.name for path in logs] == ["state.db"]
    assert len(events) == 1
    event = events[0]
    assert event.source_provider == "deepseek"
    assert event.source_app == "hermes"
    assert event.source_format == "hermes-state-db-v1"
    assert event.session_id == "hermes-session-1"
    assert event.thread_name == "Hermes synthetic session"
    assert event.model == "deepseek-v4-pro"
    assert event.cwd == "C:\\synthetic\\project"
    assert event.thread_source == "telegram"
    assert event.effort == "xhigh"
    assert event.input_tokens == 890
    assert event.cached_input_tokens == 750
    assert event.cache_creation_input_tokens == 20
    assert event.uncached_input_tokens == 140
    assert event.output_tokens == 30
    assert event.reasoning_output_tokens == 7
    assert event.total_tokens == 920
    assert event.cumulative_total_tokens == 920
    assert event.event_timestamp == "2026-07-03T12:30:00Z"
    assert "SECRET HERMES TEXT" not in json.dumps([item.to_row() for item in events])
    assert compact_hermes_diagnostics(stats) == {}
    assert HERMES_STATE_DB_DIAGNOSTIC_KEYS[-1] == "skipped_events"


def test_hermes_adapter_reports_missing_sessions_table(tmp_path: Path) -> None:
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    db_path = hermes_home / "state.db"
    sqlite3.connect(db_path).close()
    adapter = HermesStateDbAdapter()
    stats: dict[str, int] = {}

    events = adapter.parse_file(db_path, stats=stats)

    assert events == []
    assert stats["missing_sessions_table"] == 1
    assert stats["skipped_events"] == 1


def test_hermes_adapter_reports_invalid_reasoning_config_and_continues(tmp_path: Path) -> None:
    hermes_home = _make_hermes_home(tmp_path, model_config="{not json")
    adapter = HermesStateDbAdapter()
    stats: dict[str, int] = {}

    events = adapter.parse_file(hermes_home / "state.db", stats=stats)

    assert len(events) == 1
    assert events[0].effort is None
    assert stats["invalid_model_config"] == 1
    assert "skipped_events" not in stats


def test_hermes_adapter_maps_disabled_reasoning_to_off(tmp_path: Path) -> None:
    hermes_home = _make_hermes_home(
        tmp_path,
        model_config=json.dumps(
            {"reasoning_config": {"enabled": False, "effort": "xhigh"}},
            sort_keys=True,
        ),
    )
    adapter = HermesStateDbAdapter()

    events = adapter.parse_file(hermes_home / "state.db")

    assert events[0].effort == "off"


def _make_hermes_home(tmp_path: Path, *, model_config: str | None = None) -> Path:
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    db_path = hermes_home / "state.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                source TEXT,
                model TEXT,
                parent_session_id TEXT,
                started_at REAL,
                ended_at REAL,
                message_count INTEGER,
                tool_call_count INTEGER,
                input_tokens INTEGER,
                output_tokens INTEGER,
                cache_read_tokens INTEGER,
                cache_write_tokens INTEGER,
                reasoning_tokens INTEGER,
                cwd TEXT,
                git_branch TEXT,
                git_repo_root TEXT,
                billing_provider TEXT,
                billing_base_url TEXT,
                billing_mode TEXT,
                estimated_cost_usd REAL,
                cost_status TEXT,
                title TEXT,
                api_call_count INTEGER,
                model_config TEXT,
                system_prompt TEXT
            )
            """
        )
        conn.execute(
            """
            INSERT INTO sessions (
                id,
                source,
                model,
                parent_session_id,
                started_at,
                ended_at,
                message_count,
                tool_call_count,
                input_tokens,
                output_tokens,
                cache_read_tokens,
                cache_write_tokens,
                reasoning_tokens,
                cwd,
                git_branch,
                git_repo_root,
                billing_provider,
                billing_base_url,
                billing_mode,
                estimated_cost_usd,
                cost_status,
                title,
                api_call_count,
                model_config,
                system_prompt
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "hermes-session-1",
                "telegram",
                "deepseek/deepseek-v4-pro",
                None,
                1783080000.0,
                1783081800.0,
                10,
                4,
                120,
                30,
                750,
                20,
                7,
                "C:\\synthetic\\project",
                "main",
                "C:\\synthetic\\project",
                "deepseek",
                "https://api.deepseek.com/v1",
                "chat_completions",
                0.123,
                "estimated",
                "Hermes synthetic session",
                3,
                model_config
                or json.dumps(
                    {
                        "max_iterations": 10,
                        "max_tokens": 1000,
                        "reasoning_config": {"enabled": True, "effort": "xhigh"},
                    },
                    sort_keys=True,
                ),
                "SECRET HERMES TEXT",
            ),
        )
    return hermes_home
