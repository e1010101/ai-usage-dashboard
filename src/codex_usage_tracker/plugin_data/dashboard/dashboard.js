(() => {
  const dashboardFormat = window.CodexUsageDashboardFormat;
  const dashboardData = window.CodexUsageDashboardData;
  const {
    number,
    money,
    credits,
    escapeHtml,
    formatTimestamp,
  } = dashboardFormat;
  const {
    payloadRows,
    payloadRollups,
    payloadThreadRollups,
    payloadLimit,
    usageCreditValue,
    isAutoReview,
    isSubagent,
    resolveThreadAttachment,
    chronological,
  } = dashboardData;

  const initialPayload = JSON.parse(document.getElementById('usage-data').textContent);
  const stateManager = window.CodexUsageDashboardState;
  const initialState = stateManager ? stateManager.read() : {};

  let data = payloadRows(initialPayload);
  let rollups = [];
  let threadRollups = [];
  let pricingSource = initialPayload.pricing_source || {};
  let pricingSnapshotWarning = initialPayload.pricing_snapshot_warning || '';
  let providerLimitSnapshots = initialPayload.provider_limit_snapshots || {};
  let parserDiagnostics = initialPayload.parser_diagnostics || {};
  let projectMetadataPrivacy = initialPayload.project_metadata_privacy || { mode: initialPayload.privacy_mode || 'normal' };
  let apiToken = initialPayload.api_token || '';
  let contextApiEnabled = Boolean(initialPayload.context_api_enabled);
  let includeArchived = Boolean(initialPayload.include_archived);
  let loadedLimit = payloadLimit(initialPayload);
  let totalAvailableRows = Number(initialPayload.total_available_rows || data.length);

  const rowByRecordId = new Map();
  let oldestLoadedMs = null;
  function rebuildDashboardIndexes() {
    rowByRecordId.clear();
    oldestLoadedMs = null;
    data.forEach(row => {
      if (row.record_id) rowByRecordId.set(String(row.record_id), row);
      const ts = Date.parse(row.event_timestamp);
      if (!Number.isNaN(ts) && (oldestLoadedMs === null || ts < oldestLoadedMs)) oldestLoadedMs = ts;
    });
  }
  function withBucketTime(groups) {
    return groups.map(group => {
      const tsMs = Date.parse(`${group.bucket_utc_hour}:00:00.000Z`);
      return Number.isNaN(tsMs) ? null : { ...group, tsMs };
    }).filter(Boolean);
  }
  function indexRollups(nextPayload) {
    rollups = withBucketTime(payloadRollups(nextPayload));
    threadRollups = withBucketTime(payloadThreadRollups(nextPayload));
  }
  indexRollups(initialPayload);

  /* ---- Elements ---- */
  const el = id => document.getElementById(id);
  const promptEchoEl = el('promptEcho');
  const liveChipEl = el('liveChip');
  const searchEl = el('search');
  const searchClearEl = el('searchClear');
  const rangePresetsEl = el('rangePresets');
  const customRangeEl = el('customRange');
  const customStartEl = el('customStart');
  const customEndEl = el('customEnd');
  const providerSwitchEl = el('providerSwitch');
  const filtersToggleEl = el('filtersToggle');
  const filtersPopoverEl = el('filtersPopover');
  const rangeNounEl = el('rangeNoun');
  const heroCostEl = el('heroCost');
  const heroCostDeltaEl = el('heroCostDelta');
  const heroTokensEl = el('heroTokens');
  const heroTokensDeltaEl = el('heroTokensDelta');
  const tokensMetricToggleEl = el('tokensMetricToggle');
  const heroCallsEl = el('heroCalls');
  const heroThreadsEl = el('heroThreads');
  const heroCreditsEl = el('heroCredits');
  const heroSentenceEl = el('heroSentence');
  const chartTitleEl = el('chartTitle');
  const chartBarsEl = el('chartBars');
  const coverageNoteEl = el('coverageNote');
  const limitsGroupsEl = el('limitsGroups');
  const overviewSectionEl = el('overviewSection');
  const callsSectionEl = el('callsSection');
  const ledgerDayChipEl = el('ledgerDayChip');
  const ledgerCaptionEl = el('ledgerCaption');
  const ledgerRowsEl = el('ledgerRows');
  const ledgerPagerEl = el('ledgerPager');
  const ledgerPagerStatusEl = el('ledgerPagerStatus');
  const ledgerPrevEl = el('ledgerPrev');
  const ledgerNextEl = el('ledgerNext');
  const overviewRailEl = el('overviewRail');
  const callsDayChipEl = el('callsDayChip');
  const callsCaptionEl = el('callsCaption');
  const callRowsEl = el('callRows');
  const callsPagerEl = el('callsPager');
  const callsPagerStatusEl = el('callsPagerStatus');
  const callsPrevEl = el('callsPrev');
  const callsNextEl = el('callsNext');
  const callRailEl = el('callRail');
  const privacyLineEl = el('privacyLine');
  const pricingLineEl = el('pricingLine');
  const diagnosticsLineEl = el('diagnosticsLine');

  /* ---- State ---- */
  const RANGES = new Set(['this-week', 'last-7-days', 'this-month', 'last-30-days', 'all', 'custom']);
  const state = {
    view: initialState.view === 'calls' ? 'calls' : 'overview',
    range: RANGES.has(initialState.range) ? initialState.range : 'this-week',
    customStart: initialState.customStart || '',
    customEnd: initialState.customEnd || '',
    provider: initialState.provider || '',
    search: initialState.search || '',
    tokensMetric: initialState.tokensMetric === 'uncached' ? 'uncached' : 'all',
    showFilters: false,
    fModel: initialState.fModel || '',
    fEffort: initialState.fEffort || '',
    fConfidence: initialState.fConfidence || '',
    fThreadType: initialState.fThreadType || '',
    dayKey: initialState.dayKey || '',
    sortKey: initialState.sortKey || 'time',
    sortDir: initialState.sortDir || '',
    page: initialState.page || 1,
    ledgerPage: initialState.ledgerPage || 1,
    selectedThread: initialState.selectedThread || '',
    selectedCall: initialState.selectedCall || '',
  };

  function currentDashboardState() {
    return {
      view: state.view,
      search: state.search,
      tokensMetric: state.tokensMetric,
      range: state.range,
      customStart: state.customStart,
      customEnd: state.customEnd,
      provider: state.provider,
      fModel: state.fModel,
      fEffort: state.fEffort,
      fConfidence: state.fConfidence,
      fThreadType: state.fThreadType,
      dayKey: state.dayKey,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      page: state.page,
      ledgerPage: state.ledgerPage,
      selectedThread: state.selectedThread,
      selectedCall: state.selectedCall,
    };
  }
  function syncUrlState() {
    if (stateManager) stateManager.replace(currentDashboardState());
  }

  /* ---- Formatting helpers ---- */
  const DAY_MS = 86400000;
  const WEEK_MS = 7 * DAY_MS;
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const shortDateFormat = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' });
  const fullDayFormat = new Intl.DateTimeFormat([], { weekday: 'short', month: 'short', day: 'numeric' });
  const timelineFormat = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const clockFormat = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
  const narrativeFormat = new Intl.DateTimeFormat([], { dateStyle: 'medium', timeStyle: 'short' });

  function compactTokens(value) {
    const v = Number(value) || 0;
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    return String(Math.round(v));
  }
  function pctRound(value) {
    return `${Math.round((Number(value) || 0) * 100)}%`;
  }
  function sum(rows, field) {
    return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  }
  function eventTimeMs(item) {
    return item.tsMs !== undefined ? item.tsMs : Date.parse(item.event_timestamp);
  }
  function tokensOf(item) {
    if (state.tokensMetric !== 'uncached') return Number(item.total_tokens) || 0;
    const uncached = item.uncached_input_tokens !== undefined && item.uncached_input_tokens !== null
      ? Number(item.uncached_input_tokens) || 0
      : Math.max((Number(item.input_tokens) || 0) - (Number(item.cached_input_tokens) || 0), 0);
    return uncached + (Number(item.output_tokens) || 0);
  }
  function sumTokens(items) {
    return items.reduce((total, item) => total + tokensOf(item), 0);
  }
  function cacheLevel(ratio) {
    return (Number(ratio) || 0) < 0.3 ? 'warn' : 'ok';
  }
  function contextLevel(percent) {
    const p = Number(percent) || 0;
    return p >= 0.6 ? 'low' : p >= 0.35 ? 'warn' : 'ok';
  }
  function deltaInfo(current, previous) {
    if (!previous) return { text: 'no prior-period data', trend: 'none' };
    const change = (current - previous) / previous;
    if (Math.abs(change) < 0.005) return { text: 'flat vs last period', trend: 'none' };
    const magnitude = Math.abs(change * 100).toFixed(0);
    return change > 0
      ? { text: `+${magnitude}% vs last period`, trend: 'up' }
      : { text: `-${magnitude}% vs last period`, trend: 'down' };
  }

  /* ---- Date window ---- */
  function localDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function parseDateInput(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  function localDateKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function currentWindow() {
    const today = localDay(new Date());
    const todayMs = today.getTime();
    let startMs = null;
    let endMs = null;
    let invalid = false;
    if (state.range === 'this-week') {
      const dow = (today.getDay() + 6) % 7;
      startMs = todayMs - dow * DAY_MS;
    } else if (state.range === 'last-7-days') {
      startMs = todayMs - 6 * DAY_MS;
    } else if (state.range === 'this-month') {
      startMs = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    } else if (state.range === 'last-30-days') {
      startMs = todayMs - 29 * DAY_MS;
    } else if (state.range === 'custom') {
      const start = parseDateInput(state.customStart);
      const end = parseDateInput(state.customEnd);
      if (start) startMs = start.getTime();
      if (end) endMs = end.getTime() + DAY_MS;
      if (startMs !== null && endMs !== null && startMs >= endMs) invalid = true;
    }
    return { startMs, endMs, invalid, todayMs };
  }
  function rangeNounText() {
    return {
      'this-week': 'this week',
      'last-7-days': 'the last 7 days',
      'this-month': 'this month',
      'last-30-days': 'the last 30 days',
      all: 'all this usage',
      custom: 'this range',
    }[state.range] || 'this range';
  }

  /* ---- Row classification ---- */
  function confidenceOf(row) {
    if (!row.pricing_model) return 'unpriced';
    return row.pricing_estimated ? 'estimated' : 'exact';
  }
  function threadTypeOf(row) {
    if (isAutoReview(row)) return 'auto-review';
    return isSubagent(row) ? 'spawned' : 'parent';
  }
  function callKindOf(row) {
    if (isAutoReview(row)) return 'auto-review';
    return isSubagent(row) ? 'subagent' : 'user';
  }
  function rowThreadLabel(row) {
    return resolveThreadAttachment(row).label;
  }
  function rowThreadKey(row) {
    return resolveThreadAttachment(row).key;
  }

  /* ---- Filter chain: window -> provider -> search -> advanced -> day ---- */
  function searchMatches(row, term) {
    if (!term) return true;
    return [
      row.thread_name,
      row.parent_thread_name,
      row.resolved_parent_thread_name,
      row.thread_attachment_label,
      row.model,
      row.project_name,
      row.git_branch,
      row.cwd,
      row.source_app,
    ].some(value => value && String(value).toLowerCase().includes(term));
  }
  function advancedMatches(row, term) {
    return searchMatches(row, term)
      && (!state.fModel || row.model === state.fModel)
      && (!state.fEffort || (row.effort || 'none') === state.fEffort)
      && (!state.fConfidence || confidenceOf(row) === state.fConfidence)
      && (!state.fThreadType || threadTypeOf(row) === state.fThreadType);
  }

  function buildThreads(rows, totalCost) {
    const groups = new Map();
    rows.forEach(row => {
      const attachment = resolveThreadAttachment(row);
      let group = groups.get(attachment.key);
      if (!group) {
        group = { key: attachment.key, label: attachment.label, calls: [] };
        groups.set(attachment.key, group);
      }
      group.calls.push(row);
    });
    const threads = [...groups.values()].map(group => {
      const calls = group.calls;
      const cost = sum(calls, 'estimated_cost_usd');
      const tokens = sum(calls, 'total_tokens');
      const cached = sum(calls, 'cached_input_tokens');
      const uncached = sum(calls, 'uncached_input_tokens');
      const cacheRatio = cached + uncached > 0 ? cached / (cached + uncached) : 0;
      const maxContext = calls.reduce((max, call) => Math.max(max, Number(call.context_window_percent) || 0), 0);
      const provider = calls.every(call => call.source_provider === 'anthropic') ? 'anthropic' : 'openai';
      const creditTotal = calls.reduce((total, call) => {
        const value = usageCreditValue(call);
        return value === null ? total : total + value;
      }, 0);
      return {
        key: group.key,
        label: group.label,
        calls,
        callCount: calls.length,
        cost,
        tokens,
        cacheRatio,
        maxContext,
        provider,
        creditTotal,
        share: totalCost ? cost / totalCost : 0,
        hasEstimated: calls.some(call => call.pricing_estimated),
      };
    });
    threads.sort((a, b) => b.cost - a.cost);
    return threads;
  }

  function buildThreadsFromRollups(groups, rowThreadsByKey, totalCost) {
    const byKey = new Map();
    groups.forEach(group => {
      let thread = byKey.get(group.thread_key);
      if (!thread) {
        thread = {
          key: group.thread_key,
          label: group.thread_label,
          callCount: 0,
          cost: 0,
          tokens: 0,
          cached: 0,
          uncached: 0,
          maxContext: 0,
          creditTotal: 0,
          allAnthropic: true,
          hasEstimated: false,
        };
        byKey.set(group.thread_key, thread);
      }
      thread.callCount += Number(group.event_count) || 0;
      thread.cost += Number(group.estimated_cost_usd) || 0;
      thread.tokens += Number(group.total_tokens) || 0;
      const cached = Number(group.cached_input_tokens) || 0;
      thread.cached += cached;
      thread.uncached += Math.max((Number(group.input_tokens) || 0) - cached, 0);
      thread.maxContext = Math.max(thread.maxContext, Number(group.max_context_ratio) || 0);
      const creditValue = usageCreditValue(group);
      if (creditValue !== null) thread.creditTotal += creditValue;
      thread.allAnthropic = thread.allAnthropic && group.source_provider === 'anthropic';
      thread.hasEstimated = thread.hasEstimated || Boolean(group.pricing_estimated);
    });
    const threads = [...byKey.values()].map(thread => {
      const rowThread = rowThreadsByKey.get(thread.key);
      return {
        key: thread.key,
        label: thread.label,
        calls: rowThread ? rowThread.calls : [],
        callCount: thread.callCount,
        cost: thread.cost,
        tokens: thread.tokens,
        cacheRatio: thread.cached + thread.uncached > 0 ? thread.cached / (thread.cached + thread.uncached) : 0,
        maxContext: thread.maxContext,
        provider: thread.allAnthropic ? 'anthropic' : 'openai',
        creditTotal: thread.creditTotal,
        share: totalCost ? thread.cost / totalCost : 0,
        hasEstimated: thread.hasEstimated,
      };
    });
    threads.sort((a, b) => b.cost - a.cost);
    return threads;
  }

  function buildChart(chartRows, win) {
    const todayMs = win.todayMs;
    const oldest = chartRows.length
      ? localDay(new Date(Math.min(...chartRows.map(row => eventTimeMs(row) || todayMs)))).getTime()
      : todayMs;
    const chartStart = win.startMs !== null ? win.startMs : oldest;
    const chartEnd = win.endMs !== null ? Math.min(win.endMs, todayMs + DAY_MS) : todayMs + DAY_MS;
    const spanDays = Math.max(1, Math.ceil((chartEnd - chartStart) / DAY_MS));
    const daily = spanDays <= 10;
    const buckets = [];
    if (daily) {
      for (let start = chartStart; start < chartEnd; start += DAY_MS) {
        buckets.push({
          start,
          end: start + DAY_MS,
          key: localDateKey(start),
          label: start === todayMs ? 'today' : DAY_NAMES[new Date(start).getDay()],
          bucketLabel: fullDayFormat.format(new Date(start)),
          today: start === todayMs,
        });
      }
    } else {
      const step = Math.max(WEEK_MS, Math.ceil(spanDays / 77) * WEEK_MS);
      for (let start = chartStart; start < chartEnd; start += step) {
        buckets.push({
          start,
          end: Math.min(start + step, chartEnd),
          key: localDateKey(start),
          label: shortDateFormat.format(new Date(start)),
          bucketLabel: `week of ${shortDateFormat.format(new Date(start))}`,
          today: start <= todayMs && todayMs < start + step,
        });
      }
    }
    buckets.forEach(bucket => {
      let openai = 0;
      let anthropic = 0;
      chartRows.forEach(row => {
        const ts = eventTimeMs(row);
        if (!(ts >= bucket.start && ts < bucket.end)) return;
        const cost = Number(row.estimated_cost_usd) || 0;
        if (row.source_provider === 'anthropic') anthropic += cost;
        else openai += cost;
      });
      bucket.openai = openai;
      bucket.anthropic = anthropic;
    });
    const maxValue = Math.max(0.0001, ...buckets.map(bucket => bucket.openai + bucket.anthropic));
    return { buckets, daily, maxValue };
  }

  function computeScope() {
    const win = currentWindow();
    const term = state.search.trim().toLowerCase();
    const inWindow = item => {
      if (win.invalid) return false;
      const ts = eventTimeMs(item);
      if (Number.isNaN(ts)) return false;
      if (win.startMs !== null && ts < win.startMs) return false;
      if (win.endMs !== null && ts >= win.endMs) return false;
      return true;
    };
    let priorStart = null;
    if (win.startMs !== null && !win.invalid) {
      const endEffective = win.endMs !== null ? win.endMs : Date.now();
      priorStart = win.startMs - (endEffective - win.startMs);
    }
    const baseRows = data.filter(row => (!state.provider || row.source_provider === state.provider) && inWindow(row));
    const scopedRows = baseRows.filter(row => advancedMatches(row, term));

    // Free-text search only exists on raw rows; every other filter maps onto
    // rollup dimensions, so totals stay exact even when the loaded row slice
    // is truncated.
    const rollupsUsable = rollups.length > 0 && !term && !win.invalid;
    const groupMatches = group => (!state.provider || group.source_provider === state.provider)
      && (!state.fModel || group.model === state.fModel)
      && (!state.fEffort || (group.effort || 'none') === state.fEffort)
      && (!state.fConfidence || confidenceOf(group) === state.fConfidence)
      && (!state.fThreadType || (group.thread_type || 'parent') === state.fThreadType);
    const scopedGroups = rollupsUsable ? rollups.filter(groupMatches) : [];
    const windowGroups = scopedGroups.filter(inWindow);

    // Chart ignores the day filter itself so all bars stay comparable.
    const chart = buildChart(rollupsUsable ? windowGroups : scopedRows, win);
    let dayBucket = null;
    if (state.dayKey) {
      dayBucket = chart.buckets.find(bucket => bucket.key === state.dayKey) || null;
      if (!dayBucket) state.dayKey = '';
    }
    const inDayBucket = item => {
      const ts = eventTimeMs(item);
      return ts >= dayBucket.start && ts < dayBucket.end;
    };
    const rows = dayBucket ? scopedRows.filter(inDayBucket) : scopedRows;
    let priorRows = [];
    if (priorStart !== null) {
      priorRows = data.filter(row => {
        if (state.provider && row.source_provider !== state.provider) return false;
        const ts = Date.parse(row.event_timestamp);
        return ts >= priorStart && ts < win.startMs;
      }).filter(row => advancedMatches(row, term));
    }
    let aggregates = null;
    if (rollupsUsable) {
      const heroGroups = dayBucket ? windowGroups.filter(inDayBucket) : windowGroups;
      const priorGroups = priorStart !== null
        ? scopedGroups.filter(group => group.tsMs >= priorStart && group.tsMs < win.startMs)
        : [];
      aggregates = {
        cost: sum(heroGroups, 'estimated_cost_usd'),
        tokens: sumTokens(heroGroups),
        calls: sum(heroGroups, 'event_count'),
        credits: heroGroups.reduce((total, group) => {
          const value = usageCreditValue(group);
          return value === null ? total : total + value;
        }, 0),
        priorCost: sum(priorGroups, 'estimated_cost_usd'),
        priorTokens: sumTokens(priorGroups),
      };
    }
    const cost = sum(rows, 'estimated_cost_usd');
    const rowThreads = buildThreads(rows, cost);
    let threads = rowThreads;
    if (aggregates && threadRollups.length) {
      let threadGroups = threadRollups.filter(groupMatches).filter(inWindow);
      if (dayBucket) threadGroups = threadGroups.filter(inDayBucket);
      const rowThreadsByKey = new Map(rowThreads.map(thread => [thread.key, thread]));
      threads = buildThreadsFromRollups(threadGroups, rowThreadsByKey, aggregates.cost);
    }
    return { win, term, baseRows, rows, priorRows, chart, dayBucket, threads, cost, aggregates };
  }

  /* ---- Prompt line ---- */
  function updatePromptLine(scope) {
    let echo = `usage --range ${state.range}`;
    if (state.range === 'custom') echo += ` ${state.customStart || '…'}..${state.customEnd || 'now'}`;
    if (state.provider) echo += ` --provider ${state.provider === 'openai' ? 'codex' : 'claude'}`;
    if (state.view === 'calls') echo += ' --calls';
    if (state.fModel) echo += ` --model ${state.fModel}`;
    if (state.fEffort) echo += ` --effort ${state.fEffort}`;
    if (state.fConfidence) echo += ` --confidence ${state.fConfidence}`;
    if (state.fThreadType) echo += ` --threads ${state.fThreadType}`;
    if (scope.dayBucket) echo += `${scope.chart.daily ? ' --day ' : ' --week-of '}${scope.dayBucket.key}`;
    if (scope.term) echo += ` --grep "${scope.term}"`;
    promptEchoEl.textContent = echo;
  }

  /* ---- Header controls ---- */
  function renderControls() {
    if (document.activeElement !== searchEl && searchEl.value !== state.search) {
      searchEl.value = state.search;
    }
    searchClearEl.hidden = !state.search.trim();
    rangePresetsEl.querySelectorAll('.seg-btn').forEach(button => {
      button.dataset.active = button.dataset.range === state.range ? 'true' : 'false';
    });
    customRangeEl.hidden = state.range !== 'custom';
    if (document.activeElement !== customStartEl && customStartEl.value !== state.customStart) {
      customStartEl.value = state.customStart;
    }
    if (document.activeElement !== customEndEl && customEndEl.value !== state.customEnd) {
      customEndEl.value = state.customEnd;
    }
    providerSwitchEl.querySelectorAll('.provider-btn').forEach(button => {
      button.dataset.active = (button.dataset.provider || '') === state.provider ? 'true' : 'false';
    });
    const activeFilterCount = [state.fModel, state.fEffort, state.fConfidence, state.fThreadType].filter(Boolean).length;
    filtersToggleEl.textContent = state.showFilters
      ? '[ − filters ]'
      : activeFilterCount
        ? `[ + filters · ${activeFilterCount} ]`
        : '[ + filters ]';
    filtersToggleEl.dataset.open = state.showFilters ? 'true' : 'false';
    filtersToggleEl.dataset.count = !state.showFilters && activeFilterCount ? 'true' : 'false';
    filtersToggleEl.setAttribute('aria-expanded', state.showFilters ? 'true' : 'false');
  }

  function renderFiltersPopover(scope) {
    filtersPopoverEl.hidden = !state.showFilters;
    if (!state.showFilters) return;
    const uniqueSorted = values => [...new Set(values.filter(Boolean))].sort();
    const groups = [
      { title: 'model', key: 'fModel', current: state.fModel, values: uniqueSorted(scope.baseRows.map(row => row.model)) },
      { title: 'reasoning', key: 'fEffort', current: state.fEffort, values: uniqueSorted(scope.baseRows.map(row => row.effort || 'none')) },
      { title: 'confidence', key: 'fConfidence', current: state.fConfidence, values: ['exact', 'estimated', 'unpriced'] },
      { title: 'thread type', key: 'fThreadType', current: state.fThreadType, values: ['parent', 'spawned', 'auto-review'] },
    ];
    const activeFilterCount = [state.fModel, state.fEffort, state.fConfidence, state.fThreadType].filter(Boolean).length;
    const summary = [
      state.fModel,
      state.fEffort ? `reasoning ${state.fEffort}` : '',
      state.fConfidence,
      state.fThreadType,
    ].filter(Boolean).join(' · ');
    const rows = groups.map(group => {
      const chips = [{ label: 'all', value: '' }]
        .concat(group.values.map(value => ({ label: value, value })))
        .map(chip => `
          <button type="button" class="filter-chip" data-filter-key="${group.key}" data-filter-value="${escapeHtml(chip.value)}" data-active="${group.current === chip.value ? 'true' : 'false'}">${escapeHtml(chip.label)}</button>
        `).join('');
      return `
        <div class="chip-row">
          <span class="chip-row-title">${escapeHtml(group.title)}</span>
          <span class="chip-row-chips">${chips}</span>
        </div>
      `;
    }).join('');
    const clearRow = activeFilterCount
      ? `
        <div class="chip-row">
          <span class="chip-row-title"></span>
          <button type="button" class="clear-filters" data-action="clear-filters">&gt; clear filters (${escapeHtml(summary)})</button>
        </div>
      `
      : '';
    filtersPopoverEl.innerHTML = rows + clearRow;
  }

  /* ---- Answer strip ---- */
  function heroSentenceText(scope) {
    const top = scope.threads[0];
    if (!top) {
      if (scope.aggregates && scope.aggregates.calls > 0) {
        return 'Totals cover the full range, but no thread breakdown is available for it.';
      }
      return 'No usage recorded in this range.';
    }
    const totalCost = scope.aggregates ? scope.aggregates.cost : scope.cost;
    const share = pctRound(totalCost ? top.cost / totalCost : 0);
    const diagnostic = top.maxContext >= 0.6
      ? 'That thread is also carrying heavy context; a fresh thread would cut per-turn cost.'
      : top.cacheRatio >= 0.5
        ? `Cache reuse there is ${pctRound(top.cacheRatio)}, so most input is being served from cache.`
        : `Cache reuse there is only ${pctRound(top.cacheRatio)}, so most input is fresh, uncached tokens.`;
    return `Most of it went to "${top.label}" — ${money(top.cost)} (${share} of spend) across ${number.format(top.callCount)} calls. ${diagnostic}`;
  }
  function renderAnswerStrip(scope) {
    rangeNounEl.textContent = rangeNounText();
    const agg = scope.aggregates;
    const cost = agg ? agg.cost : scope.cost;
    const tokens = agg ? agg.tokens : sumTokens(scope.rows);
    const calls = agg ? agg.calls : scope.rows.length;
    const priorCost = agg ? agg.priorCost : sum(scope.priorRows, 'estimated_cost_usd');
    const priorTokens = agg ? agg.priorTokens : sumTokens(scope.priorRows);
    const creditTotal = agg ? agg.credits : scope.rows.reduce((total, row) => {
      const value = usageCreditValue(row);
      return value === null ? total : total + value;
    }, 0);
    heroCostEl.textContent = money(cost);
    heroTokensEl.textContent = number.format(tokens);
    heroCallsEl.textContent = number.format(calls);
    heroThreadsEl.textContent = number.format(scope.threads.length);
    if (tokensMetricToggleEl) {
      tokensMetricToggleEl.textContent = state.tokensMetric === 'uncached' ? 'tokens · uncached' : 'tokens · all';
      tokensMetricToggleEl.title = state.tokensMetric === 'uncached'
        ? 'Showing uncached input + output tokens only (closest to provider in-app counters). Click to include cache reads.'
        : 'Showing every token processed, including cache reads. Click to show uncached input + output only.';
    }
    heroCreditsEl.textContent = creditTotal ? `${credits(creditTotal)} Codex credits used` : '';
    const costDelta = deltaInfo(cost, priorCost);
    heroCostDeltaEl.textContent = costDelta.text;
    heroCostDeltaEl.dataset.trend = costDelta.trend;
    const tokensDelta = deltaInfo(tokens, priorTokens);
    heroTokensDeltaEl.textContent = tokensDelta.text;
    heroTokensDeltaEl.dataset.trend = tokensDelta.trend;
    heroSentenceEl.textContent = heroSentenceText(scope);
  }

  function renderChart(scope) {
    const { buckets, daily, maxValue } = scope.chart;
    chartTitleEl.textContent = daily ? ':: spend by day' : ':: spend by week';
    const MAX_BAR = 66;
    chartBarsEl.innerHTML = buckets.map(bucket => {
      const selected = Boolean(scope.dayBucket && scope.dayBucket.key === bucket.key);
      const opacity = !state.dayKey || selected ? 0.9 : 0.28;
      const anthHeight = Math.round((bucket.anthropic / maxValue) * MAX_BAR);
      const openaiHeight = Math.round((bucket.openai / maxValue) * MAX_BAR);
      const title = `${bucket.bucketLabel} · Codex ${money(bucket.openai)} · Claude ${money(bucket.anthropic)}${selected ? ' · click to clear' : ' · click to filter'}`;
      return `
        <button type="button" class="chart-col" data-day-key="${escapeHtml(bucket.key)}" data-selected="${selected ? 'true' : 'false'}" data-today="${bucket.today ? 'true' : 'false'}" title="${escapeHtml(title)}">
          <span class="chart-seg-anthropic" data-css="height: ${anthHeight}px; opacity: ${opacity}"></span>
          <span class="chart-seg-openai" data-css="height: ${openaiHeight}px; opacity: ${opacity}"></span>
          <span class="chart-label">${escapeHtml(bucket.label)}</span>
        </button>
      `;
    }).join('');
  }

  function renderCoverageNote(scope) {
    const truncated = data.length && totalAvailableRows > data.length && oldestLoadedMs !== null;
    const wantsOlder = truncated
      && (scope.win.startMs === null || scope.win.startMs < oldestLoadedMs);
    if (!wantsOlder) {
      coverageNoteEl.hidden = true;
      coverageNoteEl.textContent = '';
      return;
    }
    coverageNoteEl.hidden = false;
    coverageNoteEl.textContent = scope.aggregates
      ? `i totals, chart & threads cover the full range; per-call timelines show the newest ${number.format(data.length)} of ${number.format(totalAvailableRows)} calls (before ${fullDayFormat.format(new Date(oldestLoadedMs))})`
      : `! range incomplete — loaded newest ${number.format(data.length)} of ${number.format(totalAvailableRows)} rows; usage before ${fullDayFormat.format(new Date(oldestLoadedMs))} is not shown`;
  }

  function limitLevel(percent) {
    return percent < 0.25 ? 'low' : percent < 0.5 ? 'warn' : 'ok';
  }
  function renderLimits() {
    const groups = [];
    [['openai', 'codex'], ['anthropic', 'claude code']].forEach(([provider, label]) => {
      const snapshot = providerLimitSnapshots[provider];
      const windows = snapshot && Array.isArray(snapshot.windows) ? snapshot.windows : [];
      if (!windows.length) return;
      const focused = state.provider === provider;
      const dimmed = state.provider && state.provider !== provider;
      const windowRows = windows.map(window => {
        let percent = window.remaining_percent === null || window.remaining_percent === undefined
          ? null
          : Number(window.remaining_percent);
        if (percent === null && Number(window.total_credits) > 0 && window.remaining_credits !== null && window.remaining_credits !== undefined) {
          percent = Number(window.remaining_credits) / Number(window.total_credits);
        }
        const windowLabel = window.key === 'five_hour' ? '5h' : window.key === 'weekly' ? 'weekly' : (window.label || window.key || 'window');
        if (percent === null || !Number.isFinite(percent)) {
          return `
            <div class="limit-window">
              <div class="limit-window-row">
                <span class="limit-window-label">${escapeHtml(windowLabel)}</span>
                <span class="limit-window-value">n/a</span>
              </div>
              <div class="limit-meter"><span class="limit-fill" data-css="width: 0%"></span></div>
            </div>
          `;
        }
        const level = limitLevel(percent);
        return `
          <div class="limit-window">
            <div class="limit-window-row">
              <span class="limit-window-label">${escapeHtml(windowLabel)}</span>
              <span class="limit-window-value" data-level="${level}">${pctRound(percent)} left</span>
            </div>
            <div class="limit-meter"><span class="limit-fill" data-level="${level}" data-css="width: ${Math.max(0, Math.min(100, Math.round(percent * 100)))}%"></span></div>
          </div>
        `;
      }).join('');
      const title = focused ? 'click to show all providers' : `click to focus ${label} usage`;
      groups.push(`
        <button type="button" class="limit-group" data-provider="${provider}" data-active="${focused ? 'true' : 'false'}" data-dim="${dimmed ? 'true' : 'false'}" title="${escapeHtml(title)}">
          <span class="limit-head">[ ${escapeHtml(label)} ]</span>
          ${windowRows}
        </button>
      `);
    });
    limitsGroupsEl.innerHTML = groups.length
      ? groups.join('')
      : '<div class="limits-empty">&gt; no limit snapshots yet</div>';
  }

  /* ---- Overview: ledger ---- */
  const LEDGER_PAGE_SIZE = 6;
  function threadSignal(thread) {
    if (thread.maxContext >= 0.6) return { label: `context ${pctRound(thread.maxContext)}`, kind: 'context' };
    if (thread.cacheRatio < 0.3) return { label: 'low cache', kind: 'cache' };
    if (thread.hasEstimated) return { label: 'est. price', kind: 'price' };
    return null;
  }
  function threadCreditsText(thread) {
    if (thread.provider === 'anthropic') return 'n/a credits';
    return `${credits(thread.creditTotal)} cr`;
  }
  function renderLedger(scope) {
    const threads = scope.threads;
    const pageCount = Math.max(1, Math.ceil(threads.length / LEDGER_PAGE_SIZE));
    const page = Math.min(state.ledgerPage, pageCount);
    state.ledgerPage = page;
    const startIndex = (page - 1) * LEDGER_PAGE_SIZE;
    const visible = threads.slice(startIndex, startIndex + LEDGER_PAGE_SIZE);
    ledgerCaptionEl.textContent = `${number.format(threads.length)} threads, ranked by spend · click to drill in`;
    renderDayChip(ledgerDayChipEl, scope);
    if (!threads.length) {
      ledgerRowsEl.innerHTML = '<div class="list-empty">&gt; no usage in range — widen the time filter</div>';
    } else {
      ledgerRowsEl.innerHTML = visible.map((thread, index) => {
        const signal = threadSignal(thread);
        const signalChip = signal
          ? `<span class="signal-chip" data-kind="${signal.kind}">${escapeHtml(signal.label)}</span>`
          : '';
        return `
          <div class="ledger-row" data-thread-key="${escapeHtml(thread.key)}" data-selected="${state.selectedThread === thread.key ? 'true' : 'false'}" role="button" tabindex="0">
            <div class="ledger-rank">#${startIndex + index + 1}</div>
            <div class="ledger-main">
              <div class="ledger-name-row">
                <span class="ledger-name" title="${escapeHtml(thread.label)}">${escapeHtml(thread.label)}</span>
                <span class="prov-chip" data-provider="${thread.provider}">${thread.provider === 'anthropic' ? 'claude code' : 'codex'}</span>
                ${signalChip}
              </div>
              <div class="share-row">
                <span class="share-bar"><span class="share-fill" data-provider="${thread.provider}" data-css="width: ${pctRound(thread.share)}"></span></span>
                <span class="share-pct">${pctRound(thread.share)} of spend</span>
              </div>
            </div>
            <div class="ledger-col">
              <div class="col-strong">${escapeHtml(money(thread.cost))}</div>
              <div class="col-sub">${escapeHtml(threadCreditsText(thread))}</div>
            </div>
            <div class="ledger-col">
              <div>${escapeHtml(compactTokens(thread.tokens))}</div>
              <div class="col-sub">${number.format(thread.callCount)} calls</div>
            </div>
            <div class="ledger-col">
              <div class="cache-value" data-level="${cacheLevel(thread.cacheRatio)}">${pctRound(thread.cacheRatio)}</div>
              <div class="col-sub">cache reuse</div>
            </div>
          </div>
        `;
      }).join('');
    }
    ledgerPagerEl.hidden = pageCount <= 1;
    if (pageCount > 1) {
      const endIndex = Math.min(startIndex + LEDGER_PAGE_SIZE, threads.length);
      ledgerPagerStatusEl.textContent = `${startIndex + 1}–${endIndex} of ${threads.length} threads · [ page ${page}/${pageCount} ]`;
      ledgerPrevEl.disabled = page <= 1;
      ledgerNextEl.disabled = page >= pageCount;
    }
  }
  function renderDayChip(chipEl, scope) {
    if (scope.dayBucket) {
      chipEl.hidden = false;
      chipEl.textContent = `${scope.dayBucket.bucketLabel} ✕`;
      chipEl.title = 'Clear the day filter';
    } else {
      chipEl.hidden = true;
    }
  }

  /* ---- Overview rail: needs attention / thread drill-in ---- */
  function buildAttention(scope) {
    const attention = [];
    const contextThread = scope.threads.find(thread => thread.maxContext >= 0.6);
    if (contextThread) {
      attention.push({
        title: 'Context bloat',
        value: pctRound(contextThread.maxContext),
        color: 'error',
        body: `"${contextThread.label}" is at ${pctRound(contextThread.maxContext)} of the context window. Later turns get more expensive from here.`,
        action: 'open thread timeline',
        threadKey: contextThread.key,
      });
    }
    const lowCacheThread = scope.threads.find(thread => thread.cacheRatio < 0.3 && thread.tokens > 4000);
    if (lowCacheThread) {
      attention.push({
        title: 'Low cache reuse',
        value: pctRound(lowCacheThread.cacheRatio),
        color: 'warn',
        body: `"${lowCacheThread.label}" is paying for mostly fresh input. Compare its turns before continuing.`,
        action: 'inspect thread',
        threadKey: lowCacheThread.key,
      });
    }
    const unpriced = scope.rows.filter(row => !row.pricing_model);
    if (unpriced.length) {
      attention.push({
        title: 'Unpriced usage',
        value: compactTokens(sum(unpriced, 'total_tokens')),
        color: 'info',
        body: `${unpriced.length} call(s) have no configured price, so the spend total above is incomplete.`,
        action: 'review pricing gaps',
        threadKey: rowThreadKey(unpriced[0]),
      });
    }
    const estimated = scope.rows.filter(row => row.pricing_estimated);
    if (estimated.length && attention.length < 3) {
      attention.push({
        title: 'Estimated pricing',
        value: compactTokens(sum(estimated, 'total_tokens')),
        color: 'info',
        body: 'Some spend uses best-guess prices marked with *. Review before trusting exact totals.',
        action: 'review estimates',
        threadKey: rowThreadKey(estimated[0]),
      });
    }
    return attention.slice(0, 3);
  }
  function renderAttentionRail(scope) {
    const attention = buildAttention(scope);
    const cards = attention.length
      ? attention.map(card => `
        <div class="attention-card" data-color="${card.color}">
          <div class="attention-head">
            <span class="attention-title">${escapeHtml(card.title)}</span>
            <span class="attention-value">${escapeHtml(card.value)}</span>
          </div>
          <div class="attention-body">${escapeHtml(card.body)}</div>
          <button type="button" class="link-btn" data-action="select-thread" data-thread-key="${escapeHtml(card.threadKey)}">&gt; ${escapeHtml(card.action)}</button>
        </div>
      `).join('')
      : '<div class="rail-empty">&gt; nothing needs attention in this range</div>';
    overviewRailEl.innerHTML = `
      <div class="rail-panel">
        <div class="rail-head">
          <h2 class="panel-title"><span class="panel-title-dim">:: </span>needs attention</h2>
        </div>
        <div class="rail-body rail-body-tight">${cards}</div>
      </div>
    `;
  }
  function flaggedAction(row) {
    const recs = row && row.action_recommendations;
    return Array.isArray(recs) && recs.length && recs[0] && recs[0].action ? recs[0].action : '';
  }
  function threadNextAction(thread, chrono) {
    const flagged = flaggedAction(chrono[chrono.length - 1]);
    if (flagged) return flagged;
    if (thread.maxContext >= 0.6) return 'Prefer a new thread for unrelated follow-up work — context is heavy.';
    if (thread.cacheRatio < 0.3) return 'Compare fresh input with the previous turn before continuing.';
    return 'No action needed. Expand calls only if a signal is unclear.';
  }
  function renderThreadRail(scope, thread) {
    if (!thread.calls.length) {
      overviewRailEl.innerHTML = `
        <div class="rail-panel">
          <div class="rail-head">
            <h2 class="panel-title"><span class="panel-title-dim">:: </span>thread</h2>
            <button type="button" class="rail-close" data-action="close-thread">✕ close</button>
          </div>
          <div class="rail-body">
            <div class="drill-name">${escapeHtml(thread.label)}</div>
            <div class="drill-stats">
              <div><span class="stat-label">spend</span><br><b>${escapeHtml(money(thread.cost))}</b></div>
              <div><span class="stat-label">tokens</span><br><b>${escapeHtml(compactTokens(thread.tokens))}</b></div>
              <div><span class="stat-label">cache reuse</span><br><b class="stat-value" data-level="${cacheLevel(thread.cacheRatio)}">${pctRound(thread.cacheRatio)}</b></div>
              <div><span class="stat-label">calls</span><br><b>${number.format(thread.callCount)}</b></div>
            </div>
            <div class="rail-empty">&gt; this thread's calls are older than the loaded slice — totals above are complete, but the per-call timeline is unavailable</div>
          </div>
        </div>
      `;
      return;
    }
    const chrono = thread.calls.slice().sort(chronological);
    // Cumulative context-growth sparkline: main-line calls only.
    const mainCalls = chrono.filter(call => !isSubagent(call) && !isAutoReview(call));
    const growthCalls = mainCalls.length ? mainCalls : chrono;
    const maxCumulative = Math.max(1, ...growthCalls.map(call => Number(call.cumulative_total_tokens) || 0));
    const WIDTH = 260;
    const HEIGHT = 56;
    const points = growthCalls.map((call, index) => {
      const x = growthCalls.length === 1 ? WIDTH : (index / (growthCalls.length - 1)) * WIDTH;
      const y = HEIGHT - ((Number(call.cumulative_total_tokens) || 0) / maxCumulative) * (HEIGHT - 4) - 2;
      return [x, y];
    });
    const lastContext = Number(growthCalls[growthCalls.length - 1].context_window_percent) || 0;
    const growthColor = lastContext >= 0.6 ? 'var(--error)' : lastContext >= 0.35 ? 'var(--neon-yellow)' : 'var(--neon-green)';
    const linePath = points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(' ');
    const areaPath = `M0 ${HEIGHT} ${points.map(point => `L${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(' ')} L${WIDTH} ${HEIGHT} Z`;
    const lastPoint = points[points.length - 1];

    const related = chrono.filter(call => isSubagent(call) || isAutoReview(call));
    const relationGroups = new Map();
    related.forEach(call => {
      const key = isAutoReview(call)
        ? 'auto-review'
        : call.thread_name || call.agent_nickname || (call.agent_role ? `subagent: ${call.agent_role}` : 'subagent');
      if (!relationGroups.has(key)) relationGroups.set(key, []);
      relationGroups.get(key).push(call);
    });
    const relations = [...relationGroups.entries()].map(([name, calls]) => {
      const review = isAutoReview(calls[0]);
      return {
        name,
        kind: review ? 'auto-review' : `spawned · ${calls[0].agent_role || 'subagent'}`,
        kindAttr: review ? 'auto-review' : 'subagent',
        meta: `${calls.length} call${calls.length > 1 ? 's' : ''} · ${compactTokens(sum(calls, 'total_tokens'))} tok · ${money(sum(calls, 'estimated_cost_usd'))}`,
      };
    });
    const relationsBlock = relations.length
      ? `
        <div class="rail-section">
          <div class="rail-section-title">spawned work</div>
          ${relations.map(relation => `
            <div class="rel-row">
              <span class="rel-tick">└</span>
              <div class="cell-clip">
                <div class="rel-name">${escapeHtml(relation.name)} <span class="rel-kind" data-kind="${relation.kindAttr}">· ${escapeHtml(relation.kind)}</span></div>
                <div class="rel-meta">${escapeHtml(relation.meta)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `
      : '';
    const timelineRows = chrono.map(call => {
      const context = Number(call.context_window_percent) || 0;
      const kind = callKindOf(call);
      const estimatedMark = call.pricing_estimated ? '*' : '';
      return `
        <div class="timeline-row">
          <div class="timeline-time">${escapeHtml(timelineFormat.format(new Date(call.event_timestamp)))}</div>
          <div class="cell-clip">
            <div class="timeline-model">${escapeHtml(call.model || 'unknown')} <span class="call-kind" data-kind="${kind}">· ${kind}</span></div>
            <div class="timeline-meta">${escapeHtml(`${compactTokens(call.total_tokens)} tok · ${money(call.estimated_cost_usd)}${estimatedMark} · cache ${pctRound(call.cache_ratio)}`)}</div>
            <div class="context-meter" title="${escapeHtml(`context use ${pctRound(context)}`)}"><span class="context-fill" data-level="${contextLevel(context)}" data-css="width: ${Math.round(context * 100)}%"></span></div>
          </div>
        </div>
      `;
    }).join('');
    overviewRailEl.innerHTML = `
      <div class="rail-panel">
        <div class="rail-head">
          <h2 class="panel-title"><span class="panel-title-dim">:: </span>thread</h2>
          <button type="button" class="rail-close" data-action="close-thread">✕ close</button>
        </div>
        <div class="rail-body">
          <div class="drill-name">${escapeHtml(thread.label)}</div>
          <div class="drill-stats">
            <div><span class="stat-label">spend</span><br><b>${escapeHtml(money(thread.cost))}</b></div>
            <div><span class="stat-label">tokens</span><br><b>${escapeHtml(compactTokens(thread.tokens))}</b></div>
            <div><span class="stat-label">cache reuse</span><br><b class="stat-value" data-level="${cacheLevel(thread.cacheRatio)}">${pctRound(thread.cacheRatio)}</b></div>
            <div><span class="stat-label">max context</span><br><b class="stat-value" data-level="${contextLevel(thread.maxContext)}">${pctRound(thread.maxContext)}</b></div>
          </div>
          <div class="callout">
            <div class="callout-title">next action</div>
            <div class="callout-body">${escapeHtml(threadNextAction(thread, chrono))}</div>
          </div>
          <div class="rail-section">
            <div class="rail-section-title">context growth · session cumulative</div>
            <svg class="growth-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
              <path d="${areaPath}" fill="${growthColor}" opacity="0.12"></path>
              <path d="${linePath}" fill="none" stroke="${growthColor}" stroke-width="1.5"></path>
              <circle cx="${lastPoint[0].toFixed(1)}" cy="${lastPoint[1].toFixed(1)}" r="2.5" fill="${growthColor}"></circle>
            </svg>
            <div class="growth-caption">${escapeHtml(`${compactTokens(maxCumulative)} cumulative tokens · context ${pctRound(lastContext)} of window`)}</div>
          </div>
          ${relationsBlock}
          <div class="rail-section">
            <div class="rail-section-title">timeline · oldest → newest${thread.callCount > chrono.length ? escapeHtml(` · newest ${number.format(chrono.length)} of ${number.format(thread.callCount)} calls`) : ''}</div>
            <div class="timeline">${timelineRows}</div>
          </div>
          <button type="button" class="rail-action-btn" data-action="open-calls">&gt; open in calls view</button>
        </div>
      </div>
    `;
  }
  function renderOverviewRail(scope) {
    const thread = state.selectedThread
      ? scope.threads.find(candidate => candidate.key === state.selectedThread)
      : null;
    if (thread) renderThreadRail(scope, thread);
    else renderAttentionRail(scope);
  }

  /* ---- Calls view ---- */
  const CALLS_PAGE_SIZE = 8;
  function sortDirection() {
    return state.sortDir || (state.sortKey === 'cache' ? 'asc' : 'desc');
  }
  function sortValue(row) {
    if (state.sortKey === 'tokens') return Number(row.total_tokens) || 0;
    if (state.sortKey === 'cost') return Number(row.estimated_cost_usd) || 0;
    if (state.sortKey === 'cache') return Number(row.cache_ratio) || 0;
    return Date.parse(row.event_timestamp) || 0;
  }
  function callCreditsText(row) {
    if (row.usage_credit_confidence === 'not_applicable') return '';
    const value = usageCreditValue(row);
    return value === null ? 'no rate' : `${credits(value)} cr`;
  }
  function callCostText(row) {
    let text = money(row.estimated_cost_usd, '$0.00');
    if (row.pricing_estimated) text += '*';
    if (!row.pricing_model) text += ' ·unpriced';
    return text;
  }
  function renderCallsTable(scope) {
    const direction = sortDirection();
    const sorted = scope.rows.slice().sort((a, b) => (direction === 'asc' ? sortValue(a) - sortValue(b) : sortValue(b) - sortValue(a)));
    const pageCount = Math.max(1, Math.ceil(sorted.length / CALLS_PAGE_SIZE));
    const page = Math.min(state.page, pageCount);
    state.page = page;
    const startIndex = (page - 1) * CALLS_PAGE_SIZE;
    const visible = sorted.slice(startIndex, startIndex + CALLS_PAGE_SIZE);
    callsCaptionEl.textContent = scope.aggregates && scope.aggregates.calls > sorted.length
      ? `newest ${number.format(sorted.length)} of ${number.format(scope.aggregates.calls)} calls · sorted by ${state.sortKey} ${direction === 'desc' ? '↓' : '↑'}`
      : `${number.format(sorted.length)} calls · sorted by ${state.sortKey} ${direction === 'desc' ? '↓' : '↑'}`;
    renderDayChip(callsDayChipEl, scope);
    callsSectionEl.querySelectorAll('.sort-btn[data-sort-key]').forEach(button => {
      const key = button.dataset.sortKey;
      button.dataset.active = key === state.sortKey ? 'true' : 'false';
      const indicator = button.querySelector('.sort-ind');
      if (indicator) indicator.textContent = key === state.sortKey ? (direction === 'desc' ? '▾' : '▴') : '';
    });
    if (!sorted.length) {
      callRowsEl.innerHTML = '<div class="list-empty">&gt; no calls in range — widen the time filter</div>';
    } else {
      callRowsEl.innerHTML = visible.map(row => {
        const date = new Date(row.event_timestamp);
        const flags = Array.isArray(row.efficiency_flags) ? row.efficiency_flags : [];
        const flagChip = flags.length
          ? `<span class="flag-chip" title="${escapeHtml(flags.join(', '))}">${escapeHtml(flags[0])}</span>`
          : '';
        const threadLabel = rowThreadLabel(row);
        return `
          <div class="call-row" data-record-id="${escapeHtml(String(row.record_id || ''))}" data-selected="${state.selectedCall === String(row.record_id) ? 'true' : 'false'}" role="button" tabindex="0">
            <div class="call-time"><span class="call-date">${escapeHtml(shortDateFormat.format(date))}</span><br><span class="call-clock">${escapeHtml(clockFormat.format(date))}</span></div>
            <div class="call-thread" title="${escapeHtml(threadLabel)}">${escapeHtml(threadLabel)}<br><span class="call-thread-kind">${callKindOf(row)}</span></div>
            <div class="cell-clip"><span class="model-pill" data-provider="${row.source_provider === 'anthropic' ? 'anthropic' : 'openai'}">${escapeHtml(row.model || 'unknown')}</span></div>
            <div class="call-effort">${escapeHtml(row.effort || '—')}</div>
            <div class="call-num">${escapeHtml(compactTokens(row.total_tokens))}</div>
            <div class="call-num">${escapeHtml(callCostText(row))}<br><span class="col-sub">${escapeHtml(callCreditsText(row))}</span></div>
            <div class="call-num cache-value" data-level="${cacheLevel(row.cache_ratio)}">${pctRound(row.cache_ratio)}</div>
            <div class="call-flags">${flagChip}</div>
          </div>
        `;
      }).join('');
    }
    callsPagerEl.hidden = pageCount <= 1;
    if (pageCount > 1) {
      const endIndex = Math.min(startIndex + CALLS_PAGE_SIZE, sorted.length);
      callsPagerStatusEl.textContent = `${startIndex + 1}–${endIndex} of ${sorted.length} calls · [ page ${page}/${pageCount} ]`;
      callsPrevEl.disabled = page <= 1;
      callsNextEl.disabled = page >= pageCount;
    }
  }

  function kvRow(key, value, tone = '', wide = false) {
    const toneAttr = tone ? ` data-tone="${tone}"` : '';
    return `
      <div class="kv-row${wide ? ' kv-wide' : ''}">
        <span class="kv-key">${escapeHtml(key)}</span>
        <span class="kv-val"${toneAttr}>${escapeHtml(value)}</span>
      </div>
    `;
  }
  function callNextAction(row) {
    const flagged = flaggedAction(row);
    if (flagged) return flagged;
    if (!row.pricing_model) return 'Configure pricing before trusting cost totals.';
    const cacheRatio = Number(row.cache_ratio) || 0;
    const context = Number(row.context_window_percent) || 0;
    if (cacheRatio < 0.3 && (Number(row.input_tokens) || 0) > 0) return 'Compare fresh input with the previous turn before continuing.';
    if (context >= 0.6) return 'Inspect the thread timeline and consider starting a fresh thread.';
    return 'Use the aggregate fields first; load context only if the signal is still unclear.';
  }
  function rowNeedsDetail(row) {
    return Boolean(row && row.record_id && !Object.prototype.hasOwnProperty.call(row, 'source_file'));
  }
  function pendingText(row, value) {
    if (value !== undefined && value !== null && value !== '') return value;
    return rowNeedsDetail(row) && !row._detailError ? 'loading on demand…' : 'unknown';
  }
  function renderCallRail(scope) {
    const row = state.selectedCall ? rowByRecordId.get(state.selectedCall) : null;
    if (!row) {
      callRailEl.innerHTML = '<div class="rail-empty">&gt; click a row to inspect its aggregate fields</div>';
      return;
    }
    const anthropic = row.source_provider === 'anthropic';
    const cacheRatio = Number(row.cache_ratio) || 0;
    const context = Number(row.context_window_percent) || 0;
    const primaryRows = [];
    primaryRows.push(kvRow('est. cost', `${money(row.estimated_cost_usd, 'no configured price')}${row.pricing_estimated ? ' *best-guess' : ''}`));
    if (!anthropic) {
      const creditValue = usageCreditValue(row);
      primaryRows.push(kvRow(
        'codex credits',
        creditValue === null
          ? 'no mapped rate'
          : `${credits(creditValue)} cr · ${row.usage_credit_confidence === 'exact' ? 'rate-card match' : 'inferred mapping'}`,
      ));
    }
    primaryRows.push(kvRow('cache ratio', pctRound(cacheRatio), cacheRatio < 0.3 ? 'warn' : 'good'));
    primaryRows.push(kvRow(anthropic ? 'direct input' : 'uncached input', number.format(Number(row.uncached_input_tokens) || 0)));
    primaryRows.push(kvRow('context use', pctRound(context), context >= 0.6 ? 'bad' : context >= 0.35 ? 'warn' : 'good'));
    primaryRows.push(kvRow(
      'pricing',
      !row.pricing_model ? 'no configured price' : row.pricing_estimated ? 'best-guess estimate' : 'configured price',
      !row.pricing_model ? 'info' : 'dim',
    ));
    const kind = callKindOf(row);
    const sourceText = `${kind === 'subagent' ? `subagent: ${row.agent_role || 'unknown'}` : kind} · ${[row.source_app, row.source_provider].filter(Boolean).join(' / ') || 'unknown source'}`;
    const narrativeRows = [
      kvRow('thread', rowThreadLabel(row)),
      kvRow('project', row.project_name || 'unknown'),
      kvRow('source', sourceText),
      kvRow('parent thread', row.resolved_parent_thread_name || row.parent_thread_name || 'none'),
      kvRow('timestamp', narrativeFormat.format(new Date(row.event_timestamp))),
    ].join('');
    const tokensRows = [
      kvRow('last call total', number.format(Number(row.total_tokens) || 0), '', true),
      kvRow(anthropic ? 'cache read' : 'cached input', number.format(Number(row.cached_input_tokens) || 0), '', true),
      kvRow('cache creation', number.format(Number(row.cache_creation_input_tokens) || 0), '', true),
      kvRow(anthropic ? 'direct input' : 'uncached input', number.format(Number(row.uncached_input_tokens) || 0), '', true),
      kvRow('output', number.format(Number(row.output_tokens) || 0), '', true),
      kvRow('reasoning output', number.format(Number(row.reasoning_output_tokens) || 0), '', true),
      kvRow('session cumulative', number.format(Number(row.cumulative_total_tokens) || 0), '', true),
      kvRow('cache savings', money(row.estimated_cache_savings_usd, '$0.00'), '', true),
    ].join('');
    const rawRows = [
      kvRow('session', String(row.session_id || 'unknown')),
      kvRow('turn', String(pendingText(row, row.turn_id))),
      kvRow('cwd', String(pendingText(row, row.cwd))),
      kvRow('branch', String(row.git_branch || 'unknown')),
      kvRow('source file', rowNeedsDetail(row) ? 'loading on demand…' : `${row.source_file || 'unknown'}:${row.line_number || ''}`),
      kvRow('context window', row.model_context_window ? number.format(Number(row.model_context_window)) : String(pendingText(row, row.model_context_window))),
    ].join('');
    const detailStatus = row._detailError
      ? `<p class="context-note">Could not load additional aggregate fields: ${escapeHtml(row._detailError)}</p>`
      : '';
    const contextSection = contextApiEnabled && apiToken && liveRefreshSupported
      ? `
        <details class="rail-collapse">
          <summary>prompt context (loads on demand)</summary>
          <div class="rail-collapse-body">
            <p class="context-note">Context is read from the local JSONL log on request. It is never persisted to SQLite or dashboard HTML.</p>
            <span class="rail-btn-row">
              <button type="button" class="rail-action-btn" data-action="load-context">&gt; load context</button>
              <button type="button" class="rail-action-btn" data-action="load-context-output">&gt; include tool output</button>
            </span>
            <div id="contextResult"></div>
          </div>
        </details>
      `
      : '';
    callRailEl.innerHTML = `
      <div class="kv-card kv-primary">
        <div class="kv-title">cost, usage, and context</div>
        ${primaryRows.join('')}
      </div>
      <div class="callout">
        <div class="callout-title">next action</div>
        <div class="callout-body">${escapeHtml(callNextAction(row))}</div>
      </div>
      <div class="kv-card">
        <div class="kv-title">thread narrative</div>
        ${narrativeRows}
      </div>
      <details class="rail-collapse">
        <summary>token and pricing breakdown</summary>
        <div class="rail-collapse-body">${tokensRows}</div>
      </details>
      <details class="rail-collapse">
        <summary>raw identifiers &amp; source</summary>
        <div class="rail-collapse-body">${rawRows}${detailStatus}</div>
      </details>
      ${contextSection}
      <button type="button" class="rail-action-btn" data-action="open-thread" data-thread-key="${escapeHtml(rowThreadKey(row))}">&gt; open thread in overview</button>
    `;
  }

  /* ---- Footer meta ---- */
  function renderFooterMeta() {
    const mode = (projectMetadataPrivacy && projectMetadataPrivacy.mode) || 'normal';
    privacyLineEl.textContent = mode === 'normal'
      ? 'aggregate-only · nothing leaves this machine'
      : `aggregate-only · nothing leaves this machine · privacy mode: ${mode}`;
    const pricingName = pricingSource && pricingSource.name ? String(pricingSource.name) : '';
    if (pricingName || pricingSnapshotWarning) {
      pricingLineEl.hidden = false;
      pricingLineEl.textContent = pricingSnapshotWarning
        ? `pricing: ${pricingName || 'configured'} · snapshot changed`
        : `pricing: ${pricingName}`;
      pricingLineEl.dataset.state = pricingSnapshotWarning ? 'warn' : 'ok';
      const fetched = pricingSource && pricingSource.fetched_at ? ` Fetched ${formatTimestamp(pricingSource.fetched_at)}.` : '';
      const sources = pricingSource && Array.isArray(pricingSource.sources) && pricingSource.sources.length
        ? ` Fetched from sources: ${pricingSource.sources.map(source => source.name || 'unknown').join(', ')}.`
        : '';
      pricingLineEl.title = `${pricingSnapshotWarning || `Pricing snapshot ${pricingName}.`}${fetched}${sources}`;
    } else {
      pricingLineEl.hidden = true;
    }
    const diagnosticsEntries = Object.entries(parserDiagnostics || {}).filter(([, count]) => Number(count) > 0);
    const diagnosticsTotal = diagnosticsEntries.reduce((total, [, count]) => total + Number(count), 0);
    if (diagnosticsTotal > 0) {
      diagnosticsLineEl.hidden = false;
      diagnosticsLineEl.dataset.state = 'warn';
      diagnosticsLineEl.textContent = `${number.format(diagnosticsTotal)} parser diagnostics`;
      diagnosticsLineEl.title = `Latest refresh reported parser diagnostics: ${diagnosticsEntries.map(([key, value]) => `${key}=${value}`).join(', ')}. Run ai-usage-dashboard inspect-log <path> to investigate schema drift.`;
    } else {
      diagnosticsLineEl.hidden = true;
    }
  }

  /* ---- Main render ---- */
  // The server's CSP has no style-src 'unsafe-inline', so browsers strip
  // inline style attributes from rendered markup. Dynamic values are carried
  // in data-css and applied through the CSSOM, which CSP permits.
  function applyPendingStyles() {
    document.querySelectorAll('[data-css]').forEach(node => {
      node.style.cssText = node.dataset.css;
      node.removeAttribute('data-css');
    });
  }
  function render() {
    const scope = computeScope();
    updatePromptLine(scope);
    renderControls();
    renderFiltersPopover(scope);
    renderAnswerStrip(scope);
    renderChart(scope);
    renderCoverageNote(scope);
    renderLimits();
    document.querySelectorAll('.view-btn').forEach(button => {
      button.dataset.active = button.dataset.view === state.view ? 'true' : 'false';
    });
    overviewSectionEl.hidden = state.view !== 'overview';
    callsSectionEl.hidden = state.view !== 'calls';
    if (state.view === 'overview') {
      renderLedger(scope);
      renderOverviewRail(scope);
    } else {
      renderCallsTable(scope);
      renderCallRail(scope);
    }
    renderFooterMeta();
    applyPendingStyles();
    syncUrlState();
  }

  function setState(patch, options = {}) {
    Object.assign(state, patch);
    if (options.resetPages) {
      state.page = 1;
      state.ledgerPage = 1;
    }
    if (options.clearSelection) {
      state.selectedThread = '';
      state.selectedCall = '';
    }
    if (options.clearDay) state.dayKey = '';
    render();
    if (options.refetch && liveRefreshSupported) refreshDashboardData(true);
  }

  function selectCall(recordId) {
    state.selectedCall = recordId;
    const row = rowByRecordId.get(recordId);
    render();
    if (row && rowNeedsDetail(row)) {
      ensureRowDetail(row).then(() => {
        if (state.selectedCall === recordId) render();
      });
    }
  }

  /* ---- Live refresh ---- */
  const liveRefreshSupported = window.location.protocol !== 'file:';
  const liveRefreshIntervalMs = 10000;
  let autoRefreshEnabled = true;
  let autoRefreshTimer = null;
  let refreshInFlight = false;
  let refreshQueued = false;
  const reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function updateLiveStatus(label, detail = '') {
    liveChipEl.textContent = `[ ${label} ]`;
    liveChipEl.title = detail || label;
    const key = label.toLowerCase();
    let liveState = 'static';
    if (key.includes('error')) liveState = 'error';
    else if (key === 'live') liveState = 'live';
    else if (key === 'paused') liveState = 'paused';
    else if (key === 'refreshing' || key === 'checking' || key === 'reloading') liveState = 'busy';
    liveChipEl.dataset.state = liveState;
  }
  function pulseLiveStatus() {
    if (reducedMotionQuery.matches) return;
    liveChipEl.classList.remove('sunset-pulse');
    void liveChipEl.offsetWidth;
    liveChipEl.classList.add('sunset-pulse');
  }
  function applyDashboardPayload(nextPayload) {
    data = payloadRows(nextPayload);
    indexRollups(nextPayload);
    pricingSource = nextPayload.pricing_source || {};
    pricingSnapshotWarning = nextPayload.pricing_snapshot_warning || '';
    providerLimitSnapshots = nextPayload.provider_limit_snapshots || {};
    parserDiagnostics = nextPayload.parser_diagnostics || {};
    projectMetadataPrivacy = nextPayload.project_metadata_privacy || { mode: nextPayload.privacy_mode || 'normal' };
    apiToken = nextPayload.api_token || apiToken;
    contextApiEnabled = Boolean(nextPayload.context_api_enabled);
    includeArchived = Boolean(nextPayload.include_archived);
    totalAvailableRows = Number(nextPayload.total_available_rows || data.length);
    loadedLimit = payloadLimit(nextPayload);
    rebuildDashboardIndexes();
    render();
    if (state.selectedCall) {
      const selectedRow = rowByRecordId.get(state.selectedCall);
      if (selectedRow && rowNeedsDetail(selectedRow)) {
        ensureRowDetail(selectedRow).then(() => {
          if (state.selectedCall === String(selectedRow.record_id)) render();
        });
      }
    }
  }
  async function refreshDashboardData(manual = false) {
    if (!liveRefreshSupported) {
      updateLiveStatus('Reloading', 'Reloading static dashboard snapshot...');
      window.location.reload();
      return;
    }
    if (refreshInFlight) {
      refreshQueued = true;
      return;
    }
    refreshInFlight = true;
    updateLiveStatus(manual ? 'Refreshing' : 'Checking', manual ? 'Refreshing local usage index...' : 'Checking for new usage...');
    try {
      // Rollups carry complete totals for the window, so the raw-row slice can
      // stay at the server's default limit instead of an unbounded fetch.
      const params = new URLSearchParams({
        refresh: '1',
        include_archived: includeArchived ? '1' : '0',
        _: String(Date.now()),
      });
      const win = currentWindow();
      if (win.startMs !== null && !win.invalid) {
        // Fetch the prior period too so hero deltas have data to compare.
        const endEffective = win.endMs !== null ? win.endMs : Date.now();
        const priorStart = win.startMs - (endEffective - win.startMs);
        params.set('since', new Date(priorStart).toISOString());
        if (win.endMs !== null) params.set('until', new Date(win.endMs).toISOString());
      }
      const response = await fetch(`/api/usage?${params.toString()}`, {
        headers: {
          'Accept': 'application/json',
          'X-Codex-Usage-Token': apiToken,
        },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const nextPayload = await response.json();
      if (nextPayload.error) throw new Error(nextPayload.error);
      applyDashboardPayload(nextPayload);
      updateLiveStatus(
        autoRefreshEnabled ? 'live' : 'paused',
        `Updated ${formatTimestamp(nextPayload.refreshed_at)}. Loaded ${number.format(data.length)} of ${number.format(totalAvailableRows || data.length)} rows in range. Click to ${autoRefreshEnabled ? 'pause' : 'resume'} live refresh.`,
      );
      pulseLiveStatus();
    } catch (error) {
      const message = error.message || String(error);
      updateLiveStatus('refresh error', `Live refresh unavailable: ${message}${manual ? '. Reload this page after regenerating a static dashboard, or run ai-usage-dashboard serve-dashboard.' : ''}`);
      if (manual && message === 'HTTP 404') window.location.reload();
      // A 403 means this page's embedded API token belongs to a previous
      // server process; a fresh page load mints a matching token. Guard with
      // a timestamp so a genuinely broken server cannot cause a reload loop.
      if (message === 'HTTP 403') {
        let lastReload = 0;
        try { lastReload = Number(window.sessionStorage.getItem('usageTokenReloadAt')) || 0; } catch (storageError) { lastReload = Date.now(); }
        if (Date.now() - lastReload > 60000) {
          try { window.sessionStorage.setItem('usageTokenReloadAt', String(Date.now())); } catch (storageError) { /* ignore */ }
          window.location.reload();
        }
      }
    } finally {
      refreshInFlight = false;
      if (refreshQueued) {
        refreshQueued = false;
        refreshDashboardData(manual);
      }
    }
  }
  function scheduleAutoRefresh() {
    if (autoRefreshTimer) window.clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    if (!autoRefreshEnabled || !liveRefreshSupported) return;
    autoRefreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshDashboardData(false);
    }, liveRefreshIntervalMs);
  }

  /* ---- On-demand aggregate row detail ---- */
  async function ensureRowDetail(row) {
    if (!liveRefreshSupported || !apiToken || !row || !row.record_id || !rowNeedsDetail(row) || row._detailError) {
      return row;
    }
    if (row._detailPromise) return row._detailPromise;
    row._detailPromise = (async () => {
      const response = await fetch(`/api/usage-row?record_id=${encodeURIComponent(row.record_id)}`, {
        headers: {
          'Accept': 'application/json',
          'X-Codex-Usage-Token': apiToken,
        },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(response.status === 404
          ? 'Aggregate row detail is unavailable for this record.'
          : `Aggregate row API returned HTTP ${response.status}.`);
      }
      const payload = await response.json();
      if (!payload.row) throw new Error('Aggregate row detail was empty.');
      Object.assign(row, payload.row);
      delete row._detailError;
      return row;
    })().catch(error => {
      row._detailError = error.message || String(error);
      return row;
    }).finally(() => {
      row._detailPromise = null;
    });
    return row._detailPromise;
  }

  /* ---- On-demand prompt context (never persisted) ---- */
  async function loadContext(row, includeToolOutput) {
    const target = document.getElementById('contextResult');
    if (!target) return;
    if (!row.record_id) {
      target.innerHTML = '<p class="context-note">This row has no record id for context lookup.</p>';
      return;
    }
    target.innerHTML = '<p class="context-note">Loading local context...</p>';
    const params = new URLSearchParams({ record_id: row.record_id });
    if (includeToolOutput) params.set('include_tool_output', '1');
    try {
      const response = await fetch(`/api/context?${params.toString()}`, {
        headers: {
          'Accept': 'application/json',
          'X-Codex-Usage-Token': apiToken,
        },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(response.status === 404
          ? 'Context API is unavailable here. Run ai-usage-dashboard serve-dashboard --open for on-demand context loading.'
          : `Context API returned HTTP ${response.status}.`);
      }
      const payload = await response.json();
      target.innerHTML = renderContext(payload);
    } catch (error) {
      target.innerHTML = `<p class="context-note">${escapeHtml(error.message || String(error))}</p>`;
    }
  }
  function renderContext(payload) {
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const source = payload.source || {};
    const omitted = payload.omitted || {};
    const note = [
      'Loaded on demand from local JSONL.',
      payload.raw_context_persisted === false ? 'Not persisted to SQLite or dashboard HTML.' : '',
      payload.include_tool_output ? 'Tool output included with redaction and size limits.' : 'Tool output omitted by default.',
      source.file ? `Source: ${source.file}:${source.line_number || ''}` : '',
      omitted.older_entries ? `${number.format(omitted.older_entries)} older entries omitted.` : '',
      omitted.over_budget_chars ? `${number.format(omitted.over_budget_chars)} chars over budget omitted.` : '',
    ].filter(Boolean).join(' ');
    const body = entries.map(entry => `
      <div class="context-entry">
        <div class="context-entry-header">
          <span>${escapeHtml(entry.label || entry.type || 'entry')}</span>
          <span>${escapeHtml([formatTimestamp(entry.timestamp, ''), entry.line_number ? `line ${entry.line_number}` : ''].filter(Boolean).join(' - '))}</span>
        </div>
        <pre>${escapeHtml(entry.text || '')}</pre>
      </div>
    `).join('');
    return `<p class="context-note">${escapeHtml(note)}</p>${body || '<p class="context-note">No context entries found for this call.</p>'}`;
  }

  /* ---- Events ---- */
  searchEl.addEventListener('input', () => {
    setState({ search: searchEl.value }, { resetPages: true });
  });
  searchClearEl.addEventListener('click', () => {
    setState({ search: '' }, { resetPages: true });
    searchEl.focus();
  });
  rangePresetsEl.addEventListener('click', event => {
    const button = event.target.closest('[data-range]');
    if (!button) return;
    setState({ range: button.dataset.range }, { resetPages: true, clearDay: true, refetch: true });
  });
  customStartEl.addEventListener('input', () => {
    setState({ customStart: customStartEl.value, range: 'custom' }, { resetPages: true, clearDay: true, refetch: true });
  });
  customEndEl.addEventListener('input', () => {
    setState({ customEnd: customEndEl.value, range: 'custom' }, { resetPages: true, clearDay: true, refetch: true });
  });
  providerSwitchEl.addEventListener('click', event => {
    const button = event.target.closest('[data-provider]');
    if (!button) return;
    setState({ provider: button.dataset.provider || '' }, { resetPages: true, clearSelection: true });
  });
  filtersToggleEl.addEventListener('click', () => {
    setState({ showFilters: !state.showFilters });
  });
  if (tokensMetricToggleEl) {
    tokensMetricToggleEl.addEventListener('click', () => {
      setState({ tokensMetric: state.tokensMetric === 'uncached' ? 'all' : 'uncached' });
    });
  }
  filtersPopoverEl.addEventListener('click', event => {
    const clear = event.target.closest('[data-action="clear-filters"]');
    if (clear) {
      setState({ fModel: '', fEffort: '', fConfidence: '', fThreadType: '' }, { resetPages: true, clearDay: true, clearSelection: true });
      return;
    }
    const chip = event.target.closest('[data-filter-key]');
    if (!chip) return;
    const key = chip.dataset.filterKey;
    const value = chip.dataset.filterValue || '';
    const next = value && state[key] !== value ? value : '';
    setState({ [key]: next }, { resetPages: true, clearSelection: true });
  });
  chartBarsEl.addEventListener('click', event => {
    const bar = event.target.closest('[data-day-key]');
    if (!bar) return;
    const key = bar.dataset.dayKey;
    setState({ dayKey: state.dayKey === key ? '' : key }, { resetPages: true, clearSelection: true });
  });
  limitsGroupsEl.addEventListener('click', event => {
    const group = event.target.closest('[data-provider]');
    if (!group) return;
    const provider = group.dataset.provider;
    setState({ provider: state.provider === provider ? '' : provider }, { resetPages: true, clearSelection: true });
  });
  [ledgerDayChipEl, callsDayChipEl].forEach(chip => chip.addEventListener('click', () => {
    setState({ dayKey: '' }, { resetPages: true });
  }));
  document.querySelectorAll('.view-btn').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.view === state.view) return;
      setState({ view: button.dataset.view });
    });
  });
  ledgerRowsEl.addEventListener('click', event => {
    const row = event.target.closest('[data-thread-key]');
    if (!row) return;
    const key = row.dataset.threadKey;
    setState({ selectedThread: state.selectedThread === key ? '' : key });
  });
  ledgerRowsEl.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-thread-key]');
    if (!row) return;
    event.preventDefault();
    setState({ selectedThread: state.selectedThread === row.dataset.threadKey ? '' : row.dataset.threadKey });
  });
  ledgerPrevEl.addEventListener('click', () => setState({ ledgerPage: Math.max(1, state.ledgerPage - 1) }));
  ledgerNextEl.addEventListener('click', () => setState({ ledgerPage: state.ledgerPage + 1 }));
  overviewRailEl.addEventListener('click', event => {
    const close = event.target.closest('[data-action="close-thread"]');
    if (close) {
      setState({ selectedThread: '' });
      return;
    }
    const select = event.target.closest('[data-action="select-thread"]');
    if (select) {
      setState({ selectedThread: select.dataset.threadKey || '' });
      return;
    }
    const openCalls = event.target.closest('[data-action="open-calls"]');
    if (openCalls) {
      setState({ view: 'calls', page: 1, sortKey: 'time', sortDir: '', selectedCall: '' });
    }
  });
  callRowsEl.addEventListener('click', event => {
    const row = event.target.closest('[data-record-id]');
    if (!row) return;
    selectCall(row.dataset.recordId);
  });
  callRowsEl.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-record-id]');
    if (!row) return;
    event.preventDefault();
    selectCall(row.dataset.recordId);
  });
  callsPrevEl.addEventListener('click', () => setState({ page: Math.max(1, state.page - 1) }));
  callsNextEl.addEventListener('click', () => setState({ page: state.page + 1 }));
  callsSectionEl.querySelectorAll('.sort-btn[data-sort-key]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.sortKey;
      if (state.sortKey === key) {
        setState({ sortDir: sortDirection() === 'desc' ? 'asc' : 'desc', page: 1 });
      } else {
        setState({ sortKey: key, sortDir: '', page: 1 });
      }
    });
  });
  callRailEl.addEventListener('click', event => {
    const openThread = event.target.closest('[data-action="open-thread"]');
    if (openThread) {
      setState({ view: 'overview', selectedThread: openThread.dataset.threadKey || '' });
      return;
    }
    const loadPlain = event.target.closest('[data-action="load-context"]');
    const loadWithOutput = event.target.closest('[data-action="load-context-output"]');
    if (loadPlain || loadWithOutput) {
      const row = rowByRecordId.get(state.selectedCall);
      if (row) loadContext(row, Boolean(loadWithOutput));
    }
  });
  liveChipEl.addEventListener('click', () => {
    if (!liveRefreshSupported) {
      refreshDashboardData(true);
      return;
    }
    autoRefreshEnabled = !autoRefreshEnabled;
    scheduleAutoRefresh();
    if (autoRefreshEnabled) {
      refreshDashboardData(true);
    } else {
      updateLiveStatus('paused', 'Live refresh paused. Click to resume.');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && autoRefreshEnabled && liveRefreshSupported) refreshDashboardData(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.showFilters) {
      setState({ showFilters: false });
      return;
    }
    const target = event.target;
    const inEditable = target && target.closest && target.closest('input, select, textarea, button, [contenteditable="true"]');
    if (inEditable) return;
    if (event.key === '/') {
      event.preventDefault();
      searchEl.focus();
    }
  });

  /* ---- Init ---- */
  rebuildDashboardIndexes();
  render();
  if (state.selectedCall) {
    const row = rowByRecordId.get(state.selectedCall);
    if (row && rowNeedsDetail(row)) {
      ensureRowDetail(row).then(() => render());
    }
  }
  if (!liveRefreshSupported) {
    updateLiveStatus('static', `Static snapshot. Loaded ${number.format(data.length)} rows. Run ai-usage-dashboard serve-dashboard for live refresh.`);
  } else {
    updateLiveStatus('live', `Live refresh every ${liveRefreshIntervalMs / 1000}s. Click to pause.`);
    scheduleAutoRefresh();
    refreshDashboardData(false);
  }
})();
