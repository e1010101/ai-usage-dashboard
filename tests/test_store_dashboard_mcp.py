from __future__ import annotations

import json
import sqlite3
import sys
import threading
import urllib.error
import urllib.request
from dataclasses import replace
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from test_hermes_adapter import _make_hermes_home

import codex_usage_tracker.dashboard as dashboard_module
from codex_usage_tracker.context import load_call_context
from codex_usage_tracker.dashboard import (
    dashboard_payload,
    dashboard_record_payload,
    generate_dashboard,
)
from codex_usage_tracker.diagnostics import run_doctor
from codex_usage_tracker.dynamic_allowance import write_claude_statusline_snapshot
from codex_usage_tracker.json_contracts import validate_json_payload_contract
from codex_usage_tracker.models import UsageEvent
from codex_usage_tracker.pricing import (
    PricingUpdateResult,
    annotate_rows_with_efficiency,
    load_pricing_config,
)
from codex_usage_tracker.store import (
    EVENT_COLUMNS,
    connect,
    export_usage_csv,
    init_db,
    query_dashboard_event_count,
    query_dashboard_events,
    query_most_expensive_calls,
    query_session_usage,
    query_summary,
    query_thread_session_groups,
    query_usage_rollups,
    rebuild_usage_index,
    refresh_metadata,
    refresh_usage_index,
    schema_state,
    upsert_usage_events,
)

SESSION_ID = "019e374d-c19f-7da3-a44f-8de043a7a64e"
SECOND_SESSION_ID = "019e37d4-c1f1-71aa-b154-2d5d837af92c"
AUTO_REVIEW_SESSION_ID = "019e37d5-01fd-71df-87f4-ae3e8d60df7a"
ARCHIVED_SESSION_ID = "019e37d5-bb36-76ba-aa33-ed0beaf4f9ce"


