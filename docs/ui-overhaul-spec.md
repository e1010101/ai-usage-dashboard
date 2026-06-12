# Dashboard UI Overhaul Spec — "Terminal Sunset"

Status: draft v2 — revised after 5-juror review (findings in `ui-overhaul-spec-jury-report.md`). No implementation yet.

## Vision

Restyle the dashboard as a CLI-native instrument panel with vaporwave aesthetics: a dark terminal frame, neon accent glow, monospace type, and snappy motion. The dashboard should feel like a beautifully over-engineered TUI that happens to run in a browser — not a generic admin template.

Three words: terminal, neon, instant.

## Goals

- Distinctive CLI/vaporwave visual identity, consistent across Insights, Calls, Threads, and Call Details.
- Snappy: every interaction acknowledges in under 200ms; nothing feels animated for animation's sake.
- Clean graphics: CSS-only effects, no chart libraries, no images, no external CDNs. The dashboard must keep working fully offline from local static files via the existing assets pipeline (`dashboard.html` + `codex-usage-tracker-assets/` + `codex-usage-tracker-guide/`; versioned hrefs through `_versioned_asset_href`). It is not a single file — do not inline CSS into the template.
- Zero behavior change: filters, URL state, live refresh, exports, and the API contract stay exactly as they are.

## Preconditions

- Land the in-flight dynamic-allowance + date-range work (current uncommitted changes on `codex/dynamic-usage-remaining`, including `uv.lock`) before any overhaul commit. The uncommitted test diff adds literal assertions this restyle must preserve; the baseline must be frozen first.
- Record the base commit SHA and start the overhaul on a fresh branch from it.
- Every new rule is scoped under a root class `body.theme-sunset` (added in phase 1). Rollback = remove the class hook in one line; full rollback = revert the phase stack in reverse order.

## Non-goals

- No framework adoption (stays vanilla JS + CSS).
- No light theme in v1 (vaporwave is dark-first; revisit later if needed).
- No new data visualizations in v1 (the existing cards/tables/pager are restyled, not redesigned).
- No DOM id or dataset changes — `dashboard_state.js` URL sync and the Python test suite assert against existing ids and class names. Visual classes are added alongside, never renamed, unless tests are updated in the same commit. The full protected-string inventory is regenerated per phase (see Risks), not maintained as a list here.
- No inline `<style>` blocks or `style=` attributes anywhere — served mode runs CSP `style-src 'self'` with no `unsafe-inline` (asserted in tests). Stagger/delays via `nth-child` rules or CSSOM property assignment only.
- No replacement of native form controls: `<select>` styling is appearance-only on the closed control (`appearance: none` + custom chevron) on all platforms; the open dropdown stays native everywhere. Native `title` tooltips stay browser-default.

## Design language

### Palette (CSS custom properties in `:root`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0d0921` | Page background (deep indigo, near-black) |
| `--surface` | `#161033` | Panels, cards, table rows |
| `--surface-2` | `#1f1745` | Hover states, expanded threads |
| `--grid-line` | `#2a2058` | Decorative borders only: table rules, separators, background grid |
| `--border-interactive` | `#6e61b8` | Resting borders on inputs, buttons, and any control boundary (3.77:1 on bg, 3.52:1 on surface, 3.21:1 on surface-2 — all ≥3:1) |
| `--neon-pink` | `#ff71ce` | Claude accents, active states, selection |
| `--neon-cyan` | `#01cdfe` | Codex accents, links, focus rings |
| `--neon-green` | `#05ffa1` | OK/live status, positive deltas |
| `--neon-purple` | `#b967ff` | Secondary accents, sort indicators, "review" severity |
| `--neon-yellow` | `#fffb96` | Warnings, caveats, estimated values, "medium" severity |
| `--text` | `#e8e3ff` | Primary text |
| `--text-dim` | `#9a8fc7` | Secondary text, labels (verified: 6.61:1 on bg, 6.17:1 on surface — passes AA) |
| `--error` | `#ff5577` | Errors, invalid ranges, "high" severity |

Rules:

