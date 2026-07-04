# CLI Reference

This page lists the common command-line workflows. For tested JSON contract ids, payload shapes, and error codes, see [CLI And MCP JSON Schemas](cli-json-schemas.md).

## Index And Setup

Refresh the local aggregate index:

```bash
ai-usage-dashboard refresh
ai-usage-dashboard refresh --source all
ai-usage-dashboard refresh --source claude-code --claude-home ~/.claude
ai-usage-dashboard refresh --source hermes --hermes-home "%LOCALAPPDATA%\hermes"
```

Rebuild the local aggregate index after parser or schema changes:

```bash
ai-usage-dashboard rebuild-index
ai-usage-dashboard rebuild-index --source all
```

`refresh` defaults to `--source all`, which scans every supported source whose local root exists. Use `--source codex` for Codex JSONL files at `~/.codex/sessions`, `--source claude-code` for Claude Code JSONL files under `~/.claude/projects`, or `--source hermes` for Hermes aggregate `state.db` under `%LOCALAPPDATA%\hermes` on Windows or `~/.hermes` elsewhere. `rebuild-index` clears only the local aggregate `usage_events` and refresh metadata tables, then rescans the selected local sources.

Inspect one source log without writing to SQLite:

```bash
ai-usage-dashboard inspect-log ~/.codex/sessions/YYYY/MM/DD/rollout-...jsonl
ai-usage-dashboard inspect-log ~/.codex/sessions/YYYY/MM/DD/rollout-...jsonl --json
ai-usage-dashboard inspect-log ~/.claude/projects/<project>/<session>.jsonl --json
```

`inspect-log` reports parser adapter, aggregate token-count events, session ids, models, and parser diagnostics. It does not store raw prompts, assistant messages, tool output, or transcript snippets.

## Dashboard

```bash
ai-usage-dashboard dashboard --open
ai-usage-dashboard dashboard --active-only --open
ai-usage-dashboard open-dashboard
ai-usage-dashboard serve-dashboard --open
ai-usage-dashboard serve-dashboard --source all --open
ai-usage-dashboard serve-dashboard --no-context-api --open
```

`serve-dashboard --context-api explicit` is the default and keeps context loading as an explicit per-row action. `serve-dashboard --no-context-api` or `--context-api disabled` serves live aggregate refresh while disabling `/api/context` entirely.

Dashboards default to all history. Use `--active-only` for an active-session static/opened dashboard, or switch the served dashboard's `History` control from `All history` to `Active sessions only` when you intentionally want archived rows hidden. `--include-archived` remains accepted for compatibility and is now the dashboard default.

The localhost `/api/usage` endpoint accepts `limit` and `offset` query parameters, so automation can page aggregate rows without asking the server to load an entire large history at once.

Claude Code remaining limits appear on the Claude Code tab when `~/.codex-usage-tracker/claude-limits.json` exists. Run `ai-usage-dashboard install-claude-limits-statusline` once to configure Claude Code to keep that snapshot filled automatically.

## Summaries

```bash
ai-usage-dashboard summary --group-by model
ai-usage-dashboard summary --group-by source_app
ai-usage-dashboard summary --group-by source_provider
ai-usage-dashboard summary --group-by project
ai-usage-dashboard summary --group-by project_tag
ai-usage-dashboard summary --group-by thread --limit 20
ai-usage-dashboard summary --preset today
ai-usage-dashboard summary --preset last-7-days
ai-usage-dashboard summary --preset expensive
ai-usage-dashboard summary --preset by-subagent-role
ai-usage-dashboard expensive --limit 10
ai-usage-dashboard recommendations --limit 10
ai-usage-dashboard pricing-coverage
```

Useful investigations:

- Sort by `Highest Codex credits` to find calls or threads consuming the most usage allowance.
- Sort by `Cache` to find threads that are mostly new context versus mostly reused context.
- Sort by `Context` to find calls approaching the model context window.
- Filter by model or reasoning effort to compare usage patterns across model choices.
- Group by `source_app` or `source_provider` to compare Codex, Claude Code, Hermes, and provider aggregate usage.
- Use `summary --preset by-subagent-role` to see whether delegated work is driving a large share of usage.
- Use `expensive --limit 10` for a quick list of the highest-cost calls.
- Use `recommendations --json` for ranked action rows and thread rollups with severity score, primary recommendation, and secondary signals.

## JSON Queries

```bash
ai-usage-dashboard query --since 2026-06-01 --project ai-usage-dashboard --min-credits 1
ai-usage-dashboard query --source-app claude-code
ai-usage-dashboard query --source-app hermes
ai-usage-dashboard query --source-provider anthropic --limit 0
ai-usage-dashboard query --pricing-status unpriced --limit 0
ai-usage-dashboard recommendations --since 2026-06-01 --json
ai-usage-dashboard recommendations --source-app codex --json
ai-usage-dashboard summary --group-by model --json
ai-usage-dashboard session <session-id> --json
```

Use `query` when you need stable JSON for automation across source provider/app, project, model, effort, thread, pricing, token, or credit filters.

## Session And Context

Show one session:

```bash
ai-usage-dashboard session <session-id>
```

Load one call's logged context on demand:

```bash
ai-usage-dashboard context <record-id>
```

Raw context is read from the original local JSONL source only when explicitly requested. It is not written to SQLite, CSV, or generated dashboard HTML.

## Export

```bash
ai-usage-dashboard export --output usage.csv
ai-usage-dashboard export --output usage.csv --limit 0
```

Use `--privacy-mode redacted` or `--privacy-mode strict` before sharing CSV output.

## Local Config

```bash
ai-usage-dashboard update-pricing
ai-usage-dashboard pin-pricing --output ~/.codex-usage-tracker/pricing-2026-06-05.json
ai-usage-dashboard init-pricing
ai-usage-dashboard update-rate-card
ai-usage-dashboard init-allowance
ai-usage-dashboard parse-allowance "5h 79% 6:50 PM Weekly 33% Jun 7"
ai-usage-dashboard install-claude-limits-statusline
ai-usage-dashboard capture-claude-limits --quiet
ai-usage-dashboard init-thresholds
ai-usage-dashboard init-projects
```

Local config files live under `~/.codex-usage-tracker/` and are never committed by this project.

`update-pricing` refreshes OpenAI-published text-token pricing by default. Add `--include-deepseek` to include DeepSeek API pricing and compatibility aliases in the same local cache. Configure other non-OpenAI model prices manually in `~/.codex-usage-tracker/pricing.json` when you want USD estimates for rows whose provider is not covered by the updater.

`install-claude-limits-statusline` updates `~/.claude/settings.json` so Claude Code calls the tracker from its `statusLine` command. If you already have a status line, the installer wraps and preserves that command and writes a backup of the settings file before changing it.

`capture-claude-limits` is the lower-level stdin command used by the wrapper. It reads Claude Code status-line JSON and writes a sanitized local snapshot with only provider identity, remaining percentages, reset timestamps, and source metadata.

## Privacy Mode

`--privacy-mode` is a global option, so place it before the subcommand:

```bash
ai-usage-dashboard --privacy-mode redacted dashboard --open
ai-usage-dashboard --privacy-mode strict export --output usage-redacted.csv
ai-usage-dashboard --privacy-mode strict query --since 2026-06-01
```

`normal` keeps local project metadata visible. `redacted` hides raw `cwd` and source paths, hides Git remote labels, and replaces unnamed projects with stable hashed labels. `strict` also hides project-relative cwd, Git branch, and project tags.
