# Dynamic Usage Remaining Design

## Goal

Add dynamic Codex "Usage Remaining" data to the dashboard without requiring users to manually copy allowance percentages into `~/.codex-usage-tracker/allowance.json`.

This slice follows the local-first pattern used by `graykode/abtop`: read account-level rate-limit data already present in local agent state, convert it into allowance windows, and keep the dashboard aggregate-only. The first implementation targets Codex only. Claude Code statusLine hook support is deferred because it modifies `~/.claude/settings.json` and needs separate hook-safety design.

## Non-Goals

- Do not call OpenAI, ChatGPT, Claude, or any remote account API.
- Do not scrape browser sessions or require auth tokens.
- Do not infer Claude, Gemini, or DeepSeek allowance state in this slice.
- Do not persist prompts, assistant text, tool output, or transcript snippets.
- Do not remove manual allowance config; it remains useful for overrides and unsupported sources.

## Source Data

Codex JSONL `event_msg` records with `payload.type == "token_count"` may include a sibling `rate_limits` object. Account-level Codex rows use `limit_id == "codex"` or no `limit_id`. Model-specific limit rows should be ignored.

Window mapping:

- `primary` or `secondary` entries with `window_minutes <= 300` map to `five_hour`.
- Entries with `window_minutes > 300` map to `weekly`.
- `used_percent` is converted to `remaining_percent = 1 - used_percent / 100`.
- `resets_at` epoch seconds becomes an ISO `reset_at` timestamp.
- The source timestamp becomes `captured_at` when available.

The latest valid account-level rate-limit snapshot wins. This mirrors the practical dashboard need: show the most recent known remaining window state, not a historical average.

## Architecture

Add a small dynamic allowance provider beside the existing allowance helpers. It should expose one clear function, for example:

```python
load_dynamic_allowance_windows(codex_home: Path, *, include_archived: bool = False) -> list[AllowanceWindow]
```

The provider scans active Codex session logs by default and includes archived logs only when the dashboard/report request explicitly opts into archived history. It parses only `rate_limits` metadata and timestamps. It does not read or return message text.

`load_allowance_config()` gains an optional dynamic-window input or delegates to a new merge helper. The merge rules are:

1. Manual `allowance.json` windows win when they contain a non-null `remaining_percent`, `remaining_credits`, or `total_credits`.
2. Dynamic Codex windows fill missing manual windows.
3. If neither source has windows, the dashboard behaves as it does today.

`summarize_allowance_usage()` should include source metadata that lets the UI say whether windows came from `dynamic_codex_rate_limits`, `manual_allowance_config`, or a mixed source.

## CLI And Dashboard Flow

Dashboard generation and localhost refresh should load dynamic Codex allowance data by default. Users should not need a new setup command for Codex dynamic remaining usage.

Manual commands stay:

- `init-allowance`
- `parse-allowance`

Docs should describe manual allowance as an override/fallback, not the primary path for Codex rows.

The dashboard should keep the current `Usage Remaining` card, but its hover/copy should indicate when values came from the latest local Codex rate-limit snapshot. If dynamic data is stale or missing, keep the existing "configure allowance" guidance.

## Privacy

Dynamic allowance parsing should not write to SQLite or create a new local config file by default. Dashboard payloads and generated static HTML may include only aggregate allowance-window metadata:

- source name
- captured timestamp
- reset timestamp
- remaining percentage
- optional raw used percentage if needed for diagnostics

It must not persist raw JSONL records, prompts, assistant messages, tool output, or source excerpts. Generated dashboard HTML remains aggregate-only.

## Error Handling

- Malformed `rate_limits` objects are ignored and counted in diagnostics only if the code already has a natural place to surface that count.
- Missing `resets_at` is allowed; the dashboard can still show a remaining percentage without reset context.
- Stale dynamic data should be shown with `captured_at`, not silently treated as live.
- Manual config errors should continue to surface as today; dynamic windows should not mask invalid local override files.

## Tests

Add focused tests for:

- Parsing a Codex account-level `rate_limits` object into 5-hour and weekly allowance windows.
- Ignoring model-specific Codex rate-limit objects.
- Manual allowance windows overriding dynamic windows.
- Dashboard payload exposing dynamic allowance windows when no manual config exists.
- Dashboard payload staying aggregate-only.
- Existing `parse-allowance`, `init-allowance`, and Codex credit-rate tests continuing to pass.

## Rollout

1. Add dynamic Codex rate-limit parser tests.
2. Implement the parser and allowance merge behavior.
3. Wire dashboard payload and localhost refresh to include dynamic windows by default.
4. Update README, dashboard guide, pricing/credits docs, privacy docs, and bundled skills.
5. Run focused allowance/dashboard tests, then the release gate.

## Deferred Follow-Up

Claude Code dynamic rate limits should use a statusLine hook similar to `abtop --setup`, but it needs a separate design for:

- safe modification of `~/.claude/settings.json`
- detection of an existing `statusLine` command
- hook chaining or explicit refusal when another hook is configured
- Windows-compatible hook script generation
- stale-file display semantics for `~/.claude/*rate-limits.json`