- Neon colors are for accents, borders, glows, and small text only — body text stays `--text`/`--text-dim`.
- Text contrast: every text/background pair ≥4.5:1 (WCAG AA). All pairs above are computed and pass; record the ratios in the phase 1 exit gate so the QA audit has a baseline.
- Non-text contrast: UI component boundaries and state indicators ≥3:1 (WCAG 1.4.11). `--grid-line` (1.34:1) is decorative only; anything interactive uses `--border-interactive`.
- Provider color is never the sole differentiator (WCAG 1.4.1): pills keep their text label, provider-scoped cards carry a text or glyph prefix in addition to the colored top border. Pink/cyan is a confusable pair under common color-vision deficiencies — the text is the load-bearing cue.
- Declare `color-scheme: dark` on `:root` so native date pickers, selects, checkboxes, and scrollbars render dark.

Provider mapping: Codex = cyan, Claude Code = pink, Overview = purple. This carries through tabs, card top-borders, and model pills.

#### Token migration map (old light theme → Terminal Sunset)

| Old token | Old value | New token |
|---|---|---|
| `--bg` | `#f7f8fb` | `--bg` |
| `--panel` | `#ffffff` | `--surface` |
| `--ink` | `#172033` | `--text` |
| `--muted` | `#69758a` | `--text-dim` |
| `--line` | `#dde3ee` | `--grid-line` (decorative) / `--border-interactive` (controls) |
| `--blue` | `#2563eb` | `--neon-cyan` |
| `--green` | — | `--neon-green` |
| `--amber` | — | `--neon-yellow` |
| `--red` | — | `--error` |
| `--violet` | — | `--neon-purple` |
| `--shadow` | — | replaced by low-alpha neon glows (non-table elements only) |

Severity assignments (consumed by `severity-chip.high/.medium/.review` and `mini-bar span.low/.medium/.high`): high → `--error`, medium → `--neon-yellow`, low/review → `--neon-green` (mini-bar low) / `--neon-purple` (review chips).

### Typography

- Single monospace stack, system-only (no font downloads): `"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, "SF Mono", monospace`.
- All text monospace — it is the CLI identity. Tabular numerals for token/cost columns (`font-variant-numeric: tabular-nums`).
- Type scale in rem so user default-font-size preferences apply: h1 `1.125rem` bold, body `0.8125rem`, section labels `0.6875rem` uppercase `--text-dim` with letter-spacing declared in `em`.
- Layout must not depend on a specific stack member: no fixed pixel widths derived from glyph metrics; verify once with the stack forced to bare `monospace`. Stack members differ in advance width and x-height across machines.
- Must survive WCAG 1.4.12 text-spacing overrides (letter-spacing 0.12em, line-height 1.5) without clipping — no fixed-height containers around bracket tags or table cells.

### CLI motifs

- **Prompt line**: header becomes a terminal title bar with a decorative prompt echo reflecting active filters. Echo grammar covers every preset: `usage --week`, `usage --today`, `usage --month`, `usage --all`, `usage --from 2026-06-07 --to 2026-06-14` (custom range), with ` --provider codex|claude` appended when a provider tab is active. Fixed height, single line, `text-overflow: ellipsis` truncation — the header must not reflow on filter changes (documented guide behavior). The line is `aria-hidden="true"` (it duplicates filter state available elsewhere). Phase 1 ships it with the static placeholder `usage --week`; the live echo is a phase 4 hook. Three dim window dots on the left.
- **Status chips** (`#liveStatus`) render as bracket tags. All eight states get treatments:

  | Label | Treatment |
  |---|---|
  | `[LIVE]` | `--neon-green`, block caret `▊` (blink rules below) |
  | `[UPDATED]` | `--neon-green`, no caret (transient) |
  | `[REFRESHING]` | `--neon-cyan` |
  | `[CHECKING]` | `--neon-cyan` |
  | `[RELOADING]` | `--neon-cyan` |
  | `[PAUSED]` | `--neon-yellow`, steady caret |
  | `[STATIC]` | `--text-dim` |
  | `[REFRESH ERROR]` | `--error` |

  Constraint: the error styling hook derives `data-state` from `label.toLowerCase().includes('error')` (`dashboard.js`) — any relabel must preserve the `error` substring. The bracketed word, never the hue, carries the meaning. Add `role="status"` to the chip as part of the restyle so state transitions are announced.
