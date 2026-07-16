# Pricing, Credits, And Allowance

AI Usage Dashboard has three related but different concepts:

- `Estimated Cost`: optional USD estimates from a local pricing file, shown as a universal top card.
- Codex credits: calculated usage credits from aggregate token counters and Codex credit rates, shown in the `Provider Details` strip and detail panels.
- Usage limits: local remaining-capacity snapshots shown in the universal `Usage Limits` top card — 5-hour and weekly windows from Codex `rate_limits` (with optional manual overrides) and 5-hour and 7-day windows from captured Claude Code status-line snapshots.

## Cost Estimates

Enable optional cost estimates:

```bash
ai-usage-dashboard update-pricing
```

This fetches OpenAI text-token pricing from `https://developers.openai.com/api/docs/pricing.md`, parses the selected tier, and writes a source-stamped local cache to `~/.codex-usage-tracker/pricing.json`. The default tier is `standard`; other supported tiers are `batch`, `flex`, and `priority`.

Add DeepSeek API pricing to the same cache:

```bash
ai-usage-dashboard update-pricing --include-deepseek
```

With `--include-deepseek`, the updater fetches DeepSeek's published pricing page, caches `deepseek-v4-flash` and `deepseek-v4-pro`, and adds official compatibility aliases for `deepseek-chat` and `deepseek-reasoner`. Codex credits still apply only to Codex/OpenAI rows; DeepSeek rows are marked not applicable for credit confidence.

Add Anthropic (Claude) pricing to the same cache:

```bash
ai-usage-dashboard update-pricing --include-anthropic
```

With `--include-anthropic`, the updater fetches Anthropic's published pricing docs from `https://platform.claude.com/docs/en/about-claude/pricing.md` and caches every Claude model row (base input, prompt-cache read, and output rates — cache reads map to `cached_input_per_million`). It also adds compatibility aliases so dated transcript model ids such as `claude-sonnet-4-5-20250929` and `claude-haiku-4-5-20251001` resolve to their pricing rows. Without this flag, Claude Code rows have no USD estimates and the spend chart under-reports Anthropic usage. When Anthropic publishes both introductory and standard prices for the same model, the first (currently effective) row wins. Claude rows are marked not applicable for Codex credit confidence.

If a pricing file already exists, the updater leaves a timestamped `.bak` copy next to it before replacing the active cache.

The updater also includes marked best-guess estimates for Codex labels that are not finalized in the public pricing table. `codex-auto-review` uses OpenAI's published `codex-mini-latest` Codex pricing from `https://openai.com/index/introducing-codex/`: `$1.50` per 1M input tokens, a 75% prompt-cache discount (`$0.375` per 1M cached input tokens), and `$6.00` per 1M output tokens. `gpt-5.3-codex-spark` is listed by OpenAI as a research preview with non-final Codex rates, so the tracker estimates it as `gpt-5.3-codex` at `$1.75` per 1M input tokens, `$0.175` per 1M cached input tokens, and `$14.00` per 1M output tokens. Estimates only fill gaps: once a model appears in the fetched pricing tables, the source-published row always wins and the estimate is dropped.

Use `--no-estimates` when you want only pricing rows parsed from the source pricing tables.

For reproducible historical reports, pin the current pricing cache and pass the pinned file later:

```bash
ai-usage-dashboard pin-pricing --output ~/.codex-usage-tracker/pricing-2026-06-05.json
ai-usage-dashboard dashboard --pricing ~/.codex-usage-tracker/pricing-2026-06-05.json
```

For a manual template:

```bash
ai-usage-dashboard init-pricing
```

Edit `~/.codex-usage-tracker/pricing.json` with USD-per-million-token rates for local overrides or models that are not present in the fetched pricing tables. Normal reports never contact the network; only `update-pricing` refreshes the local pricing cache.

## Codex Credits

Codex credits are a calculated usage number, not a dashboard-only unit. The tracker uses Codex's logged aggregate token counters and the bundled OpenAI Codex rate-card snapshot to estimate credits consumed by local Codex calls. The dashboard surfaces them in the `Provider Details` strip below the top cards and in Call/Thread detail panels.

The estimate uses:

- input tokens
- cached input tokens
- output tokens
- the matched model's credit rates

