# Jury Report: Terminal Sunset UI Overhaul Spec

**Artifact:** `docs/ui-overhaul-spec.md`
**Jury:** 5 independent jurors — completeness, technical feasibility, accessibility, performance, process/maintainability
**Raw findings:** 66 severity-tagged (19 + 11 + 14 + 10 + 12)
**Date:** 2026-06-12 (jurors ran 2026-06-12 ~00:14, synthesis completed after session-limit interruption)

## Verdict

**Not ready for implementation as written.** The visual direction, palette (text contrast verified passing), and phasing concept are sound, but the spec needs one revision round before an implementer can execute it safely. Three findings are factually wrong against the codebase, two specced effects are infeasible as pure restyles, and the spec's own "zero behavior change" and "shippable every phase" guarantees are contradicted by its current content.

Convergence was high: 9 issues were independently flagged by 2+ jurors, which raises confidence that these are real spec defects rather than lens artifacts.

---

## Blocking issues (fix before implementation starts)

### B1. Sticky header + backdrop blur is infeasible as a pure restyle — 3 jurors
The calls table `th { position: sticky }` is inert today: `.table-scroll` only scrolls horizontally, so there is no vertical scroll container for sticky to attach to. `border-collapse: collapse` additionally breaks sticky cell borders. Making it work requires structural changes (`max-height`/`overflow-y` on `.table-scroll`, `border-collapse: separate`) that the spec's non-goals exclude. Separately, `backdrop-filter` on table parts has long-standing Chromium clipping bugs and forces backdrop re-sampling every scroll frame over 500–11k rows, and a translucent header makes text contrast uncomputable at spec time.
**Decision required:** drop the sticky/blur item, or explicitly authorize the structural change and use an opaque (≥0.95-alpha) `--surface` header with no blur.

### B2. Thread-expand motion spec doesn't match the implementation — 2 jurors
Spec says "rows unfold with `--swift` height transition; chevron rotates." Reality: the toggle is a `+`/`-` text swap (`dashboard.js:1526`), and expansion rebuilds the entire tbody (`render()` clears `#rows`), so there is no persistent node to transition. Height-animating a `tr` containing a nested table re-runs full table layout every frame. This also contradicts the spec's own "No DOM changes" non-goal.
**Fix:** respecify as `opacity` + `transform` animate-on-insert on the inserted `child-cell`, style the `+`/`-` glyph instead of a chevron.

### B3. "Single static file" goal and "CSP blocks external requests" QA step are factually wrong — 3 jurors
Output is multi-file: HTML + `codex-usage-tracker-assets/` (5 versioned assets) + `codex-usage-tracker-guide/`; tests assert the external hrefs. CSP is an HTTP header from `server.py:188-197` only — `file://` snapshots have no CSP at all. Worse, served-mode CSP is `style-src 'self'` with no `unsafe-inline` (asserted in tests), so any inline `style=` attribute (e.g. JS-built stagger delays) breaks silently in served mode while passing under `file://`.
**Fix:** reword goal to "fully offline from local static files via the existing assets pipeline"; reword QA to a devtools network-tab check; add constraint "no inline style attributes anywhere — stagger via `nth-child` delays or CSSOM only."

### B4. No branch/precondition story — spec targets files with uncommitted work — 1 juror, HIGH
The spec is untracked on `codex/dynamic-usage-remaining` with uncommitted edits to the exact files it plans to modify (dashboard.js, template, tests, server.py, dashboard.py, guide). Phase 1's "separate commit" would entangle unrelated dynamic-allowance/date-range diffs, and the uncommitted test diff adds new literal assertions that the restyle must preserve — a moving baseline.
**Fix:** add a Preconditions section: land the dynamic-allowance + date-range work first, record the base SHA, start the overhaul on a fresh branch.

### B5. Component inventory misses the default landing view and 5+ component families — 1 juror, HIGH×3
Absent entirely: the Needs Attention insights panel (severity chips, the default view), Investigation Presets aside, context-loading buttons with disabled states, the Insights/Calls/Threads view switcher, header meta chips (disclaimer, pricing, allowance, privacy, parser warnings), native date inputs, and any disabled-state treatment despite pervasive use.
**Fix:** add inventory rows for each; add one global disabled-state rule (muted tokens, no glow) to the design language.

### B6. `liveStatus` has 8 states; spec styles 3 — 2 jurors
Live, Static, Refreshing, Checking, Reloading, Updated, Paused, Refresh error. Implementer ships 3 bracket tags, leaves 5 unstyled. Gotcha: `dataset.state` is derived from `label.toLowerCase().includes('error')` — any relabel must preserve the `error` substring or the error styling hook silently breaks.
**Fix:** enumerate all 8 labels with treatments; note the substring constraint.

