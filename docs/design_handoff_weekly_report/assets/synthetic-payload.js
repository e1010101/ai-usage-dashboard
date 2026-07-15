/* Synthetic aggregate fixture for the recreated AI Usage Dashboard.
   All data is invented; timestamps are relative to "now" so the
   default "This week" filter always has rows. */
(function () {
  var NOW = Date.now();
  var HOUR = 3600000;
  var DAY = 24 * HOUR;

  function iso(msAgo) { return new Date(NOW - msAgo).toISOString(); }

  var seq = 0;
  function makeRow(o) {
    seq += 1;
    var cached = o.cached || 0;
    var creation = o.creation || 0;
    var uncached = o.uncached || 0;
    var output = o.output || 0;
    var reasoning = o.reasoning || 0;
    var input = uncached;
    var total = cached + creation + uncached + output;
    var cacheRatio = (cached + uncached) > 0 ? cached / (cached + uncached) : 0;
    var anthropic = o.provider === 'anthropic';
    var row = {
      record_id: 'rec-' + String(seq).padStart(4, '0'),
      session_id: o.session || ('sess-' + String(seq).padStart(4, '0')),
      turn_id: 'turn-' + seq,
      event_timestamp: iso(o.ago),
      model: o.model,
      effort: o.effort || null,
      total_tokens: total,
      input_tokens: input,
      uncached_input_tokens: uncached,
      cached_input_tokens: cached,
      cache_creation_input_tokens: creation,
      output_tokens: output,
      reasoning_output_tokens: reasoning,
      cumulative_total_tokens: o.cumulative || total,
      cache_ratio: cacheRatio,
      context_window_percent: o.context || 0,
      model_context_window: anthropic ? 200000 : 272000,
      estimated_cost_usd: o.cost != null ? o.cost : 0,
      estimated_cache_savings_usd: o.cacheSavings || 0,
      pricing_model: o.unpriced ? null : o.model,
      pricing_estimated: Boolean(o.estimated),
      usage_credits: anthropic || o.unpriced ? null : (o.credits != null ? o.credits : Math.round(total / 9000 * 10) / 10),
      usage_credit_confidence: anthropic ? 'not_applicable' : (o.unpriced ? null : (o.estimated ? 'estimated' : 'exact')),
      usage_credit_model: anthropic || o.unpriced ? null : o.model,
      usage_credit_source: anthropic || o.unpriced ? null : 'bundled OpenAI Codex rate card',
      usage_credit_fetched_at: iso(2 * DAY),
      usage_credit_tier: anthropic || o.unpriced ? null : 'plus',
      source_provider: o.provider || 'openai',
      source_app: anthropic ? 'claude-code' : 'codex',
      source_format: anthropic ? 'claude-jsonl' : 'codex-jsonl',
      thread_name: o.thread || null,
      thread_source: o.subagent ? 'subagent' : 'user',
      subagent_type: o.autoReview ? 'guardian' : (o.subagent ? 'thread_spawn' : null),
      agent_role: o.role || null,
      agent_nickname: null,
      parent_session_id: o.parentSession || null,
      parent_thread_name: o.parentThread || null,
      cwd: o.cwd || '/Users/dev/projects/' + (o.project || 'synthetic-dashboard'),
      project_name: o.project || 'synthetic-dashboard',
      project_relative_cwd: '.',
      project_tags: o.tags || [],
      git_branch: o.branch || 'main',
      git_remote_label: null,
      git_remote_hash: null,
      provider_request_id: null,
      efficiency_flags: o.flags || [],
      flag_explanations: o.why ? [o.why] : [],
      recommended_action: o.action || null,
      source_file: (anthropic ? '~/.claude/projects/' : '~/.codex/sessions/') + (o.session || ('sess-' + seq)) + '.jsonl',
      line_number: 40 + seq,
      archived: false
    };
    return row;
  }

  var rows = [];

  /* Thread 1: Investigate context growth — costly, context bloat, reasoning spike */
  var t1 = 'Investigate context growth';
  rows.push(makeRow({ ago: 2 * HOUR, thread: t1, session: 'sess-ctx', model: 'gpt-5.5', effort: 'xhigh',
    cached: 58000, uncached: 18000, output: 2000, reasoning: 3000, cumulative: 121200, context: 0.71,
    cost: 0.14, credits: 8.9, cacheSavings: 0.09, flags: ['high-context', 'reasoning-spike'],
    why: 'The session cumulative total is high enough to make later turns expensive.',
    action: 'Prefer a new thread for unrelated follow-up work.' }));
  rows.push(makeRow({ ago: 3 * HOUR, thread: t1, session: 'sess-ctx', model: 'gpt-5.5', effort: 'high',
    cached: 28200, uncached: 4600, output: 1200, reasoning: 900, cumulative: 84000, context: 0.55,
    cost: 0.06, credits: 3.9, cacheSavings: 0.04, flags: ['high-context'] }));
  rows.push(makeRow({ ago: 5 * HOUR, thread: t1, session: 'sess-ctx', model: 'gpt-5.5', effort: 'medium',
    cached: 3100, uncached: 5200, output: 900, reasoning: 300, cumulative: 41000, context: 0.27,
    cost: 0.03, credits: 1.9 }));
  /* subagent spawned by t1 */
  rows.push(makeRow({ ago: 2.5 * HOUR, thread: 'Chase cache regressions', session: 'sess-ctx-sub', model: 'gpt-5.5', effort: 'medium',
    subagent: true, role: 'explorer', parentSession: 'sess-ctx', parentThread: t1,
    cached: 2400, uncached: 6800, output: 1100, reasoning: 200, cumulative: 10500, context: 0.09,
    cost: 0.03, credits: 1.2, flags: ['low-cache'] }));

  /* Thread 2: Tighten dashboard filters — auto-review + low cache */
  var t2 = 'Tighten dashboard filters';
  rows.push(makeRow({ ago: 4 * HOUR, thread: t2, session: 'sess-filters', model: 'codex-auto-review', effort: 'low',
    autoReview: true, parentSession: 'sess-filters',
    cached: 1200, uncached: 4100, output: 900, cumulative: 6200, context: 0.05,
    cost: 0.02, estimated: true, credits: 0.6, flags: ['low-cache'],
    why: 'Cache reuse for this call is under the 30% review threshold.',
    action: 'Compare fresh input with the previous turn before continuing.' }));
  rows.push(makeRow({ ago: 6 * HOUR, thread: t2, session: 'sess-filters', model: 'gpt-5.5', effort: 'medium',
    cached: 10800, uncached: 2400, output: 1000, reasoning: 250, cumulative: 14200, context: 0.11,
    cost: 0.03, credits: 1.8 }));

  /* Thread 3: Refactor pricing module — yesterday, openai */
  var t3 = 'Refactor pricing module';
  rows.push(makeRow({ ago: DAY + 3 * HOUR, thread: t3, session: 'sess-pricing', model: 'gpt-5.5-codex', effort: 'high',
    cached: 41000, uncached: 9500, output: 2600, reasoning: 1400, cumulative: 54100, context: 0.34,
    cost: 0.08, credits: 5.1, cacheSavings: 0.05 }));
  rows.push(makeRow({ ago: DAY + 5 * HOUR, thread: t3, session: 'sess-pricing', model: 'gpt-5.5-codex', effort: 'medium',
    cached: 15200, uncached: 6200, output: 1800, reasoning: 500, cumulative: 23200, context: 0.16,
    cost: 0.04, credits: 2.4 }));
  rows.push(makeRow({ ago: DAY + 7 * HOUR, thread: t3, session: 'sess-pricing', model: 'gpt-5.5-codex', effort: 'medium',
    cached: 900, uncached: 7400, output: 1500, cumulative: 9800, context: 0.06,
    cost: 0.03, credits: 1.5, flags: ['low-cache'] }));

  /* Thread 4: Fix flaky parser tests — Claude Code */
  var t4 = 'Fix flaky parser tests';
  rows.push(makeRow({ ago: 26 * HOUR, thread: t4, session: 'sess-parser', provider: 'anthropic', model: 'claude-sonnet-4-5',
    cached: 88000, creation: 6200, uncached: 3800, output: 4100, cumulative: 102100, context: 0.48,
    cost: 0.11, project: 'ai-usage-dashboard', branch: 'fix/parser-flakes' }));
  rows.push(makeRow({ ago: 27 * HOUR, thread: t4, session: 'sess-parser', provider: 'anthropic', model: 'claude-sonnet-4-5',
    cached: 52000, creation: 12800, uncached: 5100, output: 3600, cumulative: 73500, context: 0.35,
    cost: 0.09, project: 'ai-usage-dashboard', branch: 'fix/parser-flakes' }));
  rows.push(makeRow({ ago: 29 * HOUR, thread: t4, session: 'sess-parser', provider: 'anthropic', model: 'claude-sonnet-4-5',
    cached: 9800, creation: 20400, uncached: 6900, output: 2900, cumulative: 40000, context: 0.2,
    cost: 0.08, project: 'ai-usage-dashboard', branch: 'fix/parser-flakes' }));

  /* Thread 5: Write dashboard guide — Claude Code, 3 days ago */
  var t5 = 'Write dashboard guide';
  rows.push(makeRow({ ago: 3 * DAY + 2 * HOUR, thread: t5, session: 'sess-guide', provider: 'anthropic', model: 'claude-opus-4-5',
    cached: 34000, creation: 4100, uncached: 2900, output: 5200, cumulative: 46200, context: 0.22,
    cost: 0.19, project: 'ai-usage-dashboard', tags: ['docs'] }));
  rows.push(makeRow({ ago: 3 * DAY + 4 * HOUR, thread: t5, session: 'sess-guide', provider: 'anthropic', model: 'claude-opus-4-5',
    cached: 6100, creation: 15800, uncached: 4400, output: 3800, cumulative: 30100, context: 0.14,
    cost: 0.16, project: 'ai-usage-dashboard', tags: ['docs'] }));

  /* Thread 6: Migrate CI to uv — 4-5 days ago, cheap */
  var t6 = 'Migrate CI to uv';
  rows.push(makeRow({ ago: 4 * DAY + 6 * HOUR, thread: t6, session: 'sess-ci', model: 'gpt-5.5-codex', effort: 'low',
    cached: 12400, uncached: 3100, output: 900, cumulative: 16400, context: 0.08,
    cost: 0.02, credits: 1.1, project: 'ai-usage-dashboard', branch: 'chore/uv-ci' }));
  rows.push(makeRow({ ago: 4 * DAY + 8 * HOUR, thread: t6, session: 'sess-ci', model: 'gpt-5.5-codex', effort: 'low',
    cached: 2100, uncached: 4800, output: 1100, cumulative: 8000, context: 0.04,
    cost: 0.02, credits: 0.9, project: 'ai-usage-dashboard', branch: 'chore/uv-ci' }));

  /* Thread 7: Prototype MCP tools — unpriced local model, 5 days ago */
  rows.push(makeRow({ ago: 5 * DAY + 3 * HOUR, thread: 'Prototype MCP tools', session: 'sess-mcp', model: 'deepseek-v3.2', provider: 'openai',
    unpriced: true, cached: 0, uncached: 8200, output: 2400, cumulative: 10600, context: 0.05,
    cost: 0, project: 'hermes-lab' }));

  /* Extra recent small calls to give the trend chart shape */
  rows.push(makeRow({ ago: 9 * HOUR, thread: t2, session: 'sess-filters', model: 'gpt-5.5', effort: 'medium',
    cached: 7600, uncached: 1900, output: 700, reasoning: 150, cumulative: 10200, context: 0.08,
    cost: 0.02, credits: 1.0 }));
  rows.push(makeRow({ ago: 2 * DAY + 4 * HOUR, thread: t3, session: 'sess-pricing', model: 'gpt-5.5-codex', effort: 'medium',
    cached: 5400, uncached: 2600, output: 800, cumulative: 8800, context: 0.05,
    cost: 0.02, credits: 0.9 }));
  rows.push(makeRow({ ago: 2 * DAY + 6 * HOUR, thread: t4, session: 'sess-parser', provider: 'anthropic', model: 'claude-sonnet-4-5',
    cached: 18700, creation: 2400, uncached: 2100, output: 1600, cumulative: 24800, context: 0.12,
    cost: 0.04, project: 'ai-usage-dashboard' }));

  /* Prior week rows so period-over-period deltas have data */
  rows.push(makeRow({ ago: 8 * DAY + 3 * HOUR, thread: 'Ship release 0.9', session: 'sess-rel', model: 'gpt-5.5', effort: 'high',
    cached: 30800, uncached: 8200, output: 2100, reasoning: 800, cumulative: 41900, context: 0.24,
    cost: 0.07, credits: 4.2, project: 'ai-usage-dashboard' }));
  rows.push(makeRow({ ago: 9 * DAY + 5 * HOUR, thread: 'Ship release 0.9', session: 'sess-rel', model: 'gpt-5.5', effort: 'medium',
    cached: 12100, uncached: 5400, output: 1500, cumulative: 19000, context: 0.11,
    cost: 0.04, credits: 2.0, project: 'ai-usage-dashboard' }));
  rows.push(makeRow({ ago: 10 * DAY + 2 * HOUR, thread: 'Debug limit snapshots', session: 'sess-limits', model: 'gpt-5.5-codex', effort: 'medium',
    cached: 8600, uncached: 4900, output: 1300, cumulative: 14800, context: 0.09,
    cost: 0.03, credits: 1.4, project: 'ai-usage-dashboard' }));
  rows.push(makeRow({ ago: 11 * DAY + 4 * HOUR, thread: 'Draft privacy doc', session: 'sess-priv', provider: 'anthropic', model: 'claude-sonnet-4-5',
    cached: 26400, creation: 5100, uncached: 3600, output: 2800, cumulative: 37900, context: 0.18,
    cost: 0.06, project: 'ai-usage-dashboard', tags: ['docs'] }));
  rows.push(makeRow({ ago: 12 * DAY + 6 * HOUR, thread: 'Draft privacy doc', session: 'sess-priv', provider: 'anthropic', model: 'claude-sonnet-4-5',
    cached: 4200, creation: 11900, uncached: 4100, output: 2200, cumulative: 22400, context: 0.11,
    cost: 0.05, project: 'ai-usage-dashboard', tags: ['docs'] }));

  /* Limit history: burn-down series across today */
  function historyEntry(hoursAgo, codex5h, codexWeekly, claude5h, claudeWeekly) {
    return [
      { provider: 'openai', captured_at: iso(hoursAgo * HOUR), windows: [
        { key: 'five_hour', remaining_percent: codex5h, reset_at: iso(-2.5 * HOUR) },
        { key: 'weekly', remaining_percent: codexWeekly, reset_at: iso(-3 * DAY) }
      ] },
      { provider: 'anthropic', captured_at: iso(hoursAgo * HOUR), windows: [
        { key: 'five_hour', remaining_percent: claude5h, reset_at: iso(-1.5 * HOUR) },
        { key: 'weekly', remaining_percent: claudeWeekly, reset_at: iso(-4 * DAY) }
      ] }
    ];
  }
  var history = [];
  [[8, 0.98, 0.62, 0.95, 0.55], [6, 0.93, 0.58, 0.9, 0.53], [4, 0.86, 0.52, 0.84, 0.5],
   [2, 0.79, 0.46, 0.8, 0.48], [0.5, 0.72, 0.41, 0.77, 0.46]].forEach(function (s) {
    history = history.concat(historyEntry(s[0], s[1], s[2], s[3], s[4]));
  });

  window.SYNTHETIC_PAYLOAD = {
    schema: 'codex-usage-tracker-dashboard-v1',
    generated_at: new Date(NOW).toISOString(),
    refreshed_at: new Date(NOW).toISOString(),
    rows: rows,
    limit: null,
    include_archived: true,
    total_available_rows: rows.length,
    active_available_rows: rows.length,
    all_history_available_rows: rows.length,
    archived_available_rows: 0,
    source_summaries: [
      { source_provider: 'openai', source_app: 'codex' },
      { source_provider: 'anthropic', source_app: 'claude-code' }
    ],
    pricing_configured: true,
    pricing_source: { name: 'openai-pricing.json', fetched_at: iso(2 * DAY) },
    pricing_snapshot_warning: '',
    allowance_configured: true,
    allowance_source: { name: 'codex-credit-rates.json', fetched_at: iso(2 * DAY) },
    allowance_window_source: { name: 'codex rate_limits snapshot', captured_at: iso(0.5 * HOUR) },
    allowance_windows: [
      { key: 'five_hour', label: '5h', remaining_percent: 0.72, reset_at: iso(-2.5 * HOUR) },
      { key: 'weekly', label: 'weekly', remaining_percent: 0.41, reset_at: iso(-3 * DAY) }
    ],
    allowance_error: '',
    provider_limit_snapshots: {
      openai: {
        configured: true,
        windows: [
          { key: 'five_hour', label: '5h', remaining_percent: 0.72, reset_at: iso(-2.5 * HOUR) },
          { key: 'weekly', label: 'weekly', remaining_percent: 0.41, reset_at: iso(-3 * DAY) }
        ],
        source: { name: 'codex rate_limits snapshot', captured_at: iso(0.5 * HOUR) }
      },
      anthropic: {
        configured: true,
        windows: [
          { key: 'five_hour', label: '5h', remaining_percent: 0.77, reset_at: iso(-1.5 * HOUR) },
          { key: 'weekly', label: 'weekly', remaining_percent: 0.46, reset_at: iso(-4 * DAY) }
        ],
        source: { name: 'claude status-line snapshot', captured_at: iso(0.75 * HOUR) }
      }
    },
    provider_limit_history: history,
    rate_card_error: '',
    privacy_mode: 'normal',
    project_metadata_privacy: { mode: 'normal' },
    parser_diagnostics: {},
    api_token: 'synthetic-token',
    context_api_enabled: false,
    action_thresholds: {}
  };
})();
