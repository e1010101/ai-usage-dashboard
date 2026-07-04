# Development And Release

## Local Setup

```bash
git clone https://github.com/e1010101/ai-usage-dashboard.git
cd ai-usage-dashboard
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install ".[dev]"
ai-usage-dashboard install-plugin --python .venv/bin/python
```

## Repo Layout

- `src/codex_usage_tracker/`: parser facade, SQLite store, reports, dashboard, CLI, and MCP server.
- `src/codex_usage_tracker/adapters/`: source-specific adapters for Codex, Claude Code, and Hermes.
- `src/codex_usage_tracker/plugin_data/`: plugin assets, dashboard assets, bundled docs, rate cards, and packaged skill files.
- `skills/`: source skill files copied into package data.
- `docs/`: user documentation, architecture notes, JSON schemas, and synthetic screenshots.
- `tests/`: synthetic fixtures and unit tests.
- `scripts/check_release.py`: release-readiness checks for docs, versions, packaging, wheel contents, and tracked secret patterns.
- `scripts/benchmark_synthetic_history.py`: synthetic benchmark for large aggregate histories.

## Local CI Gate

Run the local CI gate before pushing to `main`:

```bash
python -m ruff check .
python -m mypy
python -m pytest
python -m pytest --cov=codex_usage_tracker --cov-report=term-missing
python -m compileall src
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard_format.js
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard_data.js
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard.js
node --check src/codex_usage_tracker/plugin_data/dashboard/dashboard_state.js
python scripts/check_release.py
git diff --check
python -m build
python scripts/check_release.py --dist
```

## Additional Smoke Checks

Run these when touching related CLI surfaces:

```bash
ai-usage-dashboard update-pricing --output /tmp/codex-usage-pricing.json
ai-usage-dashboard update-rate-card --output /tmp/codex-usage-rate-card.json
ai-usage-dashboard doctor
ai-usage-dashboard doctor --suggest-repair
ai-usage-dashboard refresh --source all --json
ai-usage-dashboard refresh --source claude-code --claude-home /tmp/empty-claude-home --json
ai-usage-dashboard refresh --source hermes --hermes-home /tmp/empty-hermes-home --json
ai-usage-dashboard dashboard --output /tmp/codex-usage-dashboard.html
ai-usage-dashboard serve-dashboard --help
ai-usage-dashboard init-allowance --output /tmp/codex-usage-allowance.json
ai-usage-dashboard parse-allowance --output /tmp/codex-usage-allowance.json "5h 79% 6:50 PM Weekly 33% Jun 7"
ai-usage-dashboard init-thresholds --output /tmp/codex-usage-thresholds.json
ai-usage-dashboard init-projects --output /tmp/codex-usage-projects.json
ai-usage-dashboard support-bundle --output /tmp/codex-usage-support.json
ai-usage-dashboard pricing-coverage
ai-usage-dashboard summary --group-by source_app
ai-usage-dashboard summary --preset by-subagent-role
ai-usage-dashboard expensive --limit 5
```

## Dashboard Screenshots

Dashboard screenshots in `docs/assets/` and `src/codex_usage_tracker/plugin_data/docs/assets/` must be generated from synthetic aggregate fixture data only.

Do not use real session logs, real prompts, assistant text, tool output, secrets, or private data in docs or screenshots.

## Large-History Benchmarking

Use the synthetic benchmark script when changing SQLite filters, dashboard payload loading, or indexes:

```bash
python scripts/benchmark_synthetic_history.py --rows 10000 100000 500000
```

The script creates synthetic aggregate-only SQLite databases and times common filtered dashboard query paths. It does not read real Codex, Claude Code, or other coding-agent logs.

## Release Checklist

Before making the repository public or publishing a package:

```bash
python -m pytest
python -m compileall src
python -m build
python scripts/check_release.py --dist
git diff --check
```

Then verify the local package install path:

```bash
python -m pip install ".[dev]"
ai-usage-dashboard --version
ai-usage-dashboard install-plugin --plugin-dir /tmp/ai-usage-dashboard-plugin-smoke --marketplace /tmp/codex-usage-marketplace-smoke.json --python .venv/bin/python --force
```

The release checker verifies version alignment, required public docs, packaged plugin assets, wheel contents, and obvious tracked secret patterns. It does not publish anything.
