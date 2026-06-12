# Universal Dashboard Summary Cards Design

Date: 2026-06-12

## Summary

AI Usage Dashboard currently uses the same eight top-card positions across the dashboard, but several cards change labels and semantics when the active provider scope changes. The most confusing cases are `Codex Credits` becoming `Output Tokens`, `Codex Remaining` becoming `Claude Remaining`, and cache/input labels shifting between Codex and Claude Code views.

This design standardizes the top summary-card set across `Overview`, `Codex`, `Claude Code`, and future provider tabs. The top cards become a universal summary layer with fixed labels, fixed order, and provider-neutral meanings. Provider-specific metrics move into a separate section below the universal cards.

The selected direction is:

- Strict universal top cards.
- One combined `Usage limits` card in the universal top-card set.
- Limit values show remaining capacity.
- In `Overview`, the `Usage limits` card shows concise provider lines.
- Provider-specific details appear below the universal cards, not inside the universal card labels.

## Goals

- Make the top summary cards predictable across every provider scope.
- Preserve the useful high-level glance: call count, token volume, cache behavior, output volume, cost, and remaining usage limits.
- Keep provider-specific concepts visible without overloading the universal card row.
- Prepare the dashboard for additional providers such as Gemini CLI or OpenCode/DeepSeek without adding more provider-specific relabeling.
- Keep all dashboard surfaces aggregate-only: no prompt text, assistant text, tool output, raw transcript snippets, or real logs in fixtures.

## Non-Goals

- Do not redesign the whole dashboard layout.
- Do not change ingestion, SQLite schema, CSV export, or report JSON contracts unless a missing aggregate value is already present but not surfaced.
- Do not remove provider tabs, provider/app filters, Insights, Calls, Threads, or Call Details behavior.
- Do not add remote account or pricing API calls.
- Do not infer missing usage limits from model usage when a provider snapshot is unavailable.
- Do not change cost or credit calculation semantics in this slice.

## Current Behavior

The dashboard template defines eight card slots:

- `Visible Calls`
- `Total Tokens`
- `Cached Input`
- `Uncached Input`
- `Reasoning Output`
- `Estimated Cost`
- `Codex Credits`
- `Codex Remaining`

Dashboard JavaScript then mutates several labels and tooltips through provider profiles:

- `Overview` keeps `Codex Credits` and `Codex Remaining` while explaining that these apply only to Codex/OpenAI rows.
- `Codex` uses Codex-specific labels and allowance/credit semantics.
- `Claude Code` relabels cached input to `Cache Read`, uncached input to `Direct Input`, `Codex Credits` to `Output Tokens`, and `Codex Remaining` to `Claude Remaining`.

This makes the same card position mean different things depending on provider scope. It also makes Overview hard to interpret because provider-specific labels appear in a mixed-provider view.

## Target Top-Card Contract

The top summary cards should always render this exact order:

1. `Visible calls`
2. `Total tokens`
3. `Input tokens`
4. `Cache tokens`
5. `Output tokens`
6. `Reasoning tokens`
7. `Estimated cost`
8. `Usage limits`

These labels do not change across Overview, Codex, Claude Code, or future provider tabs.

### Card Semantics

`Visible calls`

- Count of calls after the active provider, app, model, confidence, search, time, history, and preset filters.
- Same as today.

`Total tokens`

- Sum of provider-reported total tokens for visible rows.
- Tooltip should state that provider total-token definitions may include cache reads or cache writes depending on source.

`Input tokens`

- Sum of fresh/direct input represented by the existing derived uncached/direct-input aggregate.
- This replaces the current provider-specific `Uncached Input` / `Direct Input` top-card label.
- Tooltip should explain that this is the best cross-provider approximation of input that was not served from cache.

`Cache tokens`

- Sum of cached/reused token activity visible in the current rows.
- For Codex/OpenAI rows, use cached input tokens.
- For Claude Code rows, include cache-read tokens and cache-creation tokens when both are available.
- Tooltip should break down cache read and cache creation where the data is available.
- The card label stays `Cache tokens`, not `Cached input`, `Cache read`, or `Cache write`.

`Output tokens`

- Sum of visible output tokens.
- This replaces the current behavior where output tokens are shown only by repurposing the old Codex credit slot in Claude Code scope.

`Reasoning tokens`