### B7. No old-token → new-token migration map — 1 juror, HIGH
Current light theme uses `--bg/--panel/--ink/--muted/--line/--blue` plus severity colors (`--green/--amber/--red`); new palette uses different names and never assigns severity colors (`severity-chip.high/.medium/.review`, mini-bar spans) or flips `color-scheme: dark` (affects native date pickers, selects, scrollbars).
**Fix:** add a mapping table, severity color assignments, and `color-scheme: dark` declaration.

---

## Required amendments (would cause rework or violations, not immediate dead-ends)

### Performance rules — make the motion language compositor-safe
- **Row hover** (technical, HIGH): edge bar must be a content-less `::before` animated with `transform`/`opacity`; never transition `border-*`, `width`, `padding`, `box-shadow` on `tr`/`td`; ban `transition: all` repo-wide; the "cap animated elements" risk rule must explicitly cover per-row CSS transitions.
- **Live-mode rebuild tax** (technical, MED): live mode refetches `limit: 'all'` and rebuilds the full tbody every 10s — every per-row CSS cost is re-paid each cycle, and the row under a stationary cursor replays its hover transition plus a full detail-panel `innerHTML` rebuild with zero user input. Rule: ≤1 pseudo-element per row, no per-row `filter`/outer `box-shadow`, no entry animations on table rows (rebuilt rows render in final state instantly).
- **Pills** (technical, MED): `fitModelPills()` does a synchronous write/read fit loop per pill every render — pills get no transition on `font-size`/`width`/`padding`, ever.
- **Selected-row glow** (technical, MED): selection follows hover in expanded Threads view; outer blurred `box-shadow` on `tr` repaints continuously across thousands of rows. Use inset shadow or solid 2px left rail; outer glow reserved for non-table elements.
- **Background grid** (technical, MED): must live on a dedicated `position: fixed; inset: 0; z-index: -1; pointer-events: none` element; `background-attachment: fixed` is banned (Chromium scroll-perf killer with two scroll surfaces in play).
- **Count-up** (4 jurors converged): numeric-only cards with a parse/reformat rule for `$`/separators, instant render for text values (`Set limits`, `Not configured`); one rAF handle per card, cancelled when a new payload lands; hook captures pre-render values in `applyDashboardPayload` and animates after `render()` (textContent writes happen in the totals renderer, not only in the refresh path); mutate only `aria-hidden` presentation nodes — `#insightCards` is `aria-live="polite"` and a ticking count-up spams screen readers; keep `tabular-nums`.
- **View-switch slide** (technical, LOW): apply to the section wrapper, not the scroll container; no permanent `will-change`.

### Accessibility — add the non-text layer the spec omits
- **WCAG 1.4.11 (3:1 non-text)** never stated. Text pairs all pass AA (verified computed: `--text` 13.3–15.6:1, `--text-dim` 5.6–6.6:1, all neons ≥4.5:1 as small text), but `--grid-line` is 1.34:1 and surface-vs-bg 1.07:1. Add a `--border-interactive` token ≥3:1 — `#6e61b8` verified at 3.77/3.52/3.21:1 across all three surfaces — for input/button resting borders; keep `#2a2058` for decorative rules only.
- **Focus visibility**: only inputs have a specced focus treatment. Add global `:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: 2px }`, never `outline: none`; glow is additive decoration. Sticky header must not obscure focused sort buttons (WCAG 2.4.11).
- **Blinking caret** violates WCAG 2.2.2 as written (auto-start, >5s, no in-page stop short of disabling live refresh). Cap: finite `animation-iteration-count` after each refresh, or single pulse per refresh; PRM stays as defense in depth.
- **Provider color never the sole differentiator** (1.4.1): pills must keep text, provider-scoped cards need a text/glyph prefix; pink/cyan is a classic CVD-confusable pair.
- **Forced colors / prefers-contrast**: add a `@media (forced-colors: active)` section — Windows High Contrast strips `box-shadow` glows and overrides custom-property colors, deleting every active/selected indicator; use transparent borders and system color keywords.
- **Type scale in rem** (0.6875/0.8125/1.125rem), letter-spacing in em; QA adds 200% zoom, text-spacing override pass, and 320px width (1.4.10 specifies 320px, not 360px).
- **Glyph noise**: prompt line, `>`/`::` prefixes, `▊`, box corners, `[!]`, `< prev [3/12] next >` — decorative glyphs only via CSS pseudo-content or `aria-hidden` spans; accessible names stay plain words; prompt line gets `aria-hidden="true"`.
- **Reduced-motion JS gate**: count-up is rAF, so require `matchMedia('(prefers-reduced-motion: reduce)')` + change listener, not just the CSS block; the `[REFRESHING]`→`[LIVE]` text change is the canonical refresh signal (pulse is additive), so PRM users don't lose the acknowledgment.
- **Small wins**: `role="status"` on `#liveStatus`; scrollbar thumb ≥10px with `scrollbar-color` primary; select styling is appearance-only of the native control on all platforms (native popup explicitly kept — 2 jurors flagged the "mobile" qualifier as wrong/misleading).

