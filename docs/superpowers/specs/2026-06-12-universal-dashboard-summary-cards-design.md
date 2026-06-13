# Universal Dashboard Summary Cards Design

Date: 2026-06-12
Status: Reviewed and gap-filled 2026-06-12; ready for implementation.

## Summary

AI Usage Dashboard currently uses the same eight top-card positions across the dashboard, but several cards change labels and semantics when the active provider scope changes. The most confusing cases are `Codex Credits` becoming `Output Tokens`, `Codex Remaining` becoming `Claude Remaining`, and cache/input labels shifting between Codex and Claude Code views.

This design standardizes the top summary-card set across `Overview`, `Codex`, `Claude Code`, and future provider tabs. The top cards become a universal summary layer with fixed labels, fixed order, and provider-neutral meanings. Provider-specific metrics move into a separate section below the universal cards.

The selected direction is:

- Strict universal top cards.
- One combined `Usage Limits` card in the universal top-card set.
- Limit values show remaining capacity.
- In `Overview`, the `Usage Limits` card shows concise provider lines.
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
- Do not rename provider-specific strings outside the top-card region: the `Highest Codex credits` sort option, investigation presets, insight captions, and Call/Thread detail panels keep their current wording.

## Current Behavior

The dashboard template (`src/codex_usage_tracker/plugin_data/dashboard/dashboard_template.html`, `.cards` block) defines eight card slots:

- `Visible Calls` (static label, `#visibleCalls`)
- `Total Tokens` (`#totalTokensCard`)
- `Cached Input` (`#cachedTokensCard`, carries a dead `data-anthropic-label="Cache Read"` attribute)
- `Uncached Input` (`#uncachedTokensCard`, carries a dead `data-anthropic-label="Direct Input"` attribute)
- `Reasoning Output` (`#reasoningTokensCard`)
- `Estimated Cost` (static label, `#estimatedCost`)
- `Codex Credits` (`#usageCreditsCard`)
- `Codex Remaining` (`#allowanceCard`)

Dashboard JavaScript then mutates labels and tooltips through the `providerProfiles` object in `updateSummaryCards`:

- `Overview` keeps `Codex Credits` and `Codex Remaining` while explaining that these apply only to Codex/OpenAI rows.
- `Codex` uses Codex-specific labels and allowance/credit semantics.
- `Claude Code` relabels cached input to `Cache Read`, uncached input to `Direct Input`, `Codex Credits` to `Output Tokens` (sum of visible output tokens), and `Codex Remaining` to `Claude Remaining`.

This makes the same card position mean different things depending on provider scope. It also makes Overview hard to interpret because provider-specific labels appear in a mixed-provider view.

## Target Top-Card Contract