- **Caret blink** is capped to satisfy WCAG 2.2.2: blink for ≤5s after each successful refresh (`animation-iteration-count` finite), then hold steady. No indefinite blinking. `prefers-reduced-motion` stops it entirely (defense in depth, not the primary mechanism).
- **Panel headers** prefixed with a dim `>` or `::`. Box-drawing corner accents on the Call Details panel: one element exposes only two pseudo-elements, so draw all four corners with a single `::before` using multi-position `linear-gradient` backgrounds (no glyphs), or use the section's children (`h2`, `#detail`) for the remaining pseudos. Corners must stay inside the border box — the generic `section` rule applies `overflow: hidden`.
- **Decorative glyphs** (`>`, `::`, `▊`, corners, `[!]`, prompt line) are injected via CSS pseudo-content (using `content: "▊" / ""` alt-text syntax where supported) or `aria-hidden` spans — never as bare DOM text. Accessible names stay plain words ("Previous", "Next", "Page 1 of 25"), never glyph soup.
- **Filter row** styled as a command palette: flat dark inputs with `--border-interactive` resting borders, neon underline + focus ring on focus, `--neon-cyan` caret. Native date inputs (`#dateStart`/`#dateEnd`, shown when preset = Custom) inherit `color-scheme: dark` for calendar chrome; the invalid-range state uses `--error` on the `dateRangeStatus` row (`data-state="error"`).
- **Empty states** as faux command output: `> no calls in range — widen the time filter`. Note: empty-state copy lives in JS and is test-asserted; the string change lands in phase 4 with its test update (see plan).

### Vaporwave atmosphere (subtle, two effects max)

- **Fixed background**: very faint perspective grid (CSS `linear-gradient` lines, ~4% opacity) fading toward a horizon glow at the bottom — pink-to-purple radial at ~8% opacity. No animation. Mechanism: a dedicated `position: fixed; inset: 0; z-index: -1; pointer-events: none` element painted once on its own layer. `background-attachment: fixed` is banned (disables fast-path scrolling in Chromium; this page has two scroll surfaces).
- **Neon glow** is the signature effect, restricted to non-table elements: active provider tab, focused input, primary button. Glowing elements pair the `box-shadow` with a 1px border of the same hue. Selected/hovered table rows do NOT get outer glow — selection follows hover in expanded Threads view and an outer blurred shadow would repaint continuously across thousands of rows. Selected row treatment: solid 2px neon left rail + `--surface-2` background (or inset box-shadow), nothing painted outside the row box.
- Explicitly rejected: scanline overlays, chromatic aberration, animated VHS noise — they read as gimmick and hurt legibility on data-dense tables.

### Interaction states (global rules)

- **Focus**: `:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: 2px }` on every interactive element — tabs, view segments, sort headers, pager, refresh, export/copy, Top button, context buttons, and the keyboard-focusable `.table-scroll` region (`tabindex="0"`). Never `outline: none`. Glow is additive decoration on top of the outline, never a replacement. The table header must not obscure a focused sort button when scrolled (WCAG 2.4.13 / 2.4.11).
- **Disabled**: one global rule — `--text-dim` text, `--grid-line` border, ~55% opacity, no glow, no hover response, `cursor: not-allowed`. Applies to: refresh button during refresh, pager buttons at range ends, context buttons in `file://` / `--no-context-api` modes, date inputs when preset ≠ Custom, and the Live checkbox + History select in static mode.
- **Forced colors** (`@media (forced-colors: active)`): Windows High Contrast strips box-shadows and overrides custom-property colors. Every state that currently reads through glow or fill (active tab, provider top borders, hover edge bar, selected row) must survive via border, underline, or weight; use transparent borders on glow-carrying elements (forced-colors paints them) and system color keywords (`Highlight`, `ButtonText`) where explicit colors are needed.

## Motion

Principles: fast in, faster out; motion communicates state change, never decoration. Global durations as custom properties.

| Token | Value | Use |
|---|---|---|
| `--snap` | `120ms cubic-bezier(0.2, 0, 0, 1)` | Hovers, focus, button presses |
| `--swift` | `180ms cubic-bezier(0.16, 1, 0.3, 1)` | Panel/row expand, tab switch, detail pin |
| `--settle` | `320ms cubic-bezier(0.16, 1, 0.3, 1)` | View switches, count-up ticks |

Hard rules (live mode rebuilds the full table every 10s at `limit: 'all'` — every per-row cost is re-paid each cycle, and the row under a stationary cursor re-enters `:hover` after each rebuild):

