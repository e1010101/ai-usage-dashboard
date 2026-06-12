# Dynamic Usage Remaining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard populate Codex Usage Remaining from local Codex JSONL `rate_limits` snapshots, while keeping manual allowance JSON as an override/fallback.

**Architecture:** Add a focused dynamic allowance reader that scans Codex logs for account-level `payload.rate_limits` on `event_msg` token-count entries and converts the latest snapshot into existing `AllowanceWindow` objects. Merge those dynamic windows into `load_allowance_config()` without writing new files, then pass `codex_home` through dashboard generation, live dashboard refresh, and MCP generation. Keep credit rate-card metadata separate from remaining-window metadata by adding `allowance_window_source` to dashboard payloads.

**Tech Stack:** Python 3.10+, SQLite-backed aggregate dashboard, pytest, node syntax checks for bundled dashboard JavaScript.

---

## File Structure

- Modify `.gitignore` so the local `.codex/` MCP config directory stays untracked.
- Create `src/codex_usage_tracker/dynamic_allowance.py` for local Codex `rate_limits` parsing and snapshot loading.
- Modify `src/codex_usage_tracker/allowance.py` to merge dynamic windows with manual allowance windows and expose `window_source` metadata.
- Modify `src/codex_usage_tracker/dashboard.py` to accept an optional `codex_home` and attach dynamic windows when provided.
- Modify `src/codex_usage_tracker/server.py`, `src/codex_usage_tracker/cli.py`, and `src/codex_usage_tracker/mcp_server.py` to pass the Codex home into dashboard generation and live `/api/usage`.
- Modify `src/codex_usage_tracker/plugin_data/dashboard/dashboard.js` to show the remaining-window source separately from the credit rate-card source.
- Modify `tests/test_allowance.py` for parser and merge behavior.
- Modify `tests/test_store_dashboard_mcp.py` for dashboard payload and live server behavior.
- Modify docs and skill copies: `README.md`, `docs/dashboard-guide.md`, `docs/pricing-and-credits.md`, `docs/privacy.md`, `skills/codex-usage-tracker/SKILL.md`, and `src/codex_usage_tracker/plugin_data/skills/codex-usage-tracker/SKILL.md`.

## Task 1: Ignore Local `.codex/`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add `.codex/` to ignored local state**

Add this entry near `.cache/`:

```gitignore
.codex/
```

- [ ] **Step 2: Verify the directory is ignored**

Run:

```powershell
git check-ignore -v .codex/config.toml
git status --short --branch
```

Expected:

```text
.gitignore:<line>:.codex/	.codex/config.toml
## codex/dynamic-usage-remaining
 M .gitignore
```

- [ ] **Step 3: Commit the ignore rule**

Run:

```powershell
git add .gitignore
git commit -m "chore: ignore local codex config"
```

Expected: one commit with only `.gitignore`.

## Task 2: Parse Dynamic Codex Rate-Limit Windows

**Files:**
- Create: `src/codex_usage_tracker/dynamic_allowance.py`
- Test: `tests/test_allowance.py`

- [ ] **Step 1: Write failing parser tests**

Add these imports to `tests/test_allowance.py`:

```python
from codex_usage_tracker.dynamic_allowance import (
    load_dynamic_codex_allowance_snapshot,
    parse_codex_rate_limit_windows,
)
```

Add these tests:

```python
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
                "resets_at": 1774686045,
            },
        },
        event_timestamp="2026-06-09T00:00:00Z",
    )

    assert windows == []


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_allowance.py::test_parse_codex_rate_limits_builds_allowance_windows tests/test_allowance.py::test_parse_codex_rate_limits_ignores_model_specific_limits tests/test_allowance.py::test_load_dynamic_codex_allowance_snapshot_uses_latest_snapshot -v
```

Expected: import failure because `codex_usage_tracker.dynamic_allowance` does not exist.

- [ ] **Step 3: Implement the dynamic allowance module**

Create `src/codex_usage_tracker/dynamic_allowance.py` with these public shapes:

```python
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from codex_usage_tracker.adapters.codex_jsonl import find_session_logs
from codex_usage_tracker.allowance import AllowanceWindow


@dataclass(frozen=True)
class DynamicAllowanceSnapshot:
    windows: list[AllowanceWindow]
    source: dict[str, Any]
    error: str | None = None


def parse_codex_rate_limit_windows(
    rate_limits: object,
    *,
    event_timestamp: str | None = None,
) -> list[AllowanceWindow]:
    """Convert account-level Codex rate_limits into allowance windows."""
```

Implementation details:
- Accept only dictionaries.
- Accept `limit_id` values of `None`, missing, `""`, or `"codex"`.
- Reject any other `limit_id`.
- Read only `primary` and `secondary` dictionaries.
- Map entries with `window_minutes <= 300` to key `five_hour`, label `5h`.
- Map entries with `window_minutes > 300` to key `weekly`, label `Weekly`.
- Read numeric `used_percent` in the range `0` to `100`.
- Convert remaining percent to `round(max(0.0, min(1.0, 1.0 - used_percent / 100.0)), 6)`.
- Convert numeric `resets_at` epoch seconds to UTC ISO strings ending in `Z`.
- Set `captured_at` to the event timestamp string.
- Deduplicate by key and keep the last entry for a key in the `primary`, `secondary` order.

Add snapshot loading with this behavior:

```python
def load_dynamic_codex_allowance_snapshot(
    codex_home: Path,
    *,
    include_archived: bool = False,
) -> DynamicAllowanceSnapshot:
    """Read Codex logs and return the latest account-level allowance snapshot."""
```

Implementation details:
- Use `find_session_logs(codex_home.expanduser(), include_archived=include_archived)`.
- For each JSONL line, parse JSON and ignore invalid JSON.
- Only inspect envelopes where `type == "event_msg"` and `payload.type == "token_count"`.
- Do not inspect raw messages, prompts, assistant content, or tool output.
- Parse `payload.rate_limits` with `parse_codex_rate_limit_windows()`.
- Keep the snapshot with the latest parseable `timestamp`; if timestamps are missing or unparsable, keep the latest valid line encountered.
- Return an empty `DynamicAllowanceSnapshot` when no dynamic windows are found.
- Source metadata for non-empty snapshots:

```python
{
    "name": "Local Codex rate-limit snapshot",
    "captured_at": latest_timestamp,
    "exact_allowance_source": True,
    "note": "Read from local Codex JSONL token_count rate_limits; raw transcript content is not persisted.",
}
```

- [ ] **Step 4: Run parser tests to verify they pass**

Run:

```powershell
python -m pytest tests/test_allowance.py::test_parse_codex_rate_limits_builds_allowance_windows tests/test_allowance.py::test_parse_codex_rate_limits_ignores_model_specific_limits tests/test_allowance.py::test_load_dynamic_codex_allowance_snapshot_uses_latest_snapshot -v
```

Expected: all three tests pass.

- [ ] **Step 5: Commit parser work**

Run:

```powershell
git add src/codex_usage_tracker/dynamic_allowance.py tests/test_allowance.py
git commit -m "feat: parse codex rate limit windows"
```

## Task 3: Merge Dynamic and Manual Allowance Windows

**Files:**
- Modify: `src/codex_usage_tracker/allowance.py`
- Test: `tests/test_allowance.py`

- [ ] **Step 1: Write failing merge tests**

Add these tests to `tests/test_allowance.py`:

```python
def test_load_allowance_config_uses_dynamic_windows_when_manual_missing(tmp_path: Path) -> None:
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


def test_load_allowance_config_manual_window_overrides_dynamic_window(tmp_path: Path) -> None:
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
```

Add `AllowanceWindow` to the existing `codex_usage_tracker.allowance` import list.

- [ ] **Step 2: Run merge tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_allowance.py::test_load_allowance_config_uses_dynamic_windows_when_manual_missing tests/test_allowance.py::test_load_allowance_config_manual_window_overrides_dynamic_window -v
```

Expected: failure because `load_allowance_config()` does not accept `dynamic_windows`.

- [ ] **Step 3: Implement merge behavior**

Modify `UsageAllowanceConfig`:

```python
    window_source: dict[str, Any] | None = None