The top summary cards always render this exact order with these exact labels (Title Case, matching the dashboard's existing label style):

1. `Visible Calls`
2. `Total Tokens`
3. `Input Tokens`
4. `Cache Tokens`
5. `Output Tokens`
6. `Reasoning Tokens`
7. `Estimated Cost`
8. `Usage Limits`

These labels do not change across Overview, Codex, Claude Code, or future provider tabs. The `Codex Credits` and `Codex Remaining` top-card slots are removed; their two positions are taken by the new standalone `Output Tokens` card and the combined `Usage Limits` card, keeping the count at eight.

### Card Semantics

`Visible Calls`

- Count of calls after the active provider, app, model, confidence, search, time, history, and preset filters.
- Same as today.

`Total Tokens`

- Sum of provider-reported total tokens for visible rows.
- Tooltip states that provider total-token definitions may include cache reads or cache writes depending on source.

`Input Tokens`

- `sum(uncached_input_tokens)` — the existing derived fresh/direct-input aggregate.
- Replaces the provider-specific `Uncached Input` / `Direct Input` top-card label.
- Tooltip: best cross-provider approximation of input that was not served from cache; raw provider input buckets remain in Call Details.

`Cache Tokens`

- `sum(cached_input_tokens) + sum(cache_creation_input_tokens)`.
- For Codex/OpenAI rows `cache_creation_input_tokens` is always zero, so this equals today's cached-input summary; for Claude Code it surfaces cache reads plus cache writes as one cache-activity number.
- Tooltip breaks down the buckets when both are nonzero:

  ```text
  Cache read: <sum cached_input_tokens>
  Cache creation: <sum cache_creation_input_tokens>
  ```

  If cache creation is zero across visible rows, omit that line.
- The label stays `Cache Tokens` — never `Cached Input`, `Cache Read`, or `Cache Write`.

`Output Tokens`

- `sum(output_tokens)` for visible rows.
- Promotes output volume to a first-class universal card; previously it was visible only by repurposing the old Codex-credit slot in Claude Code scope.

`Reasoning Tokens`

- `sum(reasoning_output_tokens)` for visible rows.
- If the visible provider does not report reasoning tokens, the value is `0` and the tooltip says the provider does not expose a stable reasoning-token bucket.

`Estimated Cost`

- Same aggregate cost value as today; `Not configured` when pricing is unavailable.
- Tooltip keeps the existing pricing-confidence caveat.

`Usage Limits`

- Shows remaining capacity, never used percentage.
- Single-provider scope: that provider's remaining windows.
- Overview: one concise line per visible provider that has a supported limit snapshot.
- Missing snapshots render stable unavailable text; the card label never changes.
- Excluded from the count-up animation (multi-line text, not a single number).

## Usage Limits Display

### Data Source

The payload already ships a unified per-provider shape — consume it directly instead of re-deriving windows:

```text
payload.provider_limit_snapshots = {
  openai:    { provider, app, label, configured, windows[], source{}, error },
  anthropic: { provider, app, label, configured, windows[], source{}, error },
}
```

Each window is an `AllowanceWindow` dict with canonical fields: `key` (`five_hour` | `weekly`), `label`, `remaining_percent` (0–1 or null), `remaining_credits` (number or null), `total_credits`, `reset_at`, `captured_at`. Window keys are already normalized at capture time (`parse_codex_rate_limit_windows`, `parse_claude_rate_limit_windows`), so the UI does **not** need the alias mapping (`primary`, `300 minutes`, `7d`, …) — that logic lives in Python and stays there. The UI only needs a display-label map:

- `five_hour` → `5h`
- `weekly` → `weekly`
- any unknown key → render the window's stored `label` as-is

Do not read the legacy top-level `allowance_windows` array for this card; that array remains in the payload for Codex credit-impact text in the provider-specific section.

### Display Rules

- Value preference per window: `remaining_percent` (rendered as a whole percentage via the existing `pct()` helper) → else `remaining_credits` with a ` cr` suffix → else, if only reset metadata exists, `configured` with details in the tooltip.
- Provider display names: `openai` → `Codex`, `anthropic` → `Claude`; future providers fall back to `providerTabLabel()`.

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

One window only:

```text
Codex 5h 72%
Claude weekly 33%
```

Provider visible but no snapshot (`configured` false or empty `windows`):

```text
Codex 5h 72% · weekly 41%
Claude no snapshot
```

No visible provider has supported limit data:

```text
No snapshots
```

No rows in the current filter range:

```text
No data in range
```

### Provider-Line Eligibility

A provider gets a line in Overview when it appears in the visible rows (same provider set that drives the provider tabs) — not merely because a snapshot file exists. Filtering Overview down to one provider through the Provider or App filters naturally collapses the card to that provider's line.

### Tooltip

The card tooltip includes, per provider: window reset timestamps (`reset_at`), snapshot source name, and `captured_at`. If a snapshot's `captured_at` is older than 24 hours, append a staleness note (for example `captured 2026-06-10 — may be stale`) to the tooltip only; the card body never shows staleness markers. When a snapshot is missing, the tooltip carries the existing actionable setup hint (`Add ~/.codex-usage-tracker/allowance.json …` for Codex, `Capture Claude Code statusLine rate_limits …` for Claude); the card body keeps the short stable text.

## Provider-Specific Section

Add a clearly separated provider-specific section between the `.cards` grid and the Insights panel (`#insightsPanel`). Implementation shape: a compact strip (`#providerDetails`) with a small heading and per-provider groups of key-value chips. It must read as secondary to the universal summary — smaller type, no card chrome competing with the top row.

Contents:

- **Codex group**: `Codex credits` total for visible rows, credit-rate coverage (existing `creditCoverageRatio`), credit-rate source name and fetched timestamp, allowance window reset timestamps, allowance-impact text (existing `allowanceImpactText` output), and the not-applicable-rows caveat.
- **Claude Code group**: limit snapshot source and captured timestamp, window reset timestamps, and (optional, post-MVP) captured-effort coverage for visible Claude calls.
- **Global**: pricing coverage / pricing-confidence summary and missing-pricing, missing-credit-rate, or missing-snapshot caveats.

The existing `#allowanceSource` status line (built by `updateAllowanceSourceLine`) duplicates much of this content; fold it into this section rather than rendering both.

Behavior:

- Overview: group details by provider; show a group only for providers present in the visible rows.
- Provider tab: show only the selected provider's group plus any global pricing caveat affecting visible rows.
- Empty state: if no group has content, hide the section entirely (no empty heading).

## Data And Computation

No new persisted data and no payload schema changes are required. Fields consumed:

- `total_tokens`, `input_tokens`, `cached_input_tokens`, `cache_creation_input_tokens`, `uncached_input_tokens`, `output_tokens`, `reasoning_output_tokens`
- `estimated_cost_usd`
- `usage_credits`, `usage_credit_confidence`
- provider/app identity fields
- `provider_limit_snapshots` (universal card) and `allowance_windows` (provider details only)

Centralize the calculations in two pure builders in `dashboard.js`:

```text
buildUniversalSummary(rows, payloadState) -> {
  visibleCalls, totalTokens, inputTokens, cacheTokens, cacheReadTokens,
  cacheCreationTokens, outputTokens, reasoningTokens, estimatedCost,
  usageLimits: { state: 'lines' | 'no-snapshots' | 'no-data', lines: [{ providerKey, providerLabel, windows }] }
}

buildProviderDetails(rows, payloadState) -> ProviderDetailGroup[]
```

`updateSummaryCards` consumes `buildUniversalSummary` output and stops reading `providerProfiles` for labels. This split prevents new providers from mutating the universal top-card contract.

## Template And JavaScript Migration Map

### Template (`dashboard_template.html`)

| Current | Target |
| --- | --- |
| `Visible Calls` / `#visibleCalls` | unchanged |
| `#totalTokensCard` / `#totalTokens` | unchanged, drop `#totalTokensLabel` span id (label becomes static) |
| `#cachedTokensCard` / `#cachedTokens` + `data-anthropic-label` | `#cacheTokensCard` / `#cacheTokens`, static `Cache Tokens` label, attribute deleted |
| `#uncachedTokensCard` / `#uncachedTokens` + `data-anthropic-label` | `#inputTokensCard` / `#inputTokens`, static `Input Tokens` label, attribute deleted (moves to position 3) |
| `#reasoningTokensCard` / `#reasoningTokens` | unchanged label `Reasoning Tokens` (moves to position 6) |
| `Estimated Cost` / `#estimatedCost` | unchanged |
| `#usageCreditsCard` / `#usageCredits` | replaced by `#outputTokensCard` / `#outputTokens` (position 5) |
| `#allowanceCard` / `#allowanceImpact` | replaced by `#usageLimitsCard` / `#usageLimits` (position 8) |

New section skeleton inserted after `.cards`:

```html
<section id="providerDetails" class="provider-details" hidden>
  <h2>Provider Details</h2>
  <div id="providerDetailGroups"></div>
</section>
```

### JavaScript (`dashboard.js`)

- `providerProfiles`: delete `totalLabel/totalTitle`, `cachedLabel/cachedTitle`, `uncachedLabel/uncachedTitle`, `reasoningLabel/reasoningTitle`, `creditsLabel/creditsTitle/creditsUnavailable`, `remainingLabel/remainingUnavailable`. Keep `summary` and `insightsCaption` (provider tabs still describe scope).
- `updateSummaryCards`: rewrite against `buildUniversalSummary`; remove the anthropic special-case added for the interim `Output Tokens` card.
- `COUNT_UP_IDS`: becomes `['visibleCalls', 'totalTokens', 'inputTokens', 'cacheTokens', 'outputTokens', 'reasoningTokens', 'estimatedCost']`. `usageLimits` is excluded.
- `allowanceImpactText`, `allowanceCardTitle`, `limitWindowText`, `providerLimitWindowText`: refactor into the usage-limits renderer and provider-details builder; delete dead branches.
- `updateAllowanceSourceLine` and `#allowanceSource`: fold into `buildProviderDetails` rendering.
- `isNonCodexProviderScope`, `creditCoverageRatio`, `sumUsageCredits`, `credits()`: still used by the provider-details Codex group and the insight builder; unchanged semantics.
- URL state (`dashboard_state.js`): no changes — no card state is persisted.

### CSS (`dashboard.css` / sunset theme)

- New `provider-details` styles must follow the Terminal Sunset token system (custom-property colors, WCAG 3:1 borders, reduced-motion-safe transitions) like the rest of the theme.
- The `.cards` grid keeps eight cards; mobile stays one card per row at narrow widths with no horizontal scrolling. Long `Usage Limits` lines wrap within existing card dimensions (allow the strong/value element to use a smaller font or `white-space: normal` for this card only).

## UI Behavior

### Overview

Eight universal cards; `Usage Limits` shows one line per visible provider with a supported limit snapshot (see examples above).

### Provider Tabs

Same eight cards; `Usage Limits` hides non-visible provider lines.

### Missing Or Partial Data

Card labels never change when data is missing:

- Missing pricing: `Estimated Cost` value is `Not configured`.
- Missing limits: `Usage Limits` value is `No snapshots`.
- One missing provider in Overview: available provider lines plus `<Provider> no snapshot`.
- Reasoning unsupported: `Reasoning Tokens` value is `0`.
- Zero visible rows: numeric cards show `0`, `Usage Limits` shows `No data in range`.

### Accessibility And Layout

- Card labels short and stable; tooltips describe provider caveats without relying on color alone.
- `Usage Limits` lines wrap cleanly; no horizontal scrolling at narrow widths.
- Provider-specific section has a real heading (`h2`) and is skipped (hidden) when empty so screen readers do not land on an empty region.
- Live refresh: builders are pure functions of `(rows, payloadState)`, so re-render on the 10s refresh tick needs no special handling.

## Documentation Updates

Update at least:

- `README.md`
- `docs/dashboard-guide.md`
- `docs/architecture.md` if the UI architecture split is worth documenting
- `docs/cli-reference.md` if visible dashboard workflow text mentions the old card labels
- `src/codex_usage_tracker/plugin_data/docs/dashboard-guide.html` (committed copy)
- `skills/codex-usage-tracker/SKILL.md`
- `src/codex_usage_tracker/plugin_data/skills/codex-usage-tracker/SKILL.md`

Docs should say:

- Top cards are universal and provider-neutral.
- Provider tabs change row scope, not top-card meanings.
- Provider-specific usage/credit/limit details live below the top cards and in details panels.
- `Usage Limits` shows remaining capacity.
- Overview shows provider lines when multiple providers are visible.

## Testing Plan

Scope label assertions to the top-card region (the `.cards` block of the generated HTML), not the whole document — `Highest Codex credits` (sort menu), preset labels, and detail-panel strings legitimately survive elsewhere.

Add or update tests in `tests/test_store_dashboard_mcp.py` to verify:

- The `.cards` block contains the eight universal labels in the contract order.
- The `.cards` block no longer contains `Codex Credits`, `Codex Remaining`, `Claude Remaining`, `Cache Read`, `Direct Input`, or `data-anthropic-label`.
- `providerProfiles` in `dashboard.js` no longer carries top-card label keys (`creditsLabel`, `remainingLabel`, `cachedLabel`, …).
- Overview limit rendering can include both Codex and Claude provider lines (feed both snapshots through `provider_limit_snapshots` fixtures).
- Codex scope renders only Codex limit values; Claude scope only Claude values.
- Missing limit snapshots produce the stable unavailable texts (`no snapshot`, `No snapshots`).
- Cache token totals include both `cached_input_tokens` and `cache_creation_input_tokens`.
- Provider-specific section still exposes Codex credits and Claude snapshot metadata.
- Existing aggregate-only guarantees remain (no raw text in fixtures or payloads).
- Existing assertions that pin the old labels/IDs (`usageCreditsLabel`, `Highest Codex credits` option, dashboard JS `Codex credits` strings) are reviewed: keep the sort-option assertion, update or delete top-card ones.

Suggested focused commands:

```bash
python -m pytest tests/test_store_dashboard_mcp.py -v
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard.js
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard_data.js
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard_state.js
python scripts/check_release.py
```

Full gate before merging:

```bash
python -m pytest
python -m ruff check .
python -m mypy
git diff --check
```

## Rollout Plan

1. Add failing dashboard tests for the universal top-card contract (labels, order, absence of provider-specific top-card strings).
2. Update `dashboard_template.html`: new card IDs/labels/order, delete `data-anthropic-label` attributes, add the `#providerDetails` skeleton.
3. Implement `buildUniversalSummary` / `buildProviderDetails` in `dashboard.js`; rewrite `updateSummaryCards`; update `COUNT_UP_IDS`; strip label keys from `providerProfiles`; remove the interim anthropic `Output Tokens` branch.
4. Implement the `Usage Limits` renderer over `provider_limit_snapshots` (display-label map, value preference, stale tooltip, unavailable texts).
5. Render the provider-specific section; fold in `#allowanceSource`.
6. Add `provider-details` styles within the Terminal Sunset token system.
7. Update docs and packaged copies.
8. Reinstall local command assets when testing installed CLI behavior (`pipx` venv bundles dashboard assets; repo edits do not reach the installed statusline/server until reinstalled).
9. Run focused dashboard checks, then the full local gate.

## Resolved Questions

- Strict universal top-card labels in Title Case (`Visible Calls` … `Usage Limits`).
- Combined `Usage Limits` card consuming `provider_limit_snapshots` only.
- Remaining-capacity display, `pct()` whole-percent rendering, `cr` suffix fallback.
- Provider lines in Overview, eligibility tied to visible rows.
- Provider-specific details strip below the universal cards, replacing `#allowanceSource`.
- Staleness (>24h) noted in tooltips only.
- No UI-side window alias mapping; canonical keys come from the Python capture layer.

## Remaining Open Questions

- Exact microcopy for the provider-details chips (resolve in code review; follow the unavailable-text rules above).
- Whether captured-effort coverage for Claude calls joins the Claude details group in this slice or a follow-up (suggest follow-up).