Direct model matches are the highest-confidence rows. Local aliases and inferred labels, such as code-review usage mapped to GPT-5.3-Codex, are marked `estimated`. Local `credit_rates` overrides are marked `user_override`. Rows without a matching model rate are marked as missing credit rates.

To copy the bundled source-stamped rate card into a local snapshot:

```bash
ai-usage-dashboard update-rate-card
```

The local snapshot is written to `~/.codex-usage-tracker/rate-card.json`. Each bundled rate and alias includes source URL, fetched date, tier, confidence, and alias rationale where applicable. Use `--source-file` only when you have a reviewed replacement JSON snapshot you want the tracker to validate and use.

## Codex Usage Limits

Remaining Codex capacity is different from Codex credits. For Codex rows, the dashboard can read local Codex JSONL `payload.rate_limits` metadata from token-count events and convert the latest account-level snapshot into 5-hour and weekly remaining windows, shown as the Codex line of the `Usage Limits` card.

This is local-only. The tracker does not call a remote account API, scrape a browser session, or infer your logged-in ChatGPT plan. A plan name such as Free, Plus, Pro, Business, or Enterprise can provide context, but it is not enough to know the current remaining allowance. Local Codex logs may also omit usage from other ChatGPT agentic surfaces that share the same allowance.

Manual allowance context remains useful when local dynamic snapshots are missing, when you want exact credit totals, or when you want to override a dynamic window:

```bash
ai-usage-dashboard init-allowance
ai-usage-dashboard parse-allowance "5h 79% 6:50 PM Weekly 33% Jun 7"
```

The tracker can store `remaining_percent`, `reset_at`, `remaining_credits`, and `total_credits` for each manual window. Manual windows with `remaining_percent`, `remaining_credits`, or `total_credits` override dynamic Codex windows with the same key. Dynamic Codex windows fill manual windows that are missing or left null.

If `total_credits` is present, call and thread details show the estimated share of that allowance. Otherwise, the dashboard shows remaining percentages and reset context.

Configure the usage component:

1. Run `ai-usage-dashboard parse-allowance "5h 79% 6:50 PM Weekly 33% Jun 7"` with current copied values.
2. Or run `ai-usage-dashboard init-allowance` and open `~/.codex-usage-tracker/allowance.json`.
3. Copy current `remaining_percent` and `reset_at` values from Codex Settings, `/status`, or another trusted usage display when you need a manual override.
4. Add `remaining_credits` and `total_credits` only if your plan or workspace exposes exact credit numbers.
5. Leave fields as `null` when you do not have a trustworthy value.

## Claude Usage Limits

Claude Code can provide `rate_limits` to custom status-line commands. The tracker can capture that local status-line JSON into a sanitized snapshot for the Claude line of the `Usage Limits` card:

```bash
ai-usage-dashboard install-claude-limits-statusline
```

The installer updates `~/.claude/settings.json` so Claude Code calls the tracker from its `statusLine` command. If you already have a status line, it wraps and preserves that command and writes a backup before changing the settings file. The installed wrapper writes `~/.codex-usage-tracker/claude-limits.json` with only provider identity, 5-hour and 7-day remaining percentages, reset timestamps, and source metadata. It does not store the full status-line payload, transcript path, prompts, assistant messages, or tool output.

If Claude Code does not include `rate_limits` yet, the wrapper exits successfully without replacing the snapshot. This is expected before the first API response or on plans that do not expose the field. `ai-usage-dashboard capture-claude-limits --quiet` remains available as a lower-level stdin command for custom scripts.

## Accuracy Notes

- The Codex line of `Usage Limits` applies to local Codex `rate_limits` snapshots and optional manual overrides.
- The Claude line of `Usage Limits` appears only when a local Claude Code status-line snapshot has been captured. Use `install-claude-limits-statusline` once to configure automatic capture from Claude Code.
- The dashboard does not infer live remaining allowance from the logged-in account plan or contact a remote usage API.
- Pricing can change after a report is generated. Use `pin-pricing` when you need reproducible historical cost estimates.
- `update-pricing --include-deepseek` adds DeepSeek model costs only; source ingestion still comes from local adapters such as Hermes.
- `update-pricing --include-anthropic` adds Claude model costs only; Claude Code usage rows still come from the Claude adapter.
- Rows with direct model/rate-card matches are more trustworthy than inferred aliases or local overrides.
- Cost and credit calculations use aggregate counters; the tracker does not re-tokenize prompts or reconstruct usage from raw text.