- All row-level effects are paint/compositor-only: `background-color`, plus a content-less `::before` animated with `transform`/`opacity`. Never transition `border-*`, `width`, `padding`, or `box-shadow` on `tr`/`td`.
- `transition-property` is enumerated explicitly on every animated selector. `transition: all` is banned repo-wide.
- At most one pseudo-element per table row; no per-row `filter` or outer `box-shadow`.
- No entry/mount animations on table rows — rebuilt rows render in their final state instantly.
- Pills (`.pill`, `.model-pill`) get no transition on `font-size`, `width`, or `padding`: `fitModelPills()` runs a synchronous resize/measure loop per pill on every render and would measure mid-transition widths.
- The animated-element cap is a number: at most 20 animated nodes at any time (insight cards + chrome), never table rows in bulk.

Specific behaviors:

- **View/tab switch**: outgoing content fades 60ms, incoming slides up 4px + fades in 180ms. Apply the slide/fade to the section wrapper, not the scroll container (animating the scroll container promotes a 500-row table to a compositor layer). No permanent `will-change`. No layout shift.
- **Card numbers**: count up over ≤320ms via `requestAnimationFrame` when a refresh changes them; skip when delta is zero. Rules: numeric-only — currency and thousands separators are parsed and reformatted through the existing formatters; text values (`Set limits`, `Not configured`, `Not applicable`, allowance text) render instantly with no animation. One rAF handle per card, cancelled when a new payload lands (refreshes can arrive back-to-back). The hook captures pre-render values in `applyDashboardPayload` and animates after `render()` — card `textContent` is written by the totals renderer, which also runs on filter/view changes where no animation should occur. Skip entirely when `document.visibilityState !== 'visible'`. Animate only `aria-hidden` presentation nodes or set the final value in accessible text immediately — `#insightCards` is `aria-live="polite"` and ticking text would spam screen readers. Keep `tabular-nums` so digits don't reflow card width per frame.
- **Live refresh pulse**: liveStatus tag glow-pulses once per successful refresh (CSS class toggled, `animationend` cleanup — verify the event fires at 0ms duration under reduced motion, or clean up synchronously). The `[REFRESHING]` → `[LIVE]` text change is the canonical refresh signal; the pulse is additive, so reduced-motion users lose nothing.
- **Thread expand**: the toggle is the existing `+`/`-` text glyph (there is no chevron) and expansion inserts a fresh child `<tr>` on full re-render — there is no persistent node to height-transition. Treatment: the inserted `child-cell` content fades/slides in via `opacity` + `transform` animation-on-insert (single layout pass, then compositor-only); the `+`/`-` glyph gets a `--snap` color/weight change. No `height`/`max-height` transitions on table rows.
- **Row hover**: background shifts to `--surface-2` and a 2px neon left-edge bar slides in — implemented as the row's single `::before` pseudo animated with `transform: translateX`/`opacity`, `--snap`. Hover styles are inert until `:hover`/`:focus-within`.
- **Initial load**: panels stagger in (30ms increments, max 5 groups) — pure CSS `animation-delay` on the top-level panels only, per view: live bar, insights/preset panel, cards grid, table section, details panel. One-time, total under 350ms. Accepted to be frame-imperfect on cold static loads (initial render + pill fitting may eat the first frames) — no JS sequencing to compensate.
- `@media (prefers-reduced-motion: reduce)`: all transitions/animations collapse to 0ms, count-up renders final values instantly, caret stops blinking. The count-up is JS-driven, so it additionally requires a `matchMedia('(prefers-reduced-motion: reduce)')` check with a change listener — the CSS block alone doesn't gate rAF. Mandatory, not best-effort, and test-asserted (see plan).

## Component inventory (restyle pass)