def test_refresh_is_idempotent_and_summary_works(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"

    first = refresh_usage_index(codex_home=codex_home, db_path=db_path)
    second = refresh_usage_index(codex_home=codex_home, db_path=db_path)
    session_rows = query_session_usage(db_path=db_path, session_id=SESSION_ID)
    summary = query_summary(db_path=db_path, group_by="model")
    recent_summary = query_summary(db_path=db_path, group_by="model", since="2026-05-17")
    future_summary = query_summary(db_path=db_path, group_by="model", since="2099-01-01")
    subagent_summary = query_summary(db_path=db_path, group_by="agent_role")
    thread_summary = query_summary(db_path=db_path, group_by="thread")
    expensive = query_most_expensive_calls(db_path=db_path, limit=1)
    subagent_rows = query_session_usage(db_path=db_path, session_id=SECOND_SESSION_ID)

    assert first.parsed_events == 4
    assert second.parsed_events == 4
    assert first.skipped_events == 0
    assert len(session_rows) == 2
    assert summary[0]["group_key"] == "gpt-5.5"
    assert summary[0]["total_tokens"] == 350
    assert recent_summary[0]["total_tokens"] == 350
    assert future_summary == []
    assert {row["group_key"] for row in subagent_summary} >= {"test_runner", "not agent role"}
    assert thread_summary[0]["group_key"] == "Add Codex token tracking"
    assert thread_summary[0]["total_tokens"] == 350
    assert subagent_rows[0]["parent_thread_name"] == "Add Codex token tracking"
    assert subagent_rows[0]["parent_session_updated_at"] == "2026-05-17T18:58:27Z"
    assert expensive[0]["total_tokens"] == 200
    with connect(db_path) as conn:
        init_db(conn)
        meta = {
            row["key"]: row["value"]
            for row in conn.execute("SELECT key, value FROM refresh_meta").fetchall()
        }
    assert meta["parsed_events"] == "4"
    assert meta["skipped_events"] == "0"
    assert meta["inserted_or_updated_events"] == "4"
    assert meta["parser_adapter"] == "codex-jsonl-v1"
    assert meta["schema_version"] == "3"
    assert meta["parser_skipped_events"] == "0"
    state = schema_state(db_path)
    assert state["schema_version"] == 3
    assert state["checksum_matches"] is True
    assert [row["version"] for row in state["migrations"]] == [1, 2, 3]


def test_refresh_all_indexes_codex_and_claude_sources(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    claude_home = _make_claude_home(tmp_path)
    hermes_home = _make_hermes_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"

    result = refresh_usage_index(
        codex_home=codex_home,
        claude_home=claude_home,
        hermes_home=hermes_home,
        db_path=db_path,
        source="all",
    )
    second = refresh_usage_index(
        codex_home=codex_home,
        claude_home=claude_home,
        hermes_home=hermes_home,
        db_path=db_path,
        source="all",
    )
    rows = query_dashboard_events(db_path=db_path, limit=0, include_archived=True)

    assert result.source_results["codex"]["parsed_events"] == 4
    assert result.source_results["claude-code"]["parsed_events"] == 2
    assert result.source_results["hermes"]["parsed_events"] == 1
    assert result.source_results["hermes"]["source_provider"] == "deepseek"
    assert result.parsed_events == 7
    assert second.inserted_or_updated_events == 7
    assert {row["source_app"] for row in rows} == {"codex", "claude-code", "hermes"}


def test_refresh_hermes_source_indexes_deepseek_sessions(tmp_path: Path) -> None:
    hermes_home = _make_hermes_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"

    result = refresh_usage_index(
        hermes_home=hermes_home,
        db_path=db_path,
        source="hermes",
    )
    rows = query_dashboard_events(db_path=db_path, limit=0, include_archived=True)

    assert result.scanned_files == 1
    assert result.parsed_events == 1
    assert result.source_results["hermes"]["source_app"] == "hermes"
    assert rows[0]["source_provider"] == "deepseek"
    assert rows[0]["source_app"] == "hermes"
    assert rows[0]["model"] == "deepseek-v4-pro"
    assert rows[0]["effort"] == "xhigh"
    assert rows[0]["total_tokens"] == 920
    assert query_dashboard_event_count(
        db_path=db_path,
        source_provider="deepseek",
        effort="xhigh",
    ) == 1


def test_provider_and_app_filters_work_for_dashboard_queries(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    claude_home = _make_claude_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"

    refresh_usage_index(
        codex_home=codex_home,
        claude_home=claude_home,
        hermes_home=tmp_path / ".hermes",
        db_path=db_path,
        source="all",
    )

    anthropic_rows = query_dashboard_events(
        db_path=db_path,
        limit=0,
        source_provider="anthropic",
    )
    claude_rows = query_dashboard_events(
        db_path=db_path,
        limit=0,
        source_app="claude-code",
    )
    openai_count = query_dashboard_event_count(
        db_path=db_path,
        source_provider="openai",
    )
    app_summary = query_summary(db_path=db_path, group_by="source_app")

    assert len(anthropic_rows) == 2
    assert len(claude_rows) == 2
    assert openai_count == 4
    assert {row["group_key"] for row in app_summary} == {"codex", "claude-code"}


def test_dashboard_payload_source_summaries_include_sources_outside_loaded_rows(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "usage.sqlite3"
    codex_event = _synthetic_usage_event("codex-newer", "2026-06-15T12:00:00Z")
    claude_event = replace(
        _synthetic_usage_event("claude-older", "2026-06-13T12:00:00Z"),
        source_file="/tmp/synthetic/claude.jsonl",
        source_provider="anthropic",
        source_app="claude-code",
        source_format="claude-code-jsonl-v1",
        model="claude-sonnet-4-20250514",
        effort=None,
        model_context_window=None,
    )
    upsert_usage_events([codex_event, claude_event], db_path=db_path)

    payload = dashboard_payload(db_path=db_path, limit=1)

    assert [row["source_app"] for row in payload["rows"]] == ["codex"]
    assert {
        (summary["source_provider"], summary["source_app"])
        for summary in payload["source_summaries"]
    } == {("openai", "codex"), ("anthropic", "claude-code")}


def test_refresh_reports_skipped_corrupt_token_events(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    log_path = next((codex_home / "sessions").glob(f"**/*{SESSION_ID}.jsonl"))
    corrupt = _token_event(600, 300)
    corrupt["payload"]["info"]["last_token_usage"]["total_tokens"] = "bad-total"  # type: ignore[index]
    valid = _token_event(650, 50)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(corrupt) + "\n")
        handle.write(json.dumps(valid) + "\n")

    result = refresh_usage_index(codex_home=codex_home, db_path=db_path)
    rows = query_session_usage(db_path=db_path, session_id=SESSION_ID)

    assert result.skipped_events == 1
    assert result.parser_diagnostics["invalid_integer"] == 1
    assert refresh_metadata(db_path)["parser_invalid_integer"] == "1"
    assert result.parsed_events == 5
    assert [row["cumulative_total_tokens"] for row in rows] == [100, 300, 650]


def test_connect_sets_sqlite_concurrency_pragmas(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    with connect(db_path) as conn:
        init_db(conn)
        busy_timeout = conn.execute("PRAGMA busy_timeout").fetchone()[0]
        journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        user_version = conn.execute("PRAGMA user_version").fetchone()[0]

    assert busy_timeout == 5000
    assert str(journal_mode).lower() == "wal"
    assert user_version == 3


def test_init_db_repairs_version_zero_schema(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    raw = sqlite3.connect(db_path)
    try:
        raw.execute(
            """
            CREATE TABLE usage_events (
                record_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                event_timestamp TEXT NOT NULL,
                source_file TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                input_tokens INTEGER NOT NULL,
                cached_input_tokens INTEGER NOT NULL,
                output_tokens INTEGER NOT NULL,
                reasoning_output_tokens INTEGER NOT NULL,
                total_tokens INTEGER NOT NULL,
                cumulative_input_tokens INTEGER NOT NULL,
                cumulative_cached_input_tokens INTEGER NOT NULL,
                cumulative_output_tokens INTEGER NOT NULL,
                cumulative_reasoning_output_tokens INTEGER NOT NULL,
                cumulative_total_tokens INTEGER NOT NULL,
                uncached_input_tokens INTEGER NOT NULL,
                cache_ratio REAL NOT NULL,
                reasoning_output_ratio REAL NOT NULL,
                context_window_percent REAL NOT NULL
            )
            """
        )
        raw.commit()
    finally:
        raw.close()

    with connect(db_path) as conn:
        init_db(conn)
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(usage_events)").fetchall()
        }
        indexes = {
            row["name"]
            for row in conn.execute("PRAGMA index_list(usage_events)").fetchall()
        }
        user_version = conn.execute("PRAGMA user_version").fetchone()[0]
        migrations = [
            dict(row)
            for row in conn.execute(
                "SELECT version, name, checksum FROM schema_migrations ORDER BY version"
            ).fetchall()
        ]

    assert {"thread_source", "parent_thread_name", "parent_session_updated_at"} <= columns
    assert "idx_usage_timestamp" in indexes
    assert "idx_usage_parent_thread" in indexes
    assert "idx_usage_total_tokens" in indexes
    assert user_version == 3
    assert [row["version"] for row in migrations] == [1, 2, 3]


def test_init_db_backfills_provider_columns_for_existing_rows(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    raw = sqlite3.connect(db_path)
    try:
        raw.execute(
            """
            CREATE TABLE usage_events (
                record_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                thread_name TEXT,
                session_updated_at TEXT,
                event_timestamp TEXT NOT NULL,
                source_file TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                turn_id TEXT,
                turn_timestamp TEXT,
                cwd TEXT,
                model TEXT,
                effort TEXT,
                current_date TEXT,
                timezone TEXT,
                thread_source TEXT,
                subagent_type TEXT,
                agent_role TEXT,
                agent_nickname TEXT,
                parent_session_id TEXT,
                parent_thread_name TEXT,
                parent_session_updated_at TEXT,
                model_context_window INTEGER,
                input_tokens INTEGER NOT NULL,
                cached_input_tokens INTEGER NOT NULL,
                output_tokens INTEGER NOT NULL,
                reasoning_output_tokens INTEGER NOT NULL,
                total_tokens INTEGER NOT NULL,
                cumulative_input_tokens INTEGER NOT NULL,
                cumulative_cached_input_tokens INTEGER NOT NULL,
                cumulative_output_tokens INTEGER NOT NULL,
                cumulative_reasoning_output_tokens INTEGER NOT NULL,
                cumulative_total_tokens INTEGER NOT NULL,
                uncached_input_tokens INTEGER NOT NULL,
                cache_ratio REAL NOT NULL,
                reasoning_output_ratio REAL NOT NULL,
                context_window_percent REAL NOT NULL
            )
            """
        )
        raw.execute(
            """
            INSERT INTO usage_events (
                record_id, session_id, event_timestamp, source_file, line_number,
                input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens,
                total_tokens, cumulative_input_tokens, cumulative_cached_input_tokens,
                cumulative_output_tokens, cumulative_reasoning_output_tokens,
                cumulative_total_tokens, uncached_input_tokens, cache_ratio,
                reasoning_output_ratio, context_window_percent
            )
            VALUES (
                'legacy-record', 'session-a', '2026-05-17T18:58:27Z',
                '/tmp/log.jsonl', 1, 100, 20, 10, 0, 110, 100, 20, 10, 0,
                110, 80, 0.2, 0.0, 0.0
            )
            """
        )
        raw.commit()
    finally:
        raw.close()

    with connect(db_path) as conn:
        init_db(conn)
        row = conn.execute(
            "SELECT * FROM usage_events WHERE record_id = 'legacy-record'"
        ).fetchone()

    assert row["source_provider"] == "openai"
    assert row["source_app"] == "codex"
    assert row["source_format"] == "codex-jsonl-v1"
    assert row["provider_request_id"] is None
    assert row["cache_creation_input_tokens"] == 0


def test_rebuild_index_clears_aggregate_rows_before_rescan(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)
    with connect(db_path) as conn:
        init_db(conn)
        conn.execute("INSERT INTO refresh_meta (key, value) VALUES ('stale', 'yes')")
        conn.execute("DELETE FROM usage_events")

    result = rebuild_usage_index(codex_home=codex_home, db_path=db_path)

    assert result.parsed_events == 4
    assert query_dashboard_event_count(db_path=db_path) == 4
    assert "stale" not in refresh_metadata(db_path)


def test_dashboard_event_query_uses_sql_prefilters(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)

    model_rows = query_dashboard_events(db_path=db_path, limit=0, model="codex-auto-review")
    effort_rows = query_dashboard_events(db_path=db_path, limit=0, effort="xhigh")
    token_rows = query_dashboard_events(db_path=db_path, limit=0, min_tokens=100)
    thread_rows = query_dashboard_events(
        db_path=db_path,
        limit=0,
        thread="Add Codex token tracking",
    )
    offset_rows = query_dashboard_events(db_path=db_path, limit=2, offset=2)
    session_rows = query_dashboard_events(db_path=db_path, limit=0, thread=SESSION_ID)
    since_rows = query_dashboard_events(db_path=db_path, limit=0, since="2026-05-17")
    future_rows = query_dashboard_events(db_path=db_path, limit=0, until="2000-01-01")

    assert len(model_rows) == 1
    assert model_rows[0]["model"] == "codex-auto-review"
    assert {row["effort"] for row in effort_rows} == {"xhigh"}
    assert {row["total_tokens"] for row in token_rows} == {100, 200}
    assert {row["session_id"] for row in thread_rows} >= {SESSION_ID, SECOND_SESSION_ID}
    assert len(offset_rows) == 2
    assert {row["record_id"] for row in offset_rows}.isdisjoint(
        {row["record_id"] for row in query_dashboard_events(db_path=db_path, limit=2)}
    )
    assert {row["session_id"] for row in session_rows} == {SESSION_ID}
    assert len(since_rows) == 4
    assert future_rows == []


def test_large_history_query_prefilter_uses_sql_indexes(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    events = [
        UsageEvent(
            record_id=f"record-{index}",
            session_id=f"session-{index % 100}",
            thread_name=f"Thread {index % 25}",
            session_updated_at="2026-05-17T18:58:27Z",
            event_timestamp=f"2026-05-{(index % 28) + 1:02d}T12:00:00Z",
            source_file=f"/tmp/synthetic/{index}.jsonl",
            line_number=index + 1,
            source_provider="openai",
            source_app="codex",
            source_format="codex-jsonl-v1",
            provider_request_id=None,
            turn_id=f"turn-{index}",
            turn_timestamp=f"2026-05-{(index % 28) + 1:02d}T12:00:00Z",
            cwd=f"/tmp/project-{index % 10}",
            model="gpt-5.5" if index % 2 == 0 else "codex-auto-review",
            effort="high" if index % 3 == 0 else "low",
            current_date="2026-05-17",
            timezone="UTC",
            thread_source="user",
            subagent_type=None,
            agent_role=None,
            agent_nickname=None,
            parent_session_id=None,
            parent_thread_name=None,
            parent_session_updated_at=None,
            model_context_window=200000,
            cache_creation_input_tokens=0,
            input_tokens=1000 + index,
            cached_input_tokens=200,
            output_tokens=100,
            reasoning_output_tokens=10,
            total_tokens=1100 + index,
            cumulative_input_tokens=1000 + index,
            cumulative_cached_input_tokens=200,
            cumulative_output_tokens=100,
            cumulative_reasoning_output_tokens=10,
            cumulative_total_tokens=1100 + index,
        )
        for index in range(10_000)
    ]
    upsert_usage_events(events, db_path=db_path)

    rows = query_dashboard_events(
        db_path=db_path,
        limit=25,
        model="gpt-5.5",
        effort="high",
        min_tokens=9000,
    )
    with connect(db_path) as conn:
        init_db(conn)
        plan = " ".join(
            str(row["detail"])
            for row in conn.execute(
                """
                EXPLAIN QUERY PLAN
                SELECT *
                FROM usage_events
                WHERE model = ? AND effort = ? AND total_tokens >= ?
                """,
                ("gpt-5.5", "high", 9000),
            )
        )

    assert len(rows) == 25
    assert all(row["model"] == "gpt-5.5" for row in rows)
    assert all(row["effort"] == "high" for row in rows)
    assert all(row["total_tokens"] >= 9000 for row in rows)
    assert "idx_usage_model_effort" in plan


def test_dashboard_and_csv_are_aggregate_only(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    refresh_usage_index(codex_home=codex_home, db_path=db_path)
    dashboard_path = tmp_path / "dashboard.html"
    csv_path = tmp_path / "usage.csv"
    all_csv_path = tmp_path / "usage-all.csv"

    generate_dashboard(db_path=db_path, output_path=dashboard_path, pricing_path=pricing_path)
    exported = export_usage_csv(output_path=csv_path, db_path=db_path)
    exported_with_zero_limit = export_usage_csv(output_path=all_csv_path, db_path=db_path, limit=0)

    dashboard = dashboard_path.read_text(encoding="utf-8")
    asset_dir = tmp_path / "codex-usage-tracker-assets"
    dashboard_js = (asset_dir / "dashboard.js").read_text(encoding="utf-8")
    dashboard_format_js = (asset_dir / "dashboard_format.js").read_text(encoding="utf-8")
    dashboard_data_js = (asset_dir / "dashboard_data.js").read_text(encoding="utf-8")
    dashboard_state_js = (asset_dir / "dashboard_state.js").read_text(encoding="utf-8")
    dashboard_css = (asset_dir / "dashboard.css").read_text(encoding="utf-8")
    favicon_svg = asset_dir / "favicon.svg"
    dashboard_surface = "\n".join([
        dashboard,
        dashboard_format_js,
        dashboard_data_js,
        dashboard_js,
        dashboard_state_js,
        dashboard_css,
    ])
    csv_text = csv_path.read_text(encoding="utf-8")
    assert exported == 4
    assert exported_with_zero_limit == 4
    assert "SECRET RAW PROMPT" not in dashboard
    assert "SECRET RAW PROMPT" not in dashboard_js
    assert "SECRET RAW PROMPT" not in dashboard_css
    assert "SECRET RAW PROMPT" not in csv_text
    assert favicon_svg.exists()
    assert "<text" not in favicon_svg.read_text(encoding="utf-8")
    assert 'rel="icon" type="image/svg+xml"' in dashboard
    assert 'href="codex-usage-tracker-assets/favicon.svg?v=' in dashboard
    assert 'href="data:image/svg+xml,' not in dashboard
    assert 'href="data:,"' not in dashboard
    assert 'href="codex-usage-tracker-assets/dashboard.css?v=' in dashboard
    assert 'src="codex-usage-tracker-assets/dashboard_format.js?v=' in dashboard
    assert 'src="codex-usage-tracker-assets/dashboard_data.js?v=' in dashboard
    assert 'src="codex-usage-tracker-assets/dashboard_state.js?v=' in dashboard
    assert 'src="codex-usage-tracker-assets/dashboard.js?v=' in dashboard
    assert "CodexUsageDashboardFormat" in dashboard_format_js
    assert "CodexUsageDashboardData" in dashboard_data_js
    assert "CodexUsageDashboardState" in dashboard_state_js
    assert "currentDashboardState" in dashboard_js
    assert "last call" in dashboard_js.lower()
    assert "session cumulative" in dashboard_js.lower()
    assert "AI Usage Dashboard" in dashboard
    assert "source_provider" in dashboard
    assert "source_app" in dashboard
    assert "source_summaries" in dashboard
    assert "providerLimitSnapshots" in dashboard_js
    assert "cache read" in dashboard_js
    assert "direct input" in dashboard_js
    assert "source_app" in csv_text
    assert "cache_creation_input_tokens" in csv_text
    assert "estimated_cost_usd" in dashboard
    assert "pricing_snapshot" in dashboard
    assert "rates_fingerprint" in dashboard
    assert "usage_credits" in dashboard
    assert "parser_diagnostics" in dashboard
    assert "parserDiagnostics" in dashboard_js
    assert "privacy_mode" in dashboard
    assert 'id="privacyLine"' in dashboard
    assert "projectMetadataPrivacy" in dashboard_js
    assert "api_token" in dashboard
    assert "context_api_enabled" in dashboard
    assert "X-Codex-Usage-Token" in dashboard_js
    assert "contextApiEnabled" in dashboard_js
    assert "recommended_action" in dashboard
    assert "flag_explanations" in dashboard
    assert "action_recommendations" in dashboard
    assert "action_thresholds" in dashboard
    assert "project_name" in dashboard
    assert "usage_credit_confidence" in dashboard
    assert "usage_credit_confidence === 'not_applicable'" in dashboard_data_js
    assert "Not applicable" in dashboard_data_js
    assert "usage_credit_confidence === 'not_applicable'" in dashboard_js
    assert "n/a credits" in dashboard_js
    assert "codex credits" in dashboard_js
    assert "parent_thread_name" in dashboard
    assert "thread_attachment_label" in dashboard
    assert "thread_attachment_relation" in dashboard
    assert "explicit parent thread" in dashboard_surface
    assert "resolveThreadAttachment" in dashboard_js
    # Header: prompt echo, live chip, search, range presets, provider switcher, filters.
    assert "ai-usage-dashboard:~$" in dashboard
    assert 'id="promptEcho"' in dashboard
    assert "updatePromptLine" in dashboard_js
    assert 'id="liveChip"' in dashboard
    assert "[ unofficial project ]" in dashboard
    assert 'id="search"' in dashboard
    for preset in ("this-week", "last-7-days", "this-month", "last-30-days", "all", "custom"):
        assert f'data-range="{preset}"' in dashboard
    assert 'id="customStart"' in dashboard
    assert 'id="customEnd"' in dashboard
    assert '[ overview ]' in dashboard
    assert '[ codex ]' in dashboard
    assert '[ claude code ]' in dashboard
    assert 'data-provider="openai"' in dashboard
    assert 'data-provider="anthropic"' in dashboard
    assert 'id="filtersToggle"' in dashboard
    assert 'id="filtersPopover"' in dashboard
    assert "clear filters" in dashboard_js
    assert "thread type" in dashboard_js
    # Answer strip: hero, spend chart, limits remaining.
    assert ":: where did" in dashboard
    assert ":: limits remaining" in dashboard
    assert 'id="heroCost"' in dashboard
    assert 'id="heroSentence"' in dashboard
    assert 'id="chartBars"' in dashboard
    assert 'id="limitsGroups"' in dashboard
    assert "vs last period" in dashboard_js
    assert "spend by day" in dashboard_js
    assert "spend by week" in dashboard_js
    # Overview ledger + rail and calls view + rail.
    assert "where it went" in dashboard
    assert "model calls" in dashboard
    assert "call details" in dashboard
    assert 'id="ledgerRows"' in dashboard
    assert 'id="overviewRail"' in dashboard
    assert 'id="callRows"' in dashboard
    assert 'id="callRail"' in dashboard
    assert 'data-view="overview"' in dashboard
    assert 'data-view="calls"' in dashboard
    assert "needs attention" in dashboard_js
    assert "no usage in range" in dashboard_js
    assert "no calls in range" in dashboard_js
    assert "cache reuse" in dashboard_js
    assert "spawned · " in dashboard_js
    assert "auto-review" in dashboard_js
    assert 'data-sort-key="time"' in dashboard
    assert 'data-sort-key="tokens"' in dashboard
    assert 'data-sort-key="cost"' in dashboard
    assert 'data-sort-key="cache"' in dashboard
    assert "state.sortKey !== 'time'" in dashboard_state_js
    assert "range: ALLOWED_RANGES.has(range) ? range : 'this-week'" in dashboard_state_js
    # Retired chrome must stay gone.
    assert "providerTabs" not in dashboard
    assert "Investigation Presets" not in dashboard
    assert "Usage Analytics" not in dashboard
    assert "Provider Details" not in dashboard
    assert "Export CSV" not in dashboard
    assert "Copy link" not in dashboard
    assert 'id="datePreset"' not in dashboard
    assert "historyScope" not in dashboard
    assert "trendMetricTokens" not in dashboard
    assert "insightsView" not in dashboard
    # Terminal Sunset styling contract.
    assert "theme-sunset" in dashboard
    assert "--neon-pink" in dashboard_css
    assert "--border-interactive" in dashboard_css
    assert "--snap" in dashboard_css
    assert "color-scheme: dark" in dashboard_css
    assert "@media (max-width: 1180px)" in dashboard_css
    assert "@media (max-width: 640px)" in dashboard_css
    assert "scrollbar-width: thin" in dashboard_css
    # Offline guarantee: the stylesheet must never reference external resources.
    assert "url(" not in dashboard_css
    assert "@import" not in dashboard_css
    assert "http" not in dashboard_css
    # Reduced motion is mandatory, not best-effort.
    assert "@media (prefers-reduced-motion: reduce)" in dashboard_css
    # transition: all is banned repo-wide; every transition enumerates properties.
    assert "transition: all" not in dashboard_css
    assert "prefers-reduced-motion" in dashboard_js
    assert "sunset-pulse" in dashboard_js
    assert "Dashboard guide" in dashboard
    assert "github.com/douglasmonsky/codex-usage-tracker/blob/main/docs/dashboard-guide.md" not in dashboard
    assert "codex-usage-tracker-guide/dashboard-guide.html" in dashboard
    assert (tmp_path / "codex-usage-tracker-guide" / "dashboard-guide.html").exists()
    assert (tmp_path / "codex-usage-tracker-guide" / "assets" / "dashboard-calls.png").exists()
    assert (asset_dir / "dashboard.js").exists()
    assert (asset_dir / "dashboard_format.js").exists()
    assert (asset_dir / "dashboard_data.js").exists()
    assert (asset_dir / "dashboard_state.js").exists()
    assert (asset_dir / "dashboard.css").exists()
    assert "formatTimestamp" in dashboard_js
    assert "pricingSnapshotWarning" in dashboard_js
    assert "formatTimestamp(nextPayload.refreshed_at)" in dashboard_js
    assert "model-pill" in dashboard_surface
    assert "Live refresh every" in dashboard_js
    assert "Refreshing local usage index" in dashboard_js
    assert "loadLimit" not in dashboard
    assert "/api/usage" in dashboard_js
    assert "/api/usage-row" in dashboard_js
    assert "/api/context" in dashboard_js

    pricing_path.write_text(
        json.dumps(
            {
                "_source": {
                    "name": "Synthetic pricing",
                    "fetched_at": "2026-06-05T12:00:00Z",
                },
                "models": {
                    "gpt-5.5": {
                        "input_per_million": 3.0,
                        "cached_input_per_million": 0.75,
                        "output_per_million": 12.0,
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    generate_dashboard(db_path=db_path, output_path=dashboard_path, pricing_path=pricing_path)
    updated_dashboard = dashboard_path.read_text(encoding="utf-8")
    assert "Pricing snapshot changed since the previous dashboard render" in updated_dashboard


def test_generate_dashboard_reuses_assets_when_asset_directory_is_locked(
    tmp_path: Path, monkeypatch
) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)
    dashboard_path = tmp_path / "dashboard.html"

    generate_dashboard(db_path=db_path, output_path=dashboard_path)
    asset_dir = tmp_path / "codex-usage-tracker-assets"
    assert (asset_dir / "dashboard.css").exists()

    original_rmtree = dashboard_module.shutil.rmtree

    def locked_rmtree(path: object, *args: object, **kwargs: object) -> None:
        if Path(path) == asset_dir:
            raise PermissionError("asset directory is being read")
        original_rmtree(path, *args, **kwargs)

    monkeypatch.setattr(dashboard_module.shutil, "rmtree", locked_rmtree)

    generate_dashboard(db_path=db_path, output_path=dashboard_path)

    dashboard = dashboard_path.read_text(encoding="utf-8")
    assert '"loaded_row_count": 4' in dashboard
    assert 'href="codex-usage-tracker-assets/dashboard.css?v=' in dashboard


def test_dashboard_answer_strip_contract(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)
    dashboard_path = tmp_path / "dashboard.html"
    generate_dashboard(db_path=db_path, output_path=dashboard_path)

    dashboard = dashboard_path.read_text(encoding="utf-8")
    asset_dir = tmp_path / "codex-usage-tracker-assets"
    dashboard_js = (asset_dir / "dashboard.js").read_text(encoding="utf-8")

    # The answer strip renders hero, spend chart, and limits cards in order.
    strip = dashboard.split('<section class="answer-strip"', 1)[1].split("</section>", 1)[0]
    assert strip.index('id="heroCost"') < strip.index('id="chartBars"') < strip.index('id="limitsGroups"')
    assert ":: where did" in strip
    assert ":: limits remaining" in strip
    assert 'id="heroCostDelta"' in strip
    assert 'id="heroTokensDelta"' in strip
    assert 'id="heroCredits"' in strip
    assert 'id="heroSentence"' in strip
    assert "Codex" in strip
    assert "Claude" in strip

    # The retired summary-card / provider-details / analytics chrome is gone.
    for stale in (
        '<div class="cards">',
        "Visible Calls",
        "Total Tokens",
        "Input Tokens",
        "Cache Tokens",
        "Output Tokens",
        "Reasoning Tokens",
        "Usage Limits",
        "providerDetails",
        "usageAnalytics",
        "insightsPanel",
    ):
        assert stale not in dashboard

    # Hero math, chart bucketing, and limits rendering are centralized.
    for symbol in (
        "computeScope",
        "buildThreads",
        "buildChart",
        "renderAnswerStrip",
        "renderChart",
        "renderLimits",
        "deltaInfo",
        "heroSentenceText",
        "compactTokens",
    ):
        assert symbol in dashboard_js
    assert "no prior-period data" in dashboard_js
    assert "vs last period" in dashboard_js
    assert "Codex credits used" in dashboard_js
    # Chart data ignores the day filter itself so all bars stay comparable.
    assert "Chart ignores the day filter" in dashboard_js
    assert "click to filter" in dashboard_js
    assert "click to clear" in dashboard_js
    assert "--week-of" in dashboard_js
    # Limit cards focus a provider and color by remaining percent.
    assert "remaining_percent" in dashboard_js
    assert "limitLevel" in dashboard_js
    assert "click to focus" in dashboard_js
    assert "click to show all providers" in dashboard_js


def test_dashboard_overview_and_calls_contract(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)
    dashboard_path = tmp_path / "dashboard.html"
    generate_dashboard(db_path=db_path, output_path=dashboard_path)

    dashboard = dashboard_path.read_text(encoding="utf-8")
    asset_dir = tmp_path / "codex-usage-tracker-assets"
    dashboard_js = (asset_dir / "dashboard.js").read_text(encoding="utf-8")
    dashboard_state_js = (asset_dir / "dashboard_state.js").read_text(encoding="utf-8")
    dashboard_css = (asset_dir / "dashboard.css").read_text(encoding="utf-8")

    # Overview: ranked thread ledger with pagination and a drill-in rail.
    assert dashboard.index('id="overviewSection"') < dashboard.index('id="callsSection"')
    assert "LEDGER_PAGE_SIZE = 6" in dashboard_js
    assert "CALLS_PAGE_SIZE = 8" in dashboard_js
    assert "ranked by spend · click to drill in" in dashboard_js
    assert "of spend" in dashboard_js
    for symbol in (
        "threadSignal",
        "renderLedger",
        "renderOverviewRail",
        "renderAttentionRail",
        "renderThreadRail",
        "buildAttention",
    ):
        assert symbol in dashboard_js
    assert "low cache" in dashboard_js
    assert "est. price" in dashboard_js
    # Truncation honesty: visible coverage note when loaded rows don't span the range.
    assert 'id="coverageNote"' in dashboard
    assert "range incomplete" in dashboard_js
    # CSP has no style-src 'unsafe-inline': dynamic styles must go through
    # data-css + CSSOM, never inline style attributes (browsers strip those).
    assert 'style="' not in dashboard_js
    assert "data-css" in dashboard_js
    assert "applyPendingStyles" in dashboard_js
    # Attention rail: max three cards in priority order, with a quiet empty state.
    assert "Context bloat" in dashboard_js
    assert "Low cache reuse" in dashboard_js
    assert "Unpriced usage" in dashboard_js
    assert "Estimated pricing" in dashboard_js
    assert "nothing needs attention in this range" in dashboard_js
    # Drill-in: context sparkline, spawned work, timeline, next action.
    assert "context growth · session cumulative" in dashboard_js
    assert "spawned work" in dashboard_js
    assert "timeline · oldest → newest" in dashboard_js
    assert "next action" in dashboard_js
    assert "open in calls view" in dashboard_js
    assert "cumulative_total_tokens" in dashboard_js

    # Calls view: sortable dense table plus call-details rail.
    assert "sortDirection" in dashboard_js
    assert "renderCallsTable" in dashboard_js
    assert "renderCallRail" in dashboard_js
    assert "sorted by" in dashboard_js
    assert "cost, usage, and context" in dashboard_js
    assert "thread narrative" in dashboard_js
    assert "token and pricing breakdown" in dashboard_js
    assert "raw identifiers &amp; source" in dashboard_js
    assert "open thread in overview" in dashboard_js
    # Cache sorts ascending by default (worst first); the rest descending.
    assert "state.sortKey === 'cache' ? 'asc' : 'desc'" in dashboard_js
    # Compact live rows hydrate on demand through the aggregate row API.
    assert "rowNeedsDetail" in dashboard_js
    assert "ensureRowDetail" in dashboard_js
    assert "loading on demand" in dashboard_js
    # Prompt context loads on demand only and is never persisted.
    assert "loadContext" in dashboard_js
    assert "renderContext" in dashboard_js
    assert "Not persisted to SQLite or dashboard HTML." in dashboard_js

    # Layout: the page never scrolls at desktop heights; lists scroll internally.
    assert "height: 100vh" in dashboard_css
    assert "min-height: 640px" in dashboard_css
    assert "max-width: 1360px" in dashboard_css
    assert "grid-template-columns: minmax(0, 1.5fr) minmax(340px, 0.8fr)" in dashboard_css
    assert "grid-template-columns: 34px minmax(0, 1fr) 90px 90px 96px" in dashboard_css
    assert "grid-template-columns: 92px minmax(0, 1.4fr) minmax(0, 1fr) 64px 74px 82px 60px 90px" in dashboard_css
    assert "min-width: 760px" in dashboard_css
    assert ".popover-anchor" in dashboard_css
    assert "min-width: 520px" in dashboard_css

    # Row-limit picker: the row slice is selectable, and the coverage note says
    # so instead of only reporting truncation.
    assert 'id="rowLimit"' in dashboard
    for option in ('value="5000"', 'value="15000"', 'value="50000"', 'value="all"'):
        assert option in dashboard
    assert "renderRowLimitControl" in dashboard_js
    assert "confirmHeavyRowLoad" in dashboard_js
    assert "HEAVY_ROW_THRESHOLD = 50000" in dashboard_js
    assert 'raise "rows" in the header to load more' in dashboard_js
    assert "limit: state.rowLimit" in dashboard_js
    assert ".rows-picker" in dashboard_css
    # Picking a row limit only arms the control; the fetch is explicit, because
    # a deep slice is slow enough that an implicit fetch reads as a no-op.
    assert 'id="rowLimitApply"' in dashboard
    assert 'id="rowLoadNote"' in dashboard
    assert "loadRowSlice" in dashboard_js
    assert "reportRowLoad" in dashboard_js
    assert "pendingRowLimit" in dashboard_js
    assert "rowLoadInFlight" in dashboard_js
    assert ".rows-apply" in dashboard_css
    assert ".row-load-note" in dashboard_css
    # Auto-refresh spacing adapts to how long a refresh actually takes; a fixed
    # interval plus queue-on-completion produced back-to-back refreshes on a
    # large index.
    assert "nextRefreshDelayMs" in dashboard_js
    assert "REFRESH_BACKOFF_FACTOR" in dashboard_js
    assert "MAX_REFRESH_INTERVAL_MS" in dashboard_js
    assert "lastRefreshDurationMs" in dashboard_js
    assert "window.setInterval" not in dashboard_js

    # Breakdown view: grouped cost table with composition, totals, and export.
    assert 'id="breakdownSection"' in dashboard
    assert dashboard.index('id="breakdownSection"') < dashboard.index('id="callsSection"')
    assert 'data-view="breakdown"' in dashboard
    for dimension in (
        'data-group="model"',
        'data-group="project"',
        'data-group="thread"',
        'data-group="effort"',
        'data-group="thread_type"',
        'data-group="source"',
        'data-group="day"',
    ):
        assert dimension in dashboard
    for symbol in (
        "buildBreakdown",
        "renderBreakdown",
        "renderBreakdownRail",
        "compositionBar",
        "breakdownCsv",
        "copyBreakdownCsv",
        "applyGroupAsFilter",
    ):
        assert symbol in dashboard_js
    assert "BREAKDOWN_PAGE_SIZE = 10" in dashboard_js
    assert "complete for this range" in dashboard_js
    assert "cost composition" in dashboard_js
    assert "token composition" in dashboard_js
    assert "cost_fresh_input_usd" in dashboard_js
    assert "perMillionTokens" in dashboard_js
    assert ".comp-seg" in dashboard_css
    assert ".breakdown-row" in dashboard_css

    # Search stays answerable from complete rollups instead of dropping the
    # dashboard back to the truncated row slice.
    assert "rollupSearchMatches" in dashboard_js
    assert "rollupEquivalentFields" in dashboard_js
    assert "threadCostSection" in dashboard_js

    # URL state round-trips the new state model.
    for key in (
        "'view'",
        "'q'",
        "'rows'",
        "'group'",
        "'gsort'",
        "'gdir'",
        "'gpage'",
        "'gsel'",
        "'date'",
        "'from'",
        "'to'",
        "'provider'",
        "'model'",
        "'effort'",
        "'confidence'",
        "'thread_type'",
        "'day'",
        "'sort'",
        "'direction'",
        "'page'",
        "'lpage'",
        "'thread'",
        "'record'",
    ):
        assert key in dashboard_state_js
    assert "url(" not in dashboard_css
    assert "http" not in dashboard_css


def test_dashboard_payload_contract_includes_analysis_metadata(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    refresh_usage_index(codex_home=codex_home, db_path=db_path)

    payload = dashboard_payload(db_path=db_path, pricing_path=pricing_path)
    row = payload["rows"][0]

    assert {
        "rows",
        "rows_compact",
        "pricing_configured",
        "allowance_configured",
        "loaded_row_count",
        "total_available_rows",
        "parser_diagnostics",
        "parser_adapter",
        "action_thresholds",
        "project_metadata_privacy",
    } <= set(payload)
    assert payload["rows_compact"] is False
    assert {
        "record_id",
        "session_id",
        "event_timestamp",
        "cwd",
        "total_tokens",
        "cache_ratio",
        "pricing_model",
        "usage_credits",
        "recommended_action",
        "project_name",
        "project_key",
        "thread_attachment_label",
    } <= set(row)


def test_dashboard_payload_preserves_multi_source_pricing_metadata(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    raw = json.loads(pricing_path.read_text(encoding="utf-8"))
    raw["_source"] = {
        "name": "OpenAI and DeepSeek pricing docs",
        "url": "https://example.test/openai-pricing",
        "tier": "standard",
        "fetched_at": "2026-07-03T00:00:00+00:00",
        "sources": [
            {"name": "OpenAI Developers pricing docs", "url": "https://example.test/openai"},
            {"name": "DeepSeek API pricing docs", "url": "https://example.test/deepseek"},
        ],
    }
    pricing_path.write_text(json.dumps(raw), encoding="utf-8")
    refresh_usage_index(codex_home=codex_home, db_path=db_path)

    payload = dashboard_payload(db_path=db_path, pricing_path=pricing_path)

    assert payload["pricing_source"]["sources"][1]["name"] == "DeepSeek API pricing docs"
    assert payload["pricing_source"]["sources"][1]["url"] == "https://example.test/deepseek"


def test_dashboard_payload_can_compact_live_rows_and_load_full_row_detail(
    tmp_path: Path,
) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    refresh_usage_index(codex_home=codex_home, db_path=db_path)

    compact_payload = dashboard_payload(
        db_path=db_path,
        pricing_path=pricing_path,
        limit=0,
        compact_rows=True,
    )
    compact_row = compact_payload["rows"][0]
    full_row = dashboard_record_payload(
        db_path=db_path,
        record_id=compact_row["record_id"],
        pricing_path=pricing_path,
    )

    assert compact_payload["rows_compact"] is True
    assert "thread_attachment_label" in compact_row
    assert "source_file" not in compact_row
    assert "line_number" not in compact_row
    assert "action_recommendations" not in compact_row
    assert "flag_explanations" not in compact_row
    assert "recommended_action" not in compact_row
    assert full_row is not None
    assert full_row["record_id"] == compact_row["record_id"]
    assert full_row["source_file"].endswith(".jsonl")
    assert isinstance(full_row["action_recommendations"], list)
    assert "recommended_action" in full_row
    assert "usage_credit_source" in full_row


def test_dashboard_payload_and_csv_privacy_mode_redact_project_metadata(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    csv_path = tmp_path / "usage-redacted.csv"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)

    payload = dashboard_payload(db_path=db_path, privacy_mode="strict")
    exported = export_usage_csv(
        output_path=csv_path,
        db_path=db_path,
        privacy_mode="redacted",
    )
    csv_text = csv_path.read_text(encoding="utf-8")
    csv_header = csv_text.splitlines()[0].split(",")
    first_row = payload["rows"][0]

    assert exported == 4
    assert payload["privacy_mode"] == "strict"
    assert payload["project_metadata_privacy"]["cwd_redacted"] is True
    assert first_row["cwd"].startswith("[redacted cwd:")
    assert first_row["project_name"].startswith("Project ")
    assert first_row["project_relative_cwd"] is None
    assert first_row["git_branch"] is None
    assert first_row["git_remote_label"] is None
    assert "/tmp/codex-usage-tracker" not in json.dumps(payload)
    assert "/tmp/codex-usage-tracker" not in csv_text
    assert "[redacted cwd:" in csv_text
    assert csv_header == EVENT_COLUMNS


def test_dashboard_guide_link_can_use_docs_url_override(tmp_path: Path, monkeypatch) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)
    monkeypatch.setenv("CODEX_USAGE_TRACKER_DOCS_URL", "https://example.test/guide")

    dashboard_path = tmp_path / "dashboard.html"
    generate_dashboard(db_path=db_path, output_path=dashboard_path)

    dashboard = dashboard_path.read_text(encoding="utf-8")
    assert 'href="https://example.test/guide"' in dashboard
    assert not (tmp_path / "codex-usage-tracker-guide").exists()
    assert (tmp_path / "codex-usage-tracker-assets" / "dashboard.js").exists()


def test_dashboard_payload_uses_dynamic_codex_allowance_windows(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    _append_codex_rate_limits(codex_home)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)

    payload = dashboard_payload(
        db_path=db_path,
        allowance_path=tmp_path / "allowance.json",
        codex_home=codex_home,
        limit_history_path=tmp_path / "limit-history.json",
    )

    assert payload["allowance_configured"] is True
    assert payload["allowance_window_source"]["name"] == "Local Codex rate-limit snapshot"
    assert [
        (window["key"], window["remaining_percent"])
        for window in payload["allowance_windows"]
    ] == [
        ("five_hour", 0.6),
        ("weekly", 0.9),
    ]

    # Building the payload records the Codex snapshot into the limit history,
    # and the payload exposes that history for burn-down analytics.
    history = payload["provider_limit_history"]
    assert isinstance(history, list) and len(history) == 1
    assert history[0]["provider"] == "openai"
    assert {window["key"] for window in history[0]["windows"]} == {"five_hour", "weekly"}
    assert (tmp_path / "limit-history.json").exists()


def test_dashboard_payload_exposes_claude_limit_windows(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    claude_home = _make_claude_home(tmp_path)
    claude_limits_path = tmp_path / "claude-limits.json"
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(
        codex_home=codex_home,
        claude_home=claude_home,
        hermes_home=tmp_path / ".hermes",
        db_path=db_path,
        source="all",
    )
    write_claude_statusline_snapshot(
        {
            "session_id": "claude-session-1",
            "rate_limits": {
                "five_hour": {"used_percentage": 80, "resets_at": 1774686045},
                "seven_day": {"used_percentage": 25, "resets_at": 1775186466},
            },
        },
        path=claude_limits_path,
        captured_at="2026-06-11T00:00:00Z",
    )

    payload = dashboard_payload(
        db_path=db_path,
        allowance_path=tmp_path / "allowance.json",
        codex_home=codex_home,
        claude_limits_path=claude_limits_path,
        limit_history_path=tmp_path / "limit-history.json",
    )

    anthropic_limits = payload["provider_limit_snapshots"]["anthropic"]
    assert anthropic_limits["configured"] is True
    assert anthropic_limits["source"]["name"] == "Local Claude Code status-line snapshot"
    assert [
        (window["key"], window["label"], window["remaining_percent"])
        for window in anthropic_limits["windows"]
    ] == [
        ("five_hour", "5h", 0.2),
        ("weekly", "7d", 0.75),
    ]


def test_dashboard_server_usage_api_refreshes_aggregate_rows(tmp_path: Path) -> None:
    from codex_usage_tracker.server import _UsageDashboardHandler

    codex_home = _make_codex_home(tmp_path)
    _append_codex_rate_limits(codex_home)
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    handler = partial(
        _UsageDashboardHandler,
        directory=str(tmp_path),
        db_path=db_path,
        pricing_path=pricing_path,
        allowance_path=tmp_path / "allowance.json",
        thresholds_path=tmp_path / "thresholds.json",
        projects_path=tmp_path / "projects.json",
        limit=5000,
        since=None,
        codex_home=codex_home,
        include_archived=False,
        dashboard_name="dashboard.html",
        context_chars=2000,
        api_token="test-token",
        context_api_enabled=True,
        refresh_lock=threading.Lock(),
        limit_history_path=tmp_path / "limit-history.json",
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        try:
            with urllib.request.urlopen(  # noqa: S310 - local test server only
                f"http://127.0.0.1:{server.server_port}/", timeout=5
            ) as response:
                page_cache_control = response.headers.get("Cache-Control")
        except urllib.error.HTTPError as exc:
            # No dashboard.html is generated in this test; the 404 error
            # response carries the same page cache headers.
            page_cache_control = exc.headers.get("Cache-Control")
        refresh_without_token = _http_error_json(
            f"http://127.0.0.1:{server.server_port}/api/usage?refresh=1&limit=2"
        )
        with urllib.request.urlopen(  # noqa: S310 - local test server only
            urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/usage?refresh=1&limit=2",
                headers={"X-Codex-Usage-Token": "test-token"},
            ),
            timeout=5,
        ) as response:
            content_security_policy = response.headers.get("Content-Security-Policy")
            referrer_policy = response.headers.get("Referrer-Policy")
            limited_payload = json.loads(response.read().decode("utf-8"))
        with urllib.request.urlopen(  # noqa: S310 - local test server only
            f"http://127.0.0.1:{server.server_port}/api/usage?limit=all",
            timeout=5,
        ) as response:
            all_payload = json.loads(response.read().decode("utf-8"))
        with urllib.request.urlopen(  # noqa: S310 - local test server only
            f"http://127.0.0.1:{server.server_port}/api/usage?limit=2&offset=2",
            timeout=5,
        ) as response:
            offset_payload = json.loads(response.read().decode("utf-8"))
        forbidden_origin = _http_error_json(
            f"http://127.0.0.1:{server.server_port}/api/usage",
            headers={"Origin": "http://example.test"},
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert refresh_without_token["status"] == 403
    assert limited_payload["refresh_result"]["parsed_events"] == 4
    assert limited_payload["refresh_result"]["skipped_events"] == 0
    assert limited_payload["refresh_result"]["parser_diagnostics"] == {}
    assert limited_payload["rows_compact"] is True
    assert len(limited_payload["rows"]) == 2
    assert "source_file" not in limited_payload["rows"][0]
    assert "action_recommendations" not in limited_payload["rows"][0]
    assert limited_payload["loaded_row_count"] == 2
    assert limited_payload["total_available_rows"] == 4
    assert limited_payload["limit"] == 2
    assert limited_payload["offset"] == 0
    assert limited_payload["has_more"] is True
    assert limited_payload["next_offset"] == 2
    assert content_security_policy is not None
    assert "connect-src 'self'" in content_security_policy
    assert "unsafe-inline" not in content_security_policy
    assert referrer_policy == "no-referrer"
    assert page_cache_control == "no-store"
    assert len(all_payload["rows"]) == 4
    assert all_payload["loaded_row_count"] == 4
    assert all_payload["total_available_rows"] == 4
    assert all_payload["limit"] is None
    assert all_payload["offset"] == 0
    assert all_payload["has_more"] is False
    assert all_payload["limit_label"] == "All"
    assert len(offset_payload["rows"]) == 2
    assert offset_payload["loaded_row_count"] == 2
    assert offset_payload["total_available_rows"] == 4
    assert offset_payload["limit"] == 2
    assert offset_payload["offset"] == 2
    assert offset_payload["has_more"] is False
    assert offset_payload["next_offset"] is None
    assert {row["record_id"] for row in offset_payload["rows"]}.isdisjoint(
        {row["record_id"] for row in limited_payload["rows"]}
    )
    assert limited_payload["pricing_configured"] is True
    assert limited_payload["allowance_configured"] is True
    assert limited_payload["allowance_source"]["name"] == "OpenAI Codex rate card"
    assert limited_payload["allowance_window_source"]["name"] == "Local Codex rate-limit snapshot"
    assert limited_payload["rows"][0]["usage_credits"] is not None
    assert "refreshed_at" in limited_payload
    assert limited_payload["parser_diagnostics"] == {}
    assert limited_payload["api_token"] == "test-token"
    assert limited_payload["context_api_enabled"] is True
    assert forbidden_origin["status"] == 403
    assert "SECRET RAW PROMPT" not in json.dumps(limited_payload)


def test_dashboard_server_debounces_back_to_back_refresh_scans(tmp_path: Path) -> None:
    from codex_usage_tracker.server import _UsageDashboardHandler

    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    handler = partial(
        _UsageDashboardHandler,
        directory=str(tmp_path),
        db_path=db_path,
        pricing_path=pricing_path,
        allowance_path=tmp_path / "allowance.json",
        thresholds_path=tmp_path / "thresholds.json",
        projects_path=tmp_path / "projects.json",
        limit=5000,
        since=None,
        codex_home=codex_home,
        include_archived=False,
        dashboard_name="dashboard.html",
        context_chars=2000,
        api_token="test-token",
        context_api_enabled=False,
        refresh_lock=threading.Lock(),
        refresh_state={},
        limit_history_path=tmp_path / "limit-history.json",
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:

        def fetch_refresh() -> dict[str, object]:
            with urllib.request.urlopen(  # noqa: S310 - local test server only
                urllib.request.Request(
                    f"http://127.0.0.1:{server.server_port}/api/usage?refresh=1&limit=2",
                    headers={"X-Codex-Usage-Token": "test-token"},
                ),
                timeout=5,
            ) as response:
                return json.loads(response.read().decode("utf-8"))

        first = fetch_refresh()
        second = fetch_refresh()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert first["refresh_result"]["skipped"] is False
    assert first["refresh_result"]["parsed_events"] == 4
    assert first["refresh_result"]["refresh_seconds"] >= 0
    assert second["refresh_result"]["skipped"] is True
    assert second["refresh_result"]["skip_reason"] == "debounced"
    # A skipped rescan still reports the last completed scan and serves rows.
    assert second["refresh_result"]["parsed_events"] == 4
    assert len(second["rows"]) == 2


def test_dashboard_server_usage_row_api_loads_full_aggregate_row(tmp_path: Path) -> None:
    from codex_usage_tracker.server import _UsageDashboardHandler

    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    handler = partial(
        _UsageDashboardHandler,
        directory=str(tmp_path),
        db_path=db_path,
        pricing_path=pricing_path,
        allowance_path=tmp_path / "allowance.json",
        thresholds_path=tmp_path / "thresholds.json",
        projects_path=tmp_path / "projects.json",
        limit=5000,
        since=None,
        codex_home=codex_home,
        include_archived=False,
        dashboard_name="dashboard.html",
        context_chars=2000,
        api_token="test-token",
        context_api_enabled=True,
        refresh_lock=threading.Lock(),
        limit_history_path=tmp_path / "limit-history.json",
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        refresh_usage_index(codex_home=codex_home, db_path=db_path)
        with urllib.request.urlopen(  # noqa: S310 - local test server only
            f"http://127.0.0.1:{server.server_port}/api/usage?limit=1",
            timeout=5,
        ) as response:
            usage_payload = json.loads(response.read().decode("utf-8"))
        record_id = usage_payload["rows"][0]["record_id"]
        detail_without_token = _http_error_json(
            f"http://127.0.0.1:{server.server_port}/api/usage-row?record_id={record_id}"
        )
        with urllib.request.urlopen(  # noqa: S310 - local test server only
            urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/usage-row?record_id={record_id}",
                headers={"X-Codex-Usage-Token": "test-token"},
            ),
            timeout=5,
        ) as response:
            row_payload = json.loads(response.read().decode("utf-8"))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert detail_without_token["status"] == 403
    assert usage_payload["rows_compact"] is True
    assert "source_file" not in usage_payload["rows"][0]
    assert row_payload["record_id"] == record_id
    assert row_payload["row"]["record_id"] == record_id
    assert row_payload["row"]["source_file"].endswith(".jsonl")
    assert isinstance(row_payload["row"]["action_recommendations"], list)
    assert "recommended_action" in row_payload["row"]


def test_dashboard_history_scope_includes_archived_rows_by_default(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    _write_archived_log(codex_home)
    db_path = tmp_path / "usage.sqlite3"
    refresh_result = refresh_usage_index(
        codex_home=codex_home,
        db_path=db_path,
        include_archived=True,
    )

    default_payload = dashboard_payload(db_path=db_path, limit=0)
    active_payload = dashboard_payload(db_path=db_path, limit=0, include_archived=False)
    all_history_payload = dashboard_payload(db_path=db_path, limit=0, include_archived=True)
    active_rows = query_dashboard_events(db_path=db_path, limit=0, include_archived=False)
    all_rows = query_dashboard_events(db_path=db_path, limit=0, include_archived=True)

    assert refresh_result.parsed_events == 5
    assert default_payload["include_archived"] is True
    assert default_payload["history_scope"] == "all-history"
    assert default_payload["loaded_row_count"] == 5
    assert default_payload["total_available_rows"] == 5
    assert active_payload["include_archived"] is False
    assert active_payload["history_scope"] == "active"
    assert active_payload["loaded_row_count"] == 4
    assert active_payload["total_available_rows"] == 4
    assert active_payload["active_available_rows"] == 4
    assert active_payload["all_history_available_rows"] == 5
    assert active_payload["archived_available_rows"] == 1
    assert all_history_payload["include_archived"] is True
    assert all_history_payload["history_scope"] == "all-history"
    assert all_history_payload["loaded_row_count"] == 5
    assert all_history_payload["total_available_rows"] == 5
    assert len(active_rows) == 4
    assert len(all_rows) == 5
    assert not any(_is_archived_source_file(row["source_file"]) for row in active_rows)
    assert any(_is_archived_source_file(row["source_file"]) for row in all_rows)


def test_dashboard_server_usage_api_switches_history_scope(tmp_path: Path) -> None:
    from codex_usage_tracker.server import _UsageDashboardHandler

    codex_home = _make_codex_home(tmp_path)
    _write_archived_log(codex_home)
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    handler = partial(
        _UsageDashboardHandler,
        directory=str(tmp_path),
        db_path=db_path,
        pricing_path=pricing_path,
        allowance_path=tmp_path / "allowance.json",
        thresholds_path=tmp_path / "thresholds.json",
        projects_path=tmp_path / "projects.json",
        limit=5000,
        since=None,
        codex_home=codex_home,
        include_archived=False,
        dashboard_name="dashboard.html",
        context_chars=2000,
        api_token="test-token",
        context_api_enabled=True,
        refresh_lock=threading.Lock(),
        limit_history_path=tmp_path / "limit-history.json",
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with urllib.request.urlopen(  # noqa: S310 - local test server only
            urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/usage?refresh=1&limit=all",
                headers={"X-Codex-Usage-Token": "test-token"},
            ),
            timeout=5,
        ) as response:
            active_payload = json.loads(response.read().decode("utf-8"))
        with urllib.request.urlopen(  # noqa: S310 - local test server only
            urllib.request.Request(
                f"http://127.0.0.1:{server.server_port}/api/usage?refresh=1&limit=all&include_archived=1",
                headers={"X-Codex-Usage-Token": "test-token"},
            ),
            timeout=5,
        ) as response:
            all_history_payload = json.loads(response.read().decode("utf-8"))
        with urllib.request.urlopen(  # noqa: S310 - local test server only
            f"http://127.0.0.1:{server.server_port}/api/usage?limit=all&include_archived=0",
            timeout=5,
        ) as response:
            active_after_all_payload = json.loads(response.read().decode("utf-8"))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert active_payload["include_archived"] is False
    assert active_payload["loaded_row_count"] == 4
    assert active_payload["archived_available_rows"] == 0
    assert active_payload["refresh_result"]["include_archived"] is False
    assert all_history_payload["include_archived"] is True
    assert all_history_payload["loaded_row_count"] == 5
    assert all_history_payload["archived_available_rows"] == 1
    assert all_history_payload["refresh_result"]["include_archived"] is True
    assert active_after_all_payload["include_archived"] is False
    assert active_after_all_payload["loaded_row_count"] == 4
    assert active_after_all_payload["archived_available_rows"] == 1
    archived_record_ids = {
        row["record_id"]
        for row in query_dashboard_events(
            db_path=db_path,
            limit=0,
            include_archived=True,
        )
        if _is_archived_source_file(row["source_file"])
    }
    assert {row["record_id"] for row in active_after_all_payload["rows"]}.isdisjoint(
        archived_record_ids
    )


def test_dashboard_server_returns_json_for_sqlite_errors(tmp_path: Path, monkeypatch) -> None:
    from codex_usage_tracker import server as server_module
    from codex_usage_tracker.server import _UsageDashboardHandler

    def broken_dashboard_payload(**kwargs):
        raise sqlite3.OperationalError("database is locked")

    def broken_context(**kwargs):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(server_module, "dashboard_payload", broken_dashboard_payload)
    monkeypatch.setattr(server_module, "load_call_context", broken_context)
    handler = partial(
        _UsageDashboardHandler,
        directory=str(tmp_path),
        db_path=tmp_path / "usage.sqlite3",
        pricing_path=tmp_path / "pricing.json",
        allowance_path=tmp_path / "allowance.json",
        thresholds_path=tmp_path / "thresholds.json",
        projects_path=tmp_path / "projects.json",
        limit=5000,
        since=None,
        codex_home=tmp_path / ".codex",
        include_archived=False,
        dashboard_name="dashboard.html",
        context_chars=2000,
        api_token="test-token",
        context_api_enabled=True,
        refresh_lock=threading.Lock(),
        limit_history_path=tmp_path / "limit-history.json",
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        usage_error = _http_error_json(
            f"http://127.0.0.1:{server.server_port}/api/usage"
        )
        context_error = _http_error_json(
            f"http://127.0.0.1:{server.server_port}/api/context?record_id=abc",
            headers={"X-Codex-Usage-Token": "test-token"},
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert usage_error["status"] == 500
    assert "Database error" in usage_error["payload"]["error"]
    assert context_error["status"] == 500
    assert "Database error" in context_error["payload"]["error"]


def test_dashboard_server_can_disable_context_api(tmp_path: Path) -> None:
    from codex_usage_tracker.server import _UsageDashboardHandler

    handler = partial(
        _UsageDashboardHandler,
        directory=str(tmp_path),
        db_path=tmp_path / "usage.sqlite3",
        pricing_path=tmp_path / "pricing.json",
        allowance_path=tmp_path / "allowance.json",
        thresholds_path=tmp_path / "thresholds.json",
        projects_path=tmp_path / "projects.json",
        limit=5000,
        since=None,
        codex_home=tmp_path / ".codex",
        include_archived=False,
        dashboard_name="dashboard.html",
        context_chars=2000,
        api_token="test-token",
        context_api_enabled=False,
        refresh_lock=threading.Lock(),
        limit_history_path=tmp_path / "limit-history.json",
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        context_error = _http_error_json(
            f"http://127.0.0.1:{server.server_port}/api/context?record_id=abc",
            headers={"X-Codex-Usage-Token": "test-token"},
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert context_error["status"] == 403
    assert "disabled" in context_error["payload"]["error"]


def test_dashboard_query_limit_zero_loads_all_rows(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)

    assert len(query_dashboard_events(db_path=db_path, limit=2)) == 2
    assert len(query_dashboard_events(db_path=db_path, limit=0)) == 4
    assert query_dashboard_event_count(db_path=db_path) == 4


def test_context_loads_raw_log_only_on_demand(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)
    rows = query_session_usage(db_path=db_path, session_id=SESSION_ID)

    context = load_call_context(rows[0]["record_id"], db_path=db_path)
    context_text = json.dumps(context)

    assert context["loaded_on_demand"] is True
    assert context["raw_context_persisted"] is False
    assert "SECRET RAW PROMPT" in context_text
    assert "sk" + "-proj-" not in context_text
    assert "AKIAIOSFODNN7EXAMPLE" not in context_text
    assert "Authorization: Bearer abc.def" not in context_text
    assert "xoxb-123456789012" not in context_text
    assert "eyJhbGciOiJIUzI1Ni" not in context_text
    assert "client_secret=super-secret-value" not in context_text
    assert "BEGIN OPENSSH PRIVATE KEY" not in context_text
    assert "[REDACTED_OPENAI_KEY]" in context_text
    assert "[REDACTED_AWS_ACCESS_KEY]" in context_text
    assert "[REDACTED_BEARER_TOKEN]" in context_text
    assert "[REDACTED_SLACK_TOKEN]" in context_text
    assert "[REDACTED_JWT]" in context_text
    assert "[REDACTED_PRIVATE_KEY]" in context_text
    assert any(entry["label"] == "message / user" for entry in context["entries"])


def test_mcp_wrappers_smoke(tmp_path: Path, monkeypatch) -> None:
    from codex_usage_tracker import mcp_server

    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    dashboard_path = tmp_path / "dashboard.html"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    allowance_path = tmp_path / "allowance.json"
    projects_path = tmp_path / "projects.json"
    monkeypatch.setattr(mcp_server, "DEFAULT_CODEX_HOME", codex_home)
    monkeypatch.setattr(mcp_server, "DEFAULT_CLAUDE_HOME", tmp_path / ".claude")
    monkeypatch.setattr(mcp_server, "DEFAULT_HERMES_HOME", tmp_path / ".hermes")
    monkeypatch.setattr(mcp_server, "DEFAULT_DB_PATH", db_path)
    monkeypatch.setattr(mcp_server, "DEFAULT_DASHBOARD_PATH", dashboard_path)
    monkeypatch.setattr(mcp_server, "DEFAULT_PRICING_PATH", pricing_path)
    monkeypatch.setattr(mcp_server, "DEFAULT_ALLOWANCE_PATH", allowance_path)
    monkeypatch.setattr(mcp_server, "DEFAULT_PROJECTS_PATH", projects_path)
    monkeypatch.setattr(mcp_server, "update_pricing_from_openai_docs", _fake_pricing_update)

    refresh = mcp_server.refresh_usage_index()
    summary = mcp_server.usage_summary(group_by="thread")
    summary_json = mcp_server.usage_summary(group_by="model", response_format="json")
    project_summary = mcp_server.usage_summary(group_by="project")
    model_summary = mcp_server.usage_summary(preset="by-model")
    expensive = mcp_server.most_expensive_usage_calls(limit=1)
    expensive_json = mcp_server.most_expensive_usage_calls(limit=1, response_format="json")
    query_json = mcp_server.usage_query(
        model="gpt-5.5",
        min_tokens=50,
        limit=2,
        privacy_mode="strict",
    )
    recommendations_json = mcp_server.usage_recommendations(
        limit=2,
        response_format="json",
        privacy_mode="strict",
    )
    pricing_coverage = mcp_server.usage_pricing_coverage()
    pricing_coverage_json = mcp_server.usage_pricing_coverage(response_format="json")
    session = mcp_server.session_usage(session_id=SESSION_ID)
    session_json = mcp_server.session_usage(session_id=SESSION_ID, response_format="json")
    record_id = query_session_usage(db_path=db_path, session_id=SESSION_ID)[0]["record_id"]
    context_disabled = mcp_server.usage_call_context(record_id=record_id)
    context_disabled_json = json.loads(context_disabled)
    monkeypatch.setenv("CODEX_USAGE_TRACKER_ALLOW_RAW_CONTEXT", "1")
    context = mcp_server.usage_call_context(record_id=record_id)
    context_json = json.loads(context)
    dashboard = mcp_server.generate_usage_dashboard()
    csv_export = mcp_server.export_usage_csv(str(tmp_path / "usage.csv"), privacy_mode="redacted")
    pricing_update = mcp_server.update_usage_pricing_config()
    allowance = mcp_server.init_usage_allowance_config()
    doctor = mcp_server.usage_doctor()
    doctor_json = mcp_server.usage_doctor(response_format="json")

    for payload in (
        refresh,
        summary_json,
        expensive_json,
        query_json,
        recommendations_json,
        pricing_coverage_json,
        session_json,
        context_disabled_json,
        context_json,
        dashboard,
        csv_export,
        pricing_update,
        allowance,
        doctor_json,
    ):
        _assert_contract(payload)

    assert refresh["parsed_events"] == 4
    assert refresh["skipped_events"] == 0
    assert "Add Codex token tracking" in summary
    assert summary_json["schema"] == "codex-usage-tracker-summary-v1"
    assert summary_json["rows"][0]["group_key"] == "gpt-5.5"
    assert "codex-usage-tracker" in project_summary
    assert "estimated cost" in model_summary
    assert "Most expensive Codex calls" in expensive
    assert expensive_json["is_expensive"] is True
    assert query_json["schema"] == "codex-usage-tracker-query-v1"
    assert query_json["filters"]["model"] == "gpt-5.5"
    assert query_json["row_count"] == 2
    assert query_json["rows"][0]["pricing_model"] == "gpt-5.5"
    assert query_json["rows"][0]["cwd"].startswith("[redacted cwd:")
    assert query_json["rows"][0]["project_relative_cwd"] is None
    assert recommendations_json["schema"] == "codex-usage-tracker-recommendations-v1"
    assert recommendations_json["row_count"] >= 1
    assert recommendations_json["rows"][0]["recommendation_score"] > 0
    assert recommendations_json["threads"]
    assert "Codex pricing coverage" in pricing_coverage
    assert pricing_coverage_json["schema"] == "codex-usage-tracker-pricing-coverage-v1"
    assert SESSION_ID in session
    assert session_json["resolved_session_id"] == SESSION_ID
    assert session_json["row_count"] == 2
    assert "Raw context loading through MCP is disabled" in context_disabled
    assert context_disabled_json["schema"] == "codex-usage-tracker-context-disabled-v1"
    assert "SECRET RAW PROMPT" not in context_disabled
    assert "SECRET RAW PROMPT" in context
    assert context_json["schema"] == "codex-usage-tracker-context-v1"
    assert "sk" + "-proj-" not in context
    assert "[REDACTED_OPENAI_KEY]" in context
    assert dashboard["dashboard_path"] == str(dashboard_path)
    assert csv_export["privacy_mode"] == "redacted"
    assert pricing_update["model_count"] == 1
    assert pricing_update["source_url"] == "https://example.test/pricing.md"
    assert allowance["allowance_path"] == str(allowance_path)
    assert allowance_path.exists()
    assert "AI Usage Dashboard doctor" in doctor
    assert doctor_json["schema"] == "codex-usage-tracker-doctor-v1"


def test_pricing_annotation_and_doctor_pass(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    dashboard_path = tmp_path / "dashboard.html"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    refresh_usage_index(codex_home=codex_home, db_path=db_path)
    generate_dashboard(db_path=db_path, output_path=dashboard_path, pricing_path=pricing_path)

    rows = query_most_expensive_calls(db_path=db_path, limit=1)
    annotated = annotate_rows_with_efficiency(
        rows, pricing=load_pricing_config(tmp_path / "missing-pricing.json")
    )
    assert annotated[0]["estimated_cost_usd"] is None
    annotated = annotate_rows_with_efficiency(rows, pricing=load_pricing_config(pricing_path))
    assert annotated[0]["estimated_cost_usd"] > 0

    repo_root = tmp_path / "repo"
    (repo_root / ".codex-plugin").mkdir(parents=True)
    (repo_root / ".codex-plugin" / "plugin.json").write_text("{}", encoding="utf-8")
    (repo_root / ".mcp.json").write_text(
        json.dumps(
            {
                "mcpServers": {
                    "ai-usage-dashboard": {
                        "command": sys.executable,
                        "args": ["-m", "codex_usage_tracker.mcp_server"],
                        "env": {
                            "PYTHONPATH": str(Path(__file__).resolve().parents[1] / "src")
                        },
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    plugin_link = tmp_path / "plugins" / "ai-usage-dashboard"
    plugin_link.parent.mkdir()
    (plugin_link / ".codex-plugin").mkdir(parents=True)
    (plugin_link / ".codex-plugin" / "plugin.json").write_text(
        "{}",
        encoding="utf-8",
    )
    (plugin_link / ".mcp.json").write_text(
        (repo_root / ".mcp.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    marketplace_path = tmp_path / "marketplace.json"
    marketplace_path.write_text(
        json.dumps({"plugins": [{"name": "ai-usage-dashboard"}]}),
        encoding="utf-8",
    )

    report = run_doctor(
        codex_home=codex_home,
        db_path=db_path,
        dashboard_path=dashboard_path,
        pricing_path=pricing_path,
        plugin_link=plugin_link,
        marketplace_path=marketplace_path,
        repo_root=repo_root,
    )

    assert report["status"] == "pass"


def test_dashboard_payload_until_scopes_rows_and_counts(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    upsert_usage_events(
        [
            _synthetic_usage_event("range-early", "2026-06-01T12:00:00Z"),
            _synthetic_usage_event("range-inside", "2026-06-08T12:00:00Z"),
            _synthetic_usage_event("range-late", "2026-06-20T12:00:00Z"),
        ],
        db_path=db_path,
    )

    payload = dashboard_payload(
        db_path=db_path,
        limit=None,
        since="2026-06-07T00:00:00Z",
        until="2026-06-14T00:00:00Z",
        include_archived=True,
    )

    assert [row["record_id"] for row in payload["rows"]] == ["range-inside"]
    assert payload["loaded_row_count"] == 1
    assert payload["total_available_rows"] == 1
    assert payload["has_more"] is False


def test_dashboard_server_usage_api_filters_by_date_range(tmp_path: Path) -> None:
    from codex_usage_tracker.server import _UsageDashboardHandler

    db_path = tmp_path / "usage.sqlite3"
    upsert_usage_events(
        [
            _synthetic_usage_event("range-early", "2026-06-01T12:00:00Z"),
            _synthetic_usage_event("range-inside", "2026-06-08T12:00:00Z"),
            _synthetic_usage_event("range-late", "2026-06-20T12:00:00Z"),
        ],
        db_path=db_path,
    )
    handler = partial(
        _UsageDashboardHandler,
        directory=str(tmp_path),
        db_path=db_path,
        pricing_path=tmp_path / "pricing.json",
        allowance_path=tmp_path / "allowance.json",
        thresholds_path=tmp_path / "thresholds.json",
        projects_path=tmp_path / "projects.json",
        limit=5000,
        since=None,
        codex_home=_make_codex_home(tmp_path),
        include_archived=True,
        dashboard_name="dashboard.html",
        context_chars=2000,
        api_token="test-token",
        context_api_enabled=True,
        refresh_lock=threading.Lock(),
        limit_history_path=tmp_path / "limit-history.json",
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with urllib.request.urlopen(  # noqa: S310 - local test server only
            f"http://127.0.0.1:{server.server_port}/api/usage?limit=all"
            "&since=2026-06-07T00:00:00Z&until=2026-06-14T00:00:00Z",
            timeout=5,
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert [row["record_id"] for row in payload["rows"]] == ["range-inside"]
    assert payload["total_available_rows"] == 1


def test_dashboard_defaults_to_this_week_without_load_cap_control(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)
    dashboard_path = tmp_path / "dashboard.html"
    generate_dashboard(db_path=db_path, output_path=dashboard_path)

    dashboard = dashboard_path.read_text(encoding="utf-8")
    dashboard_js = (tmp_path / "codex-usage-tracker-assets" / "dashboard.js").read_text(
        encoding="utf-8"
    )
    dashboard_state_js = (
        tmp_path / "codex-usage-tracker-assets" / "dashboard_state.js"
    ).read_text(encoding="utf-8")

    assert 'data-range="this-week"' in dashboard
    assert "range: RANGES.has(initialState.range) ? initialState.range : 'this-week'" in dashboard_js
    assert "range: ALLOWED_RANGES.has(range) ? range : 'this-week'" in dashboard_state_js
    assert 'id="loadLimit"' not in dashboard
    assert "updateLoadLimitControl" not in dashboard_js
    # Refresh must stay bounded: totals come from rollups, not an unbounded row fetch.
    assert "limit: 'all'" not in dashboard_js
    assert "payloadRollups" in dashboard_js
    assert '"usage_rollups"' in dashboard
    assert "params.set('since'" in dashboard_js
    assert "params.set('until'" in dashboard_js
    # History scope has no UI control; the payload defaults to all history.
    assert "historyScope" not in dashboard
    assert '"include_archived": true' in dashboard
    assert "include_archived: includeArchived ? '1' : '0'" in dashboard_js


def _synthetic_usage_event(record_id: str, event_timestamp: str) -> UsageEvent:
    return UsageEvent(
        record_id=record_id,
        session_id="session-range",
        thread_name="Range Thread",
        session_updated_at=event_timestamp,
        event_timestamp=event_timestamp,
        source_file="/tmp/synthetic/range.jsonl",
        line_number=1,
        source_provider="openai",
        source_app="codex",
        source_format="codex-jsonl-v1",
        provider_request_id=None,
        turn_id=f"turn-{record_id}",
        turn_timestamp=event_timestamp,
        cwd="/tmp/project-range",
        model="gpt-5.5",
        effort="high",
        current_date=event_timestamp[:10],
        timezone="UTC",
        thread_source="user",
        subagent_type=None,
        agent_role=None,
        agent_nickname=None,
        parent_session_id=None,
        parent_thread_name=None,
        parent_session_updated_at=None,
        model_context_window=200000,
        cache_creation_input_tokens=0,
        input_tokens=1000,
        cached_input_tokens=200,
        output_tokens=100,
        reasoning_output_tokens=10,
        total_tokens=1100,
        cumulative_input_tokens=1000,
        cumulative_cached_input_tokens=200,
        cumulative_output_tokens=100,
        cumulative_reasoning_output_tokens=10,
        cumulative_total_tokens=1100,
    )


def _make_codex_home(tmp_path: Path) -> Path:
    codex_home = tmp_path / ".codex"
    log_dir = codex_home / "sessions" / "2026" / "05" / "17"
    log_path = log_dir / f"rollout-2026-05-17T14-58-23-{SESSION_ID}.jsonl"
    second_log_path = log_dir / f"rollout-2026-05-17T16-24-11-{SECOND_SESSION_ID}.jsonl"
    auto_review_log_path = log_dir / f"rollout-2026-05-17T16-31-02-{AUTO_REVIEW_SESSION_ID}.jsonl"
    _write_jsonl(
        codex_home / "session_index.jsonl",
        [
            {
                "id": SESSION_ID,
                "thread_name": "Add Codex token tracking",
                "updated_at": "2026-05-17T18:58:27Z",
            },
            {
                "id": SECOND_SESSION_ID,
                "updated_at": "2026-05-17T20:24:11Z",
            },
            {
                "id": AUTO_REVIEW_SESSION_ID,
                "updated_at": "2026-05-17T20:31:02Z",
            },
        ],
    )
    _write_jsonl(
        log_path,
        [
            _entry("session_meta", {"id": SESSION_ID}),
            _entry(
                "turn_context",
                {
                    "turn_id": "turn-a",
                    "model": "gpt-5.5",
                    "effort": "xhigh",
                    "cwd": "/tmp/codex-usage-tracker",
                },
            ),
            _entry(
                "response_item",
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "SECRET RAW PROMPT "
                            + "sk"
                            + "-proj-abcdefghijklmnopqrstuvwxyz123456 "
                            + "AKIAIOSFODNN7EXAMPLE "
                            + "Authorization: Bearer abc.def.ghi123456789 "
                            + "xoxb-123456789012-123456789012-abcdefghijklmnopqrstuvwx "
                            + "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
                            + "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkNvZGV4In0."
                            + "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c "
                            + "client_secret=super-secret-value "
                            + "-----BEGIN OPENSSH PRIVATE KEY-----abc123-----END OPENSSH PRIVATE KEY-----",
                        }
                    ],
                },
            ),
            _token_event(100, 100),
            _token_event(300, 200),
        ],
    )
    _write_jsonl(
        second_log_path,
        [
            _entry(
                "session_meta",
                {
                    "id": SECOND_SESSION_ID,
                    "thread_source": "subagent",
                    "source": {
                        "subagent": {
                            "thread_spawn": {
                                "parent_thread_id": SESSION_ID,
                                "agent_nickname": "Verifier",
                                "agent_role": "test_runner",
                            }
                        }
                    },
                },
            ),
            _entry(
                "turn_context",
                {
                    "turn_id": "turn-c",
                    "model": "gpt-5.5",
                    "effort": "medium",
                    "cwd": "/tmp/codex-usage-tracker",
                },
            ),
            _token_event(50, 50),
        ],
    )
    _write_jsonl(
        auto_review_log_path,
        [
            _entry(
                "session_meta",
                {
                    "id": AUTO_REVIEW_SESSION_ID,
                    "thread_source": "subagent",
                    "source": {"subagent": {"other": "guardian"}},
                },
            ),
            _entry(
                "turn_context",
                {
                    "turn_id": "turn-d",
                    "model": "codex-auto-review",
                    "effort": "low",
                    "cwd": "/tmp/codex-usage-tracker",
                },
            ),
            _token_event(50, 50),
        ],
    )
    return codex_home


def _make_claude_home(tmp_path: Path) -> Path:
    claude_home = tmp_path / ".claude"
    log_path = claude_home / "projects" / "project-a" / "session.jsonl"
    log_path.parent.mkdir(parents=True)
    rows = [
        {
            "type": "assistant",
            "timestamp": "2026-06-08T12:00:00.000Z",
            "sessionId": "claude-session-1",
            "cwd": "/tmp/claude-project",
            "message": {
                "id": "msg-001",
                "role": "assistant",
                "model": "claude-sonnet-4-20250514",
                "usage": {
                    "input_tokens": 100,
                    "cache_creation_input_tokens": 20,
                    "cache_read_input_tokens": 50,
                    "output_tokens": 30,
                },
                "content": [{"type": "text", "text": "SECRET CLAUDE TEXT"}],
            },
        },
        {
            "type": "assistant",
            "timestamp": "2026-06-08T12:05:00.000Z",
            "sessionId": "claude-session-1",
            "cwd": "/tmp/claude-project",
            "message": {
                "id": "msg-002",
                "role": "assistant",
                "model": "claude-sonnet-4-20250514",
                "usage": {
                    "input_tokens": 40,
                    "cache_read_input_tokens": 10,
                    "output_tokens": 60,
                },
            },
        },
    ]
    log_path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
    return claude_home


def _write_archived_log(codex_home: Path) -> Path:
    archived_log_path = (
        codex_home
        / "archived_sessions"
        / f"rollout-2026-05-17T17-00-00-{ARCHIVED_SESSION_ID}.jsonl"
    )
    _write_jsonl(
        archived_log_path,
        [
            _entry("session_meta", {"id": ARCHIVED_SESSION_ID}),
            _entry(
                "turn_context",
                {
                    "turn_id": "turn-archived",
                    "model": "gpt-5.5",
                    "effort": "low",
                    "cwd": "/tmp/codex-usage-tracker",
                },
            ),
            _token_event(900, 900),
        ],
    )
    return archived_log_path


def _is_archived_source_file(source_file: str) -> bool:
    return "archived_sessions" in Path(source_file).parts


def _write_pricing(path: Path) -> Path:
    path.write_text(
        json.dumps(
            {
                "models": {
                    "gpt-5.5": {
                        "input_per_million": 2.0,
                        "cached_input_per_million": 0.5,
                        "output_per_million": 10.0,
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    return path


def _assert_contract(payload: object) -> None:
    assert validate_json_payload_contract(payload) == []


def _http_error_json(url: str, headers: dict[str, str] | None = None) -> dict[str, object]:
    request = urllib.request.Request(url, headers=headers or {})
    try:
        urllib.request.urlopen(request, timeout=5)  # noqa: S310 - local test server only
    except urllib.error.HTTPError as exc:
        return {
            "status": exc.code,
            "payload": json.loads(exc.read().decode("utf-8")),
        }
    raise AssertionError("expected HTTPError")


def _fake_pricing_update(
    path: Path,
    tier: str = "standard",
    include_estimates: bool = True,
    include_deepseek: bool = False,
    include_anthropic: bool = False,
) -> PricingUpdateResult:
    return PricingUpdateResult(
        path=path,
        source_url="https://example.test/pricing.md",
        tier=tier,
        fetched_at="2026-05-17T00:00:00+00:00",
        model_count=1 + int(include_deepseek) + int(include_anthropic),
        estimated_model_count=1 if include_estimates else 0,
        deepseek_model_count=1 if include_deepseek else 0,
        anthropic_model_count=1 if include_anthropic else 0,
        alias_count=(2 if include_deepseek else 0) + (2 if include_anthropic else 0),
        source_urls=(
            "https://example.test/pricing.md",
            "https://example.test/deepseek-pricing",
        )
        if include_deepseek
        else ("https://example.test/pricing.md",),
        backup_path=None,
    )


def _append_codex_rate_limits(codex_home: Path) -> None:
    log_path = next((codex_home / "sessions").glob("**/*.jsonl"))
    rows = [
        json.loads(line)
        for line in log_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    for row in reversed(rows):
        payload = row.get("payload")
        if (
            row.get("type") == "event_msg"
            and isinstance(payload, dict)
            and payload.get("type") == "token_count"
        ):
            row["timestamp"] = "2026-06-09T02:00:00Z"
            payload["rate_limits"] = {
                "limit_id": "codex",
                "primary": {
                    "used_percent": 40,
                    "window_minutes": 300,
                },
                "secondary": {
                    "used_percent": 10,
                    "window_minutes": 10080,
                },
            }
            break
    else:
        raise AssertionError("expected a token_count row in synthetic Codex log")
    _write_jsonl(log_path, rows)


def _token_event(cumulative_total: int, last_total: int) -> dict[str, object]:
    return _entry(
        "event_msg",
        {
            "type": "token_count",
            "info": {
                "total_token_usage": {
                    "input_tokens": cumulative_total - 25,
                    "cached_input_tokens": 25,
                    "output_tokens": 25,
                    "reasoning_output_tokens": 5,
                    "total_tokens": cumulative_total,
                },
                "last_token_usage": {
                    "input_tokens": last_total - 25,
                    "cached_input_tokens": 10,
                    "output_tokens": 25,
                    "reasoning_output_tokens": 5,
                    "total_tokens": last_total,
                },
                "model_context_window": 258400,
            },
        },
    )


def _entry(entry_type: str, payload: dict[str, object]) -> dict[str, object]:
    return {
        "timestamp": "2026-05-17T18:58:27.000Z",
        "type": entry_type,
        "payload": payload,
    }


def _write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(row) + "\n" for row in rows),
        encoding="utf-8",
    )


def _rollup_event(record_id: str, event_timestamp: str, **overrides: object) -> UsageEvent:
    base = UsageEvent(
        record_id=record_id,
        session_id="session-rollup",
        thread_name="Rollup thread",
        session_updated_at="2026-07-01T00:00:00Z",
        event_timestamp=event_timestamp,
        source_file="/tmp/synthetic/rollups.jsonl",
        line_number=1,
        source_provider="openai",
        source_app="codex",
        source_format="codex-jsonl-v1",
        provider_request_id=None,
        turn_id=None,
        turn_timestamp=event_timestamp,
        cwd="/tmp/project",
        model="gpt-5.5",
        effort="high",
        current_date="2026-07-01",
        timezone="UTC",
        thread_source="user",
        subagent_type=None,
        agent_role=None,
        agent_nickname=None,
        parent_session_id=None,
        parent_thread_name=None,
        parent_session_updated_at=None,
        model_context_window=200000,
        cache_creation_input_tokens=0,
        input_tokens=1000,
        cached_input_tokens=600,
        output_tokens=50,
        reasoning_output_tokens=5,
        total_tokens=1050,
        cumulative_input_tokens=1000,
        cumulative_cached_input_tokens=600,
        cumulative_output_tokens=50,
        cumulative_reasoning_output_tokens=5,
        cumulative_total_tokens=1050,
    )
    return replace(base, **overrides) if overrides else base


def test_query_usage_rollups_buckets_hourly_and_filters(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    upsert_usage_events(
        [
            _rollup_event("rollup-1", "2026-07-01T10:05:00.000Z"),
            _rollup_event("rollup-2", "2026-07-01T10:55:00.000Z"),
            _rollup_event(
                "rollup-3",
                "2026-07-01T11:05:00.000Z",
                source_provider="anthropic",
                source_app="claude-code",
                model="claude-sonnet-5",
                effort=None,
            ),
        ],
        db_path=db_path,
    )

    rollups = query_usage_rollups(db_path=db_path)
    windowed = query_usage_rollups(db_path=db_path, since="2026-07-01T11:00:00Z")

    assert [
        (group["bucket_utc_hour"], group["source_provider"], group["model"], group["event_count"])
        for group in rollups
    ] == [
        ("2026-07-01T10", "openai", "gpt-5.5", 2),
        ("2026-07-01T11", "anthropic", "claude-sonnet-5", 1),
    ]
    first = rollups[0]
    assert first["input_tokens"] == 2000
    assert first["cached_input_tokens"] == 1200
    assert first["output_tokens"] == 100
    assert first["reasoning_output_tokens"] == 10
    assert first["total_tokens"] == 2100
    assert {group["thread_type"] for group in rollups} == {"parent"}
    assert [group["bucket_utc_hour"] for group in windowed] == ["2026-07-01T11"]


def test_dashboard_payload_rollups_stay_complete_when_rows_truncated(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    upsert_usage_events(
        [
            _rollup_event("rollup-1", "2026-07-01T10:05:00.000Z"),
            _rollup_event("rollup-2", "2026-07-02T10:05:00.000Z"),
            _rollup_event("rollup-3", "2026-07-03T10:05:00.000Z"),
        ],
        db_path=db_path,
    )

    payload = dashboard_payload(db_path=db_path, limit=1, pricing_path=pricing_path)

    assert len(payload["rows"]) == 1
    assert payload["usage_rollups_bucket"] == "utc-hour"
    rollups = payload["usage_rollups"]
    assert len(rollups) == 3
    assert sum(group["total_tokens"] for group in rollups) == 3150
    assert sum(group["event_count"] for group in rollups) == 3
    expected_cost = (400 * 2.0 + 600 * 0.5 + 50 * 10.0) / 1_000_000
    for group in rollups:
        assert group["pricing_model"] == "gpt-5.5"
        assert group["pricing_estimated"] is False
        assert abs(group["estimated_cost_usd"] - expected_cost) < 1e-12


def test_thread_rollups_attach_subagents_to_parent_thread(tmp_path: Path) -> None:
    from codex_usage_tracker.threads import build_thread_rollups

    db_path = tmp_path / "usage.sqlite3"
    upsert_usage_events(
        [
            _rollup_event(
                "parent-1",
                "2026-07-01T10:05:00.000Z",
                session_id="sess-parent",
                thread_name="Parent thread",
            ),
            _rollup_event(
                "parent-2",
                "2026-07-01T10:25:00.000Z",
                session_id="sess-parent",
                thread_name="Parent thread",
            ),
            _rollup_event(
                "spawned-1",
                "2026-07-01T10:35:00.000Z",
                session_id="sess-child",
                thread_name=None,
                thread_source="subagent",
                subagent_type="thread_spawn",
                parent_session_id="sess-parent",
            ),
        ],
        db_path=db_path,
    )

    groups = query_thread_session_groups(db_path=db_path)
    rollups = build_thread_rollups(groups)

    assert {group["resolved_parent_thread_name"] for group in groups} == {None, "Parent thread"}
    assert [
        (group["thread_key"], group["thread_label"], group["thread_type"], group["event_count"])
        for group in rollups
    ] == [
        ("thread:Parent thread", "Parent thread", "parent", 2),
        ("thread:Parent thread", "Parent thread", "spawned", 1),
    ]
    assert sum(group["total_tokens"] for group in rollups) == 3150
    assert rollups[0]["max_context_ratio"] is not None


def test_dashboard_payload_thread_rollups_complete_and_slim(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    upsert_usage_events(
        [
            _rollup_event(
                "parent-1",
                "2026-07-01T10:05:00.000Z",
                session_id="sess-parent",
                thread_name="Parent thread",
            ),
            _rollup_event(
                "other-1",
                "2026-07-02T09:05:00.000Z",
                session_id="sess-other",
                thread_name="Other thread",
            ),
        ],
        db_path=db_path,
    )

    payload = dashboard_payload(db_path=db_path, limit=1, pricing_path=pricing_path)

    thread_rollups = payload["thread_rollups"]
    assert len(payload["rows"]) == 1
    assert {group["thread_label"] for group in thread_rollups} == {
        "Parent thread",
        "Other thread",
    }
    expected_cost = (400 * 2.0 + 600 * 0.5 + 50 * 10.0) / 1_000_000
    for group in thread_rollups:
        assert abs(group["estimated_cost_usd"] - expected_cost) < 1e-12
        assert "usage_credits" in group
        assert "usage_credit_confidence" in group
        assert "usage_credit_source" not in group
    for group in payload["usage_rollups"]:
        assert group["thread_type"] == "parent"
        assert "usage_credits" in group
        assert "usage_credit_source" not in group


def test_rollup_cost_components_sum_to_the_estimated_cost(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    upsert_usage_events(
        [
            _rollup_event("rollup-1", "2026-07-01T10:05:00.000Z"),
            _rollup_event(
                "rollup-2",
                "2026-07-01T11:05:00.000Z",
                model="model-without-a-price",
            ),
        ],
        db_path=db_path,
    )

    payload = dashboard_payload(db_path=db_path, limit=5, pricing_path=pricing_path)
    by_model = {group["model"]: group for group in payload["usage_rollups"]}

    priced = by_model["gpt-5.5"]
    assert abs(priced["cost_uncached_input_usd"] - (400 * 2.0) / 1_000_000) < 1e-12
    assert abs(priced["cost_cached_input_usd"] - (600 * 0.5) / 1_000_000) < 1e-12
    assert abs(priced["cost_output_usd"] - (50 * 10.0) / 1_000_000) < 1e-12
    components = (
        priced["cost_uncached_input_usd"]
        + priced["cost_cached_input_usd"]
        + priced["cost_output_usd"]
    )
    assert abs(components - priced["estimated_cost_usd"]) < 1e-12

    unpriced = by_model["model-without-a-price"]
    assert unpriced["estimated_cost_usd"] is None
    assert unpriced["cost_uncached_input_usd"] is None
    assert unpriced["cost_cached_input_usd"] is None
    assert unpriced["cost_output_usd"] is None


def test_rollups_expose_project_identity_without_leaking_paths(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    upsert_usage_events(
        [
            _rollup_event("rollup-1", "2026-07-01T10:05:00.000Z", cwd=str(tmp_path / "alpha")),
            _rollup_event(
                "rollup-2",
                "2026-07-01T10:15:00.000Z",
                session_id="sess-beta",
                thread_name="Beta thread",
                cwd=str(tmp_path / "beta"),
            ),
        ],
        db_path=db_path,
    )

    payload = dashboard_payload(db_path=db_path, limit=1, pricing_path=pricing_path)

    for key in ("usage_rollups", "thread_rollups"):
        groups = payload[key]
        assert {group["project_name"] for group in groups} == {"alpha", "beta"}, key
        # cwd is a grouping input only; the raw path must never reach a payload.
        assert all("cwd" not in group for group in groups), key
        assert all("project_key" not in group for group in groups), key
        assert all("git_remote_hash" not in group for group in groups), key

    redacted = dashboard_payload(
        db_path=db_path,
        limit=1,
        pricing_path=pricing_path,
        privacy_mode="redacted",
    )
    assert all(
        group["project_name"].startswith("Project ")
        for group in redacted["usage_rollups"]
    )


def test_rollups_split_projects_while_keeping_totals_exact(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    events = [
        _rollup_event("rollup-1", "2026-07-01T10:05:00.000Z", cwd=str(tmp_path / "alpha")),
        _rollup_event("rollup-2", "2026-07-01T10:25:00.000Z", cwd=str(tmp_path / "alpha")),
        _rollup_event("rollup-3", "2026-07-01T10:45:00.000Z", cwd=str(tmp_path / "beta")),
    ]
    upsert_usage_events(events, db_path=db_path)

    payload = dashboard_payload(db_path=db_path, limit=1, pricing_path=pricing_path)
    usage_rollups = payload["usage_rollups"]

    # Same hour and model, so only the added cwd dimension separates them.
    assert len(usage_rollups) == 2
    assert sum(group["event_count"] for group in usage_rollups) == len(events)
    assert sum(group["total_tokens"] for group in usage_rollups) == 1050 * len(events)
    # Both rollup sets aggregate the same rows, which is what lets the dashboard
    # swap to thread rollups while searching without changing any total.
    assert sum(group["event_count"] for group in payload["thread_rollups"]) == len(events)
    assert abs(
        sum(group["estimated_cost_usd"] for group in usage_rollups)
        - sum(group["estimated_cost_usd"] for group in payload["thread_rollups"])
    ) < 1e-12


def test_rollups_carry_cache_creation_tokens(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    upsert_usage_events(
        [
            _rollup_event(
                "rollup-1",
                "2026-07-01T10:05:00.000Z",
                cache_creation_input_tokens=120,
            ),
            _rollup_event(
                "rollup-2",
                "2026-07-01T10:25:00.000Z",
                cache_creation_input_tokens=80,
            ),
        ],
        db_path=db_path,
    )

    payload = dashboard_payload(db_path=db_path, limit=1, pricing_path=pricing_path)

    assert sum(g["cache_creation_input_tokens"] for g in payload["usage_rollups"]) == 200
    assert sum(g["cache_creation_input_tokens"] for g in payload["thread_rollups"]) == 200


def test_dashboard_rows_carry_cost_components_for_the_call_rail(tmp_path: Path) -> None:
    db_path = tmp_path / "usage.sqlite3"
    pricing_path = _write_pricing(tmp_path / "pricing.json")
    upsert_usage_events(
        [_rollup_event("rollup-1", "2026-07-01T10:05:00.000Z")],
        db_path=db_path,
    )

    row = dashboard_payload(db_path=db_path, pricing_path=pricing_path)["rows"][0]
    components = (
        row["cost_uncached_input_usd"]
        + row["cost_cached_input_usd"]
        + row["cost_output_usd"]
    )
    assert abs(components - row["estimated_cost_usd"]) < 1e-12

    # Compact live rows stay lean; the rail hydrates components on demand
    # through the single-row detail endpoint.
    compact = dashboard_payload(
        db_path=db_path,
        pricing_path=pricing_path,
        compact_rows=True,
    )["rows"][0]
    assert "cost_uncached_input_usd" not in compact
    detail = dashboard_record_payload(
        db_path=db_path,
        record_id="rollup-1",
        pricing_path=pricing_path,
    )
    assert detail is not None
    assert abs(detail["cost_uncached_input_usd"] - (400 * 2.0) / 1_000_000) < 1e-12
