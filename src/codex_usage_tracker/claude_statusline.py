"""Claude Code status-line integration helpers."""

from __future__ import annotations

import base64
import binascii
import json
import os
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from codex_usage_tracker.dynamic_allowance import write_claude_statusline_snapshot
from codex_usage_tracker.paths import DEFAULT_CLAUDE_HOME, DEFAULT_CLAUDE_LIMITS_PATH

CLAUDE_STATUSLINE_SUBCOMMAND = "claude-statusline"


@dataclass(frozen=True)
class ClaudeStatusLineInstallResult:
    claude_home: Path
    settings_path: Path
    limits_path: Path
    command: str
    backup_path: Path | None
    installed: bool
    changed: bool
    already_installed: bool
    wrapped_existing: bool


def install_claude_limits_statusline(
    *,
    claude_home: Path = DEFAULT_CLAUDE_HOME,
    limits_path: Path = DEFAULT_CLAUDE_LIMITS_PATH,
    force: bool = False,
    tracker_command: list[str] | None = None,
) -> ClaudeStatusLineInstallResult:
    """Install a Claude Code statusLine wrapper that captures rate-limit snapshots."""

    expanded_home = claude_home.expanduser()
    expanded_limits_path = limits_path.expanduser()
    settings_path = expanded_home / "settings.json"
    settings = _read_settings(settings_path)
    status_line = settings.get("statusLine")
    if status_line is None:
        status_line_config: dict[str, object] = {}
    elif isinstance(status_line, dict):
        status_line_config = dict(status_line)
    else:
        raise ValueError("Claude settings statusLine must be an object when present")

    existing_command = _optional_nonempty_str(status_line_config.get("command"))
    already_installed = bool(existing_command and _is_tracker_statusline_command(existing_command))
    if existing_command is not None and already_installed and not force:
        return ClaudeStatusLineInstallResult(
            claude_home=expanded_home,
            settings_path=settings_path,
            limits_path=expanded_limits_path,
            command=existing_command,
            backup_path=None,
            installed=True,
            changed=False,
            already_installed=True,
            wrapped_existing=False,
        )

    if already_installed:
        original_command = _extract_wrapped_original_command(existing_command)
    else:
        original_command = existing_command
    command = build_claude_statusline_command(
        limits_path=expanded_limits_path,
        original_command=original_command,
        tracker_command=tracker_command,
    )
    status_line_config["type"] = "command"
    status_line_config["command"] = command
    settings["statusLine"] = status_line_config

    backup_path = _write_settings(settings_path, settings)
    return ClaudeStatusLineInstallResult(
        claude_home=expanded_home,
        settings_path=settings_path,
        limits_path=expanded_limits_path,
        command=command,
        backup_path=backup_path,
        installed=True,
        changed=True,
        already_installed=False,
        wrapped_existing=bool(original_command),
    )


def build_claude_statusline_command(
    *,
    limits_path: Path,
    original_command: str | None = None,
    tracker_command: list[str] | None = None,
) -> str:
    """Build the shell command stored in Claude Code's settings.json."""

    command_parts = list(tracker_command or [sys.executable, "-m", "codex_usage_tracker"])
    command_parts.extend(
        [
            CLAUDE_STATUSLINE_SUBCOMMAND,
            "--limits-path",
            limits_path.expanduser().as_posix(),
        ]
    )
    if original_command:
        command_parts.extend(["--original-command-base64", encode_statusline_command(original_command)])
    return _join_shell_command(command_parts)


def encode_statusline_command(command: str) -> str:
    """Encode an existing status-line shell command for wrapper storage."""

    return base64.urlsafe_b64encode(command.encode("utf-8")).decode("ascii")


def decode_statusline_command(encoded: str) -> str:
    """Decode an existing status-line shell command from wrapper storage."""

    try:
        return base64.urlsafe_b64decode(encoded.encode("ascii")).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise ValueError("invalid encoded Claude status-line command") from exc


def capture_claude_statusline_input(raw: str, *, limits_path: Path) -> bool:
    """Best-effort capture of Claude Code statusLine JSON without noisy failures."""

    if not raw.strip():
        return False
    try:
        payload = json.loads(raw)
        write_claude_statusline_snapshot(payload, path=limits_path)
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return False
    return True


def run_original_statusline_command(
    command: str,
    *,
    stdin_text: str,
) -> subprocess.CompletedProcess[str]:
    """Run a user's original status-line command with the same stdin."""

    return subprocess.run(
        command,
        input=stdin_text,
        capture_output=True,
        text=True,
        shell=True,
        check=False,
    )


def _read_settings(settings_path: Path) -> dict[str, object]:
    expanded = settings_path.expanduser()
    if not expanded.exists():
        return {}
    try:
        raw = json.loads(expanded.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid Claude settings JSON at {expanded}: {exc}") from exc
    if not isinstance(raw, dict):
        raise ValueError("Claude settings JSON must be an object")
    return raw


def _write_settings(settings_path: Path, settings: dict[str, object]) -> Path | None:
    expanded = settings_path.expanduser()
    backup_path = _backup_settings(expanded) if expanded.exists() else None
    expanded.parent.mkdir(parents=True, exist_ok=True)
    expanded.write_text(json.dumps(settings, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    return backup_path


def _backup_settings(settings_path: Path) -> Path:
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup_path = settings_path.with_name(f"{settings_path.name}.{timestamp}.bak")
    backup_path.write_text(settings_path.read_text(encoding="utf-8"), encoding="utf-8")
    return backup_path


def _extract_wrapped_original_command(command: str | None) -> str | None:
    if not command:
        return None
    match = _ORIGINAL_COMMAND_RE.search(command)
    if match is None:
        return None
    try:
        return decode_statusline_command(match.group(1))
    except ValueError:
        return None


_ORIGINAL_COMMAND_RE = re.compile(r"--original-command-base64[\s=]+['\"]?([A-Za-z0-9_=-]+)")


def _is_tracker_statusline_command(command: str) -> bool:
    return CLAUDE_STATUSLINE_SUBCOMMAND in command and (
        "codex_usage_tracker" in command or "codex-usage-tracker" in command
    )


def _optional_nonempty_str(value: object) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def _join_shell_command(command_parts: list[str]) -> str:
    # Claude Code executes statusLine commands through Git Bash even on Windows,
    # where unquoted backslashes are escape characters and silently disappear.
    if os.name == "nt":
        command_parts = [part.replace("\\", "/") for part in command_parts]
    return shlex.join(command_parts)
