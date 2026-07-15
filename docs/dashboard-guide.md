# Dashboard Guide

> **Unofficial project:** AI Usage Dashboard is independent and is not made by, affiliated with, endorsed by, sponsored by, or supported by OpenAI. OpenAI and Codex are trademarks of OpenAI.

This guide uses synthetic aggregate data. The screenshots do not contain prompts, assistant text, tool output, or real Codex or Claude Code session content.

> **Note:** The dashboard now ships the answer-first weekly-report layout in the Terminal Sunset dark theme. Existing screenshots show the previous table-first UI and will be regenerated from synthetic fixtures; the walkthroughs below describe the current layout.

## Open The Dashboard

For the best experience, run the localhost dashboard server:

```bash
ai-usage-dashboard setup
ai-usage-dashboard update-pricing
ai-usage-dashboard update-rate-card
ai-usage-dashboard refresh --source all
ai-usage-dashboard serve-dashboard --source all --open
```

Use `ai-usage-dashboard serve-dashboard --open` for the default all-sources dashboard. Use `--source codex`, `--source claude-code`, or `--source hermes` for a single-source dashboard; `--source all` indexes Codex, Claude Code, and Hermes when their local roots exist.

The Codex line of the `Usage Limits` card is populated from local Codex JSONL `rate_limits` snapshots when available. For optional manual allowance context, initialize a local template and copy values from Codex Usage or `/status`:

```bash
ai-usage-dashboard init-allowance
ai-usage-dashboard parse-allowance "5h 79% 6:50 PM Weekly 33% Jun 7"
```

The Claude line of the `Usage Limits` card is populated from a sanitized Claude Code status-line snapshot. Claude Code sends `rate_limits` to status-line commands after API responses for plans that expose those limits. To capture those values without storing transcript text, install the tracker wrapper once:

```bash
ai-usage-dashboard install-claude-limits-statusline
```

The installer updates `~/.claude/settings.json`. If you already have a custom Claude status line, it wraps and preserves that command and writes a backup before changing the file. The installed wrapper reads Claude Code's status-line JSON from stdin and writes only provider, window percentages, reset timestamps, and source metadata to `~/.codex-usage-tracker/claude-limits.json`.

To tune review thresholds locally, run `ai-usage-dashboard init-thresholds` and edit `~/.codex-usage-tracker/thresholds.json`. These thresholds control low-cache, high-context, high-uncached-input, large-thread, reasoning-spike, low-output, and high-cost recommendations.

To tune project attribution locally, run `ai-usage-dashboard init-projects` and edit `~/.codex-usage-tracker/projects.json`. The dashboard derives project name, relative cwd, branch, tags, and a hashed remote origin from aggregate `cwd` and local Git metadata when available.

Before sharing screenshots or generated artifacts, use `--privacy-mode redacted` or `--privacy-mode strict` before the subcommand:

```bash
ai-usage-dashboard --privacy-mode strict serve-dashboard --open
ai-usage-dashboard --privacy-mode strict dashboard --open
```

Redacted mode hides raw cwd/source paths, hides Git remote labels, and hashes unnamed projects while preserving configured aliases. Strict mode also hides project-relative cwd, Git branch, and tags. The dashboard footer shows the active metadata mode.

The server keeps the HTML aggregate-only and enables two live features:

- The `[ live ]` chip in the title row auto-refreshes the aggregate rows every 10 seconds and rescans the sources selected when the dashboard server started. Click it to pause or resume live refresh.
- `> load context` in the call-details rail reads one selected model call from the original local JSONL file only when you ask for it.

For a static snapshot, use:

```bash
ai-usage-dashboard dashboard --open
```

Static file mode can still filter, sort, and inspect aggregate call fields. It cannot refresh from logs or load raw context until you open the dashboard through `serve-dashboard`.

The localhost server uses a random per-server token for refresh and context API calls, validates loopback `Host` and `Origin` headers, and can run as aggregate-only with `ai-usage-dashboard serve-dashboard --no-context-api`.

## Header And Filters

The header is one compact row of controls, echoed by a decorative prompt line (`ai-usage-dashboard:~$ usage --range this-week …`) that restates the active state as CLI flags.

- **Search** filters rows by case-insensitive substring across thread, parent thread, model, project, branch, cwd, and source app. Press `/` to focus it.
- **Range presets** — `this week · 7d · month · 30d · all · custom` — control the time window. `this week` starts on Monday, `month` is the calendar month, and `7d`/`30d` are rolling windows including today. `custom` shows start/end date inputs; either end may be left open.
- The **provider switcher** — `[ overview ] [ codex ] [ claude code ]` — scopes everything to one provider or shows both together.
- **`[ + filters ]`** opens a popover with chip rows for model, reasoning effort, pricing confidence (exact / estimated / unpriced), and thread type (parent / spawned / auto-review). The label shows the active-filter count while closed, and a `> clear filters` link resets them.
- The `[ live ]` chip shows refresh status (`live`, `paused`, `static`, `refresh error`); clicking it pauses or resumes live refresh. Details such as the exact refresh time live in hover titles.
- The URL tracks the view, range, provider, search, advanced filters, day selection, sort, pages, and selected thread or call, so an investigation can be reopened or shared by copying the address.