| Area | Treatment |
|---|---|
| Header / live bar | Terminal title bar, prompt line (aria-hidden, fixed height), bracket-tag status chips (all 8 states), neon refresh button + disabled state, Live checkbox + History select restyled flat-dark with disabled treatment in static mode |
| Header meta chips | `disclaimer-chip` ("Unofficial project"), `#pricingSource`, `#allowanceSource`, `#privacyMode`, conditional `#parserDiagnostics` — dim bracket tags; warning/missing variants in `--neon-yellow`, error variants in `--error` |
| Provider tabs | Underline tabs → bracketed segments `[ overview ] [ codex ] [ claude ]`, active = neon glow + filled, `aria-pressed` preserved |
| View switcher | Insights/Calls/Threads segmented control (shares `.segmented` with provider tabs — note tests assert `.segmented:not(.provider-tabs)`); active segment filled, no glow; dynamic `#tableCaption`/`#tableTitle` as dim `::`-prefixed caption line |
| Needs Attention panel | `#insightsPanel` / `#insightCards` insight cards on `--surface`, severity chips per the severity map (high/medium/review), card body `--text`, `aria-live` semantics untouched |
| Investigation presets | `preset-card` buttons with `--border-interactive` borders, active card = filled + 1px neon border (`aria-pressed` preserved), `#presetStatus` as dim echo line, `#clearPreset` as ghost button |
| Filter row | Command-palette inputs, appearance-only `<select>` styling (native popup everywhere), neon focus underline, native date inputs via `color-scheme: dark`, `dateRangeStatus` idle/active/error states |
| Insight cards (metric cards) | `--surface` panels, provider-colored 2px top border + text/glyph provider prefix, big tabular numerals, dim uppercase labels, count-up per Motion rules |
| Calls table | Dense monospace rows, `--grid-line` rules, hover edge-bar per Motion rules, sort indicator in `--neon-purple`, header restyled on opaque `--surface` background — no backdrop blur, no new sticky behavior (current `th` sticky is inert because `.table-scroll` scrolls horizontally only; making it functional requires structural changes excluded by the non-goals — revisit as a follow-up). `.table-scroll` horizontal scrollbar styled to match the details panel scrollbar |
| Threads view | Same table language; expanded thread gets faint neon left rail (solid, no glow) tying child calls to parent; `flags`/`flag` signal chips as dim bracket tags |
| Call Details panel | Box-drawing corners per CLI-motif mechanism, `::` section headers, signal/confidence chips as bracket tags, `detail-collapse` native `<details>`/`<summary>` restyled (custom dim marker), thread timeline `timeline-item`/`signal-strip`/`mini-bar` recolored per severity map, context buttons + disabled states, `context-result`/`context-note` loading and error notes, `_detailError` / "Loading additional aggregate fields…" row states, scrollbar `scrollbar-color` primary + webkit enhancement, thumb ≥10px, panel stays keyboard-scrollable |
| Pager | Styled around the real `#pageStatus` string ("1–50 of 1,234 calls · page 1/25", "No rows") — bracket the page fraction, dim the rest. Hidden state on single pages preserved. Button accessible names stay "Previous"/"Next"; `< >` glyphs via pseudo-content only |
| Action status | `#actionStatus` transient confirmations as dim faux output (`> copied`), auto-clear behavior unchanged |
| Date status / caveats | `--neon-yellow` bracket tag, e.g. `[!] week totals from loaded rows only` |
| Top button | Floating `▲` terminal key-cap with glow on hover |
| Export/copy buttons | Ghost buttons, neon border on hover, active press scales 0.97 `--snap` |
| Misc | `#providerSummary` paragraph, `metric-stack`/`metric-sub` two-line cells: inherit base styles, no special treatment. Native `title` tooltips stay browser-default |

Read-only context for implementers: `dashboard_format.js` and `dashboard_data.js` generate markup the restyle touches (`time-cell` and friends) — their class names must be preserved; they are part of the test-asserted `dashboard_surface`.

## Implementation plan

All changes live in `plugin_data/dashboard/` (`dashboard.css`, `dashboard_template.html`, small additive hooks in `dashboard.js`) plus the guide page in phase 6 — they ship through the existing build/serve pipeline automatically.

Phases 1–2 allow no JS *logic* changes; JS string/markup-literal edits (status labels, empty-state copy, pager text) are deferred to phase 4 and land with their matching test updates in the same commit.

1. **Tokens + chrome** — `body.theme-sunset` root class, palette/typography/motion custom properties (with `color-scheme: dark`), page background element, header/title bar, static prompt-line placeholder, status tags (CSS only — labels unchanged). New tests in this commit: token presence (`--neon-pink`, `--snap`), no-external-reference scan of `dashboard.css` (no `url(`, `@import`, `http`).
   *Exit gate*: contrast measurement of every token pair recorded (text ≥4.5:1, non-text ≥3:1), full pytest green.
