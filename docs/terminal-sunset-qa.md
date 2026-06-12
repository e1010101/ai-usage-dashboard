# Terminal Sunset — Phase 5 QA Report

Date: 2026-06-12. Branch `codex/terminal-sunset-ui`, base SHA `d459f84`.

## Automated checks (all pass)

- **Full pytest**: 105 passed, 3 skipped — includes the new guarantees added per phase:
  token presence + no-external-reference scan (phase 1), reduced-motion block presence +
  transition-`all` ban (phase 3), count-up reduced-motion gate / pulse / caret / prompt echo /
  pager fraction / empty-state copy (phase 4).
- **Contrast audit** vs `terminal-sunset-contrast-baseline.md`: all text pairs ≥4.5:1, all
  interactive boundaries ≥3:1 (`--border-interactive` 3.21–3.77:1 across surfaces). Phase 4
  state colors (live/updated green 13.7:1, busy cyan 9.7:1, paused yellow 16.9:1, error 5.9:1
  on `--surface`) all pass as text. `--grid-line` confined to decorative rules and
  non-interactive status chips.
- **Offline guarantee**: generated a real static snapshot (`ai-usage-dashboard dashboard`);
  zero external references in HTML markup, CSS, and all JS assets. The only `https://` strings
  in the output are pricing-source attribution URLs inside the inline JSON payload — data, not
  fetched resources. CSP note: the CSP header is served-mode only (`server.py`); `file://`
  snapshots rely on this source-level scan, which is also enforced by the pytest asserts.
- **JS syntax**: `node --check` clean on dashboard.js.
- **Theme markers**: snapshot contains `theme-sunset` body class, `bg-scene`, `promptLine`.
- **Motion discipline** (verified by construction + greps): every transition enumerates its
  properties; rows animate background-color plus one content-less pseudo (transform/opacity)
  only; no entry animations on table rows; pills carry no transitions; stagger is 5 groups of
  pure-CSS `animation-delay`; caret blink is finite (5 iterations, WCAG 2.2.2).

## Known deviations (documented in commits)

- Sticky-header backdrop blur dropped (jury B1): `th` sticky was inert in the base layout and
  blur fails contrast/perf review. Header restyled opaque on `--surface`.
- Thread-expand content fade omitted (phase 3): CSS cannot distinguish a user expand from a
  10s live-refresh rebuild; animating it would replay on every refresh. Toggle-glyph color
  transition acknowledges the action instead.
- Prompt line carries a `ai-usage-dashboard:~$` path prefix beyond the spec's bare
  `usage --week` grammar (kept; echo hook preserves it).

## Remaining manual checklist (needs a human + browser)

- [ ] Visual smoke in `serve-dashboard` and `file://` modes at 1280 / 1180 / 900 / 640 / 360 / 320 px
- [ ] 200% browser zoom + WCAG 1.4.12 text-spacing override pass
- [ ] Keyboard-only walkthrough: tabs → filters → sort headers → pager → details
- [ ] NVDA spot-check (status chip announcements, bracket glyphs suppressed via alt-text content)
- [ ] Windows High Contrast (`forced-colors: active`) pass
- [ ] OS reduced-motion pass (zero motion, steady caret, instant count-up)
- [ ] Scroll-jank check on a large dataset (Threads view, `?expand=all`)
