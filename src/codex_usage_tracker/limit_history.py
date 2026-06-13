"""Append-only history of provider usage-limit snapshots for burn-down analytics.

Each entry stores only provider identity, capture timestamp, and per-window
remaining percentages with reset timestamps. No transcript or prompt content
ever reaches this file.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from codex_usage_tracker.allowance import AllowanceWindow
from codex_usage_tracker.paths import DEFAULT_LIMIT_HISTORY_PATH

LIMIT_HISTORY_SCHEMA = "codex-usage-tracker-limit-history-v1"
LIMIT_HISTORY_MAX_ENTRIES = 4000
_HISTORY_NOTE = (
    "Provider usage-limit snapshots over time; only provider, capture timestamp, "
    "window key, remaining percentage, and reset timestamp are stored."
)


def record_limit_history(
    provider: str,
    windows: list[AllowanceWindow],
    *,
    captured_at: str | None,
    path: Path = DEFAULT_LIMIT_HISTORY_PATH,
    max_entries: int = LIMIT_HISTORY_MAX_ENTRIES,
) -> Path | None:
    """Append one sanitized limit snapshot, skipping consecutive duplicates."""

    sanitized_windows = [_sanitize_window(window) for window in windows]
    sanitized_windows = [window for window in sanitized_windows if window is not None]
    if not provider or not sanitized_windows:
        return None
    entry: dict[str, Any] = {
        "provider": provider,
        "captured_at": captured_at,
        "windows": sanitized_windows,
    }

    expanded = path.expanduser()
    entries = _load_entries(expanded)
    last_for_provider = next(
        (existing for existing in reversed(entries) if existing.get("provider") == provider),
        None,
    )
    if last_for_provider is not None and _same_snapshot(last_for_provider, entry):
        return expanded

    entries.append(entry)
    if len(entries) > max_entries:
        entries = entries[len(entries) - max_entries:]

    payload = {
        "schema": LIMIT_HISTORY_SCHEMA,
        "note": _HISTORY_NOTE,
        "entries": entries,
    }
    try:
        expanded.parent.mkdir(parents=True, exist_ok=True)
        expanded.write_text(json.dumps(payload, sort_keys=True) + "\n", encoding="utf-8")
    except OSError:
        return None
    return expanded


def load_limit_history(
    path: Path = DEFAULT_LIMIT_HISTORY_PATH,
    *,
    max_entries: int | None = None,
) -> list[dict[str, Any]]:
    """Read the recorded limit-snapshot history, newest entries last."""

    entries = _load_entries(path.expanduser())
    if max_entries is not None and len(entries) > max_entries:
        return entries[len(entries) - max_entries:]
    return entries


def _load_entries(expanded: Path) -> list[dict[str, Any]]:
    try:
        raw = json.loads(expanded.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(raw, dict):
        return []
    schema = raw.get("schema")
    if schema and schema != LIMIT_HISTORY_SCHEMA:
        return []
    entries = raw.get("entries")
    if not isinstance(entries, list):
        return []
    return [entry for entry in entries if isinstance(entry, dict) and entry.get("provider")]


def _sanitize_window(window: AllowanceWindow | dict[str, Any]) -> dict[str, Any] | None:
    raw = asdict(window) if isinstance(window, AllowanceWindow) else window
    if not isinstance(raw, dict):
        return None
    key = raw.get("key")
    remaining_percent = raw.get("remaining_percent")
    if not isinstance(key, str) or not key:
        return None
    if not isinstance(remaining_percent, int | float) or isinstance(remaining_percent, bool):
        return None
    sanitized: dict[str, Any] = {
        "key": key,
        "remaining_percent": round(float(remaining_percent), 6),
    }
    label = raw.get("label")
    if isinstance(label, str) and label:
        sanitized["label"] = label
    reset_at = raw.get("reset_at")
    if isinstance(reset_at, str) and reset_at:
        sanitized["reset_at"] = reset_at
    return sanitized


def _same_snapshot(left: dict[str, Any], right: dict[str, Any]) -> bool:
    def signature(entry: dict[str, Any]) -> list[tuple[Any, Any, Any]]:
        windows = entry.get("windows")
        if not isinstance(windows, list):
            return []
        return sorted(
            (
                window.get("key"),
                window.get("remaining_percent"),
                window.get("reset_at"),
            )
            for window in windows
            if isinstance(window, dict)
        )

    return signature(left) == signature(right)
