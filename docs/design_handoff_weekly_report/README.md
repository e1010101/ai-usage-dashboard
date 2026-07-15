# Handoff: Weekly Report Dashboard Overhaul (Terminal Sunset)

## Overview
Insight-first redesign of the AI Usage Dashboard's local web UI (`plugin_data/dashboard/`). It replaces the current table-first landing view (8 summary cards, 10 filter controls, 6 insight cards + 7 presets, dense calls table) with an answer-first layout: a hero strip that literally answers "where did my spend go this period?", a ranked thread ledger as the primary surface, a max-3-item attention rail, and details on demand. Two views: **overview** (ledger + thread drill-in) and **calls** (paginated dense table + call details).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate this design in the repo's existing environment**: vanilla JS + a single CSS file + an HTML template (`dashboard_template.html`, `dashboard.css`, `dashboard.js`), rendered from the `#usage-data` JSON payload. No framework should be introduced.

- `Overhaul A - Weekly Report v2.dc.html` — **the design to implement.** Template markup at the top (inside `<x-dc>`), logic class below it (inside `<script data-dc-script>`). The logic class is plain JS and is the behavior spec; the template's inline styles are the visual spec.
- `Current Dashboard (Terminal Sunset).dc.html` + `assets/dashboard*.{css,js}` — the current shipped UI, recreated for side-by-side comparison (copies of the repo's real files).
- `assets/synthetic-payload.js` — fixture data in the exact `codex-usage-tracker-dashboard-v1` payload schema; useful for testing the port.
- `support.js` — prototype runtime only; ignore for the port.

## Fidelity
**High-fidelity.** Colors, spacing, typography, copy, and interactions are final. Recreate pixel-perfectly using the repo's existing vanilla-JS render pattern. All colors already come from the repo's Terminal Sunset theme.

## Data Contract
Everything renders from the existing dashboard payload (rows + `provider_limit_snapshots`). Fields used per row: `event_timestamp`, `thread_name`, `parent_thread_name`, `session_id`, `thread_source`, `model`, `effort`, `source_provider`, `source_app`, `total_tokens`, `cached_input_tokens`, `uncached_input_tokens`, `cache_creation_input_tokens`, `output_tokens`, `reasoning_output_tokens`, `cumulative_total_tokens`, `cache_ratio`, `context_window_percent`, `model_context_window`, `estimated_cost_usd`, `estimated_cache_savings_usd`, `pricing_model`, `pricing_estimated`, `usage_credits`, `usage_credit_confidence`, `project_name`, `git_branch`, `cwd`, `agent_role`, `efficiency_flags`, `recommended_action`, `turn_id`, `source_file`, `line_number`.

## Design Tokens (Terminal Sunset)
- Background: `#0d0921`; panel: `#161033`; raised/hover: `#1f1745`; border: `#2a2058`; strong border: `#6e61b8`; disabled: `#4c4180`
- Text: `#e8e3ff`; dim text: `#9a8fc7`
- Accents: cyan `#01cdfe` (Codex/openai, links), pink `#ff71ce` (Claude/anthropic), green `#05ffa1` (good/ok), yellow `#fffb96` (warning/increase), purple `#b967ff` (info/selection), error `#ff5577`
- Font: `"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace`; base 13px
- Radii: 3px (buttons/chips), 4px (panels/cards), 999px (progress bars); borders 1px (2px top-accent on answer-strip cards)
- Background scene (fixed, pointer-events none): radial pink/purple glow from bottom + 64px repeating grid lines at `rgba(110,97,184,0.05)`
- Numbers everywhere: `font-variant-numeric: tabular-nums`
- Links: `a { color:#01cdfe }`, hover `#05ffa1`
- Entry animation: fade + 4px rise, 180ms `cubic-bezier(0.16,1,0.3,1)`, staggered 0/60ms

## Layout — App Shell (no page scroll)
Root container: `max-width: 1360px`, centered, padding `20px 28px 16px`, `height: 100vh; min-height: 640px; box-sizing: border-box; display: flex; flex-direction: column; overflow-y: auto` (the overflow only engages below 640px). Header, answer strip, footer are `flex: 0 0 auto`; the main section is `flex: 1 1 auto; min-height: 280px`. Every list/table/rail scrolls internally (`min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #6e61b8 #161033`), and lists are paginated so internal scrolling is rare. **The page itself must never scroll at normal desktop heights.**

## Screens / Views

### Header (both views)
- **Prompt line**: one-line, ellipsized, 12px dim. `ai-usage-dashboard:~$` in purple, then a live echo of current state as CLI flags: `usage --range this-week --provider codex --calls --model gpt-5.5 --effort high --confidence exact --threads spawned --day 2026-07-14 --grep "parser"`. Only active parts appear. `--week-of` replaces `--day` when the chart is in weekly buckets. Custom range echoes `--range custom 2026-07-01..2026-07-10` (open ends: `…` / `now`). Preceded by faint `● ● ●` window dots.
- **Title row**: `AI Usage Dashboard` 18px/700 + bordered chips `[ live ]` (green) and `[ unofficial project ]` (dim), 11px uppercase.
- **Controls** (right, wrapping row, gap 10px):
  - **Search**: bordered box, `/` prefix in dim, `<input type="search">` placeholder "thread, model, project…" width 170px, ✕ clear button when non-empty. Filters rows by case-insensitive substring across thread_name, parent_thread_name, model, project_name, git_branch, cwd, source_app.
  - **Range presets**: segmented control — `this week · 7d · month · 30d · all · custom` (11px uppercase). this week = since Monday; month = calendar month; 7d/30d = rolling including today. Active: bg `#1f1745`, border `#6e61b8`, text `#e8e3ff`; inactive: transparent, dim.
  - **Custom range**: when `custom` is active, show two `<input type="date">` (start → end) in a `#6e61b8`-bordered box, `color-scheme: dark`. Either end may be empty (open-ended).
  - **Provider switcher**: segmented `[ overview ] [ codex ] [ claude code ]` lowercase; active gets accent color (purple/cyan/pink), accent border, and glow `0 0 10px <accent>44`.
  - **Filters toggle**: `[ + filters ]` button; label becomes `[ − filters ]` when open and `[ + filters · N ]` (yellow) when N filters are active while closed.
- **Advanced-filters popover**: absolutely positioned under the header's right edge (anchored via an always-rendered zero-height relative wrapper so toggling causes **zero layout shift**), z-index 20, min-width 520px, `#6e61b8` border, shadow `0 16px 40px rgba(0,0,0,0.6)`. Four chip rows — **model** (distinct models in scope), **reasoning** (effort values, 'none' for null), **confidence** (exact / estimated / unpriced), **thread type** (parent / spawned / auto-review) — each prefixed with an `all` chip. Chips toggle; active chip = raised bg + `#6e61b8` border. When any filter is active, a cyan `> clear filters (summary)` link row appears.

### Answer strip (both views) — 3 cards, grid `minmax(320px,1.1fr) minmax(300px,1fr) minmax(240px,0.7fr)`, gap 12px
1. **":: where did {range noun} go?"** (purple top-accent): spend total 30px/700 with delta line under it (`+34% vs last period` yellow if up, green if down, dim if flat/no prior; prior period = equal-length window immediately before); tokens total 20px + delta; calls · threads count + Codex credits line; then a plain-language sentence naming the top thread by spend, its share, and one diagnostic (heavy context ≥60% → "a fresh thread would cut per-turn cost"; else cache reuse ≥50% → "most input served from cache"; else "most input is fresh, uncached tokens").
2. **":: spend by day"** (cyan top-accent; title becomes ":: spend by week" in weekly mode): stacked bar chart, bars 66px max height, cyan = Codex cost, pink = Claude cost (legend top-right). Range span ≤10 days → daily buckets ("today" label on current day, other days short weekday); longer/all → weekly buckets labeled with week-start date ("Jul 6"). **Each bar is clickable**: filters everything to that day/week (other bars dim to 0.28 opacity, selected label cyan bold; click again to clear). Chart data ignores the day filter itself so all bars stay comparable. Tooltip: "Tue, Jul 14 · Codex $0.21 · Claude $0.11 · click to filter".
3. **":: limits remaining"** (green top-accent): one bordered card per provider — header `[ codex ]` / `[ claude code ]` in accent color, then a 5h row and weekly row, each with label, "72% left" value, and 6px progress bar (green ≥50%, yellow 25–50%, red <25% remaining). **The whole card is clickable** to focus/unfocus that provider (same as the header switcher); the non-focused provider's card dims to 0.35.

### Overview — "where it went" ledger (left, ~1.5fr)
Panel with header row: view switcher segmented `[ overview | calls ]`, title `:: where it went`, right side shows active day-filter chip (`Tue, Jul 14 ✕`, cyan) + caption "N threads, ranked by spend · click to drill in" (nowrap, ellipsized).
Rows group calls by `parent_thread_name || thread_name || session_id` (subagents fold into parents), ranked by total cost desc. Row grid: `34px 1fr 90px 90px 96px`, gap 12px, padding `12px 16px`, bottom border; hover bg `#1f1745`; selected: raised bg + `inset 2px 0 0 #b967ff`.
Per row: rank `#1` dim · name 700 ellipsized + provider chip (`codex` cyan / `claude code` pink, lowercase, bordered) + at most one signal chip (context ≥60% → red `CONTEXT 71%`; else cache <30% → yellow `LOW CACHE`; else any estimated pricing → purple `EST. PRICE`); badges wrap on narrow widths (`flex-wrap`) rather than overlap. Under the name: 5px share-of-spend bar in provider color + "43% of spend" dim. Right columns (right-aligned): cost 700 with credits subline ("8.9 cr" / "n/a credits"); tokens compact ("121k") with "N calls" subline; cache reuse % (yellow <30%, else green) with "cache reuse" subline.
**Pagination**: 6 rows/page; footer pager (raised bg, top border): "1–6 of 9 threads · [ page 1/2 ]" + `← prev` / `next →` bordered buttons (disabled = `#4c4180`). Page resets on any range/provider/filter/search change. Empty state: `> no usage in range — widen the time filter`.

### Overview — right rail (~0.8fr, max-height 100%, internal scroll)
Shows **needs attention** when no thread is selected, **thread drill-in** when one is.
- **:: needs attention**: max 3 cards, priority order: context bloat (red accent, thread ≥60% context), low cache reuse (yellow, cache <30% and >4k tokens), unpriced usage (purple, rows with null pricing_model), estimated pricing (purple, only if slots remain). Card: 3px left accent border, title + value on top row, 11px dim body naming the thread and the consequence, cyan `> action` link that selects the relevant thread. Empty: `> nothing needs attention in this range`.
- **:: thread drill-in** (header has `✕ close`): thread name 14px/700; 2×2 stat grid (spend, tokens, cache reuse colored, max context colored green/yellow/red at 35%/60% thresholds); **next action** callout (raised, `#6e61b8` border) — last call's `recommended_action` or derived from context/cache state; **context growth** sparkline — SVG 260×56, session `cumulative_total_tokens` across main-line calls (subagents/auto-review excluded), line+12%-opacity area+end dot, colored by latest context pressure, caption "121k cumulative tokens · context 71% of window"; **spawned work** (only if present) — `└`-prefixed rows per subagent thread / auto-review group: name + kind (`spawned · explorer` cyan / `auto-review` purple) + "N calls · tokens · cost"; **timeline** (oldest → newest) — per call: time, model 700 + call-kind (user dim / subagent cyan / auto-review purple), "tokens · cost(*) · cache%" meta, 4px context-use bar; `> open in calls view` button.

### Calls view — dense table (left)
Same panel header pattern (switcher, `:: model calls`, day chip + caption "N calls · sorted by time ↓").
Column grid: `92px 1.4fr 1fr 64px 74px 82px 60px 90px` → time (date 700 + clock subline) / thread (ellipsized + kind subline) / model (bordered pill, provider color) / effort (dim, `—` if null) / tokens / cost (+`*` estimated, `·unpriced`; credits subline) / cache % (yellow <30%) / first efficiency flag as chip. Header cells for time, tokens, cost, cache are sort buttons with ▾/▴ indicator; clicking toggles direction; cache defaults **ascending** (worst first), others descending. Table area `min-width: 760px` with horizontal scroll fallback.
**Pagination**: 8 rows/page, same pager component. Row select: raised bg + purple inset edge.

### Calls view — call details rail
Empty state: `> click a row to inspect its aggregate fields`. Selected:
- **cost, usage, and context** (raised, `#6e61b8` border): est. cost (+ "*best-guess"), codex credits + confidence ("rate-card match" / "inferred mapping") — omitted for anthropic, cache ratio (colored), uncached/direct input, context use (colored), pricing status (purple if unpriced)
- **next action** callout (same derivation rules as thread rail)
- **thread narrative**: thread, project, source ("user · codex / openai", "subagent: explorer · …", "auto-review · …"), parent thread, timestamp
- `<details>` **token and pricing breakdown**: last-call total, cached input / cache read, cache creation, uncached/direct input, output, reasoning output, session cumulative, cache savings
- `<details>` **raw identifiers & source**: session, turn, cwd, branch, source file:line, context window
- `> open thread in overview` button → switches view and selects the parent thread

### Footer
Dim 11px: "synthetic fixture data · aggregate-only · nothing leaves this machine" (adapt copy for production: privacy line) + link back.

## State Management
Single state object: `range` ('this-week'|'last-7'|'this-month'|'last-30'|'all'|'custom'), `customStart`/`customEnd` (date strings), `provider` (''|'openai'|'anthropic'), `view` ('overview'|'calls'), `selected` (thread key), `selectedCall` (record_id), `sortKey`/`sortDir`, `page`, `ledgerPage`, `search`, `showFilters`, `fModel`, `fEffort`, `fConfidence`, `fThreadType`, `fDay` ({start,end,label}|null).
Filter chain: time window → provider → search → advanced filters → day bucket. Chart uses everything except the day filter. Any filter change resets both pages and clears selections. Range change clears `fDay`.

## Assets
None — no images or icon fonts. All visuals are CSS. Fonts are system-installed monospace with Google-Fonts JetBrains Mono fallback (repo already ships without webfonts; keep its current font stack if different).

## Porting Order (suggested)
1. App shell + header (search, presets, provider switcher, filters popover) + answer strip, rendered from the real payload
2. Ledger + attention rail + thread drill-in
3. Calls view + call details rail
4. Retire old summary cards / insights / presets sections once parity is confirmed