- Sum of visible reasoning/thinking output tokens.
- If a provider does not report reasoning tokens, the value is `0` and the tooltip should say the visible provider does not expose a stable reasoning-token bucket.

`Estimated cost`

- Same aggregate cost value as today.
- Keep `Not configured` when pricing is unavailable.
- Tooltip should keep the existing pricing confidence caveat where practical.

`Usage limits`

- Shows remaining usage capacity, not used percentage.
- In a single-provider scope, show that provider's remaining windows.
- In `Overview`, show concise provider lines for each visible provider that has a supported limit snapshot.
- Missing snapshots render stable unavailable text instead of changing the card label.

## Usage Limits Display

The universal `Usage limits` card should display short-window and weekly remaining values because Codex and Claude Code both fit that mental model in local dashboard data.

Preferred display labels:

- `5h`
- `weekly`

Single-provider examples:

```text
5h 72%
weekly 41%
```

Overview example:

```text
Codex 5h 72% · weekly 41%
Claude 5h 48% · weekly 33%
```

If a provider has only one window:

```text
Codex 5h 72%
Claude weekly 33%
```

If a provider is visible but has no snapshot:

```text
Codex 5h 72% · weekly 41%
Claude no snapshot
```

If no visible provider has supported limit data:

```text
No snapshots
```

The card title/tooltip should include reset timestamps and source names when available. Long reset/source details should not be crammed into the card body.

## Provider-Specific Section

Add a clearly separated provider-specific section below the universal cards and above the Insights/table area. It can be a compact strip or small grouped panel, but it should not look like another competing primary summary row.

This section should hold provider-specific metrics and caveats, including:

- `Codex credits`
- Codex credit-rate coverage
- Credit-rate source and fetched timestamp
- Codex allowance reset timestamps
- Claude limit reset timestamps
- Claude status-line snapshot source and captured timestamp
- Pricing coverage or pricing confidence summary
- Missing pricing, missing credit-rate, or missing limit-snapshot caveats
- Rows where Codex credits are not applicable

In Overview, the provider-specific section should group details by provider when the values differ. In a provider tab, it should show only the selected provider's relevant details plus any global pricing caveat that still affects the visible rows.

## Data And Computation

No new persisted data is required for the first implementation. The dashboard payload already includes the aggregate fields needed for the universal card set:

- `total_tokens`
- `input_tokens`
- `cached_input_tokens`
- `cache_creation_input_tokens`
- `uncached_input_tokens`
- `output_tokens`
- `reasoning_output_tokens`
- `estimated_cost_usd`
- `usage_credits`
- `usage_credit_confidence`
- provider/app identity fields
- allowance and provider limit snapshot payloads

The dashboard should centralize summary-card calculations into a provider-neutral model. A useful shape would be:

```text
buildUniversalSummary(rows, payloadState) -> {
  visibleCalls,
  totalTokens,
  inputTokens,
  cacheTokens,
  outputTokens,
  reasoningTokens,
  estimatedCost,
  usageLimits
}
```

Provider-specific details should be built separately:

```text
buildProviderDetails(rows, payloadState) -> ProviderDetailGroup[]
```

This split prevents new providers from mutating the universal top-card contract.

### Cache Token Calculation

Cache token display should avoid provider-specific labels at the top level while still being honest in tooltips.

Recommended calculation:

```text
cacheTokens = sum(cached_input_tokens) + sum(cache_creation_input_tokens)
```

For providers where `cache_creation_input_tokens` is always zero, this equals today's cached-input summary. For Claude Code, it surfaces both cache read and cache creation as cache activity.

The tooltip should include:

```text
Cache read: <sum cached_input_tokens>
Cache creation: <sum cache_creation_input_tokens>
```

If cache creation is zero for all visible rows, the tooltip can omit that line.

### Input Token Calculation

`Input tokens` should use:

```text
inputTokens = sum(uncached_input_tokens)
```

This is the cross-provider "fresh/direct input" card. It avoids the ambiguity of provider-reported `input_tokens`, which can include cache creation and cache reads for some providers.

The provider-specific section or details panel can still expose raw provider input buckets.

### Usage Limit Normalization

The UI should normalize available limit windows into these canonical display keys:

- `five_hour`
- `weekly`

Known aliases should map into those keys:

- `5h`, `five_hour`, `five-hour`, `primary`, or windows up to 300 minutes map to `five_hour`.
- `7d`, `seven_day`, `weekly`, or windows longer than 300 minutes map to `weekly`.