### Process — make the phase plan executable
- **Per-phase exit gates** (2 jurors): P1 = token contrast measurements + pytest green; P2 = pytest + both-mode visual smoke; P3 = reduced-motion run-through + pytest; P4 = behavior-parity check; P5 shrinks to final regression sweep. Currently all verification is end-loaded into phase 5 while phases 1–3 can each break literal test assertions — "every phase shippable" is unenforced.
- **Test-coupling inventory is a stale subset** (3 jurors): beyond the two listed CSS strings, tests assert `.table-scroll`, `overflow-x: auto`, the cards `repeat(4, minmax(0, 1fr))` grid, both media-query breakpoints, `.segmented:not(.provider-tabs)`, `.provider-tabs button`, `thread-row`, `thread-call-table`, `detail-card primary`, `filter-status-row`, plus UI copy the restyle rewrites ("Refreshing local usage index", the empty-state sentence, `Copy link`, `Export CSV`, `Back to top`, option markup). Replace the hardcoded list with a procedure: regenerate the protected-string inventory per phase by grepping the test file for `in dashboard*` asserts, diff against planned changes before writing code.
- **"No JS" phases contradict JS-owned strings** (2 jurors): pager format, status-chip labels, empty-state copy, and detail-card markup live in `dashboard.js`/`dashboard_format.js`. Either render brackets/prefixes via CSS pseudo-content (JS strings untouched) or relax phases 1–2 to "no JS logic changes; string/markup-literal edits allowed with matching test updates in the same commit."
- **Docs phase missing** (2 jurors): the bundled guide page hardcodes the light theme (visual orphan after restyle), and `dashboard-guide.md` embeds 4 light-UI screenshots plus wording the spec renames. Add a phase: regenerate screenshots (`--privacy-mode strict`), sweep guide wording, update .md and bundled .html in one commit, style `.guide-link`.
- **Rollback story**: scope all new rules under a root class (e.g. `body.theme-sunset`, removable in one line) or write down "rollback = revert the stack in reverse order" as the explicit policy.
- **New tests for new guarantees**: PRM block presence (phase 3), token presence (phase 1), no-external-reference scan of dashboard.css (phase 1) — same commits that introduce each feature.
- **Box-drawing corners**: one element has two pseudos; four corner glyphs need the children's pseudos too, or a single pseudo with multi-position `linear-gradient` backgrounds; `section { overflow: hidden }` clips anything outside the border box.
- **Prompt line**: define the echo grammar for every preset including the new custom range (`usage --from 2026-06-07 --to 2026-06-14`), the phase-1 placeholder text, and a fixed-height/truncation rule so header non-reflow behavior (documented in the guide) is preserved.
- **Pager**: respec around the real `#pageStatus` string ("1–50 of 1,234 calls · page 1/25", "No rows", hidden on single pages) — the `< prev [3/12] next >` mock loses information and violates zero-behavior-change if taken literally.
- **Responsive QA**: add ~1180/900/640px to the QA widths (real breakpoints with layout changes); spec the `.table-scroll` horizontal scrollbar; note mono fonts widen every column.
- **frontend-design skill note**: expand to per-phase invocation with the spec section + protected-string inventory as input, output reviewed against the phase exit gate.

## Advisory (low severity, accept or defer consciously)

- Initial-load stagger: pure CSS `animation-delay`, top-level panels only, accept frame-imperfection on cold static loads — no JS sequencing.
- Font stack metric variance: verify layout once with bare `monospace`; no pixel widths derived from glyph metrics.
- CSS size impact on 20MB snapshots is negligible (<0.5%) — don't spend budget minifying.
- "Cap animated elements" needs a number (e.g. N=20) and a large-payload smoke check to be testable.
- `#actionStatus` flash ("Copied") unspecced — natural candidate for a dim `> copied` echo.
- Misc unlisted elements (`#providerSummary`, `metric-stack` cells, flag chips, native `title` tooltips) — mark "inherit base styles"; native tooltips stay browser-default.
- `dashboard_format.js` / `dashboard_data.js` should be listed as read-only context (they generate `time-cell` and other markup the spec restyles).

## Cross-juror convergence map

| Issue | Jurors |
|---|---|
| Sticky header + backdrop blur | technical, performance, accessibility |
| "Single static file" / CSP wrong | process, performance |
| Test-coupling list incomplete | completeness, process, performance |
| Thread expand vs real implementation | completeness, technical |
| "No JS" phases vs JS-owned strings | process, performance |
| Count-up underspecified/hazardous | completeness, technical, accessibility, performance |
| Guide page + screenshots orphaned | completeness (×2), process |
| Select styling claim misleading | accessibility, performance |
| Prompt line (reflow / grammar / SR noise) | completeness, process, accessibility |