2. **Components** — tabs, view switcher, filters, cards, insights/preset panels, tables, details panel, pager, meta chips, disabled states. No JS.
   *Exit gate*: pytest green; both-mode visual smoke at 1280/640/360px; all inventory rows render with new tokens.
3. **Motion** — transitions, expand/unfold, hover edge-bars, stagger, reduced-motion block. No JS. New test in this commit: `@media (prefers-reduced-motion: reduce)` block presence.
   *Exit gate*: reduced-motion run-through (OS setting on: zero motion, caret steady); pytest green; large-payload smoke (`limit=0` on a big DB) confirms no per-row animation cost.
4. **JS-assisted polish** — count-up tick (per Motion rules), refresh pulse class toggle, prompt-line filter echo (full grammar incl. custom range), bracket-tag label strings (preserving the `error` substring hook), pager/empty-state string updates. Each hook isolated, no behavior change; every string edit updates its test assertion in the same commit.
   *Exit gate*: behavior-parity check (URL state, live refresh, exports, copy link) + pytest green.
5. **QA pass** — final regression sweep: contrast audit against the phase-1 baseline plus non-text 3:1 sweep (borders, focus indicators, state changes); keyboard-only walkthrough (tabs → filters → sort headers → pager → details); NVDA spot-check; forced-colors pass; reduced-motion pass; 200% zoom and text-spacing-override pass; widths 1280/1180/900/640/360/320px; static `file://` snapshot check via devtools network tab — no external requests (note: CSP exists in served mode only, set by `server.py`; `file://` has no CSP, so this is a manual source-level guarantee backed by the phase-1 scan assert); full pytest run; manual check of both `serve-dashboard` and static modes.
6. **Docs** — restyle the bundled guide page (`plugin_data/docs/dashboard-guide.html`) with the same tokens, style `.guide-link` in the header, regenerate all four guide screenshots from synthetic fixtures with `--privacy-mode strict`, sweep `docs/dashboard-guide.md` wording for renamed affordances (Top button → `▲` key-cap, status chips → bracket tags, underline tabs → bracketed segments). `.md` and bundled `.html` in the same commit.

Each phase is a separate commit and must pass its exit gate before the next begins; the dashboard stays shippable between phases.

Implementation note: run the build under the `frontend-design` skill, invoked per phase with the relevant spec section plus that phase's protected-string inventory as input; review skill output against the phase exit gate before committing.

## Risks

- **Test coupling**: pytest asserts literal CSS/JS/template strings well beyond the commonly cited two (`scrollbar-gutter: stable`, `overflow-y: scroll`) — including `.table-scroll`, `overflow-x: auto`, the cards `grid-template-columns: repeat(4, minmax(0, 1fr))`, the `@media (max-width: 1180px)` / `640px` breakpoints, `.segmented:not(.provider-tabs)`, `.provider-tabs button`, UI copy ("Refreshing local usage index", the empty-state sentence, `Copy link`, `Export CSV`, `Back to top`), and option markup. Procedure (replaces any static list): at the start of each phase, regenerate the protected-string inventory by grepping `tests/test_store_dashboard_mcp.py` for `in dashboard`, `in dashboard_css`, `in dashboard_js`, `in dashboard_surface` assertions; diff it against the phase's planned changes before writing code; update tests in the same commit as the change that invalidates them.
- **Live-mode rebuild tax**: live mode fetches `limit: 'all'` and rebuilds the entire tbody every 10s; Threads view with `?expand=all` can render ~11k rows. Every per-row CSS cost is re-paid per cycle, and the row under a stationary cursor replays hover (plus a full detail-panel rebuild) with zero user input. The Motion hard rules exist for this; they apply to CSS `:hover` transitions, not just JS animation.
- **Contrast vs. vibe**: vaporwave palettes fail AA easily. The token table is computed, not eyeballed — but any token adjustment during implementation must re-run the measurements, including the non-text 3:1 layer.
- **20MB static files**: CSS size impact is negligible (<0.5% of the inline JSON payload) — do not spend budget minifying CSS. The real constraint is the animated-node cap (≤20) and the no-row-animation rules above; the phase 3 gate includes a large-payload smoke check.