For each visible provider, choose the newest available snapshot from the existing payload state. Do not synthesize a value if the snapshot is missing.

The display value should prefer `remaining_percent`. If only `remaining_credits` exists, display credits with a clear suffix. If only reset metadata exists, display `configured` and leave details in the tooltip.

## UI Behavior

### Overview

Overview keeps the same eight universal cards. `Usage limits` contains one concise line per provider with a supported limit concept.

Example:

```text
Codex 5h 72% · weekly 41%
Claude 5h 48% · weekly 33%
```

If the user filters Overview down to one provider through the Provider or App filters, the card naturally collapses to that provider's line.

### Provider Tabs

Provider tabs keep the same eight universal cards and hide non-visible provider limit lines.

Codex tab example:

```text
5h 72%
weekly 41%
```

Claude Code tab example:

```text
5h 48%
weekly 33%
```

### Missing Or Partial Data

The card labels do not change when data is missing.

Examples:

- Missing pricing: `Estimated cost` value is `Not configured`.
- Missing limits: `Usage limits` value is `No snapshots`.
- One missing provider in Overview: show the available provider values plus `<Provider> no snapshot`.
- Reasoning tokens unsupported: `Reasoning tokens` value is `0`.

### Accessibility And Layout

- Card labels should remain short and stable.
- Long `Usage limits` lines should wrap cleanly within the existing card dimensions.
- Tooltips should describe provider caveats without relying only on color.
- The provider-specific section should have a heading that makes it clearly secondary to the universal summary.
- Mobile layout should remain one card per row at narrow widths and should not introduce horizontal scrolling.

## Documentation Updates

Update at least:

- `README.md`
- `docs/dashboard-guide.md`
- `docs/architecture.md` if the UI architecture split is worth documenting
- `docs/cli-reference.md` if visible dashboard workflow text mentions the old card labels
- Packaged dashboard guide HTML if it is committed/generated manually in this repo
- `skills/codex-usage-tracker/SKILL.md`
- `src/codex_usage_tracker/plugin_data/skills/codex-usage-tracker/SKILL.md`

Docs should say:

- Top cards are universal and provider-neutral.
- Provider tabs change row scope, not top-card meanings.
- Provider-specific usage/credit/limit details live below the top cards and in details panels.
- `Usage limits` shows remaining capacity.
- Overview shows provider lines when multiple providers are visible.

## Testing Plan

Add or update tests in the dashboard test suite to verify:

- Generated dashboard HTML contains the exact universal card labels.
- Generated dashboard HTML no longer uses provider-specific labels in the top-card template such as `Codex Credits`, `Codex Remaining`, `Claude Remaining`, `Cache Read`, or `Direct Input`.
- Dashboard JavaScript no longer relabels top cards based on provider profile.
- Overview limit rendering can include both Codex and Claude provider lines.
- Codex provider scope renders only Codex limit values.
- Claude provider scope renders only Claude limit values.
- Missing limit snapshots produce stable unavailable text.
- Cache token totals include `cached_input_tokens` and `cache_creation_input_tokens`.
- Provider-specific details still expose Codex credits and Claude snapshot metadata.
- Existing aggregate-only guarantees remain in place.
- Dashboard JavaScript syntax checks pass.

Suggested focused commands:

```bash
python -m pytest tests/test_store_dashboard_mcp.py -v
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard.js
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard_state.js
python scripts/check_release.py
```

Run the full test suite before merging:

```bash
python -m pytest
python -m ruff check .
git diff --check
```

## Rollout Plan

1. Add failing dashboard tests for the universal top-card contract.
2. Replace provider-specific top-card relabeling with provider-neutral labels and calculations.
3. Add a provider-specific details section below the universal cards.
4. Normalize `Usage limits` display for Codex, Claude, Overview, missing snapshots, and partial snapshots.
5. Update docs and packaged copies.
6. Reinstall or rebuild local command assets when testing installed CLI behavior, because dashboard assets are bundled into the installed package.
7. Run focused dashboard checks, then the full local gate.

## Open Questions

No product-blocking questions remain from the brainstorming session. The selected decisions are:

- Strict universal top-card labels.
- Combined `Usage limits` card.
- Remaining-capacity display.
- Provider lines in Overview.
- Provider-specific details below the universal cards.

Implementation may still need small wording decisions for exact unavailable text, but those should follow the rules above and can be resolved in code review.