```

Modify `load_allowance_config()` signature:

```python
def load_allowance_config(
    path: Path = DEFAULT_ALLOWANCE_PATH,
    *,
    rate_card_path: Path = DEFAULT_RATE_CARD_PATH,
    dynamic_windows: list[AllowanceWindow] | None = None,
    dynamic_source: dict[str, Any] | None = None,
) -> UsageAllowanceConfig:
```

Add helpers:

```python
def _merge_allowance_windows(
    manual_windows: list[AllowanceWindow],
    dynamic_windows: list[AllowanceWindow],
) -> list[AllowanceWindow]:
    merged: list[AllowanceWindow] = []
    dynamic_by_key = {window.key: window for window in dynamic_windows}
    manual_keys: set[str] = set()
    for manual in manual_windows:
        manual_keys.add(manual.key)
        if _allowance_window_has_values(manual):
            merged.append(manual)
        elif manual.key in dynamic_by_key:
            merged.append(dynamic_by_key[manual.key])
        else:
            merged.append(manual)
    for dynamic in dynamic_windows:
        if dynamic.key not in manual_keys:
            merged.append(dynamic)
    return merged


def _allowance_window_has_values(window: AllowanceWindow) -> bool:
    return (
        window.remaining_percent is not None
        or window.remaining_credits is not None
        or window.total_credits is not None
    )
```

Manual source rules:
- If the manual file contains an object `_source`, preserve that object as the manual window source.
- If a manual file exists without `_source`, use:

```python
{
    "name": "Local allowance config",
    "url": str(path.expanduser()),
    "exact_allowance_source": False,
}
```

Merged source rules:
- No manual source and dynamic windows exist: `window_source = dynamic_source`.
- Manual source and no dynamic windows: `window_source = manual_source`.
- Manual source and dynamic windows exist:

```python
{
    "name": "Local allowance config with dynamic Codex fallback",
    "url": str(path.expanduser()),
    "manual_source": manual_source,
    "dynamic_source": dynamic_source,
}
```

`loaded` rules:
- `loaded=True` when the manual file loaded successfully or dynamic windows are present.
- `loaded=False` only when no manual file loaded and no dynamic windows are present.

Modify `summarize_allowance_usage()` to return both:

```python
"source": resolved.source,
"window_source": resolved.window_source,
```

- [ ] **Step 4: Run merge tests**

Run:

```powershell
python -m pytest tests/test_allowance.py::test_load_allowance_config_uses_dynamic_windows_when_manual_missing tests/test_allowance.py::test_load_allowance_config_manual_window_overrides_dynamic_window tests/test_allowance.py -v
```

Expected: all `tests/test_allowance.py` tests pass.

- [ ] **Step 5: Commit merge work**

Run:

```powershell
git add src/codex_usage_tracker/allowance.py tests/test_allowance.py
git commit -m "feat: merge dynamic allowance windows"
```

## Task 4: Wire Dashboard, CLI, Server, and MCP

**Files:**
- Modify: `src/codex_usage_tracker/dashboard.py`
- Modify: `src/codex_usage_tracker/server.py`
- Modify: `src/codex_usage_tracker/cli.py`
- Modify: `src/codex_usage_tracker/mcp_server.py`
- Modify: `src/codex_usage_tracker/plugin_data/dashboard/dashboard.js`
- Test: `tests/test_store_dashboard_mcp.py`

- [ ] **Step 1: Write failing dashboard tests**

Add this helper to `tests/test_store_dashboard_mcp.py` near the other log helpers:

```python
def _append_codex_rate_limits(codex_home: Path) -> None:
    log_path = next((codex_home / "sessions").glob("**/*.jsonl"))
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(
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
            )
            + "\n"
        )
