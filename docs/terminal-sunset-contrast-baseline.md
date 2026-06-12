# Terminal Sunset — Contrast Baseline (Phase 1 Exit Gate)

Overhaul base SHA: `d459f84` (branch `codex/terminal-sunset-ui`).
Computed 2026-06-12 via WCAG 2.1 relative-luminance formula. Re-run after any token change
(formula: contrast = (L_hi + 0.05) / (L_lo + 0.05), sRGB linearization per WCAG 2.1).

## Text pairs (requirement: ≥4.5:1, WCAG AA)

| Token | on `--bg` | on `--surface` | on `--surface-2` | Verdict |
|---|---|---|---|---|
| `--text` `#e8e3ff` | 15.64 | 14.59 | 13.31 | PASS |
| `--text-dim` `#9a8fc7` | 6.61 | 6.17 | 5.63 | PASS |
| `--neon-pink` `#ff71ce` | 7.89 | 7.36 | 6.71 | PASS |
| `--neon-cyan` `#01cdfe` | 10.36 | 9.66 | 8.81 | PASS |
| `--neon-green` `#05ffa1` | 14.68 | 13.69 | 12.49 | PASS |
| `--neon-purple` `#b967ff` | 5.98 | 5.58 | 5.09 | PASS |
| `--neon-yellow` `#fffb96` | 18.08 | 16.86 | 15.39 | PASS |
| `--error` `#ff5577` | 6.32 | 5.90 | 5.38 | PASS |

## Non-text pairs (requirement: ≥3:1, WCAG 1.4.11)

| Token | on `--bg` | on `--surface` | on `--surface-2` | Verdict |
|---|---|---|---|---|
| `--border-interactive` `#6e61b8` | 3.77 | 3.52 | 3.21 | PASS — use for all control boundaries |
| `--grid-line` `#2a2058` | 1.34 | 1.25 | 1.14 | DECORATIVE ONLY — never on interactive boundaries |
| `--neon-cyan` (focus ring) | 10.36 | 9.66 | 8.81 | PASS |

## Structural (informational — surfaces distinguish by layout, not contrast)

- `--surface` vs `--bg`: 1.07:1
- `--surface-2` vs `--surface`: 1.10:1

Surfaces alone do not mark control boundaries; interactive elements always carry a
`--border-interactive` border or a `:focus-visible` outline.
