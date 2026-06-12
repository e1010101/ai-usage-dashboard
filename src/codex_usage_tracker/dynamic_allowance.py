"""Dynamic Codex usage allowance windows parsed from local JSONL rate limits."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from codex_usage_tracker.adapters.codex_jsonl import find_session_logs
from codex_usage_tracker.allowance import AllowanceWindow, parse_windows
from codex_usage_tracker.paths import DEFAULT_CLAUDE_LIMITS_PATH

CLAUDE_LIMITS_SCHEMA = "codex-usage-tracker-claude-limits-v1"


@dataclass(frozen=True)
class DynamicAllowanceSnapshot:
    windows: list[AllowanceWindow]
    source: dict[str, Any]
    error: str | None = None


def parse_codex_rate_limit_windows(
    rate_limits: object, *, event_timestamp: str | None = None
) -> list[AllowanceWindow]:
    """Convert account-level Codex rate limits into allowanced-style windows."""

    if not isinstance(rate_limits, dict):
        return []
    limit_id = rate_limits.get("limit_id")
    if limit_id not in (None, "", "codex"):
        return []

    windows_by_key: dict[str, AllowanceWindow] = {}
    key_order: list[str] = []
    for bucket in ("primary", "secondary"):
        raw = rate_limits.get(bucket)
        if not isinstance(raw, dict):
            continue

        used_percent = _optional_percent(raw.get("used_percent"))
        if used_percent is None:
            continue
        window_minutes = _optional_positive_number(raw.get("window_minutes"))
        if window_minutes is None:
            continue

        key = "five_hour" if window_minutes <= 300 else "weekly"
        reset_at = _optional_reset_timestamp(raw.get("resets_at"))
        window = AllowanceWindow(
            key=key,
            label="5h" if key == "five_hour" else "Weekly",
            remaining_percent=used_percent,
            reset_at=reset_at,
            captured_at=event_timestamp,
        )
        if key not in windows_by_key:
            key_order.append(key)
        windows_by_key[key] = window

    return [windows_by_key[key] for key in key_order]


def parse_claude_rate_limit_windows(
    rate_limits: object, *, event_timestamp: str | None = None
) -> list[AllowanceWindow]:
    """Convert Claude Code statusLine rate limits into provider limit windows."""

    if not isinstance(rate_limits, dict):
        return []
    windows: list[AllowanceWindow] = []
    for raw_key, key, label in (
        ("five_hour", "five_hour", "5h"),
        ("seven_day", "weekly", "7d"),
    ):
        raw = rate_limits.get(raw_key)
        if not isinstance(raw, dict):
            continue
        remaining_percent = _optional_percent(raw.get("used_percentage"))
        if remaining_percent is None:
            continue
        windows.append(
            AllowanceWindow(
                key=key,
                label=label,
                remaining_percent=remaining_percent,
                reset_at=_optional_reset_timestamp(raw.get("resets_at")),
                captured_at=event_timestamp,
            )
        )
    return windows


def load_dynamic_codex_allowance_snapshot(
    codex_home: Path, *, include_archived: bool = False
) -> DynamicAllowanceSnapshot:
    """Read Codex logs and return the latest account-level allowance snapshot."""

    latest: dict[str, Any] | None = None
    latest_dt: datetime | None = None
    latest_line = -1
    line_cursor = 0

    logs = find_session_logs(codex_home.expanduser(), include_archived=include_archived)
    for path in logs:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line_cursor += 1
                try:
                    envelope = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(envelope, dict):
                    continue
                if envelope.get("type") != "event_msg":
                    continue
                event_payload = envelope.get("payload")
                if not isinstance(event_payload, dict):
                    continue
                if event_payload.get("type") != "token_count":
                    continue

                windows = parse_codex_rate_limit_windows(
                    event_payload.get("rate_limits"),
                    event_timestamp=_optional_str(envelope.get("timestamp")),
                )
                if not windows:
                    continue

                timestamp = _optional_str(envelope.get("timestamp"))
                parsed = _parse_timestamp(timestamp)
                candidate = {"timestamp": timestamp, "windows": windows}
                if parsed is not None:
                    if (
                        latest_dt is None
                        or parsed > latest_dt
                        or (parsed == latest_dt and line_cursor > latest_line)
                    ):
                        latest = candidate
                        latest_dt = parsed
                        latest_line = line_cursor
                elif latest is None or (latest_dt is None and line_cursor > latest_line):
                    latest = candidate
                    latest_line = line_cursor

    if not latest:
        return DynamicAllowanceSnapshot(windows=[], source={})

    return DynamicAllowanceSnapshot(
        windows=latest["windows"],
        source={
            "name": "Local Codex rate-limit snapshot",
            "captured_at": latest["timestamp"],
            "exact_allowance_source": True,
            "note": "Read from local Codex JSONL token_count rate_limits; raw transcript content is not persisted.",
        },
    )


def write_claude_statusline_snapshot(
    statusline_payload: object,
    *,
    path: Path = DEFAULT_CLAUDE_LIMITS_PATH,
    captured_at: str | None = None,
) -> Path:
    """Write a sanitized Claude Code statusLine rate-limit snapshot for dashboards."""

    if not isinstance(statusline_payload, dict):
        raise ValueError("Claude status-line payload must be a JSON object")
    captured = captured_at or _utc_now()
    windows = parse_claude_rate_limit_windows(
        statusline_payload.get("rate_limits"),
        event_timestamp=captured,
    )
    if not windows:
        raise ValueError("Claude status-line payload did not include rate_limits")
    source: dict[str, Any] = {
        "name": "Local Claude Code status-line snapshot",
        "captured_at": captured,
        "exact_limit_source": True,
        "note": (
            "Read from Claude Code statusLine rate_limits JSON; raw transcript content "
            "and status-line input are not persisted."
        ),
    }
    session_id = _optional_str(statusline_payload.get("session_id"))
    version = _optional_str(statusline_payload.get("version"))
    if session_id:
        source["session_id"] = session_id
    if version:
        source["claude_code_version"] = version

    payload = {
        "schema": CLAUDE_LIMITS_SCHEMA,
        "provider": "anthropic",
        "app": "claude-code",
        "windows": [asdict(window) for window in windows],
        "source": source,
    }
    output = path.expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return output


def load_dynamic_claude_limit_snapshot(
    path: Path = DEFAULT_CLAUDE_LIMITS_PATH,
) -> DynamicAllowanceSnapshot:
    """Read the latest sanitized Claude Code statusLine limit snapshot."""

    expanded = path.expanduser()
    if not expanded.exists():
        return DynamicAllowanceSnapshot(windows=[], source={})
    try:
        raw = json.loads(expanded.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("Claude limit snapshot must be a JSON object")
        schema = raw.get("schema")
        if schema and schema != CLAUDE_LIMITS_SCHEMA:
            raise ValueError(f"unsupported Claude limit snapshot schema: {schema}")
        windows = parse_windows(raw.get("windows", []))
        source = raw.get("source") if isinstance(raw.get("source"), dict) else {}
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        return DynamicAllowanceSnapshot(windows=[], source={}, error=str(exc))
    return DynamicAllowanceSnapshot(windows=windows, source=source if windows else {})


def _optional_str(value: object) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def _optional_positive_number(value: object) -> float | None:
    if isinstance(value, bool) or value is None or value == "":
        return None
    try:
        if isinstance(value, int | float) or (isinstance(value, str) and value.strip()):
            parsed = float(value)
        else:
            return None
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return parsed


def _optional_reset_timestamp(value: object) -> str | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(
            microsecond=0
        ).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OSError):
        return None


def _optional_percent(value: object) -> float | None:
    used_percent = _optional_positive_number(value)
    if used_percent is None or used_percent > 100:
        return None
    return round(max(0.0, min(1.0, 1.0 - (used_percent / 100.0))), 6)


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