## The Answer Strip

Three cards under the header answer "where did my spend go this period?" at a glance:

- **`:: where did this week go?`** shows total estimated spend and tokens with deltas against the preceding equal-length period, call and thread counts, Codex credits used, and a plain-language sentence naming the top thread by spend, its share, and one diagnostic (heavy context, high cache reuse, or mostly fresh input).
- **`:: spend by day`** stacks estimated cost per day (cyan = Codex, pink = Claude). Ranges longer than ten days switch to weekly buckets and the title becomes `:: spend by week`. **Each bar is clickable**: it filters the whole dashboard to that day or week (click again, or use the ✕ chip in the panel header, to clear). The chart keeps all bars visible while one is selected so they stay comparable.
- **`:: limits remaining`** shows each provider's 5h and weekly windows with remaining-percentage meters (green ≥50%, yellow 25–50%, red <25%). Clicking a provider card focuses that provider, same as the header switcher.

The Codex limits come from local Codex `rate_limits` snapshots; the Claude limits come from the sanitized status-line snapshot at `~/.codex-usage-tracker/claude-limits.json`.

## Overview — Where It Went

The dashboard opens in `overview` view. The main panel is a spend ledger: threads ranked by estimated cost, six per page.

- Calls are grouped into threads using thread attachments, so subagents and auto-review work fold into their parent thread.
- Each row shows rank, thread name, a provider chip, at most one signal chip (`CONTEXT n%` red, `LOW CACHE` yellow, or `EST. PRICE` purple), a share-of-spend bar, cost with Codex credits, tokens with call count, and cache reuse.
- Click a row to drill in; click again or use `✕ close` to return.

The right rail shows **`:: needs attention`** when nothing is selected: at most three cards, in priority order — context bloat, low cache reuse, unpriced usage, then estimated pricing — each naming the affected thread, the consequence, and a link that opens the relevant thread.

Drilling into a thread replaces the rail with **`:: thread`**:

- spend, tokens, cache reuse, and max context stats (colored by 35%/60% context thresholds)
- a **next action** callout from the last call's recommendation or derived from context/cache state
- a **context growth** sparkline of the session's cumulative tokens across main-line calls
- **spawned work**: per-subagent and auto-review groups with call counts, tokens, and cost
- a **timeline** of every call, oldest to newest, with model, source kind, tokens, cost, cache, and a context-use meter
- `> open in calls view` to jump to the dense table

## Calls View

Switch to `calls` (or press the view toggle in any panel header) for the dense per-call table, eight rows per page.

- Columns: time, thread, model, effort, tokens, cost (with `*` for estimated and `·unpriced` markers, Codex credits under it), cache %, and the first efficiency flag.
- `time`, `tokens`, `cost`, and `cache` headers sort; `cache` defaults ascending (worst first), the others descending. Click again to reverse.
- Click a row to open **`:: call details`**: cost/usage/context signals first (est. cost, Codex credits with rate confidence, cache ratio, uncached or direct input, context use, pricing status), then a next-action callout, a thread narrative (thread, project, source, parent thread, timestamp), and collapsed `token and pricing breakdown` and `raw identifiers & source` sections.
- `> open thread in overview` jumps back to the ledger with that call's thread selected.
- When rows were served in compact form, the remaining aggregate fields load on demand through `/api/usage-row`.
- When served from localhost, `/api/usage` accepts `limit`, `offset`, `since`, and `until` so automation can page aggregate rows or fetch an exact time window.

Useful interpretation notes:

- `last call total` is the token usage for the selected model call; `session cumulative` is the running total the source logged for that session at the time of that call.
- Claude totals include direct input, cache writes, cache reads, and output, so very large totals are often mostly cache-read reuse rather than fresh prompt growth. Call details show the raw provider buckets (`cache read` and `direct input` for Claude Code rows).
- A cost with `*` means the pricing row is marked as a best-guess estimate; `·unpriced` means no configured price, so spend totals are incomplete.
- Codex credits are estimated from aggregate token counters for Codex/OpenAI rows only; Claude Code rows show `n/a credits`. Direct model matches use the bundled OpenAI Codex rate-card snapshot; inferred mappings are marked as such.
- Time values are shown in your browser's local date/time format while sorting and time filtering still use the logged timestamp.
- In redacted or strict privacy mode, search only sees the redacted metadata fields included in the dashboard payload.
- The footer shows the privacy line, the pricing source, and a parser-diagnostics count when the latest refresh reported skipped or malformed events (`ai-usage-dashboard inspect-log <path>` inspects a suspect log without writing to SQLite).

