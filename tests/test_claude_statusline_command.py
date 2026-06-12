from __future__ import annotations

import json
import os
import shlex
from pathlib import Path

from codex_usage_tracker.claude_statusline import (
    build_claude_statusline_command,
    decode_statusline_command,
    install_claude_limits_statusline,
)


def test_statusline_command_survives_git_bash(tmp_path: Path) -> None:
    """Claude Code runs statusLine commands through Git Bash on Windows, where
    unquoted backslashes are escape characters and silently disappear."""

    limits_path = tmp_path / "claude-limits.json"
    command = build_claude_statusline_command(
        limits_path=limits_path,
        original_command="powershell -File C:/Users/demo/statusline.ps1",
    )

    if os.name == "nt":
        assert "\\" not in command

    parts = shlex.split(command)
    assert "claude-statusline" in parts
    assert parts[parts.index("--limits-path") + 1] == limits_path.as_posix()
    encoded = parts[parts.index("--original-command-base64") + 1]
    assert decode_statusline_command(encoded) == "powershell -File C:/Users/demo/statusline.ps1"


def test_force_reinstall_preserves_wrapped_original_command(tmp_path: Path) -> None:
    """Force reinstall must keep the user's original statusline chained, not drop it."""

    claude_home = tmp_path / ".claude"
    claude_home.mkdir()
    original = "powershell -NoProfile -File C:/Users/demo/statusline.ps1"
    (claude_home / "settings.json").write_text(
        json.dumps({"statusLine": {"type": "command", "command": original}}),
        encoding="utf-8",
    )
    limits_path = tmp_path / "claude-limits.json"

    install_claude_limits_statusline(claude_home=claude_home, limits_path=limits_path)
    result = install_claude_limits_statusline(
        claude_home=claude_home, limits_path=limits_path, force=True
    )

    parts = shlex.split(result.command)
    encoded = parts[parts.index("--original-command-base64") + 1]
    assert decode_statusline_command(encoded) == original


def test_statusline_command_posixifies_tracker_command(tmp_path: Path) -> None:
    command = build_claude_statusline_command(
        limits_path=tmp_path / "claude-limits.json",
        tracker_command=["C:\\Python313\\python.exe", "-m", "codex_usage_tracker"],
    )

    if os.name == "nt":
        assert "\\" not in command
        assert "C:/Python313/python.exe" in shlex.split(command)
