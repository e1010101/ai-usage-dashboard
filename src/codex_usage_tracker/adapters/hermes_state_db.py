"""Parse Hermes aggregate session state into usage records."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from collections.abc import MutableMapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from codex_usage_tracker.models import SessionInfo, UsageEvent

HERMES_STATE_DB_ADAPTER_VERSION = "hermes-state-db-v1"
HERMES_STATE_DB_DIAGNOSTIC_KEYS = (
    "missing_sessions_table",
    "invalid_session_row",
    "invalid_model_config",
    "invalid_integer",
    "skipped_events",
)
_SESSION_COLUMNS = (
    "id",
    "source",
    "model",
    "parent_session_id",
    "started_at",
    "ended_at",
    "input_tokens",
    "output_tokens",
    "cache_read_tokens",
    "cache_write_tokens",
    "reasoning_tokens",
    "cwd",
    "git_branch",
    "git_repo_root",
    "billing_provider",
    "billing_base_url",
    "billing_mode",
    "model_config",
    "title",
)


@dataclass(frozen=True)
class HermesStateDbAdapter:
    """Versioned parser adapter for Hermes aggregate SQLite state."""

    source_provider: str = "deepseek"
    source_app: str = "hermes"
    source_format: str = HERMES_STATE_DB_ADAPTER_VERSION

    def discover_logs(self, root: Path, *, include_archived: bool = False) -> list[Path]:
        del include_archived
        state_db = root / "state.db"
        return [state_db] if state_db.is_file() else []

    def load_session_index(self, root: Path) -> dict[str, SessionInfo]:
        del root
        return {}

    def parse_file(
        self,
        path: Path,
        session_index: dict[str, SessionInfo] | None = None,
        stats: MutableMapping[str, int] | None = None,
    ) -> list[UsageEvent]:
        del session_index
        if not path.exists():
            return []
        with sqlite3.connect(path) as conn:
            conn.row_factory = sqlite3.Row
            if not _sessions_table_exists(conn):
                _increment_stat(stats, "missing_sessions_table")
                _increment_stat(stats, "skipped_events")
                return []
            rows = _session_rows(conn)
        parent_info = _parent_info(rows)
        events: list[UsageEvent] = []
        for row in rows:
            try:
                event = _build_event(path, row, parent_info, stats)
            except ValueError:
                _increment_stat(stats, "invalid_session_row")
                _increment_stat(stats, "skipped_events")
                continue
            if event.total_tokens <= 0:
                continue
            events.append(event)
        return events


def compact_hermes_diagnostics(stats: MutableMapping[str, int]) -> dict[str, int]:
    return {
        key: int(stats.get(key, 0))
        for key in HERMES_STATE_DB_DIAGNOSTIC_KEYS
        if stats.get(key, 0)
    }


def _sessions_table_exists(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'"
    ).fetchone()
    return row is not None


def _session_rows(conn: sqlite3.Connection) -> list[dict[str, object]]:
    columns = {
        str(row["name"])
        for row in conn.execute("PRAGMA table_info(sessions)").fetchall()
    }
    selected = [column for column in _SESSION_COLUMNS if column in columns]
    if "id" not in selected:
        return []
    order_by = "started_at, id" if "started_at" in columns else "id"
    rows = conn.execute(f"SELECT {', '.join(selected)} FROM sessions ORDER BY {order_by}").fetchall()
    return [{column: row[column] for column in selected} for row in rows]


def _parent_info(rows: list[dict[str, object]]) -> dict[str, tuple[str | None, str | None]]:
    result: dict[str, tuple[str | None, str | None]] = {}
    for row in rows:
        session_id = _optional_str(row.get("id"))
        if not session_id:
            continue
        timestamp = _event_timestamp(row)
        result[session_id] = (_optional_str(row.get("title")), timestamp)
    return result


def _build_event(
    path: Path,
    row: dict[str, object],
    parent_info: dict[str, tuple[str | None, str | None]],
    stats: MutableMapping[str, int] | None,
) -> UsageEvent:
    session_id = _optional_str(row.get("id"))
    if not session_id:
        raise ValueError("missing Hermes session id")
    direct_input = _token_int(row.get("input_tokens"), default=0)
    cache_read = _token_int(row.get("cache_read_tokens"), default=0)
    cache_write = _token_int(row.get("cache_write_tokens"), default=0)
    output_tokens = _token_int(row.get("output_tokens"), default=0)
    reasoning_tokens = _token_int(row.get("reasoning_tokens"), default=0)
    input_tokens = direct_input + cache_read + cache_write
    total_tokens = input_tokens + output_tokens
    event_timestamp = _event_timestamp(row) or ""
    parent_session_id = _optional_str(row.get("parent_session_id"))
    parent_thread_name, parent_session_updated_at = (
        parent_info.get(parent_session_id, (None, None)) if parent_session_id else (None, None)
    )
    return UsageEvent(
        record_id=_record_id(session_id),
        session_id=session_id,
        thread_name=_optional_str(row.get("title")),
        session_updated_at=event_timestamp or None,
        event_timestamp=event_timestamp,
        source_file=str(path),
        line_number=0,
        source_provider=_source_provider(row),
        source_app="hermes",
        source_format=HERMES_STATE_DB_ADAPTER_VERSION,
        provider_request_id=None,
        turn_id=session_id,
        turn_timestamp=event_timestamp or None,
        cwd=_optional_str(row.get("cwd")),
        model=_normalize_model(_optional_str(row.get("model"))),
        effort=_reasoning_effort(row, stats),
        current_date=None,
        timezone=None,
        thread_source=_optional_str(row.get("source")),
        subagent_type="thread_spawn" if parent_session_id else None,
        agent_role=None,
        agent_nickname=None,
        parent_session_id=parent_session_id,
        parent_thread_name=parent_thread_name,
        parent_session_updated_at=parent_session_updated_at,
        model_context_window=None,
        cache_creation_input_tokens=cache_write,
        input_tokens=input_tokens,
        cached_input_tokens=cache_read,
        output_tokens=output_tokens,
        reasoning_output_tokens=reasoning_tokens,
        total_tokens=total_tokens,
        cumulative_input_tokens=input_tokens,
        cumulative_cached_input_tokens=cache_read,
        cumulative_output_tokens=output_tokens,
        cumulative_reasoning_output_tokens=reasoning_tokens,
        cumulative_total_tokens=total_tokens,
    )


def _event_timestamp(row: dict[str, object]) -> str | None:
    return _epoch_to_iso(row.get("ended_at")) or _epoch_to_iso(row.get("started_at"))


def _epoch_to_iso(value: object) -> str | None:
    if value in (None, ""):
        return None
    try:
        timestamp = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z")


def _source_provider(row: dict[str, object]) -> str:
    provider = _optional_str(row.get("billing_provider"))
    if provider:
        return provider
    model = (_optional_str(row.get("model")) or "").lower()
    base_url = (_optional_str(row.get("billing_base_url")) or "").lower()
    if "deepseek" in model or "deepseek" in base_url:
        return "deepseek"
    return "unknown"


def _reasoning_effort(row: dict[str, object], stats: MutableMapping[str, int] | None) -> str | None:
    raw = _optional_str(row.get("model_config"))
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        _increment_stat(stats, "invalid_model_config")
        return None
    if not isinstance(payload, dict):
        _increment_stat(stats, "invalid_model_config")
        return None
    reasoning = payload.get("reasoning_config")
    if not isinstance(reasoning, dict):
        return None
    enabled = reasoning.get("enabled")
    if enabled is False:
        return "off"
    effort = _optional_str(reasoning.get("effort"))
    return effort if enabled is True else None


def _normalize_model(model: str | None) -> str | None:
    if model is None:
        return None
    if "/" not in model:
        return model
    provider, _, name = model.partition("/")
    if provider.lower() in {"deepseek", "openai", "anthropic"} and name:
        return name
    return model


def _record_id(session_id: str) -> str:
    raw = f"hermes|{session_id}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _token_int(value: object, *, default: int) -> int:
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        raise ValueError(f"invalid integer value: {value!r}")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip():
        return int(value)
    raise ValueError(f"invalid integer value: {value!r}")


def _optional_str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _increment_stat(stats: MutableMapping[str, int] | None, key: str) -> None:
    if stats is not None:
        stats[key] = stats.get(key, 0) + 1