## Details And Context

When served from localhost with the context API enabled, the call-details rail includes a collapsed `prompt context` section with `> load context` and `> include tool output`.

- `> load context` fetches a size-limited, redacted context excerpt for only that call.
- `> include tool output` repeats the request with tool output included, still redacted and capped.
- Raw context is not written to SQLite, CSV, or the generated dashboard HTML.
- If the server was started with `--no-context-api`, the section is hidden and the dashboard remains aggregate-only.

## Practical Workflow

1. Start with `serve-dashboard --source all --open` when tracking all supported local sources, or `serve-dashboard --source codex --open` for Codex only.
2. Leave the `[ live ]` chip on while you work; usage refreshes every 10 seconds.
3. Optionally run `parse-allowance` with copied values from Codex Usage or `/status`, or initialize and edit `allowance.json` manually, when you want to override or supplement the dynamic Codex snapshot.
4. Read the answer strip first: the hero sentence names the top thread and its main efficiency signal.
5. Click a spend-chart bar to isolate a day or week when investigating a spike.
6. Work through `:: needs attention`, drilling into each flagged thread.
7. Use the provider switcher or a limits card when you want one provider's numbers in isolation.
8. Open `+ filters` for model, effort, confidence, or thread-type questions.
9. Switch to `calls` view and sort by `cost`, `tokens`, or `cache` for manual comparison; copy the URL to return to the same state later.
10. Use `> load context` only when aggregate fields are not enough to explain the call.
11. Use `ai-usage-dashboard export --output usage.csv` when the aggregate calls need spreadsheet review.

## Investigating Long Chat Growth

Long-running coding-agent chats can carry a surprising amount of context into later turns. Prompt caching can reduce the cost of repeated input, but it does not make a large conversation free. Later calls may still include a large cached prefix, new uncached input, reasoning output, and tool-related context.

Use these dashboard fields together:

- `Cached input`: repeated context the source was able to reuse.
- `Uncached input`: fresh context added by the current turn.
- `Session cumulative`: the running total the source logged for the session.
- `Context use`: how much of the model's context window the call used.
- `Cache ratio`: whether the call is mostly reused context or mostly new input.

When a thread keeps growing but the old context is no longer helping, starting a fresh agent thread may be more efficient than continuing to carry the same cached history forward.

## Privacy Model

The dashboard is designed to be shareable as an aggregate report, but only after you review it like any generated artifact.

It includes:

- session ids, thread names, cwd values, source file paths, source provider/app/format labels, timestamps, model labels, reasoning effort, token counts, cost estimates, Codex credit estimates where applicable, dynamic or manually entered allowance windows, and derived ratios

It does not include:

- prompts, assistant responses, raw tool output, pasted secrets, message snippets, or transcript text

The screenshots in this guide are produced from synthetic fixture data used by the test suite.

Use `--privacy-mode redacted` or `--privacy-mode strict` before sharing generated dashboards, CSV exports, query JSON, or support bundles. Redacted mode removes raw cwd/source paths and hides unnamed project names behind stable hashes. Strict mode also hides project-relative cwd, branch, and tags. Configured project aliases are treated as explicit display opt-ins in both modes.

Remaining 5-hour and weekly Codex allowance is read from local Codex `rate_limits` metadata when those snapshots are present. It is not inferred from the logged-in account plan, and no remote usage or account API is called. Add `~/.codex-usage-tracker/allowance.json` when you want to override dynamic values, add exact credit totals, or provide copied allowance state for environments without dynamic snapshots. Local Codex logs may also omit usage from other ChatGPT agentic surfaces that share the same allowance.

Claude Code remaining limits are read from a local sanitized status-line snapshot at `~/.codex-usage-tracker/claude-limits.json`. Run `ai-usage-dashboard install-claude-limits-statusline` once to update `~/.claude/settings.json`; the installer preserves an existing status-line command by wrapping it.

Dashboard payloads include archived sessions by default so time filters cover all indexed usage. Use `--active-only` when you want current-work views that hide archived rows.

Pricing and Codex credit estimates are source-stamped local calculations. Use `ai-usage-dashboard pin-pricing --output <path>` when a report needs to keep the same USD pricing snapshot over time, and use `ai-usage-dashboard update-rate-card` when you want an explicit local copy of the bundled Codex credit rate-card snapshot. `update-pricing` refreshes OpenAI pricing by default; add `--include-deepseek` for DeepSeek API pricing, and add manual local prices for other models when you want USD estimates for those rows.