```

Add this payload test:

```python
def test_dashboard_payload_uses_dynamic_codex_allowance_windows(tmp_path: Path) -> None:
    codex_home = _make_codex_home(tmp_path)
    _append_codex_rate_limits(codex_home)
    db_path = tmp_path / "usage.sqlite3"
    refresh_usage_index(codex_home=codex_home, db_path=db_path)

    payload = dashboard_payload(db_path=db_path, codex_home=codex_home)

    assert payload["allowance_configured"] is True
    assert payload["allowance_window_source"]["name"] == "Local Codex rate-limit snapshot"
    assert [(window["key"], window["remaining_percent"]) for window in payload["allowance_windows"]] == [
        ("five_hour", 0.6),
        ("weekly", 0.9),
    ]
```

Add one live server assertion in the existing `/api/usage` test after it creates `codex_home`:

```python
_append_codex_rate_limits(codex_home)
```

Then assert after `limited_payload` is loaded:

```python
assert limited_payload["allowance_window_source"]["name"] == "Local Codex rate-limit snapshot"
```

- [ ] **Step 2: Run dashboard tests to verify they fail**

Run:

```powershell
python -m pytest tests/test_store_dashboard_mcp.py::test_dashboard_payload_uses_dynamic_codex_allowance_windows -v
```

Expected: failure because `dashboard_payload()` does not accept `codex_home`.

- [ ] **Step 3: Wire dynamic windows into dashboard payload**

Modify `dashboard_payload()`:

```python
def dashboard_payload(
    db_path: Path,
    limit: int | None = 5000,
    offset: int = 0,
    pricing_path: Path = DEFAULT_PRICING_PATH,
    allowance_path: Path = DEFAULT_ALLOWANCE_PATH,
    rate_card_path: Path = DEFAULT_RATE_CARD_PATH,
    codex_home: Path | None = None,
    since: str | None = None,
    ...
) -> dict[str, object]:
```

Load dynamic windows only when `codex_home` is not `None`:

```python
dynamic_allowance = (
    load_dynamic_codex_allowance_snapshot(
        codex_home,
        include_archived=include_archived,
    )
    if codex_home is not None
    else None
)
allowance = load_allowance_config(
    allowance_path,
    rate_card_path=rate_card_path,
    dynamic_windows=dynamic_allowance.windows if dynamic_allowance else None,
    dynamic_source=dynamic_allowance.source if dynamic_allowance else None,
)
```

Return both source fields:

```python
"allowance_source": allowance_summary["source"],
"allowance_window_source": allowance_summary["window_source"],
```

Modify `generate_dashboard()` to accept `codex_home: Path | None = None` and pass it to `dashboard_payload()`.

- [ ] **Step 4: Pass Codex home through callers**

Modify callers:
- `src/codex_usage_tracker/cli.py`: pass `codex_home=args.codex_home` in `_run_dashboard()` and `_run_open_dashboard()`.
- `src/codex_usage_tracker/server.py`: pass `codex_home=codex_home` to the initial `generate_dashboard()` call and `codex_home=self._codex_home` to live `dashboard_payload()`.
- `src/codex_usage_tracker/mcp_server.py`: pass `codex_home=DEFAULT_CODEX_HOME` to `generate_dashboard()`.

Modify `dashboard.js` state:

```javascript
let allowanceWindowSource = initialPayload.allowance_window_source || {};
```

Modify live refresh state:

```javascript
allowanceWindowSource = nextPayload.allowance_window_source || {};
```

Modify `updateAllowanceSourceLine()` title construction so credit source and window source are separate:

```javascript
const creditSourceName = allowanceSource.name || 'Codex credit rates';
const windowSourceName = allowanceWindowSource.name || 'Manual allowance windows';
```

Use `creditSourceName` for `Credit rates: ...` and use `windowSourceName` in the allowance-window title text.

- [ ] **Step 5: Run dashboard tests and JS syntax check**

Run:

```powershell
python -m pytest tests/test_store_dashboard_mcp.py::test_dashboard_payload_uses_dynamic_codex_allowance_windows tests/test_store_dashboard_mcp.py::test_dashboard_server_context_api_requires_token_and_redacts_raw_context -v
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard.js
```

Expected: selected tests pass and Node reports no syntax errors.

- [ ] **Step 6: Commit dashboard wiring**

Run:

```powershell
git add src/codex_usage_tracker/dashboard.py src/codex_usage_tracker/server.py src/codex_usage_tracker/cli.py src/codex_usage_tracker/mcp_server.py src/codex_usage_tracker/plugin_data/dashboard/dashboard.js tests/test_store_dashboard_mcp.py
git commit -m "feat: wire dynamic allowance dashboard"
```

## Task 5: Update Docs and Skill Guidance

**Files:**
- Modify: `README.md`
- Modify: `docs/dashboard-guide.md`
- Modify: `docs/pricing-and-credits.md`
- Modify: `docs/privacy.md`
- Modify: `skills/codex-usage-tracker/SKILL.md`
- Modify: `src/codex_usage_tracker/plugin_data/skills/codex-usage-tracker/SKILL.md`

- [ ] **Step 1: Update text about Usage Remaining**

Update docs to say:
- Codex dashboard Usage Remaining is populated dynamically from local Codex JSONL `rate_limits` when available.
- `~/.codex-usage-tracker/allowance.json` remains useful for manual overrides, exact total credits, or environments without dynamic snapshots.
- Manual windows with `remaining_percent`, `remaining_credits`, or `total_credits` override dynamic windows with the same key.
- Claude Code status-line capture is deferred and not installed by this package.
- Dynamic reading inspects aggregate rate-limit metadata only and does not persist transcript content.

- [ ] **Step 2: Verify docs contain the new source wording**

Run:

```powershell
rg -n "rate_limits|manual overrides|Claude Code status-line|dynamic" README.md docs skills src/codex_usage_tracker/plugin_data/skills
```

Expected: matches appear in the files listed above.

- [ ] **Step 3: Commit docs**

Run:

```powershell
git add README.md docs/dashboard-guide.md docs/pricing-and-credits.md docs/privacy.md skills/codex-usage-tracker/SKILL.md src/codex_usage_tracker/plugin_data/skills/codex-usage-tracker/SKILL.md
git commit -m "docs: explain dynamic usage remaining"
```

## Task 6: Final Verification

**Files:**
- Read-only verification across changed files.

- [ ] **Step 1: Run focused Python tests**

Run:

```powershell
python -m pytest tests/test_allowance.py tests/test_store_dashboard_mcp.py -v
```

Expected: all tests pass.

- [ ] **Step 2: Run compile and JS checks**

Run:

```powershell
python -m compileall src
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard.js
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard_state.js
git diff --check
```

Expected: all commands exit with code 0.

- [ ] **Step 3: Run release smoke checks for changed surfaces**

Run:

```powershell
python scripts/check_release.py
codex-usage-tracker dashboard --output $env:TEMP\codex-usage-dashboard.html --codex-home .codex
codex-usage-tracker open-dashboard --json --output $env:TEMP\codex-usage-dashboard.html --codex-home .codex
```

Expected:
- `scripts/check_release.py` exits 0.
- Dashboard command writes an HTML file.
- Open-dashboard JSON includes `schema`, `dashboard_path`, and `include_archived`.

- [ ] **Step 4: Inspect repository state**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -6
```

Expected: clean worktree on `codex/dynamic-usage-remaining`, with commits for ignore, parser, merge, dashboard wiring, and docs.

## Self-Review

Spec coverage:
- Dynamic Codex JSONL `rate_limits` parser: Task 2.
- Account-level filtering and model-specific rejection: Task 2 tests and implementation details.
- Manual fallback/override behavior: Task 3.
- Dashboard and live refresh wiring: Task 4.
- `.codex/` local directory handling: Task 1.
- Claude status-line hook deferred: Task 5 docs.
- Privacy boundary: Tasks 2 and 5.

Placeholder scan:
- The plan contains no `TBD`, no unresolved `TODO`, and no "implement later" steps.
- Each code-changing task includes exact paths, function signatures, tests, commands, and expected results.

Type consistency:
- `AllowanceWindow` stays the shared window type.
- `DynamicAllowanceSnapshot.windows` feeds `load_allowance_config(dynamic_windows=...)`.
- Dashboard payload keeps `allowance_source` for credit rates and adds `allowance_window_source` for remaining-window provenance.
