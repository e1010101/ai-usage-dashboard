    const dashboardFormat = window.CodexUsageDashboardFormat;
    const dashboardData = window.CodexUsageDashboardData;
    const {
      number,
      compact,
      money,
      credits,
      pct,
      short,
      escapeHtml,
      truncate,
      formatTimestamp,
      formatTimestampTitle,
      renderTimeCell,
      defaultSortDirection,
      textValue,
      compareValues,
      sortLabel,
    } = dashboardFormat;
    const {
      payloadRows,
      payloadLimit,
      optionValueExists,
      clamp,
      usageCreditValue,
      usageCreditStatusText,
      sumUsageCredits,
      creditCoverageRatio,
      isAutoReview,
      isSubagent,
      sourceLabel,
      usageSourceLabel,
      resolvedParentThreadName,
      resolvedParentSessionUpdatedAt,
      resolveThreadAttachment,
      chronological,
      compactListSummary,
      threadModelSummary,
    } = dashboardData;
    const initialPayload = JSON.parse(document.getElementById('usage-data').textContent);
    const stateManager = window.CodexUsageDashboardState;
    const urlParams = new URLSearchParams(window.location.search);
    const initialState = stateManager ? stateManager.read(urlParams) : {};
    let data = payloadRows(initialPayload);
    let sourceSummaries = Array.isArray(initialPayload.source_summaries) ? initialPayload.source_summaries : [];
    let pricingConfigured = Boolean(initialPayload.pricing_configured);
    let pricingSource = initialPayload.pricing_source || {};
    let pricingSnapshotWarning = initialPayload.pricing_snapshot_warning || '';
    let allowanceConfigured = Boolean(initialPayload.allowance_configured);
    let allowanceSource = initialPayload.allowance_source || {};
    let allowanceWindowSource = initialPayload.allowance_window_source || {};
    let allowanceWindows = Array.isArray(initialPayload.allowance_windows) ? initialPayload.allowance_windows : [];
    let allowanceError = initialPayload.allowance_error || '';
    let providerLimitSnapshots = initialPayload.provider_limit_snapshots || {};
    let providerLimitHistory = Array.isArray(initialPayload.provider_limit_history) ? initialPayload.provider_limit_history : [];
    let rateCardError = initialPayload.rate_card_error || '';
    let projectMetadataPrivacy = initialPayload.project_metadata_privacy || { mode: initialPayload.privacy_mode || 'normal' };
    let parserDiagnostics = initialPayload.parser_diagnostics || {};
    let apiToken = initialPayload.api_token || '';
    let contextApiEnabled = Boolean(initialPayload.context_api_enabled);
    let actionThresholds = initialPayload.action_thresholds || {};
    let totalAvailableRows = Number(initialPayload.total_available_rows || data.length);
    let activeAvailableRows = Number(initialPayload.active_available_rows || data.length);
    let allHistoryAvailableRows = Number(initialPayload.all_history_available_rows || totalAvailableRows);
    let archivedAvailableRows = Number(initialPayload.archived_available_rows || Math.max(allHistoryAvailableRows - activeAvailableRows, 0));
    let loadedLimit = payloadLimit(initialPayload);
    const providerTabsEl = document.getElementById('providerTabs');
    const rowsEl = document.getElementById('rows');
    const detailEl = document.getElementById('detail');
    const searchEl = document.getElementById('search');
    const modelEl = document.getElementById('model');
    const providerEl = document.getElementById('sourceProvider');
    const appEl = document.getElementById('sourceApp');
    const effortEl = document.getElementById('effort');
    const pricingStatusEl = document.getElementById('pricingStatus');
    const threadScopeEl = document.getElementById('threadScope');
    const datePresetEl = document.getElementById('datePreset');
    const dateStartEl = document.getElementById('dateStart');
    const dateEndEl = document.getElementById('dateEnd');
    const dateRangeStatusEl = document.getElementById('dateRangeStatus');
    const dateStatusRowEl = document.getElementById('dateStatusRow');
    const sortEl = document.getElementById('sort');
    const tableTitleEl = document.getElementById('tableTitle');
    const tableCaptionEl = document.getElementById('tableCaption');
    const insightsCaptionEl = document.getElementById('insightsCaption');
    const insightsViewEl = document.getElementById('insightsView');
    const callsViewEl = document.getElementById('callsView');
    const threadsViewEl = document.getElementById('threadsView');
    const insightsPanelEl = document.getElementById('insightsPanel');
    const insightCardsEl = document.getElementById('insightCards');
    const presetListEl = document.getElementById('presetList');
    const presetStatusEl = document.getElementById('presetStatus');
    const clearPresetEl = document.getElementById('clearPreset');
    const refreshDashboardEl = document.getElementById('refreshDashboard');
    const autoRefreshEl = document.getElementById('autoRefresh');
    const historyScopeEl = document.getElementById('historyScope');
    const liveStatusEl = document.getElementById('liveStatus');
    const copyViewLinkEl = document.getElementById('copyViewLink');
    const exportVisibleEl = document.getElementById('exportVisible');
    const actionStatusEl = document.getElementById('actionStatus');
    const prevPageEl = document.getElementById('prevPage');
    const nextPageEl = document.getElementById('nextPage');
    const pageStatusEl = document.getElementById('pageStatus');
    const pagerEl = document.getElementById('pager');
    const toTopEl = document.getElementById('toTop');
    const totalTokensCardEl = document.getElementById('totalTokensCard');
    const totalTokensEl = document.getElementById('totalTokens');
    const inputTokensCardEl = document.getElementById('inputTokensCard');
    const inputTokensEl = document.getElementById('inputTokens');
    const cacheTokensCardEl = document.getElementById('cacheTokensCard');
    const cacheTokensEl = document.getElementById('cacheTokens');
    const outputTokensCardEl = document.getElementById('outputTokensCard');
    const outputTokensEl = document.getElementById('outputTokens');
    const reasoningTokensCardEl = document.getElementById('reasoningTokensCard');
    const reasoningTokensEl = document.getElementById('reasoningTokens');
    const estimatedCostEl = document.getElementById('estimatedCost');
    const usageLimitsCardEl = document.getElementById('usageLimitsCard');
    const usageLimitsEl = document.getElementById('usageLimits');
    const providerDetailsEl = document.getElementById('providerDetails');
    const providerDetailGroupsEl = document.getElementById('providerDetailGroups');
    const usageAnalyticsEl = document.getElementById('usageAnalytics');
    const usageTrendEl = document.getElementById('usageTrend');
    const trendTooltipEl = document.getElementById('trendTooltip');
    const trendMetricTokensEl = document.getElementById('trendMetricTokens');
    const trendMetricCostEl = document.getElementById('trendMetricCost');
    const effortBreakdownBlockEl = document.getElementById('effortBreakdownBlock');
    const effortBreakdownEl = document.getElementById('effortBreakdown');
    const projectLeaderboardBlockEl = document.getElementById('projectLeaderboardBlock');
    const projectLeaderboardEl = document.getElementById('projectLeaderboard');
    const limitBurndownBlockEl = document.getElementById('limitBurndownBlock');
    const limitBurndownEl = document.getElementById('limitBurndown');
    let rowByRecordId = new Map();
    let threadAttachmentByRecordId = new Map();
    const expandedThreads = new Set();
    const liveRefreshSupported = window.location.protocol !== 'file:';
    const initialPayloadIncludeArchived = Boolean(initialPayload.include_archived);
    let includeArchived = initialPayloadIncludeArchived;
    if (liveRefreshSupported && initialState.historyScope === 'all') includeArchived = true;
    if (liveRefreshSupported && initialState.historyScope === 'active') includeArchived = false;
    const liveRefreshIntervalMs = 10000;
    const pageSize = 500;
    const datePresetLabels = {
      all: 'All time',
      today: 'Today',
      'this-week': 'This week',
      'last-7-days': 'Last 7 days',
      'this-month': 'This month',
      custom: 'Custom range',
    };
    const allowedDatePresets = new Set(Object.keys(datePresetLabels));
    const providerProfiles = {
      overview: {
        insightsCaption: 'Ranked across all visible providers. Codex credits and remaining usage apply only to Codex/OpenAI rows.',
      },
      openai: {
        insightsCaption: 'Ranked within visible Codex usage, with credit and remaining-usage signals included when they are available.',
      },
      anthropic: {
        insightsCaption: 'Ranked within visible Claude Code usage. Total tokens include cache reads and cache writes reported by Claude Code.',
      },
    };
    const limitWindowDisplayLabels = { five_hour: '5h', weekly: 'weekly' };
    const limitSetupHints = {
      openai: 'Add ~/.codex-usage-tracker/allowance.json to show 5h and weekly remaining usage.',
      anthropic: 'Capture Claude Code statusLine rate_limits to show 5h and 7d remaining usage.',
    };
    const limitStaleAfterMs = 24 * 60 * 60 * 1000;
    let trendMetric = 'tokens';
    let activeView = ['calls', 'threads', 'insights'].includes(initialState.view) ? initialState.view : 'insights';
    let sortKey = optionValueExists(sortEl, initialState.sort) ? initialState.sort : sortEl.value || 'time';
    let sortDirection = ['asc', 'desc'].includes(initialState.direction) ? initialState.direction : defaultSortDirection(sortKey);
    let activePreset = '';
    let selectedRecordId = initialState.record || '';
    let selectedThreadKey = initialState.thread || '';
    let refreshInFlight = false;
    let refreshQueued = false;
    let autoRefreshTimer = null;
    let currentPage = 1;
    let initialThreadExpansionApplied = false;
    let initialDetailApplied = false;
    const presetDefinitions = [
      {
        key: 'highest-cost',
        label: 'Highest-cost threads',
        description: 'Threads sorted by estimated spend, with subagents attached.',
        view: 'threads',
        sort: 'cost',
        direction: 'desc',
        caption: 'Highest-cost threads preset',
        matches: () => true,
      },
      {
        key: 'context-bloat',
        label: 'Context bloat',
        description: 'Calls over 60% context use or with very high cumulative tokens.',
        view: 'calls',
        sort: 'context',
        direction: 'desc',
        caption: 'Context bloat preset',
        matches: row => Number(row.context_window_percent || 0) >= threshold('high_context_percent', 0.6) || Number(row.cumulative_total_tokens || 0) >= threshold('large_cumulative_tokens', 200000),
      },
      {
        key: 'cache-misses',
        label: 'Cache misses',
        description: 'Low cache-ratio calls grouped by cwd, model, and thread.',
        view: 'calls',
        sort: 'cache',
        direction: 'asc',
        caption: 'Cache misses preset',
        matches: row => Number(row.input_tokens || 0) > 0 && Number(row.cache_ratio || 0) < threshold('low_cache_ratio', 0.3),
      },
      {
        key: 'pricing-gaps',
        label: 'Pricing gaps',
        description: 'Unpriced usage that makes estimated cost totals incomplete.',
        view: 'calls',
        sort: 'total',
        direction: 'desc',
        pricingStatus: 'unpriced',
        caption: 'Pricing gaps preset',
        matches: row => !row.pricing_model,
      },
      {
        key: 'estimated-review',
        label: 'Estimated-price review',
        description: 'Usage priced with marked best-guess estimates.',
        view: 'calls',
        sort: 'cost',
        direction: 'desc',
        pricingStatus: 'estimated',
        caption: 'Estimated-price review preset',
        matches: row => Boolean(row.pricing_estimated),
      },
      {
        key: 'usage-credits',
        label: 'Highest Codex credits',
        description: 'Calls sorted by estimated impact on Codex usage allowance.',
        view: 'calls',
        sort: 'usage',
        direction: 'desc',
        caption: 'Highest Codex credits preset',
        matches: row => Number(row.usage_credits || 0) > 0,
      },
    ];
    function directional(compareResult) {
      return sortDirection === 'asc' ? compareResult : -compareResult;
    }
    function setSort(key, direction = null) {
      sortKey = key;
      sortDirection = direction || defaultSortDirection(key);
      sortEl.value = key;
      currentPage = 1;
      render();
    }
    function handleHeaderSort(key) {
      if (sortKey === key) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDirection = defaultSortDirection(key);
      }
      sortEl.value = key;
      currentPage = 1;
      render();
    }
    function updateSortControls() {
      sortEl.value = sortKey;
      document.querySelectorAll('[data-sort-header]').forEach(header => {
        const active = header.dataset.sortHeader === sortKey;
        header.dataset.sortActive = active ? 'true' : 'false';
        header.setAttribute('aria-sort', active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none');
      });
      document.querySelectorAll('[data-sort-indicator]').forEach(indicator => {
        indicator.textContent = indicator.dataset.sortIndicator === sortKey ? (sortDirection === 'asc' ? '▲' : '▼') : '';
      });
      tableCaptionEl.dataset.sortDescription = `${sortLabel(sortKey)} ${sortDirection === 'asc' ? 'ascending' : 'descending'}`;
    }
    function loadedRowsDescription() {
      const loaded = number.format(data.length);
      const available = number.format(totalAvailableRows || data.length);
      const capped = loadedLimit !== null && totalAvailableRows > data.length;
      return capped ? `${loaded} of ${available} calls loaded` : `${loaded} calls loaded`;
    }
    function loadedRowsCaveat(range) {
      if (loadedLimit === null || totalAvailableRows <= data.length) return '';
      const scope = range && (range.active || range.invalid) ? range.label : 'All time';
      return `${scope} totals are from loaded rows only (${loadedRowsDescription()}). Run ai-usage-dashboard serve-dashboard to load every call in range.`;
    }
    function historyRowsDescription() {
      const archived = Number(archivedAvailableRows || 0);
      if (includeArchived) {
        return archived
          ? `All history includes ${number.format(archived)} archived calls`
          : 'All history selected; no archived calls are indexed yet';
      }
      return archived
        ? `Active sessions only; ${number.format(archived)} archived calls hidden`
        : 'Active sessions only';
    }
    function updateHistoryScopeControl() {
      historyScopeEl.value = includeArchived ? 'all' : 'active';
      const detail = historyRowsDescription();
      historyScopeEl.title = detail;
      historyScopeEl.parentElement.title = `${detail}. All history is the default; Active sessions only hides archived rows.`;
    }
    function rebuildDashboardIndexes() {
      rowByRecordId = new Map(data.map(row => [row.record_id, row]));
      threadAttachmentByRecordId = new Map(data.map(row => [row.record_id, resolveThreadAttachment(row)]));
    }
    function effortDisplay(row) {
      if (row.effort) return row.effort;
      return row.source_provider === 'anthropic' ? 'n/a' : 'Unknown';
    }
    function usageCreditsWithStatus(row) {
      if (row.usage_credit_confidence === 'not_applicable') return 'Not applicable';
      const value = usageCreditValue(row);
      return value === null ? 'No mapped rate' : `${credits(value)} credits · ${usageCreditStatusText(row)}`;
    }
    function costUsageCell(costText, row) {
      const creditValue = usageCreditValue(row);
      if (row.usage_credit_confidence === 'not_applicable') {
        return `<span class="metric-stack"><span>${escapeHtml(costText)}</span></span>`;
      }
      const usage = creditValue === null || creditValue === undefined ? 'No credit rate' : `${credits(creditValue)} cr`;
      return `<span class="metric-stack"><span>${escapeHtml(costText)}</span><span class="metric-sub">${escapeHtml(usage)}</span></span>`;
    }
    function snapshotWindows(snapshot) {
      return snapshot && Array.isArray(snapshot.windows) ? snapshot.windows : [];
    }
    function providerLimitSnapshot(scope) {
      return (providerLimitSnapshots && providerLimitSnapshots[scope]) || {};
    }
    function limitWindowText(windows, totalCredits, mode = 'impact') {
      if (!windows.length) return '';
      const labels = windows.map(window => {
        const label = short(window.label || window.key, 'Window');
        const total = Number(window.total_credits || 0);
        const remainingCredits = window.remaining_credits === null || window.remaining_credits === undefined ? null : Number(window.remaining_credits);
        const remainingPercent = window.remaining_percent === null || window.remaining_percent === undefined ? null : Number(window.remaining_percent);
        if (mode === 'remaining-card' && remainingPercent !== null && Number.isFinite(remainingPercent)) {
          return `${label} ${pct(remainingPercent)}`;
        }
        if (mode === 'remaining-card' && remainingCredits !== null && Number.isFinite(remainingCredits)) {
          return `${label} ${credits(remainingCredits)} cr left`;
        }
        if (mode === 'impact' && total > 0) {
          return `${label} ${pct(totalCredits / total)} of allowance`;
        }
        if (mode === 'impact' && remainingCredits !== null && Number.isFinite(remainingCredits)) {
          return `${label} ${credits(totalCredits)} used vs ${credits(remainingCredits)} remaining`;
        }
        if (remainingPercent !== null && Number.isFinite(remainingPercent)) {
          return `${label} ${pct(remainingPercent)} remaining`;
        }
        if (remainingCredits !== null && Number.isFinite(remainingCredits)) {
          return `${label} ${credits(remainingCredits)} credits remaining`;
        }
        if (total > 0) {
          return `${label} ${credits(totalCredits)} of ${credits(total)} credits`;
        }
        return `${label} configured`;
      });
      return labels.join(mode === 'remaining-card' ? '\n' : ' · ');
    }
    function allowanceWindowText(totalCredits, mode = 'impact') {
      return limitWindowText(allowanceWindows, totalCredits, mode);
    }
    function limitWindowDisplayLabel(window) {
      return limitWindowDisplayLabels[window.key] || short(window.label || window.key, 'window');
    }
    function limitWindowDisplayValue(window) {
      const remainingPercent = window.remaining_percent === null || window.remaining_percent === undefined ? null : Number(window.remaining_percent);
      if (remainingPercent !== null && Number.isFinite(remainingPercent)) return pct(remainingPercent);
      const remainingCredits = window.remaining_credits === null || window.remaining_credits === undefined ? null : Number(window.remaining_credits);
      if (remainingCredits !== null && Number.isFinite(remainingCredits)) return `${credits(remainingCredits)} cr`;
      return 'configured';
    }
    function providerShortName(provider) {
      if (provider === 'openai') return 'Codex';
      if (provider === 'anthropic') return 'Claude';
      return providerTabLabel(provider);
    }
    function buildUsageLimits(rows) {
      if (!rows.length) return { state: 'no-data', lines: [] };
      const providers = [...new Set(rows.map(row => row.source_provider).filter(Boolean))].sort();
      const lines = providers.map(provider => {
        const snapshot = providerLimitSnapshot(provider);
        const windows = snapshotWindows(snapshot);
        return {
          provider,
          label: providerShortName(provider),
          configured: Boolean(snapshot.configured) && windows.length > 0,
          windows,
          source: snapshot.source || {},
          error: snapshot.error || '',
        };
      });
      if (!lines.some(line => line.configured)) return { state: 'no-snapshots', lines };
      return { state: 'lines', lines };
    }
    function usageLimitsCardText(limits) {
      if (limits.state === 'no-data') return 'No data in range';
      if (limits.state === 'no-snapshots') return 'No snapshots';
      const configured = limits.lines.filter(line => line.configured);
      if (configured.length === 1 && limits.lines.length === 1) {
        return configured[0].windows
          .map(window => `${limitWindowDisplayLabel(window)} ${limitWindowDisplayValue(window)}`)
          .join('\n');
      }
      return limits.lines
        .map(line => {
          if (!line.configured) return `${line.label} no snapshot`;
          const windows = line.windows
            .map(window => `${limitWindowDisplayLabel(window)} ${limitWindowDisplayValue(window)}`)
            .join(' · ');
          return `${line.label} ${windows}`;
        })
        .join('\n');
    }
    function limitSnapshotStaleNote(source) {
      const captured = source && source.captured_at ? Date.parse(source.captured_at) : NaN;
      if (!Number.isFinite(captured)) return '';
      if (Date.now() - captured <= limitStaleAfterMs) return '';
      return ` (captured ${formatTimestamp(source.captured_at, source.captured_at)} — may be stale)`;
    }
    function usageLimitsCardTitle(limits) {
      if (limits.state === 'no-data') return 'No calls in the current filter range.';
      if (limits.state === 'no-snapshots' && !limits.lines.length) {
        return 'No provider limit snapshots are available for the visible rows.';
      }
      const parts = limits.lines.map(line => {
        if (!line.configured) {
          const hint = limitSetupHints[line.provider] || 'No limit snapshot available.';
          return line.error ? `${line.label}: limit snapshot error: ${line.error}` : `${line.label}: ${hint}`;
        }
        const resets = line.windows
          .filter(window => window.reset_at)
          .map(window => `${limitWindowDisplayLabel(window)} resets ${formatTimestamp(window.reset_at, window.reset_at)}`)
          .join(', ');
        const sourceName = line.source.name ? `Source: ${line.source.name}.` : '';
        return [`${line.label}: remaining capacity.`, resets ? `${resets}.` : '', sourceName, limitSnapshotStaleNote(line.source)]
          .filter(Boolean)
          .join(' ');
      });
      return parts.join(' ');
    }
    function buildUniversalSummary(rows) {
      const sum = field => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
      const cacheReadTokens = sum('cached_input_tokens');
      const cacheCreationTokens = sum('cache_creation_input_tokens');
      return {
        visibleCalls: rows.length,
        totalTokens: sum('total_tokens'),
        inputTokens: sum('uncached_input_tokens'),
        cacheTokens: cacheReadTokens + cacheCreationTokens,
        cacheReadTokens,
        cacheCreationTokens,
        outputTokens: sum('output_tokens'),
        reasoningTokens: sum('reasoning_output_tokens'),
        estimatedCost: sum('estimated_cost_usd'),
        usageCredits: sumUsageCredits(rows),
        usageLimits: buildUsageLimits(rows),
      };
    }
    function rowAllowanceImpact(row) {
      if (row.usage_credit_confidence === 'not_applicable') return 'Codex credit rates do not apply to this source.';
      const value = usageCreditValue(row);
      if (value === null) return 'No mapped Codex credit rate';
      const impact = allowanceWindowText(value, 'impact');
      return impact || `${credits(value)} credits counted toward Codex usage limits`;
    }
    function providerTabLabel(provider) {
      if (provider === 'openai') return sourceCatalogHas('openai', 'codex') ? 'Codex' : 'OpenAI';
      if (provider === 'anthropic') return sourceCatalogHas('anthropic', 'claude-code') ? 'Claude Code' : 'Anthropic';
      return provider ? provider.split(/[-_]/).map(part => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join(' ') : 'Overview';
    }
    function sourceCatalogRows() {
      return sourceSummaries.length ? sourceSummaries : data;
    }
    function sourceCatalogValues(field) {
      return sourceCatalogRows().map(row => row[field]).filter(Boolean);
    }
    function sourceCatalogHas(provider, app = '') {
      return sourceCatalogRows().some(row => row.source_provider === provider && (!app || row.source_app === app));
    }
    function availableProviders() {
      return [...new Set(sourceCatalogValues('source_provider'))].sort();
    }
    function explicitProviderScope() {
      if (providerEl.value) return providerEl.value;
      if (appEl.value) {
        const providerFromApp = [...new Set(sourceCatalogRows().filter(row => row.source_app === appEl.value).map(row => row.source_provider).filter(Boolean))];
        if (providerFromApp.length === 1) return providerFromApp[0];
      }
      return '';
    }
    function inferredProviderScope(rows = []) {
      const explicit = explicitProviderScope();
      if (explicit) return explicit;
      const providers = [...new Set(rows.map(row => row.source_provider).filter(Boolean))];
      return providers.length === 1 ? providers[0] : '';
    }
    function currentProviderProfile(rows = []) {
      const scope = inferredProviderScope(rows);
      if (scope === 'openai') return { scope, ...providerProfiles.openai };
      if (scope === 'anthropic') return { scope, ...providerProfiles.anthropic };
      return { scope: '', ...providerProfiles.overview };
    }
    function renderProviderTabs() {
      const tabs = [{ key: '', label: 'Overview' }, ...availableProviders().map(provider => ({ key: provider, label: providerTabLabel(provider) }))];
      const selected = explicitProviderScope();
      providerTabsEl.innerHTML = tabs.map(tab => `
        <button type="button" data-provider-tab="${escapeHtml(tab.key)}" aria-pressed="${tab.key === selected ? 'true' : 'false'}">${escapeHtml(tab.label)}</button>
      `).join('');
      document.body.dataset.provider = selected || 'overview';
      providerTabsEl.querySelectorAll('[data-provider-tab]').forEach(button => {
        button.addEventListener('click', () => {
          const nextProvider = button.dataset.providerTab || '';
          providerEl.value = nextProvider;
          if (!nextProvider) {
            appEl.value = '';
          } else if (appEl.value && !sourceCatalogHas(nextProvider, appEl.value)) {
            appEl.value = '';
          }
          activePreset = '';
          currentPage = 1;
          render();
        });
      });
    }
    function updateSummaryCards(rows, summary) {
      totalTokensEl.textContent = number.format(summary.totalTokens);
      totalTokensCardEl.title = 'Provider-reported total tokens; depending on the source this includes cache reads and cache writes.';
      inputTokensEl.textContent = number.format(summary.inputTokens);
      inputTokensCardEl.title = 'Fresh input tokens that were not served from cache — the best cross-provider approximation. Raw provider input buckets stay in Call Details.';
      cacheTokensEl.textContent = number.format(summary.cacheTokens);
      cacheTokensCardEl.title = summary.cacheCreationTokens > 0
        ? `Cache activity for the visible rows. Cache read: ${number.format(summary.cacheReadTokens)}. Cache creation: ${number.format(summary.cacheCreationTokens)}.`
        : `Cache activity for the visible rows. Cache read: ${number.format(summary.cacheReadTokens)}.`;
      outputTokensEl.textContent = number.format(summary.outputTokens);
      outputTokensCardEl.title = 'Output tokens generated for the visible rows.';
      reasoningTokensEl.textContent = number.format(summary.reasoningTokens);
      reasoningTokensCardEl.title = summary.reasoningTokens > 0
        ? 'Reasoning or thinking output tokens reported by the visible sources.'
        : 'The visible providers did not report a stable reasoning-token bucket for these rows.';
      estimatedCostEl.textContent = pricingConfigured ? money(summary.estimatedCost) : 'Not configured';
      usageLimitsEl.textContent = usageLimitsCardText(summary.usageLimits);
      usageLimitsCardEl.title = usageLimitsCardTitle(summary.usageLimits);
      if (insightsCaptionEl) insightsCaptionEl.textContent = currentProviderProfile(rows).insightsCaption;
    }
    function buildProviderDetails(rows, summary) {
      const groups = [];
      const visibleProviders = new Set(rows.map(row => row.source_provider).filter(Boolean));
      if (visibleProviders.has('openai')) {
        const items = [];
        items.push(['Codex credits', `${credits(summary.usageCredits)} credits across visible rows`]);
        items.push(['Credit coverage', `${pct(creditCoverageRatio(rows))} of visible tokens map to Codex credit rates`]);
        if (allowanceSource.name) {
          const fetched = allowanceSource.fetched_at ? ` (snapshot ${formatTimestamp(allowanceSource.fetched_at, allowanceSource.fetched_at)})` : '';
          items.push(['Credit rates', `${allowanceSource.name}${fetched}`]);
        }
        const impact = allowanceWindowText(summary.usageCredits, 'impact');
        if (impact) items.push(['Allowance impact', impact]);
        const resets = allowanceWindows
          .filter(window => window.reset_at)
          .map(window => `${limitWindowDisplayLabel(window)} ${formatTimestamp(window.reset_at, window.reset_at)}`)
          .join(' · ');
        if (resets) items.push(['Allowance resets', resets]);
        if (allowanceError) items.push(['Allowance error', allowanceError]);
        if (rateCardError) items.push(['Rate-card error', rateCardError]);
        pushLimitAnalyticsItems(items, 'openai');
        const notApplicable = rows.filter(row => row.usage_credit_confidence === 'not_applicable').length;
        if (notApplicable && visibleProviders.size > 1) {
          items.push(['Not applicable', `${number.format(notApplicable)} visible rows are outside Codex credit rates`]);
        }
        groups.push({ provider: 'openai', label: providerTabLabel('openai'), items });
      }
      if (visibleProviders.has('anthropic')) {
        const items = [];
        const snapshot = providerLimitSnapshot('anthropic');
        const windows = snapshotWindows(snapshot);
        const source = snapshot.source || {};
        if (windows.length) {
          if (source.name) {
            const captured = source.captured_at ? ` (captured ${formatTimestamp(source.captured_at, source.captured_at)})` : '';
            items.push(['Limit snapshot', `${source.name}${captured}`]);
          }
          const resets = windows
            .filter(window => window.reset_at)
            .map(window => `${limitWindowDisplayLabel(window)} ${formatTimestamp(window.reset_at, window.reset_at)}`)
            .join(' · ');
          if (resets) items.push(['Limit resets', resets]);
        } else {
          items.push(['Limit snapshot', limitSetupHints.anthropic]);
        }
        if (snapshot.error) items.push(['Snapshot error', snapshot.error]);
        pushLimitAnalyticsItems(items, 'anthropic');
        groups.push({ provider: 'anthropic', label: providerTabLabel('anthropic'), items });
      }
      const globalItems = [];
      if (!pricingConfigured) {
        globalItems.push(['Pricing', 'Not configured. Run ai-usage-dashboard update-pricing to estimate costs.']);
      } else if (pricingSnapshotWarning) {
        globalItems.push(['Pricing', pricingSnapshotWarning]);
      }
      if (globalItems.length) {
        groups.push({ provider: '', label: 'Pricing', items: globalItems });
      }
      return groups.filter(group => group.items.length);
    }
    function renderProviderDetails(rows, summary) {
      const groups = buildProviderDetails(rows, summary);
      if (!groups.length) {
        providerDetailsEl.hidden = true;
        providerDetailGroupsEl.innerHTML = '';
        return;
      }
      providerDetailsEl.hidden = false;
      providerDetailGroupsEl.innerHTML = groups.map(group => `
        <div class="provider-detail-group" data-provider="${escapeHtml(group.provider)}">
          <h3>${escapeHtml(group.label)}</h3>
          <dl class="provider-detail-kv">
            ${group.items.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}
          </dl>
        </div>
      `).join('');
    }
    function previousPeriodRange(range) {
      if (!range || !range.active || range.invalid || !range.start || !range.endExclusive) return null;
      const endMs = Math.min(range.endExclusive.getTime(), Date.now());
      const spanMs = endMs - range.start.getTime();
      if (spanMs <= 0) return null;
      return {
        active: true,
        invalid: false,
        start: new Date(range.start.getTime() - spanMs),
        endExclusive: range.start,
        label: 'Prior period',
      };
    }
    function deltaDisplay(current, previous) {
      const cur = Number(current) || 0;
      const prev = Number(previous) || 0;
      if (!cur && !prev) return null;
      if (!prev) return { text: 'new', trend: 'up' };
      const change = (cur - prev) / prev;
      const magnitude = Math.abs(change * 100);
      const trend = magnitude < 0.5 ? 'flat' : change > 0 ? 'up' : 'down';
      const formatted = magnitude >= 100 ? number.format(Math.round(magnitude)) : magnitude.toFixed(1);
      return { text: `${change >= 0 ? '+' : '-'}${formatted}%`, trend };
    }
    function updateCardDeltas(summary, previousSummary) {
      const fields = [
        ['visibleCalls', value => number.format(value)],
        ['totalTokens', value => number.format(value)],
        ['inputTokens', value => number.format(value)],
        ['cacheTokens', value => number.format(value)],
        ['outputTokens', value => number.format(value)],
        ['reasoningTokens', value => number.format(value)],
        ['estimatedCost', value => money(value)],
      ];
      fields.forEach(([key, formatValue]) => {
        const el = document.getElementById(`${key}Delta`);
        if (!el) return;
        const info = previousSummary ? deltaDisplay(summary[key], previousSummary[key]) : null;
        if (!info) {
          el.hidden = true;
          el.textContent = '';
          el.removeAttribute('data-trend');
          el.title = '';
          return;
        }
        el.hidden = false;
        el.textContent = `${info.text} vs prior`;
        el.dataset.trend = info.trend;
        el.title = `Preceding equal-length period: ${formatValue(previousSummary[key])}. Computed from loaded rows.`;
      });
    }
    const trendHourFormat = new Intl.DateTimeFormat([], { hour: 'numeric' });
    const trendHourDateFormat = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric', hour: 'numeric' });
    const trendDayFormat = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' });
    const trendMonthFormat = new Intl.DateTimeFormat([], { month: 'short', year: 'numeric' });
    const trendProviderOrder = ['openai', 'anthropic', 'other'];
    const dailyTrendPresets = new Set(['this-week', 'last-7-days']);
    function trendProviderKey(row) {
      if (row.source_provider === 'openai') return 'openai';
      if (row.source_provider === 'anthropic') return 'anthropic';
      return 'other';
    }
    function trendProviderLabel(key) {
      if (key === 'openai') return providerShortName('openai');
      if (key === 'anthropic') return providerShortName('anthropic');
      return 'Other';
    }
    function trendUnitFor(startMs, endMs, preset = '') {
      const spanDays = (endMs - startMs) / 86400000;
      if (dailyTrendPresets.has(preset)) return 'day';
      if (spanDays <= 3.05) return 'hour';
      if (spanDays <= 130) return 'day';
      if (spanDays <= 740) return 'week';
      return 'month';
    }
    function trendBucketDate(date, unit) {
      if (unit === 'hour') return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
      if (unit === 'week') return weekStart(localDay(date));
      if (unit === 'month') return new Date(date.getFullYear(), date.getMonth(), 1);
      return localDay(date);
    }
    function nextTrendBucket(date, unit) {
      if (unit === 'hour') return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() + 1);
      if (unit === 'week') return addDays(date, 7);
      if (unit === 'month') return new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return addDays(date, 1);
    }
    function trendBucketLabel(ms, unit, showDateForHour = false) {
      const date = new Date(ms);
      if (unit === 'hour') return showDateForHour ? trendHourDateFormat.format(date) : trendHourFormat.format(date);
      if (unit === 'month') return trendMonthFormat.format(date);
      return trendDayFormat.format(date);
    }
    function trendValueText(value) {
      return trendMetric === 'cost' ? money(value) : compact(value);
    }
    function buildUsageTrend(rows, dateRange) {
      const metricValue = trendMetric === 'cost'
        ? row => Number(row.estimated_cost_usd || 0)
        : row => Number(row.total_tokens || 0);
      const stamps = [];
      for (const row of rows) {
        const ts = row.event_timestamp ? new Date(row.event_timestamp) : null;
        if (ts && !Number.isNaN(ts.getTime())) stamps.push({ ts, row });
      }
      if (!stamps.length) return null;
      const nowMs = Date.now();
      let startMs = dateRange && dateRange.active && !dateRange.invalid && dateRange.start
        ? dateRange.start.getTime()
        : Math.min(...stamps.map(stamp => stamp.ts.getTime()));
      let endMs = dateRange && dateRange.active && !dateRange.invalid && dateRange.endExclusive
        ? Math.min(dateRange.endExclusive.getTime(), nowMs + 3600000)
        : Math.max(...stamps.map(stamp => stamp.ts.getTime())) + 1;
      if (endMs <= startMs) endMs = startMs + 1;
      const preset = allowedDatePresets.has(datePresetEl.value) ? datePresetEl.value : 'all';
      const unit = trendUnitFor(startMs, endMs, preset);
      const showDateForHour = unit === 'hour'
        && localDateKey(new Date(startMs)) !== localDateKey(new Date(Math.max(startMs, endMs - 1)));
      const buckets = new Map();
      let cursor = trendBucketDate(new Date(startMs), unit);
      let guard = 0;
      while (cursor.getTime() < endMs && guard < 400) {
        buckets.set(cursor.getTime(), { openai: 0, anthropic: 0, other: 0 });
        cursor = nextTrendBucket(cursor, unit);
        guard += 1;
      }
      const seenProviders = new Set();
      for (const stamp of stamps) {
        const key = trendBucketDate(stamp.ts, unit).getTime();
        const bucket = buckets.get(key);
        if (!bucket) continue;
        const provider = trendProviderKey(stamp.row);
        bucket[provider] += metricValue(stamp.row);
        seenProviders.add(provider);
      }
      const ordered = [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([ms, sums]) => ({ ms, ...sums, total: sums.openai + sums.anthropic + sums.other }));
      return {
        unit,
        buckets: ordered,
        providers: trendProviderOrder.filter(provider => seenProviders.has(provider)),
        showDateForHour,
      };
    }
    function renderUsageTrend(rows, dateRange) {
      const trend = buildUsageTrend(rows, dateRange);
      if (!trend || !trend.buckets.length || !trend.buckets.some(bucket => bucket.total > 0)) {
        usageTrendEl.innerHTML = '<p class="trend-empty">No usage in range to chart.</p>';
        return;
      }
      const width = 960;
      const height = 180;
      const padTop = 16;
      const padBottom = 24;
      const padX = 8;
      const innerHeight = height - padTop - padBottom;
      const max = Math.max(...trend.buckets.map(bucket => bucket.total));
      const count = trend.buckets.length;
      const slot = (width - padX * 2) / count;
      const barWidth = Math.max(Math.min(slot * 0.72, 48), 1.5);
      const bars = trend.buckets.map((bucket, index) => {
        const x = padX + index * slot + (slot - barWidth) / 2;
        const bucketLabel = trendBucketLabel(bucket.ms, trend.unit, trend.showDateForHour);
        let y = height - padBottom;
        const segments = trendProviderOrder.map(provider => {
          const value = bucket[provider];
          if (!value) return '';
          const segHeight = Math.max((value / max) * innerHeight, 0.5);
          y -= segHeight;
          const segmentTooltip = `${bucketLabel} · ${trendProviderLabel(provider)}: ${trendValueText(value)} (${pct(value / bucket.total)} of ${trendValueText(bucket.total)})`;
          return `<rect data-provider="${provider}" data-tooltip="${escapeHtml(segmentTooltip)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${segHeight.toFixed(2)}"></rect>`;
        }).join('');
        const tooltip = [
          `${bucketLabel}: ${trendValueText(bucket.total)}`,
          ...trendProviderOrder
            .filter(provider => bucket[provider] > 0)
            .map(provider => `${trendProviderLabel(provider)} ${trendValueText(bucket[provider])}`),
        ].join(' · ');
        return `<g class="trend-bar" tabindex="0" role="img" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}">${segments}</g>`;
      }).join('');
      const labelIndexes = count <= 2 ? [...trend.buckets.keys()] : [0, Math.floor((count - 1) / 2), count - 1];
      const labels = [...new Set(labelIndexes)].map(index => {
        const anchor = index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle';
        const x = padX + index * slot + slot / 2;
        return `<text x="${x.toFixed(2)}" y="${height - 7}" text-anchor="${anchor}">${escapeHtml(trendBucketLabel(trend.buckets[index].ms, trend.unit, trend.showDateForHour))}</text>`;
      }).join('');
      const midY = padTop + innerHeight / 2;
      const legend = trend.providers.map(provider => `
        <span class="trend-legend-item"><span class="trend-swatch" data-provider="${provider}"></span>${escapeHtml(trendProviderLabel(provider))}</span>
      `).join('');
      const unitNoun = { hour: 'hourly', day: 'daily', week: 'weekly', month: 'monthly' }[trend.unit] || trend.unit;
      usageTrendEl.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${unitNoun} ${trendMetric === 'cost' ? 'estimated cost' : 'total tokens'}; peak ${trendValueText(max)}`)}">
          <line class="trend-grid" x1="${padX}" y1="${midY.toFixed(2)}" x2="${width - padX}" y2="${midY.toFixed(2)}"></line>
          <line class="trend-grid" x1="${padX}" y1="${padTop}" x2="${width - padX}" y2="${padTop}"></line>
          <text x="${padX}" y="${padTop - 5}">${escapeHtml(trendValueText(max))}</text>
          ${bars}
          ${labels}
        </svg>
        <div class="trend-legend">${legend}</div>
      `;
    }
    const limitWindowDurations = { five_hour: 5 * 3600000, weekly: 7 * 86400000 };
    function limitHistorySeries(provider, windowKey) {
      const samples = [];
      for (const entry of providerLimitHistory) {
        if (entry.provider !== provider) continue;
        const t = Date.parse(entry.captured_at || '');
        if (!Number.isFinite(t)) continue;
        const windows = Array.isArray(entry.windows) ? entry.windows : [];
        const window = windows.find(candidate => candidate && candidate.key === windowKey);
        if (!window) continue;
        const remaining = Number(window.remaining_percent);
        if (!Number.isFinite(remaining)) continue;
        samples.push({ t, pct: remaining, resetAt: window.reset_at || '' });
      }
      samples.sort((a, b) => a.t - b.t);
      return samples;
    }
    function currentWindowSegment(samples) {
      if (!samples.length) return [];
      let start = samples.length - 1;
      while (start > 0) {
        const earlier = samples[start - 1];
        const later = samples[start];
        if (earlier.resetAt && later.resetAt && earlier.resetAt !== later.resetAt) break;
        if (earlier.pct < later.pct - 0.02) break;
        start -= 1;
      }
      return samples.slice(start);
    }
    function limitForecast(segment, resetAtMs) {
      if (segment.length < 2) return null;
      const first = segment[0];
      const last = segment[segment.length - 1];
      const spanMs = last.t - first.t;
      if (spanMs < 10 * 60 * 1000) return null;
      const drop = first.pct - last.pct;
      if (drop < 0.005) return { state: 'idle' };
      const ratePerMs = drop / spanMs;
      const etaMs = last.t + last.pct / ratePerMs;
      if (Number.isFinite(resetAtMs) && etaMs >= resetAtMs) return { state: 'safe', etaMs };
      return { state: 'exhausts', etaMs };
    }
    function humanizeDuration(ms) {
      if (!(ms > 0)) return 'now';
      const minutes = ms / 60000;
      if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
      const hours = minutes / 60;
      if (hours < 48) return `${hours.toFixed(1)}h`;
      return `${(hours / 24).toFixed(1)}d`;
    }
    function limitForecastText(forecast) {
      if (!forecast) return '';
      if (forecast.state === 'idle') return 'no recent burn';
      if (forecast.state === 'safe') return 'resets before exhaustion at current pace';
      return `~${humanizeDuration(forecast.etaMs - Date.now())} to exhaustion at current pace`;
    }
    function windowAttributionText(provider, window) {
      const duration = limitWindowDurations[window.key];
      const resetMs = window.reset_at ? Date.parse(window.reset_at) : NaN;
      if (!duration || !Number.isFinite(resetMs)) return '';
      const startMs = resetMs - duration;
      const endMs = Math.min(resetMs, Date.now());
      const totals = new Map();
      let total = 0;
      for (const row of data) {
        if (row.source_provider !== provider) continue;
        const t = Date.parse(row.event_timestamp || '');
        if (!Number.isFinite(t) || t < startMs || t > endMs) continue;
        const tokens = Number(row.total_tokens || 0);
        total += tokens;
        const key = row.project_name || 'Unknown project';
        totals.set(key, (totals.get(key) || 0) + tokens);
      }
      if (!total) return '';
      return [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([project, tokens]) => `${truncate(project, 24)} ${pct(tokens / total)}`)
        .join(' · ');
    }
    function pushLimitAnalyticsItems(items, provider) {
      const snapshot = providerLimitSnapshot(provider);
      for (const window of snapshotWindows(snapshot)) {
        const label = limitWindowDisplayLabel(window);
        const segment = currentWindowSegment(limitHistorySeries(provider, window.key));
        const resetAtMs = window.reset_at ? Date.parse(window.reset_at) : NaN;
        const forecastText = limitForecastText(limitForecast(segment, resetAtMs));
        if (forecastText) items.push([`${label} pace`, forecastText]);
        const drivers = windowAttributionText(provider, window);
        if (drivers) items.push([`${label} window drivers`, `${drivers} (from loaded rows)`]);
      }
    }
    function burndownSparkline(segment) {
      const width = 120;
      const height = 28;
      const first = segment[0];
      const last = segment[segment.length - 1];
      const span = Math.max(last.t - first.t, 1);
      const points = segment.map(sample => {
        const x = 4 + ((sample.t - first.t) / span) * (width - 8);
        const y = height - 4 - clamp(sample.pct, 0, 1) * (height - 8);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      return `
        <svg class="burn-spark" viewBox="0 0 ${width} ${height}" aria-hidden="true">
          <polyline class="burn-line" points="${points}"></polyline>
        </svg>
      `;
    }
    function renderLimitBurndown() {
      const seriesList = [];
      for (const provider of ['openai', 'anthropic']) {
        const snapshot = providerLimitSnapshot(provider);
        for (const window of snapshotWindows(snapshot)) {
          const segment = currentWindowSegment(limitHistorySeries(provider, window.key));
          if (segment.length < 2) continue;
          const resetAtMs = window.reset_at ? Date.parse(window.reset_at) : NaN;
          seriesList.push({
            provider,
            window,
            segment,
            forecast: limitForecast(segment, resetAtMs),
          });
        }
      }
      if (!seriesList.length) {
        limitBurndownBlockEl.hidden = true;
        limitBurndownEl.innerHTML = '';
        return;
      }
      limitBurndownBlockEl.hidden = false;
      limitBurndownEl.innerHTML = seriesList.map(series => {
        const label = `${providerShortName(series.provider)} ${limitWindowDisplayLabel(series.window)}`;
        const current = limitWindowDisplayValue(series.window);
        const forecastText = limitForecastText(series.forecast);
        const sampleNote = `${number.format(series.segment.length)} snapshots this window`;
        return `
          <div class="burn-row" title="${escapeHtml(`${label}: ${sampleNote}.`)}">
            <span class="burn-label">${escapeHtml(label)}</span>
            ${burndownSparkline(series.segment)}
            <span class="burn-value">${escapeHtml(current)}</span>
            <span class="burn-forecast">${escapeHtml(forecastText || sampleNote)}</span>
          </div>
        `;
      }).join('');
    }
    function hideTrendTooltip() {
      trendTooltipEl.hidden = true;
      trendTooltipEl.textContent = '';
    }
    function showTrendTooltip(bar, clientX, clientY) {
      const text = bar.dataset.tooltip || '';
      if (!text) {
        hideTrendTooltip();
        return;
      }
      trendTooltipEl.textContent = text;
      trendTooltipEl.hidden = false;
      const wrap = trendTooltipEl.parentElement;
      const wrapRect = wrap.getBoundingClientRect();
      let x;
      let y;
      if (clientX === undefined || clientY === undefined) {
        const barRect = bar.getBoundingClientRect();
        x = barRect.left + barRect.width / 2 - wrapRect.left;
        y = barRect.top - wrapRect.top;
      } else {
        x = clientX - wrapRect.left;
        y = clientY - wrapRect.top;
      }
      const tipRect = trendTooltipEl.getBoundingClientRect();
      const left = clamp(x + 12, 0, Math.max(wrapRect.width - tipRect.width - 4, 0));
      const top = Math.max(y - tipRect.height - 10, 0);
      trendTooltipEl.style.left = `${Math.round(left)}px`;
      trendTooltipEl.style.top = `${Math.round(top)}px`;
    }
    usageTrendEl.addEventListener('mousemove', event => {
      const segment = event.target.closest('[data-tooltip]');
      if (!segment || !usageTrendEl.contains(segment)) {
        hideTrendTooltip();
        return;
      }
      showTrendTooltip(segment, event.clientX, event.clientY);
    });
    usageTrendEl.addEventListener('mouseleave', hideTrendTooltip);
    usageTrendEl.addEventListener('focusin', event => {
      const bar = event.target.closest('.trend-bar');
      if (bar) showTrendTooltip(bar);
    });
    usageTrendEl.addEventListener('focusout', hideTrendTooltip);
    function buildEffortBreakdown(rows) {
      const map = new Map();
      for (const row of rows) {
        if (!row.effort) continue;
        if (!map.has(row.effort)) {
          map.set(row.effort, { effort: row.effort, calls: 0, tokens: 0, cost: 0, outputTokens: 0, reasoningTokens: 0 });
        }
        const entry = map.get(row.effort);
        entry.calls += 1;
        entry.tokens += Number(row.total_tokens || 0);
        entry.cost += Number(row.estimated_cost_usd || 0);
        entry.outputTokens += Number(row.output_tokens || 0);
        entry.reasoningTokens += Number(row.reasoning_output_tokens || 0);
      }
      return [...map.values()].sort((a, b) => b.tokens - a.tokens);
    }
    function renderEffortBreakdown(rows) {
      const entries = buildEffortBreakdown(rows);
      if (!entries.length) {
        effortBreakdownBlockEl.hidden = true;
        effortBreakdownEl.innerHTML = '';
        return;
      }
      effortBreakdownBlockEl.hidden = false;
      const withEffort = entries.reduce((sum, entry) => sum + entry.calls, 0);
      const coverageNote = withEffort < rows.length
        ? `<p class="analytics-note">${number.format(withEffort)} of ${number.format(rows.length)} visible calls have a recorded effort.</p>`
        : '';
      effortBreakdownEl.innerHTML = `
        <table class="analytics-table">
          <thead><tr><th>Effort</th><th class="num">Calls</th><th class="num">Tokens</th><th class="num">Cost</th><th class="num">Reasoning share</th></tr></thead>
          <tbody>
            ${entries.map(entry => `
              <tr>
                <td>${escapeHtml(entry.effort)}</td>
                <td class="num">${number.format(entry.calls)}</td>
                <td class="num" title="${escapeHtml(number.format(entry.tokens))}">${escapeHtml(compact(entry.tokens))}</td>
                <td class="num">${pricingConfigured ? escapeHtml(money(entry.cost)) : 'n/a'}</td>
                <td class="num">${entry.outputTokens > 0 ? escapeHtml(pct(entry.reasoningTokens / entry.outputTokens)) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${coverageNote}
      `;
    }
    function buildProjectLeaderboard(rows, previousRows) {
      const groupKey = row => row.project_name || 'Unknown project';
      const totals = new Map();
      for (const row of rows) {
        const key = groupKey(row);
        if (!totals.has(key)) totals.set(key, { project: key, calls: 0, tokens: 0, cost: 0 });
        const entry = totals.get(key);
        entry.calls += 1;
        entry.tokens += Number(row.total_tokens || 0);
        entry.cost += Number(row.estimated_cost_usd || 0);
      }
      const previousTokens = new Map();
      if (previousRows) {
        for (const row of previousRows) {
          const key = groupKey(row);
          previousTokens.set(key, (previousTokens.get(key) || 0) + Number(row.total_tokens || 0));
        }
      }
      return [...totals.values()]
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 6)
        .map(entry => ({
          ...entry,
          delta: previousRows ? deltaDisplay(entry.tokens, previousTokens.get(entry.project) || 0) : null,
        }));
    }
    function renderProjectLeaderboard(rows, previousRows) {
      const entries = buildProjectLeaderboard(rows, previousRows);
      if (!entries.length) {
        projectLeaderboardBlockEl.hidden = true;
        projectLeaderboardEl.innerHTML = '';
        return;
      }
      projectLeaderboardBlockEl.hidden = false;
      const showTrend = Boolean(previousRows);
      projectLeaderboardEl.innerHTML = `
        <table class="analytics-table">
          <thead><tr><th>Project</th><th class="num">Calls</th><th class="num">Tokens</th><th class="num">Cost</th>${showTrend ? '<th class="num">Trend</th>' : ''}</tr></thead>
          <tbody>
            ${entries.map(entry => `
              <tr>
                <td title="${escapeHtml(entry.project)}">${escapeHtml(truncate(entry.project, 36))}</td>
                <td class="num">${number.format(entry.calls)}</td>
                <td class="num" title="${escapeHtml(number.format(entry.tokens))}">${escapeHtml(compact(entry.tokens))}</td>
                <td class="num">${pricingConfigured ? escapeHtml(money(entry.cost)) : 'n/a'}</td>
                ${showTrend ? `<td class="num"><span class="analytics-trend" data-trend="${entry.delta ? escapeHtml(entry.delta.trend) : 'flat'}">${entry.delta ? escapeHtml(entry.delta.text) : '-'}</span></td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${showTrend ? '<p class="analytics-note">Trend compares token volume with the preceding equal-length period.</p>' : ''}
      `;
    }
    function renderUsageAnalytics(rows, dateRange, previousRows) {
      if (!rows.length) {
        usageAnalyticsEl.hidden = true;
        return;
      }
      usageAnalyticsEl.hidden = false;
      trendMetricTokensEl.setAttribute('aria-pressed', trendMetric === 'tokens' ? 'true' : 'false');
      trendMetricCostEl.setAttribute('aria-pressed', trendMetric === 'cost' ? 'true' : 'false');
      trendMetricCostEl.disabled = !pricingConfigured;
      trendMetricCostEl.title = pricingConfigured ? '' : 'Run ai-usage-dashboard update-pricing to chart estimated cost.';
      renderUsageTrend(rows, dateRange);
      renderEffortBreakdown(rows);
      renderProjectLeaderboard(rows, previousRows);
      renderLimitBurndown();
    }
    function rebuildSelectOptions(select, values, label) {
      const previous = select.value;
      select.textContent = '';
      const allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = label;
      select.appendChild(allOption);
      [...new Set(values.filter(Boolean))].sort().forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
      const valuesSet = new Set(Array.from(select.options).map(option => option.value));
      select.value = valuesSet.has(previous) ? previous : '';
    }
    function rebuildFilterOptions() {
      rebuildSelectOptions(modelEl, data.map(row => row.model), 'All models');
      rebuildSelectOptions(providerEl, sourceCatalogValues('source_provider'), 'All providers');
      rebuildSelectOptions(appEl, sourceCatalogValues('source_app'), 'All apps');
      rebuildSelectOptions(effortEl, data.map(row => row.effort), 'All efforts');
    }
    function applyInitialState() {
      if (!initialState) return;
      searchEl.value = initialState.search || '';
      if (optionValueExists(modelEl, initialState.model)) modelEl.value = initialState.model;
      if (optionValueExists(providerEl, initialState.sourceProvider)) providerEl.value = initialState.sourceProvider;
      if (optionValueExists(appEl, initialState.sourceApp)) appEl.value = initialState.sourceApp;
      if (optionValueExists(effortEl, initialState.effort)) effortEl.value = initialState.effort;
      if (optionValueExists(pricingStatusEl, initialState.confidence)) pricingStatusEl.value = initialState.confidence;
      if (optionValueExists(threadScopeEl, initialState.threadScope)) threadScopeEl.value = initialState.threadScope;
      const initialDatePreset = allowedDatePresets.has(initialState.datePreset) ? initialState.datePreset : '';
      const initialDateStart = cleanDateInput(initialState.dateStart);
      const initialDateEnd = cleanDateInput(initialState.dateEnd);
      if (initialDatePreset && initialDatePreset !== 'custom' && initialDatePreset !== 'all') {
        datePresetEl.value = initialDatePreset;
        syncDatePresetInputs();
      } else if (initialDateStart || initialDateEnd) {
        datePresetEl.value = 'custom';
        dateStartEl.value = initialDateStart;
        dateEndEl.value = initialDateEnd;
      } else if (initialDatePreset) {
        datePresetEl.value = initialDatePreset;
      }
      if (optionValueExists(sortEl, initialState.sort)) {
        sortKey = initialState.sort;
        sortEl.value = sortKey;
      }
      if (['asc', 'desc'].includes(initialState.direction)) sortDirection = initialState.direction;
      if (presetDefinitions.some(preset => preset.key === initialState.preset)) activePreset = initialState.preset;
      if (initialState.page && Number(initialState.page) > 1) currentPage = Number(initialState.page);
      if (Array.isArray(initialState.expandedThreads)) {
        initialState.expandedThreads.forEach(key => expandedThreads.add(key));
      }
      if (initialState.expandedThreads && initialState.expandedThreads.length) {
        initialThreadExpansionApplied = true;
      }
    }
    function updatePricingSourceLine() {
      const sourceEl = document.getElementById('pricingSource');
      const pricingSources = Array.isArray(pricingSource.sources) ? pricingSource.sources : [];
      const sourceLabels = pricingSources.map(source => {
        const name = source && source.name ? source.name : '';
        const url = source && source.url ? source.url : '';
        return name && url ? `${name}: ${url}` : name || url;
      }).filter(Boolean);
      if (pricingConfigured && (pricingSource.url || sourceLabels.length)) {
        const sourceParts = [
          pricingSource.name || 'Pricing source',
          pricingSource.tier ? `${pricingSource.tier} tier` : '',
          pricingSource.fetched_at ? `fetched ${formatTimestamp(pricingSource.fetched_at)}` : '',
          pricingSource.pinned ? 'pinned snapshot' : '',
        ].filter(Boolean);
        const fetchedFrom = sourceLabels.length
          ? `Fetched from sources: ${sourceLabels.join('; ')}`
          : `Fetched from ${pricingSource.url}`;
        const fetchedAt = pricingSource.fetched_at ? ` at ${formatTimestampTitle(pricingSource.fetched_at)}` : '';
        sourceEl.textContent = 'Costs';
        sourceEl.dataset.state = 'ready';
        sourceEl.title = `${sourceParts.join(' · ')}. ${fetchedFrom}${fetchedAt}. Internal Codex labels may use marked best-guess estimates.${pricingSnapshotWarning ? ` ${pricingSnapshotWarning}` : ''}`;
      } else {
        sourceEl.textContent = pricingConfigured ? 'Costs' : 'No costs';
        sourceEl.dataset.state = pricingConfigured ? 'ready' : 'missing';
        sourceEl.title = pricingConfigured ? (pricingSnapshotWarning || '') : 'Run ai-usage-dashboard update-pricing to configure estimated costs.';
      }
    }
    function updateParserDiagnosticsLine() {
      const sourceEl = document.getElementById('parserDiagnostics');
      const entries = Object.entries(parserDiagnostics || {}).filter(([, value]) => Number(value || 0) > 0);
      if (!entries.length) {
        sourceEl.hidden = true;
        sourceEl.textContent = '';
        sourceEl.title = '';
        return;
      }
      const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
      sourceEl.hidden = false;
      sourceEl.textContent = 'Parser warnings';
      sourceEl.dataset.state = 'missing';
      sourceEl.title = `Latest refresh reported ${number.format(total)} parser diagnostics: ${entries.map(([key, value]) => `${key}=${value}`).join(', ')}. Run ai-usage-dashboard inspect-log <path> to investigate schema drift.`;
    }
    function updatePrivacyModeLine() {
      const sourceEl = document.getElementById('privacyMode');
      const mode = projectMetadataPrivacy.mode || 'normal';
      sourceEl.textContent = mode === 'normal' ? 'Metadata normal' : `Metadata ${mode}`;
      sourceEl.dataset.state = mode === 'normal' ? 'ready' : 'missing';
      sourceEl.title = mode === 'normal'
        ? 'Project metadata is shown with local cwd, project, branch, and configured labels.'
        : [
            `Project metadata privacy mode: ${mode}.`,
            projectMetadataPrivacy.cwd_redacted ? 'Raw cwd paths are redacted.' : '',
            projectMetadataPrivacy.project_names_redacted ? 'Unnamed projects use stable hashed labels.' : '',
            projectMetadataPrivacy.git_remote_label_hidden ? 'Git remote labels are hidden.' : '',
            projectMetadataPrivacy.relative_cwd_hidden ? 'Relative cwd is hidden.' : '',
            projectMetadataPrivacy.git_branch_hidden ? 'Git branch is hidden.' : '',
            projectMetadataPrivacy.tags_hidden ? 'Project tags are hidden.' : '',
            projectMetadataPrivacy.aliases_preserved ? 'Configured project aliases are treated as explicit display opt-ins.' : '',
          ].filter(Boolean).join(' ');
    }
    function padDatePart(value) {
      return String(value).padStart(2, '0');
    }
    function localDateKey(date) {
      return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
    }
    function localDay(value = new Date()) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    function addDays(date, days) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
    }
    function parseDateInput(value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
    }
    function cleanDateInput(value) {
      const date = parseDateInput(value);
      return date ? localDateKey(date) : '';
    }
    function weekStart(date) {
      const day = date.getDay();
      const offset = day === 0 ? -6 : 1 - day;
      return addDays(date, offset);
    }
    function presetDateRange(preset) {
      const today = localDay();
      if (preset === 'today') {
        return { start: today, endExclusive: addDays(today, 1) };
      }
      if (preset === 'this-week') {
        const start = weekStart(today);
        return { start, endExclusive: addDays(start, 7) };
      }
      if (preset === 'last-7-days') {
        return { start: addDays(today, -6), endExclusive: addDays(today, 1) };
      }
      if (preset === 'this-month') {
        return {
          start: new Date(today.getFullYear(), today.getMonth(), 1),
          endExclusive: new Date(today.getFullYear(), today.getMonth() + 1, 1),
        };
      }
      return { start: null, endExclusive: null };
    }
    function syncDatePresetInputs() {
      const preset = datePresetEl.value;
      if (preset === 'custom') return;
      if (preset === 'all') {
        dateStartEl.value = '';
        dateEndEl.value = '';
        return;
      }
      const range = presetDateRange(preset);
      dateStartEl.value = range.start ? localDateKey(range.start) : '';
      dateEndEl.value = range.endExclusive ? localDateKey(addDays(range.endExclusive, -1)) : '';
    }
    function toggleCustomDateFields() {
      const custom = datePresetEl.value === 'custom';
      [dateStartEl, dateEndEl].forEach(el => {
        const field = el.closest('.date-field-custom');
        if (field) field.hidden = !custom;
        el.disabled = !custom;
      });
    }
    function formatDateRangeLabel(prefix, start, end) {
      const startLabel = start ? localDateKey(start) : '';
      const endLabel = end ? localDateKey(end) : '';
      if (startLabel && endLabel && startLabel === endLabel) return `${prefix} ${startLabel}`;
      if (startLabel && endLabel) return `${prefix} ${startLabel} to ${endLabel}`;
      if (startLabel) return `${prefix} from ${startLabel}`;
      if (endLabel) return `${prefix} through ${endLabel}`;
      return prefix;
    }
    function currentDateRange() {
      const preset = allowedDatePresets.has(datePresetEl.value) ? datePresetEl.value : 'all';
      if (preset !== 'custom' && preset !== 'all') {
        const range = presetDateRange(preset);
        return {
          active: true,
          invalid: false,
          start: range.start,
          endExclusive: range.endExclusive,
          label: formatDateRangeLabel(datePresetLabels[preset], range.start, addDays(range.endExclusive, -1)),
        };
      }
      const start = parseDateInput(dateStartEl.value);
      const end = parseDateInput(dateEndEl.value);
      if (start && end && start > end) {
        return {
          active: true,
          invalid: true,
          start,
          endExclusive: addDays(end, 1),
          label: 'Invalid date range',
        };
      }
      if (start || end) {
        return {
          active: true,
          invalid: false,
          start,
          endExclusive: end ? addDays(end, 1) : null,
          label: formatDateRangeLabel('Custom', start, end),
        };
      }
      return { active: false, invalid: false, start: null, endExclusive: null, label: 'All time' };
    }
    function rowMatchesDateRange(row, range) {
      if (range.invalid) return false;
      if (!range.active) return true;
      const timestamp = row.event_timestamp ? new Date(row.event_timestamp) : null;
      if (!timestamp || Number.isNaN(timestamp.getTime())) return false;
      if (range.start && timestamp < range.start) return false;
      if (range.endExclusive && timestamp >= range.endExclusive) return false;
      return true;
    }
    function updateDateFilterControls() {
      toggleCustomDateFields();
      const range = currentDateRange();
      const caveat = loadedRowsCaveat(range);
      const showStatus = range.active || range.invalid || Boolean(caveat);
      if (dateStatusRowEl) dateStatusRowEl.hidden = !showStatus;
      dateRangeStatusEl.hidden = !showStatus;
      dateRangeStatusEl.textContent = caveat || (showStatus ? range.label : '');
      dateRangeStatusEl.dataset.state = range.invalid ? 'error' : range.active ? 'active' : 'idle';
      return range;
    }
    function dateCaptionPrefix(range = currentDateRange()) {
      return range.active || range.invalid ? `${range.label}. ` : '';
    }
    function isSpawnedWork(row) {
      return isSubagent(row) || Boolean(resolvedParentThreadName(row));
    }
    function threadScopeMatches(row, threadScope) {
      if (!threadScope) return true;
      const spawned = isSpawnedWork(row);
      return threadScope === 'parents' ? !spawned : threadScope === 'spawned' ? spawned : true;
    }
    function filtered(dateRange = currentDateRange()) {
      const term = searchEl.value.trim().toLowerCase();
      const model = modelEl.value;
      const sourceProvider = providerEl.value;
      const sourceApp = appEl.value;
      const effort = effortEl.value;
      const pricingStatus = pricingStatusEl.value;
      const threadScope = threadScopeEl.value;
      const rows = data.filter(row => {
        const haystack = [
          rowThreadLabel(row),
          row.cwd,
          row.project_name,
          row.project_relative_cwd,
          Array.isArray(row.project_tags) ? row.project_tags.join(' ') : '',
          row.git_branch,
          row.git_remote_label,
          row.source_provider,
          row.source_app,
          row.source_format,
          row.model,
          row.effort,
          row.session_id,
          row.turn_id,
          row.thread_source,
          row.subagent_type,
          row.agent_role,
          row.agent_nickname,
          row.parent_session_id,
          row.parent_thread_name,
          row.resolved_parent_thread_name,
        ].join(' ').toLowerCase();
        const statusMatches = !pricingStatus
          || (pricingStatus === 'official' && row.pricing_model && !row.pricing_estimated)
          || (pricingStatus === 'estimated' && row.pricing_estimated)
          || (pricingStatus === 'unpriced' && !row.pricing_model)
          || (pricingStatus === 'credit-exact' && row.usage_credit_confidence === 'exact')
          || (pricingStatus === 'credit-estimated' && row.usage_credit_confidence === 'estimated')
          || (pricingStatus === 'credit-override' && row.usage_credit_confidence === 'user_override')
          || (pricingStatus === 'credit-missing' && row.usage_credit_confidence === 'unpriced')
          || (pricingStatus === 'credit-not-applicable' && row.usage_credit_confidence === 'not_applicable');
        return (!term || haystack.includes(term))
          && (!model || row.model === model)
          && (!sourceProvider || row.source_provider === sourceProvider)
          && (!sourceApp || row.source_app === sourceApp)
          && (!effort || row.effort === effort)
          && statusMatches
          && threadScopeMatches(row, threadScope)
          && rowMatchesDateRange(row, dateRange)
          && presetMatchesRow(row);
      });
      rows.sort(compareCalls);
      return rows;
    }
    function currentDashboardState() {
      return {
        view: activeView,
        search: searchEl.value.trim(),
        model: modelEl.value,
        sourceProvider: providerEl.value,
        sourceApp: appEl.value,
        effort: effortEl.value,
        confidence: pricingStatusEl.value,
        threadScope: threadScopeEl.value,
        datePreset: datePresetEl.value,
        dateStart: datePresetEl.value === 'custom' ? dateStartEl.value : '',
        dateEnd: datePresetEl.value === 'custom' ? dateEndEl.value : '',
        historyScope: includeArchived ? 'all' : 'active',
        sort: sortKey,
        direction: sortDirection,
        preset: activePreset,
        page: currentPage,
        record: selectedRecordId,
        thread: selectedThreadKey,
        expandedThreads: Array.from(expandedThreads),
      };
    }
    function syncUrlState() {
      if (!stateManager) return;
      stateManager.replace(currentDashboardState());
    }
    function showActionStatus(message) {
      actionStatusEl.textContent = message;
      if (!message) return;
      window.setTimeout(() => {
        if (actionStatusEl.textContent === message) actionStatusEl.textContent = '';
      }, 2200);
    }
    async function copyCurrentViewLink() {
      if (!stateManager) return;
      const url = stateManager.urlFor(currentDashboardState());
      try {
        await stateManager.copyText(url);
        showActionStatus('Copied');
      } catch (error) {
        showActionStatus('Copy failed');
      }
    }
    function exportCurrentRows() {
      if (!stateManager) return;
      const rows = filtered();
      const columns = [
        { label: 'timestamp', field: 'event_timestamp' },
        { label: 'thread', field: row => rowThreadLabel(row) },
        { label: 'project', field: 'project_name' },
        { label: 'source_provider', field: 'source_provider' },
        { label: 'source_app', field: 'source_app' },
        { label: 'source_format', field: 'source_format' },
        { label: 'provider_request_id', field: 'provider_request_id' },
        { label: 'model', field: 'model' },
        { label: 'effort', field: 'effort' },
        { label: 'total_tokens', field: 'total_tokens' },
        { label: 'input_tokens', field: 'input_tokens' },
        { label: 'cache_creation_input_tokens', field: 'cache_creation_input_tokens' },
        { label: 'cached_input_tokens', field: 'cached_input_tokens' },
        { label: 'uncached_input_tokens', field: 'uncached_input_tokens' },
        { label: 'output_tokens', field: 'output_tokens' },
        { label: 'reasoning_output_tokens', field: 'reasoning_output_tokens' },
        { label: 'estimated_cost_usd', field: 'estimated_cost_usd' },
        { label: 'usage_credits', field: 'usage_credits' },
        { label: 'cache_ratio', field: 'cache_ratio' },
        { label: 'context_window_percent', field: 'context_window_percent' },
        { label: 'pricing_model', field: 'pricing_model' },
        { label: 'usage_credit_confidence', field: 'usage_credit_confidence' },
        { label: 'recommendation', field: row => row.recommended_action || recommendationSummary(row) },
        { label: 'record_id', field: 'record_id' },
      ];
      const csv = stateManager.toCsv(rows, columns);
      const suffix = activeView === 'threads' ? 'thread-filtered-calls' : `${activeView}-calls`;
      stateManager.downloadText(`codex-usage-${suffix}.csv`, csv, 'text/csv;charset=utf-8');
      showActionStatus(`Exported ${number.format(rows.length)}`);
    }
    function activePresetDefinition() {
      return presetDefinitions.find(preset => preset.key === activePreset) || null;
    }
    function presetMatchesRow(row) {
      const preset = activePresetDefinition();
      return preset ? preset.matches(row) : true;
    }
    function applyPreset(key) {
      const preset = presetDefinitions.find(candidate => candidate.key === key);
      if (!preset) return;
      activePreset = preset.key;
      activeView = preset.view;
      pricingStatusEl.value = preset.pricingStatus || '';
      sortKey = preset.sort;
      sortDirection = preset.direction || defaultSortDirection(preset.sort);
      sortEl.value = preset.sort;
      currentPage = 1;
      render();
    }
    function clearPreset() {
      activePreset = '';
      pricingStatusEl.value = '';
      sortKey = 'time';
      sortDirection = defaultSortDirection(sortKey);
      sortEl.value = sortKey;
      currentPage = 1;
      render();
    }
    function threshold(key, fallback) {
      const value = Number(actionThresholds[key]);
      return Number.isFinite(value) ? value : fallback;
    }
    function topRecommendation(row) {
      return Array.isArray(row.action_recommendations) && row.action_recommendations.length
        ? row.action_recommendations[0]
        : null;
    }
    function recommendationSummary(row) {
      const recommendation = topRecommendation(row);
      return recommendation ? `${recommendation.title}: ${recommendation.why}` : 'No aggregate action is flagged.';
    }
    function signalCount(row) {
      return Array.isArray(row.efficiency_flags) ? row.efficiency_flags.length : 0;
    }
    function rowAttentionScore(row) {
      const costScore = clamp(Number(row.estimated_cost_usd || 0) * 24, 0, 60);
      const tokenScore = clamp(Number(row.total_tokens || 0) / 2500, 0, 36);
      const lowCacheScore = Number(row.input_tokens || 0) > 0 ? clamp((0.5 - Number(row.cache_ratio || 0)) * 70, 0, 35) : 0;
      const contextScore = clamp(Number(row.context_window_percent || 0) * 42, 0, 42);
      const pricingScore = row.pricing_model ? (row.pricing_estimated ? 12 : 0) : 30;
      const usageScore = clamp(Number(row.usage_credits || 0) * 2.5, 0, 48);
      return costScore + usageScore + tokenScore + lowCacheScore + contextScore + pricingScore + signalCount(row) * 12;
    }
    function threadAttentionScore(group) {
      const costScore = clamp(Number(group.estimatedCost || 0) * 24, 0, 72);
      const tokenScore = clamp(Number(group.totalTokens || 0) / 3500, 0, 42);
      const lowCacheScore = clamp((0.55 - Number(group.cacheRatio || 0)) * 70, 0, 38);
      const contextScore = clamp(Number(group.maxContextUse || 0) * 45, 0, 45);
      const pricingScore = group.pricingStatus === 'No price' ? 36 : group.pricingStatus === 'Estimated' || group.pricingStatus === 'Mixed' ? 18 : 0;
      const usageScore = clamp(Number(group.usageCredits || 0) * 2.4, 0, 72);
      const relationScore = (group.subagentCount || 0) * 4 + (group.autoReviewCount || 0) * 6 + (group.attachedCount || 0) * 3;
      return costScore + usageScore + tokenScore + lowCacheScore + contextScore + pricingScore + relationScore + Number(group.signalCount || 0) * 10;
    }
    function severityForScore(score) {
      if (score >= 95) return 'high';
      if (score >= 48) return 'medium';
      return 'review';
    }
    function callSortValue(row, key) {
      if (key === 'attention') return rowAttentionScore(row);
      if (key === 'cache') return Number(row.cache_ratio || 0);
      if (key === 'context') return Number(row.context_window_percent || 0);
      if (key === 'cost') return Number(row.estimated_cost_usd || 0);
      if (key === 'effort') return textValue(row.effort);
      if (key === 'model') return textValue(row.model);
      if (key === 'signals') return Array.isArray(row.efficiency_flags) ? row.efficiency_flags.length : 0;
      if (key === 'source') return textValue(usageSourceLabel(row));
      if (key === 'thread') return textValue(rowThreadLabel(row));
      if (key === 'time') return String(row.event_timestamp || '');
      if (key === 'usage') return Number(row.usage_credits || 0);
      return Number(row.total_tokens || 0);
    }
    function compareCalls(a, b) {
      const primary = directional(compareValues(callSortValue(a, sortKey), callSortValue(b, sortKey)));
      if (primary !== 0) return primary;
      const timeFallback = String(b.event_timestamp || '').localeCompare(String(a.event_timestamp || ''));
      if (timeFallback !== 0) return timeFallback;
      return String(a.record_id || '').localeCompare(String(b.record_id || ''));
    }
    function rowAttachment(row) {
      return threadAttachmentByRecordId.get(row.record_id) || resolveThreadAttachment(row);
    }
    function rowThreadLabel(row) {
      return rowAttachment(row).label;
    }
    function sortThreads(groups) {
      groups.sort(compareThreads);
      return groups;
    }
    function threadSortValue(group, key) {
      if (key === 'attention') return group.attentionScore;
      if (key === 'cache') return group.cacheRatio;
      if (key === 'context') return group.maxContextUse;
      if (key === 'cost') return group.estimatedCost;
      if (key === 'effort') return textValue(group.effortSummary);
      if (key === 'model') return textValue(group.modelSummary);
      if (key === 'signals') return group.signalCount;
      if (key === 'source') return textValue(group.sourceSummary);
      if (key === 'thread') return textValue(group.label);
      if (key === 'time') return String(group.latestActivity || '');
      if (key === 'usage') return group.usageCredits;
      return group.totalTokens;
    }
    function compareThreads(a, b) {
      const primary = directional(compareValues(threadSortValue(a, sortKey), threadSortValue(b, sortKey)));
      if (primary !== 0) return primary;
      const timeFallback = String(b.latestActivity || '').localeCompare(String(a.latestActivity || ''));
      if (timeFallback !== 0) return timeFallback;
      return String(a.label || '').localeCompare(String(b.label || ''));
    }
    function relationshipTime(group) {
      return String(group.relationshipLatestActivity || group.latestActivity || '');
    }
    function compareTopLevelThreads(a, b) {
      if (sortKey === 'time' && sortDirection === 'desc') {
        const relationshipCompare = relationshipTime(b).localeCompare(relationshipTime(a));
        if (relationshipCompare !== 0) return relationshipCompare;
      }
      return compareThreads(a, b);
    }
    function fitModelPills() {
      document.querySelectorAll('.model-pill').forEach(pill => {
        pill.style.fontSize = '';
        const maxSize = 12;
        const minSize = 9;
        let size = maxSize;
        while (size > minSize && pill.scrollWidth > pill.clientWidth) {
          size -= 0.5;
          pill.style.fontSize = `${size}px`;
        }
        pill.title = pill.dataset.fullLabel || pill.textContent || '';
      });
    }
    function dominantParentThread(calls, ownLabel) {
      const counts = new Map();
      for (const row of calls) {
        const parent = resolvedParentThreadName(row);
        if (!parent || parent === ownLabel) continue;
        counts.set(parent, (counts.get(parent) || 0) + 1);
      }
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      return ranked.length ? ranked[0][0] : '';
    }
    function arrangeThreadGroups(groups) {
      const byLabel = new Map(groups.map(group => [group.label, group]));
      for (const group of groups) {
        group.childThreadCount = 0;
        group.childCallCount = 0;
        group.relationshipLatestActivity = group.latestActivity;
        group.parentVisible = Boolean(group.parentThreadLabel && byLabel.has(group.parentThreadLabel));
        group.renderAsChild = false;
      }
      for (const group of groups) {
        if (!group.parentVisible) continue;
        const parent = byLabel.get(group.parentThreadLabel);
        parent.childThreadCount += 1;
        parent.childCallCount += group.callCount;
        if (String(group.latestActivity || '') > String(parent.relationshipLatestActivity || '')) {
          parent.relationshipLatestActivity = group.latestActivity;
        }
      }
      if (sortKey !== 'time' || sortDirection !== 'desc') {
        return sortThreads(groups);
      }
      const childrenByParent = new Map();
      for (const group of groups) {
        if (!group.parentVisible) continue;
        if (!childrenByParent.has(group.parentThreadLabel)) childrenByParent.set(group.parentThreadLabel, []);
        childrenByParent.get(group.parentThreadLabel).push(group);
      }
      const display = [];
      const topLevel = groups.filter(group => !group.parentVisible).sort(compareTopLevelThreads);
      const displayed = new Set();
      function appendGroup(group, renderAsChild = false) {
        if (displayed.has(group.key)) return;
        displayed.add(group.key);
        group.renderAsChild = renderAsChild;
        display.push(group);
        const children = (childrenByParent.get(group.label) || []).sort(compareThreads);
        for (const child of children) appendGroup(child, true);
      }
      for (const group of topLevel) {
        appendGroup(group, false);
      }
      return display;
    }
    function pricingStatusFor(rows) {
      const priced = rows.filter(row => row.pricing_model);
      const estimated = rows.filter(row => row.pricing_estimated);
      if (priced.length === 0) return 'No price';
      if (estimated.length === rows.length) return 'Estimated';
      if (estimated.length > 0 || priced.length < rows.length) return 'Mixed';
      return 'Configured';
    }
    function creditStatusFor(rows) {
      const applicableCreditRows = rows.filter(row => row.usage_credit_confidence !== 'not_applicable');
      const rated = applicableCreditRows.filter(row => usageCreditValue(row) !== null);
      const estimated = applicableCreditRows.filter(row => row.usage_credit_confidence === 'estimated');
      if (applicableCreditRows.length === 0) return 'Not applicable';
      if (rated.length === 0) return 'No mapped rate';
      if (estimated.length === applicableCreditRows.length) return 'Estimated mapping';
      if (estimated.length > 0 || rated.length < applicableCreditRows.length) return 'Mixed';
      return 'Official rate-card match';
    }
    function threadLifecycle(calls) {
      const highCost = threshold('high_cost_usd', 1);
      const highContext = threshold('high_context_percent', 0.6);
      let largestJump = 0;
      let largestJumpRow = null;
      for (let index = 1; index < calls.length; index += 1) {
        const previous = Number(calls[index - 1].cumulative_total_tokens || 0);
        const current = Number(calls[index].cumulative_total_tokens || 0);
        const jump = Math.max(current - previous, Number(calls[index].total_tokens || 0), 0);
        if (jump > largestJump) {
          largestJump = jump;
          largestJumpRow = calls[index];
        }
      }
      const firstExpensiveIndex = calls.findIndex(row => Number(row.estimated_cost_usd || 0) >= highCost || Number(row.context_window_percent || 0) >= highContext);
      const firstExpensiveRow = firstExpensiveIndex >= 0 ? calls[firstExpensiveIndex] : null;
      const first = calls[0] || {};
      const last = calls[calls.length - 1] || {};
      const cacheTrend = Number(last.cache_ratio || 0) - Number(first.cache_ratio || 0);
      const contextTrend = Number(last.context_window_percent || 0) - Number(first.context_window_percent || 0);
      const spikeIndex = largestJumpRow ? calls.indexOf(largestJumpRow) : -1;
      const subagentBeforeSpike = spikeIndex > 0 && calls.slice(0, spikeIndex).some(row => isSubagent(row) || isAutoReview(row));
      const topAction = calls.map(topRecommendation).filter(Boolean)[0];
      let action = topAction
        ? topAction.action
        : 'Expand calls or select a row for call-level recommendations.';
      if (contextTrend >= 0.15 || Number(last.context_window_percent || 0) >= highContext) {
        action = 'Review where context growth begins and consider starting a fresh thread.';
      } else if (cacheTrend <= -0.25) {
        action = 'Check for reintroduced files or tool output after cache reuse dropped.';
      } else if (subagentBeforeSpike) {
        action = 'Compare attached subagent or review calls before changing the parent workflow.';
      }
      return {
        firstExpensiveRow,
        firstExpensiveIndex,
        largestJump,
        largestJumpRow,
        cacheTrend,
        contextTrend,
        subagentBeforeSpike,
        action,
      };
    }
    function groupThreads(rows) {
      const map = new Map();
      for (const row of rows) {
        const attachment = rowAttachment(row);
        const key = attachment.key;
        if (!map.has(key)) {
          map.set(key, { key, label: attachment.label, rows: [] });
        }
        map.get(key).rows.push(row);
      }
      const groups = [...map.values()].map(group => {
        const calls = group.rows.slice().sort(chronological);
        const totalTokens = calls.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0);
        const inputTokens = calls.reduce((sum, row) => sum + Number(row.input_tokens || 0), 0);
        const cachedTokens = calls.reduce((sum, row) => sum + Number(row.cached_input_tokens || 0), 0);
        const estimatedCost = calls.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
        const usageCredits = sumUsageCredits(calls);
        const signalCount = calls.reduce((sum, row) => sum + (Array.isArray(row.efficiency_flags) ? row.efficiency_flags.length : 0), 0);
        const latestActivity = calls.reduce((latest, row) => String(row.event_timestamp || '') > latest ? String(row.event_timestamp || '') : latest, '');
        const maxContextUse = calls.reduce((max, row) => Math.max(max, Number(row.context_window_percent || 0)), 0);
        const subagentCount = calls.filter(isSubagent).length;
        const autoReviewCount = calls.filter(isAutoReview).length;
        const attachedCount = calls.filter(row => rowAttachment(row).relation !== 'direct' && rowAttachment(row).relation !== 'session').length;
        const modelSummary = threadModelSummary(calls);
        const effortValues = calls.map(row => row.effort);
        const effortSummary = effortValues.some(Boolean)
          ? compactListSummary(effortValues, 'efforts')
          : (calls.every(row => row.source_provider === 'anthropic') ? 'n/a' : 'Unknown');
        const sourceSummary = compactListSummary(calls.map(usageSourceLabel), 'sources');
        const parentThreadLabel = dominantParentThread(calls, group.label);
        const lifecycle = threadLifecycle(calls);
        return {
          key: group.key,
          label: group.label,
          calls,
          callCount: calls.length,
          latestActivity,
          parentThreadLabel,
          modelSummary,
          effortSummary,
          sourceSummary,
          totalTokens,
          estimatedCost,
          usageCredits,
          cacheRatio: inputTokens ? cachedTokens / inputTokens : 0,
          maxContextUse,
          pricingStatus: pricingStatusFor(calls),
          creditStatus: creditStatusFor(calls),
          signalCount,
          subagentCount,
          autoReviewCount,
          attachedCount,
          lifecycle,
          attentionScore: 0,
        };
      });
      for (const group of groups) {
        group.attentionScore = threadAttentionScore(group);
      }
      return arrangeThreadGroups(groups);
    }
    function paginate(items) {
      const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
      currentPage = Math.min(Math.max(currentPage, 1), pageCount);
      const start = (currentPage - 1) * pageSize;
      const end = Math.min(start + pageSize, items.length);
      return {
        items: items.slice(start, end),
        start,
        end,
        total: items.length,
        pageCount,
      };
    }
    function updatePager(page, itemLabel = 'rows') {
      const shouldShowPager = page.pageCount > 1;
      pagerEl.hidden = !shouldShowPager;
      prevPageEl.disabled = currentPage <= 1;
      nextPageEl.disabled = currentPage >= page.pageCount;
      if (!page.total) {
        pageStatusEl.textContent = 'No rows';
        return;
      }
      pageStatusEl.innerHTML = `${number.format(page.start + 1)}-${number.format(page.end)} of ${number.format(page.total)} ${escapeHtml(itemLabel)} · <span class="page-frac">page ${number.format(currentPage)}/${number.format(page.pageCount)}</span>`;
    }
    function buildInsights(rows) {
      const groups = groupThreads(rows);
      const insights = [];
      if (inferredProviderScope(rows) === 'anthropic' && rows.length) {
        const totalTokens = rows.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0);
        const cacheReadTokens = rows.reduce((sum, row) => sum + Number(row.cached_input_tokens || 0), 0);
        if (totalTokens > 0) {
          insights.push({
            title: 'Cache-read share',
            value: pct(cacheReadTokens / totalTokens),
            body: 'Claude Code totals include cache reads, so a large total often reflects reused context rather than fresh input.',
            severity: cacheReadTokens / totalTokens >= 0.8 ? 'review' : 'medium',
            action: 'Open Calls view',
            view: 'calls',
            sort: 'total',
          });
        }
      }
      const topCostGroup = groups.filter(group => group.estimatedCost > 0).sort((a, b) => b.estimatedCost - a.estimatedCost || b.attentionScore - a.attentionScore)[0];
      if (topCostGroup) {
        insights.push({
          title: 'Costliest thread',
          value: pricingConfigured ? money(topCostGroup.estimatedCost) : 'Not configured',
          body: `${topCostGroup.label} has ${number.format(topCostGroup.callCount)} calls and ${number.format(topCostGroup.totalTokens)} tokens.`,
          severity: severityForScore(topCostGroup.attentionScore),
          action: 'Open thread timeline',
          preset: 'highest-cost',
        });
      }
      const lowCacheLimit = threshold('low_cache_ratio', 0.3);
      const lowCacheRows = rows.filter(row => Number(row.input_tokens || 0) > 0 && Number(row.cache_ratio || 0) < lowCacheLimit);
      if (lowCacheRows.length) {
        const lowest = lowCacheRows.slice().sort((a, b) => Number(a.cache_ratio || 0) - Number(b.cache_ratio || 0))[0];
        insights.push({
          title: 'Low cache reuse',
          value: pct(lowest.cache_ratio),
          body: `${number.format(lowCacheRows.length)} calls are under ${pct(lowCacheLimit)} cache reuse. Start with ${rowThreadLabel(lowest)}.`,
          severity: 'medium',
          action: 'Apply cache-misses preset',
          preset: 'cache-misses',
        });
      }
      const highContextLimit = threshold('high_context_percent', 0.6);
      const highContextRows = rows.filter(row => Number(row.context_window_percent || 0) >= highContextLimit);
      if (highContextRows.length) {
        const highest = highContextRows.slice().sort((a, b) => Number(b.context_window_percent || 0) - Number(a.context_window_percent || 0))[0];
        insights.push({
          title: 'Context bloat',
          value: pct(highest.context_window_percent),
          body: `${number.format(highContextRows.length)} calls are at or above ${pct(highContextLimit)} context use.`,
          severity: severityForScore(rowAttentionScore(highest)),
          action: 'Apply context-bloat preset',
          preset: 'context-bloat',
        });
      }
      const usageCredits = sumUsageCredits(rows);
      if (usageCredits > 0) {
        const creditCoverage = creditCoverageRatio(rows);
        insights.push({
          title: 'Codex allowance usage',
          value: `${credits(usageCredits)} credits`,
          body: allowanceWindowText(usageCredits, 'impact') || allowanceWindowText(usageCredits, 'remaining') || `${pct(creditCoverage)} of visible tokens map to Codex credit rates.`,
          severity: severityForScore(clamp(usageCredits * 2.4, 0, 140)),
          action: 'Review highest-credit calls',
          preset: 'usage-credits',
        });
      }
      const unpricedTokens = rows.reduce((sum, row) => sum + (!row.pricing_model ? Number(row.total_tokens || 0) : 0), 0);
      if (unpricedTokens) {
        insights.push({
          title: 'Unpriced usage',
          value: number.format(unpricedTokens),
          body: 'These tokens are omitted from estimated cost totals until pricing is configured.',
          severity: 'review',
          action: 'Review pricing gaps',
          preset: 'pricing-gaps',
        });
      }
      const estimatedTokens = rows.reduce((sum, row) => sum + (row.pricing_estimated ? Number(row.total_tokens || 0) : 0), 0);
      if (estimatedTokens) {
        insights.push({
          title: 'Estimated pricing',
          value: number.format(estimatedTokens),
          body: 'Marked best-guess prices are included, but should be reviewed separately.',
          severity: 'review',
          action: 'Review estimates',
          preset: 'estimated-review',
        });
      }
      const reasoningRows = rows.filter(row => Number(row.reasoning_output_tokens || 0) > 0).sort((a, b) => Number(b.reasoning_output_tokens || 0) - Number(a.reasoning_output_tokens || 0));
      if (reasoningRows[0]) {
        insights.push({
          title: 'Reasoning output spike',
          value: number.format(reasoningRows[0].reasoning_output_tokens || 0),
          body: `${rowThreadLabel(reasoningRows[0])} has the largest reasoning-output call in the current filter.`,
          severity: severityForScore(rowAttentionScore(reasoningRows[0])),
          action: 'Inspect selected call',
          view: 'calls',
          sort: 'signals',
        });
      }
      return insights.slice(0, 6);
    }
    function renderInsightPanel(rows) {
      if (activeView !== 'insights' && !activePreset) {
        insightsPanelEl.hidden = true;
        return;
      }
      insightsPanelEl.hidden = false;
      renderPresetControls();
      const insights = buildInsights(rows);
      if (!insights.length) {
        insightCardsEl.innerHTML = '<div class="empty-state">no attention signals match the current filters</div>';
        return;
      }
      insightCardsEl.innerHTML = insights.map((insight, index) => {
        const severity = insight.severity || 'review';
        return `
          <article class="insight-card" data-severity="${escapeHtml(severity)}">
            <div class="insight-card-header">
              <h3>${escapeHtml(insight.title)}</h3>
              <span class="severity-chip ${escapeHtml(severity)}">${escapeHtml(severity === 'high' ? 'High' : severity === 'medium' ? 'Medium' : 'Review')}</span>
            </div>
            <strong>${escapeHtml(insight.value)}</strong>
            <p>${escapeHtml(insight.body)}</p>
            <button class="insight-action" type="button" data-insight-index="${index}">${escapeHtml(insight.action)}</button>
          </article>
        `;
      }).join('');
      insightCardsEl.querySelectorAll('[data-insight-index]').forEach(button => {
        const insight = insights[Number(button.dataset.insightIndex)];
        button.addEventListener('click', () => {
          if (insight.preset) {
            applyPreset(insight.preset);
            return;
          }
          activeView = insight.view || 'calls';
          if (insight.sort) {
            sortKey = insight.sort;
            sortDirection = defaultSortDirection(insight.sort);
            sortEl.value = sortKey;
          }
          currentPage = 1;
          render();
        });
      });
    }
    function renderPresetControls() {
      const preset = activePresetDefinition();
      clearPresetEl.hidden = !preset;
      presetStatusEl.textContent = preset ? `${preset.caption}: ${preset.description}` : 'No preset applied.';
      presetListEl.innerHTML = presetDefinitions.map(candidate => `
        <button class="preset-card" type="button" data-preset="${escapeHtml(candidate.key)}" aria-pressed="${candidate.key === activePreset ? 'true' : 'false'}">
          <span class="preset-copy"><b>${escapeHtml(candidate.label)}</b><span>${escapeHtml(candidate.description)}</span></span>
          <span class="preset-chip">Run</span>
        </button>
      `).join('');
      presetListEl.querySelectorAll('[data-preset]').forEach(button => {
        button.addEventListener('click', () => applyPreset(button.dataset.preset));
      });
    }
    function updatePromptLine() {
      const promptEl = document.getElementById('promptLine');
      if (!promptEl) return;
      const presetFlags = {
        all: '--all',
        today: '--today',
        'this-week': '--week',
        'last-7-days': '--last-7-days',
        'this-month': '--month',
      };
      let echo;
      if (datePresetEl.value === 'custom') {
        echo = `usage --from ${dateStartEl.value || '?'} --to ${dateEndEl.value || '?'}`;
      } else {
        echo = `usage ${presetFlags[datePresetEl.value] || '--week'}`;
      }
      const providerNames = { openai: 'codex', anthropic: 'claude' };
      if (providerEl.value) echo += ` --provider ${providerNames[providerEl.value] || providerEl.value}`;
      promptEl.innerHTML = `<span class="prompt-path">ai-usage-dashboard:~$</span> ${escapeHtml(echo)}`;
    }
    function render() {
      const dateRange = updateDateFilterControls();
      const rows = filtered(dateRange);
      cancelCardCountUps();
      rowsEl.textContent = '';
      updateSortControls();
      const summary = buildUniversalSummary(rows);
      const previousRange = previousPeriodRange(dateRange);
      const previousRows = previousRange ? filtered(previousRange) : null;
      const previousSummary = previousRows ? buildUniversalSummary(previousRows) : null;
      document.getElementById('visibleCalls').textContent = number.format(summary.visibleCalls);
      renderProviderTabs();
      updateSummaryCards(rows, summary);
      updateCardDeltas(summary, previousSummary);
      renderProviderDetails(rows, summary);
      renderUsageAnalytics(rows, dateRange, previousRows);
      insightsViewEl.setAttribute('aria-pressed', activeView === 'insights' ? 'true' : 'false');
      callsViewEl.setAttribute('aria-pressed', activeView === 'calls' ? 'true' : 'false');
      threadsViewEl.setAttribute('aria-pressed', activeView === 'threads' ? 'true' : 'false');
      renderInsightPanel(rows);
      if (activeView === 'threads') {
        renderThreads(rows);
      } else if (activeView === 'insights') {
        renderThreads(rows, 'insights');
      } else {
        renderCalls(rows);
      }
      fitModelPills();
      updatePromptLine();
      syncUrlState();
    }
    function renderCalls(rows) {
      const page = paginate(rows);
      updatePager(page, 'calls');
      tableTitleEl.textContent = 'Model Calls';
      const preset = activePresetDefinition();
      const prefix = preset ? `${preset.caption}. ` : '';
      tableCaptionEl.textContent = `${prefix}${dateCaptionPrefix()}Showing individual model calls sorted by ${tableCaptionEl.dataset.sortDescription}. ${loadedRowsDescription()}.`;
      for (const row of page.items) {
        const tr = document.createElement('tr');
        const flags = Array.isArray(row.efficiency_flags) ? row.efficiency_flags : [];
        tr.className = 'call-row';
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label', `Inspect ${rowThreadLabel(row)} usage`);
        tr.innerHTML = `
          <td>${renderTimeCell(row.event_timestamp)}</td>
          <td title="${escapeHtml(short(row.session_id))}">${escapeHtml(truncate(rowThreadLabel(row)))}</td>
          <td><span class="pill" data-full-label="${escapeHtml(short(usageSourceLabel(row)))}">${escapeHtml(short(usageSourceLabel(row)))}</span></td>
          <td><span class="pill model-pill" data-full-label="${escapeHtml(short(row.model))}">${escapeHtml(short(row.model))}</span></td>
          <td>${escapeHtml(effortDisplay(row))}</td>
          <td class="num">${number.format(row.total_tokens || 0)}</td>
          <td class="num">${costUsageCell(row.pricing_estimated ? `${money(row.estimated_cost_usd)}*` : money(row.estimated_cost_usd), row)}</td>
          <td class="num">${pct(row.cache_ratio)}</td>
          <td><div class="flags">${flags.slice(0, 2).map(flag => `<span class="flag">${escapeHtml(flag)}</span>`).join('')}</div></td>
        `;
        tr.addEventListener('mouseenter', () => showDetail(row));
        tr.addEventListener('click', () => selectRow(row));
        tr.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectRow(row);
          }
        });
        rowsEl.appendChild(tr);
      }
      if (!initialDetailApplied && selectedRecordId) {
        const selected = rows.find(row => row.record_id === selectedRecordId);
        if (selected) {
          initialDetailApplied = true;
          showDetail(selected);
        }
      }
      if (!initialDetailApplied && urlParams.get('detail') === 'first' && page.items[0]) {
        initialDetailApplied = true;
        showDetail(page.items[0]);
      }
      if (!rows.length) {
        rowsEl.innerHTML = '<tr><td class="empty-state" colspan="9">no calls in range — widen the time filter</td></tr>';
      }
    }
    function renderThreads(rows, mode = 'threads') {
      const groups = groupThreads(rows);
      if (!initialThreadExpansionApplied && (activeView === 'threads' || activeView === 'insights')) {
        const expansion = urlParams.get('expand');
        if (expansion === 'all') {
          groups.forEach(group => expandedThreads.add(group.key));
        } else if (expansion === 'first' && groups[0]) {
          expandedThreads.add(groups[0].key);
        }
        initialThreadExpansionApplied = true;
      }
      const page = paginate(groups);
      updatePager(page, 'threads');
      tableTitleEl.textContent = mode === 'insights' ? 'Top Threads by Attention Score' : 'Threads';
      const preset = activePresetDefinition();
      const prefix = preset ? `${preset.caption}. ` : '';
      tableCaptionEl.textContent = `${prefix}${dateCaptionPrefix()}Showing ${number.format(groups.length)} threads from ${number.format(rows.length)} filtered calls, sorted by ${tableCaptionEl.dataset.sortDescription}. ${loadedRowsDescription()}. Click a thread to expand its calls.`;
      for (const group of page.items) {
        const tr = document.createElement('tr');
        const expanded = expandedThreads.has(group.key);
        const threadNotes = [
          `${number.format(group.callCount)} calls`,
          group.pricingStatus,
          group.parentThreadLabel ? `spawned from ${group.parentThreadLabel}` : '',
          group.childThreadCount ? `${number.format(group.childThreadCount)} spawned threads` : '',
          group.subagentCount ? `${number.format(group.subagentCount)} subagent` : '',
          group.autoReviewCount ? `${number.format(group.autoReviewCount)} auto-review` : '',
          group.attachedCount ? 'attached' : '',
        ].filter(Boolean).join(' - ');
        tr.className = `thread-row${group.parentThreadLabel ? ' spawned-thread' : ''}`;
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        tr.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${group.label} calls. Attention score ${Math.round(group.attentionScore)}.`);
        tr.innerHTML = `
          <td>${renderTimeCell(group.latestActivity)}</td>
          <td>
            <div class="thread-title">
                <span class="thread-toggle" aria-hidden="true">${expanded ? '-' : '+'}</span>
              <span class="thread-meta">
                <span class="thread-name">${group.renderAsChild ? '<span class="thread-relation">spawned</span> ' : ''}${escapeHtml(truncate(group.label, 72))}</span>
                <span class="thread-subtle">${escapeHtml(threadNotes)} · attention ${number.format(Math.round(group.attentionScore))}</span>
              </span>
            </div>
          </td>
          <td><span class="pill" data-full-label="${escapeHtml(short(group.sourceSummary))}">${escapeHtml(short(group.sourceSummary))}</span></td>
          <td><span class="pill model-pill" data-full-label="${escapeHtml(short(group.modelSummary))}">${escapeHtml(short(group.modelSummary))}</span></td>
          <td>${escapeHtml(truncate(group.effortSummary, 28))}</td>
          <td class="num">${number.format(group.totalTokens)}</td>
          <td class="num">${costUsageCell(pricingConfigured ? money(group.estimatedCost) : 'Not configured', { usage_credits: group.usageCredits, usage_credit_confidence: group.creditStatus === 'Not applicable' ? 'not_applicable' : undefined })}</td>
          <td class="num">${pct(group.cacheRatio)}</td>
          <td class="num">${number.format(group.signalCount)}</td>
        `;
        tr.addEventListener('click', () => {
          if (expandedThreads.has(group.key)) {
            expandedThreads.delete(group.key);
          } else {
            expandedThreads.add(group.key);
          }
          selectThread(group);
          render();
        });
        tr.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            tr.click();
          }
        });
        tr.addEventListener('mouseenter', () => showThreadDetail(group));
        rowsEl.appendChild(tr);
        if (expanded) {
          rowsEl.appendChild(renderThreadCalls(group));
        }
      }
      if (!groups.length) {
        rowsEl.innerHTML = '<tr><td class="empty-state" colspan="9">no threads in range — widen the time filter</td></tr>';
      }
      if (!initialDetailApplied && selectedThreadKey) {
        const selected = groups.find(group => group.key === selectedThreadKey);
        if (selected) {
          initialDetailApplied = true;
          showThreadDetail(selected);
        }
      }
      if (!initialDetailApplied && urlParams.get('detail') === 'first' && page.items[0]) {
        initialDetailApplied = true;
        showThreadDetail(page.items[0]);
      }
    }
    function renderThreadCalls(group) {
      const tr = document.createElement('tr');
      tr.className = 'thread-child-row';
      const calls = group.calls.map(row => {
        const flags = Array.isArray(row.efficiency_flags) ? row.efficiency_flags : [];
        return `
          <tr class="thread-call-row" tabindex="0" role="button" data-record-id="${escapeHtml(row.record_id || '')}">
            <td>${renderTimeCell(row.event_timestamp)}</td>
            <td><span class="pill model-pill" data-full-label="${escapeHtml(short(row.model))}">${escapeHtml(short(row.model))}</span></td>
            <td>${escapeHtml(effortDisplay(row))}</td>
            <td>${escapeHtml(sourceLabel(row))}</td>
            <td class="num">${number.format(row.total_tokens || 0)}</td>
            <td class="num">${costUsageCell(row.pricing_estimated ? `${money(row.estimated_cost_usd)}*` : money(row.estimated_cost_usd), row)}</td>
            <td class="num">${pct(row.cache_ratio)}</td>
            <td><div class="flags">${flags.slice(0, 2).map(flag => `<span class="flag">${escapeHtml(flag)}</span>`).join('')}</div></td>
          </tr>
        `;
      }).join('');
      tr.innerHTML = `
        <td class="child-cell" colspan="9">
          <table class="thread-call-table" aria-label="${escapeHtml(group.label)} calls">
            <thead><tr><th>Time</th><th>Model</th><th>Effort</th><th>Source</th><th class="num">Last Call</th><th class="num">Cost</th><th class="num">Cache</th><th>Signals</th></tr></thead>
            <tbody>${calls}</tbody>
          </table>
        </td>
      `;
      return tr;
    }
    function contextControls(row) {
      const fileMode = window.location.protocol === 'file:';
      const apiUnavailable = !contextApiEnabled || !apiToken;
      const disabled = fileMode || apiUnavailable ? ' disabled' : '';
      const hint = fileMode
        ? 'Open this dashboard with ai-usage-dashboard serve-dashboard to load raw context on demand.'
        : apiUnavailable
          ? 'Context loading is disabled for this dashboard server. Restart with --context-api explicit to enable explicit row actions.'
          : 'Context is not embedded in this dashboard. Press a button to read this call from the local JSONL source.';
      return `
        <div class="context-actions">
          <button class="context-button" type="button" data-context-load${disabled}>Load context</button>
          <button class="context-button secondary" type="button" data-context-load-output${disabled}>Include tool output</button>
        </div>
        <div id="contextResult" class="context-result"><p class="context-note">${escapeHtml(hint)}</p></div>
      `;
    }
    function bindContextButtons(row) {
      const loadButton = detailEl.querySelector('[data-context-load]');
      const outputButton = detailEl.querySelector('[data-context-load-output]');
      if (loadButton) loadButton.addEventListener('click', () => loadContext(row, false));
      if (outputButton) outputButton.addEventListener('click', () => loadContext(row, true));
    }
    function rowNeedsDetail(row) {
      return Boolean(row && row.record_id && !Object.prototype.hasOwnProperty.call(row, 'source_file'));
    }
    function rowDetailStatus(row) {
      if (row._detailPromise) return 'Loading additional aggregate fields...';
      if (row._detailError) return `Could not load additional aggregate fields: ${row._detailError}`;
      if (!rowNeedsDetail(row)) return '';
      if (liveRefreshSupported && apiToken) return 'Additional aggregate fields load on demand in the live dashboard.';
      return 'Open this dashboard with ai-usage-dashboard serve-dashboard to load additional aggregate fields.';
    }
    function rowDetailFallback(row, fallback) {
      return rowNeedsDetail(row) && !row._detailError ? 'Loading on demand...' : fallback;
    }
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
          const errorText = response.status === 404
            ? 'Aggregate row detail is unavailable for this record.'
            : `Aggregate row API returned HTTP ${response.status}.`;
          throw new Error(errorText);
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
          const errorText = response.status === 404
            ? 'Context API is unavailable here. Run ai-usage-dashboard serve-dashboard --open for on-demand context loading.'
            : `Context API returned HTTP ${response.status}.`;
          throw new Error(errorText);
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
    function pricingStatusText(row) {
      if (!row.pricing_model) return 'No configured price';
      return row.pricing_estimated ? 'Best-guess estimate' : 'Configured price';
    }
    function nextActionForRow(row) {
      if (row.recommended_action) return row.recommended_action;
      if (!row.pricing_model) return 'Configure pricing before trusting cost totals.';
      if (Number(row.cache_ratio || 0) < 0.3 && Number(row.input_tokens || 0) > 0) return 'Compare fresh input with the previous turn before continuing.';
      if (Number(row.context_window_percent || 0) >= 0.6) return 'Inspect the thread timeline and consider starting a fresh thread.';
      if (Number(row.reasoning_output_tokens || 0) > Number(row.output_tokens || 0)) return 'Review whether reasoning effort is appropriate for this task.';
      return 'Use the aggregate fields first; load context only if the signal is still unclear.';
    }
    function fieldsList(fields, className = 'detail-kv') {
      return `<dl class="${className}">${fields.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(short(value))}</dd>`).join('')}</dl>`;
    }
    function detailCollapse(title, fields) {
      return `
        <details class="detail-collapse">
          <summary>${escapeHtml(title)}</summary>
          <div class="detail-collapse-body">${fieldsList(fields)}</div>
        </details>
      `;
    }
    function timelineSeverity(value) {
      if (value >= 0.65) return 'high';
      if (value >= 0.35) return 'medium';
      return 'low';
    }
    function timelineWidth(value) {
      return `${Math.round(clamp(Number(value || 0), 0, 1) * 100)}%`;
    }
    function renderThreadTimeline(group) {
      const calls = group.calls.slice(-5);
      if (!calls.length) return '<p>No calls in this thread.</p>';
      return `<div class="timeline-list">${calls.map(row => {
        const contextUse = Number(row.context_window_percent || 0);
        return `
          <div class="timeline-item">
            <div class="timeline-time">${escapeHtml(formatTimestamp(row.event_timestamp, 'Unknown'))}</div>
            <div>
              <div class="timeline-title">${escapeHtml(sourceLabel(row))} · ${escapeHtml(short(row.model))}</div>
              <div class="timeline-meta">${escapeHtml(number.format(row.total_tokens || 0))} tokens · ${escapeHtml(money(row.estimated_cost_usd))} · ${escapeHtml(row.source_provider === 'anthropic' ? `${number.format(row.output_tokens || 0)} output` : usageCreditsWithStatus(row))} · cache ${escapeHtml(pct(row.cache_ratio))}</div>
              <div class="timeline-meta">${escapeHtml(recommendationSummary(row))}</div>
              <div class="signal-strip">
                <span class="flag">context ${escapeHtml(pct(contextUse))}</span>
                <span class="flag">${escapeHtml(pricingStatusText(row))}</span>
              </div>
              <div class="mini-bar" title="Context use ${escapeHtml(pct(contextUse))}"><span class="${timelineSeverity(contextUse)}" style="width: ${timelineWidth(contextUse)}"></span></div>
            </div>
          </div>
        `;
      }).join('')}</div>`;
    }
    function selectRow(row) {
      selectedRecordId = row.record_id || '';
      selectedThreadKey = '';
      showDetail(row);
      syncUrlState();
    }
    function selectThread(group) {
      selectedThreadKey = group.key || '';
      selectedRecordId = '';
      showThreadDetail(group);
      syncUrlState();
    }
    function showDetail(row) {
      const attachment = rowAttachment(row);
      const detailStatus = rowDetailStatus(row);
      const flags = Array.isArray(row.efficiency_flags) && row.efficiency_flags.length ? row.efficiency_flags.join(', ') : 'None';
      const whyFlagged = Array.isArray(row.flag_explanations) && row.flag_explanations.length
        ? row.flag_explanations.join(' ')
        : rowNeedsDetail(row) && !row._detailError
          ? 'Loading aggregate recommendation details...'
          : recommendationSummary(row);
      const uncachedLabel = row.source_provider === 'anthropic' ? 'Direct input' : 'Uncached input';
      const cachedLabel = row.source_provider === 'anthropic' ? 'Cache read' : 'Cached input';
      const sourceLine = row.source_file
        ? `${row.source_file}:${row.line_number || ''}`
        : rowDetailFallback(row, 'Unavailable');
      const contextWindow = row.model_context_window === null || row.model_context_window === undefined
        ? rowDetailFallback(row, 'Unknown')
        : number.format(row.model_context_window || 0);
      detailEl.innerHTML = `
        <div class="detail-stack">
          ${detailStatus ? `<p class="context-note">${escapeHtml(detailStatus)}</p>` : ''}
          <div class="detail-card primary">
            <h3>Cost, usage, and context</h3>
            ${fieldsList([
              ['Estimated cost', money(row.estimated_cost_usd)],
              ...(row.source_provider === 'anthropic' ? [] : [
                ['Codex credits', usageCreditsWithStatus(row)],
                ['Allowance impact', rowAllowanceImpact(row)],
              ]),
              ['Cache ratio', pct(row.cache_ratio)],
              [uncachedLabel, number.format(row.uncached_input_tokens || 0)],
              ['Context use', pct(row.context_window_percent)],
              ['Pricing status', pricingStatusText(row)],
              ['Next action', nextActionForRow(row)],
              ['Why flagged', whyFlagged],
            ])}
          </div>
          <div class="detail-card">
            <h3>Thread narrative</h3>
            ${fieldsList([
              ['Thread', attachment.label],
              ['Project', row.project_name || 'Unknown project'],
              ['Project tags', Array.isArray(row.project_tags) && row.project_tags.length ? row.project_tags.join(', ') : 'None'],
              ['Thread attachment', attachment.relation],
              ['Source', sourceLabel(row)],
              ['Usage source', usageSourceLabel(row)],
              ['Parent thread', resolvedParentThreadName(row) || 'None'],
              ['Timestamp', formatTimestamp(row.event_timestamp)],
            ])}
          </div>
          <div class="detail-card">
            <h3>Token and pricing breakdown</h3>
            ${fieldsList([
              ['Last call total', number.format(row.total_tokens || 0)],
              ['Last call input', number.format(row.input_tokens || 0)],
              [cachedLabel, number.format(row.cached_input_tokens || 0)],
              ['Cache creation input', number.format(row.cache_creation_input_tokens || 0)],
              ['Output', number.format(row.output_tokens || 0)],
              ['Reasoning output', number.format(row.reasoning_output_tokens || 0)],
              ['Session cumulative', number.format(row.cumulative_total_tokens || 0)],
              ['Pricing model', row.pricing_model || 'No configured price'],
              ['Credit model', row.usage_credit_model || rowDetailFallback(row, 'No mapped rate')],
              ['Credit confidence', usageCreditStatusText(row)],
              ['Credit source', row.usage_credit_source || rowDetailFallback(row, 'None')],
              ['Credit source fetched', row.usage_credit_fetched_at || rowDetailFallback(row, 'Unknown')],
              ['Credit tier', row.usage_credit_tier || rowDetailFallback(row, 'Unknown')],
              ['Cache savings', money(row.estimated_cache_savings_usd)],
              ['Efficiency signals', flags],
            ])}
          </div>
          ${detailCollapse('Raw aggregate identifiers', [
            ['Session', row.session_id],
            ['Turn', row.turn_id],
              ['Thread source', row.thread_source || 'user'],
              ['Subagent type', row.subagent_type || 'None'],
              ['Agent role', row.agent_role || 'None'],
              ['Agent nickname', row.agent_nickname || 'None'],
              ['Source app', row.source_app || 'Unknown'],
              ['Source provider', row.source_provider || 'Unknown'],
              ['Source format', row.source_format || 'Unknown'],
              ['Provider request id', row.provider_request_id || rowDetailFallback(row, 'None')],
              ['Credit note', row.usage_credit_note || rowDetailFallback(row, 'None')],
              ['Parent session', row.parent_session_id || 'None'],
            ['Parent updated', resolvedParentSessionUpdatedAt(row) ? formatTimestamp(resolvedParentSessionUpdatedAt(row)) : 'None'],
            ['Cwd', row.cwd],
            ['Project cwd', row.project_relative_cwd || '.'],
            ['Git branch', row.git_branch || 'Unknown'],
            ['Remote label', row.git_remote_label || 'None'],
            ['Remote hash', row.git_remote_hash || rowDetailFallback(row, 'None')],
          ])}
          ${detailCollapse('Source file and line', [
            ['Source line', sourceLine],
            ['Context window', contextWindow],
          ])}
          ${contextControls(row)}
        </div>
      `;
      detailEl.dataset.recordId = row.record_id || '';
      bindContextButtons(row);
      if (rowNeedsDetail(row) && !row._detailError && liveRefreshSupported && apiToken) {
        ensureRowDetail(row).then(() => {
          if (detailEl.dataset.recordId === (row.record_id || '')) showDetail(row);
        });
      }
    }
    function showThreadDetail(group) {
      const lifecycle = group.lifecycle || {};
      const anthropicThread = group.calls.every(row => row.source_provider === 'anthropic');
      const creditsDisplay = group.creditStatus === 'Not applicable'
        ? 'Not applicable'
        : `${credits(group.usageCredits)} credits · ${group.creditStatus}`;
      const allowanceDisplay = group.creditStatus === 'Not applicable'
        ? 'Codex remaining applies only to Codex/OpenAI rows.'
        : allowanceWindowText(group.usageCredits, 'impact') || allowanceWindowText(group.usageCredits, 'remaining') || `${credits(group.usageCredits)} credits counted toward Codex usage limits`;
      detailEl.innerHTML = `
        <div class="detail-stack">
          <div class="detail-card primary">
            <h3>Thread attention summary</h3>
            ${fieldsList([
              ['Estimated cost', pricingConfigured ? money(group.estimatedCost) : 'Not configured'],
              ...(anthropicThread ? [] : [
                ['Codex credits', creditsDisplay],
                ['Allowance impact', allowanceDisplay],
              ]),
              ['Attention score', number.format(Math.round(group.attentionScore))],
              ['Cache ratio', pct(group.cacheRatio)],
              ['Max context use', pct(group.maxContextUse)],
              ['Pricing status', group.pricingStatus],
              ['Next action', lifecycle.action || (group.maxContextUse >= threshold('high_context_percent', 0.6) || group.cacheRatio < threshold('low_cache_ratio', 0.3) ? 'Inspect the timeline before continuing this thread.' : 'Expand calls or select a row for call-level details.')],
            ])}
          </div>
          <div class="detail-card">
            <h3>Thread lifecycle</h3>
            ${fieldsList([
              ['First expensive turn', lifecycle.firstExpensiveRow ? `${formatTimestamp(lifecycle.firstExpensiveRow.event_timestamp)} · call ${number.format((lifecycle.firstExpensiveIndex || 0) + 1)}` : 'None above thresholds'],
              ['Largest cumulative jump', lifecycle.largestJumpRow ? `${number.format(lifecycle.largestJump)} tokens at ${formatTimestamp(lifecycle.largestJumpRow.event_timestamp)}` : 'None'],
              ['Cache trend', `${lifecycle.cacheTrend >= 0 ? '+' : ''}${pct(lifecycle.cacheTrend || 0)}`],
              ['Context trend', `${lifecycle.contextTrend >= 0 ? '+' : ''}${pct(lifecycle.contextTrend || 0)}`],
              ['Subagent before spike', lifecycle.subagentBeforeSpike ? 'Yes' : 'No'],
            ])}
          </div>
          <div class="detail-card">
            <h3>Thread timeline</h3>
            ${renderThreadTimeline(group)}
          </div>
          <div class="detail-card">
            <h3>Relationships</h3>
            ${fieldsList([
              ['Thread', group.label],
              ['Calls', number.format(group.callCount)],
              ['Subagent calls', number.format(group.subagentCount)],
              ['Auto-review calls', number.format(group.autoReviewCount)],
              ['Attached calls', number.format(group.attachedCount)],
              ['Spawned from', group.parentThreadLabel || 'None'],
              ['Spawned threads', number.format(group.childThreadCount || 0)],
              ['Spawned child calls', number.format(group.childCallCount || 0)],
            ])}
          </div>
          ${detailCollapse('Secondary thread fields', [
            ['Latest activity', formatTimestamp(group.latestActivity)],
            ['Total tokens', number.format(group.totalTokens)],
            ['Efficiency signals', number.format(group.signalCount)],
            ['Model mix', group.modelSummary],
            ['Source mix', group.sourceSummary],
            ['Reasoning mix', group.effortSummary],
          ])}
        </div>
      `;
    }
    function setView(view) {
      activeView = view;
      currentPage = 1;
      render();
    }
    function updateLiveStatus(label, detail = '') {
      liveStatusEl.textContent = label;
      liveStatusEl.title = detail || label;
      const key = label.toLowerCase();
      let state = 'static';
      if (key.includes('error')) state = 'error';
      else if (key === 'live') state = 'live';
      else if (key === 'updated') state = 'updated';
      else if (key === 'paused') state = 'paused';
      else if (key === 'refreshing' || key === 'checking' || key === 'reloading') state = 'busy';
      liveStatusEl.dataset.state = state;
      if (state === 'live' || state === 'paused') {
        const caret = document.createElement('span');
        caret.className = 'live-caret';
        caret.setAttribute('aria-hidden', 'true');
        caret.textContent = ' ▊';
        liveStatusEl.appendChild(caret);
      }
    }
    function pulseLiveStatus() {
      liveStatusEl.classList.remove('sunset-pulse');
      void liveStatusEl.offsetWidth;
      liveStatusEl.classList.add('sunset-pulse');
    }
    function updateToTopVisibility() {
      toTopEl.dataset.visible = window.scrollY > 320 ? 'true' : 'false';
    }
    const COUNT_UP_IDS = ['visibleCalls', 'totalTokens', 'inputTokens', 'cacheTokens', 'outputTokens', 'reasoningTokens', 'estimatedCost'];
    const countUpHandles = new Map();
    const reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    function parseCardNumber(text) {
      const match = /^\$?([\d,]+(?:\.\d+)?)$/.exec((text || '').trim());
      if (!match) return null;
      return {
        value: Number(match[1].replace(/,/g, '')),
        currency: (text || '').trim().startsWith('$'),
        decimals: (match[1].split('.')[1] || '').length,
      };
    }
    function captureCardValues() {
      const snapshot = new Map();
      COUNT_UP_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) snapshot.set(id, el.textContent);
      });
      return snapshot;
    }
    function cancelCardCountUps() {
      countUpHandles.forEach(handle => cancelAnimationFrame(handle));
      countUpHandles.clear();
    }
    function runCardCountUps(previousValues) {
      if (reducedMotionQuery.matches || document.visibilityState !== 'visible') return;
      COUNT_UP_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const finalText = el.textContent;
        const from = parseCardNumber(previousValues.get(id));
        const to = parseCardNumber(finalText);
        if (!from || !to || from.value === to.value) return;
        const start = performance.now();
        const step = now => {
          const progress = Math.min((now - start) / 320, 1);
          if (progress >= 1) {
            el.textContent = finalText;
            countUpHandles.delete(id);
            return;
          }
          const eased = 1 - Math.pow(1 - progress, 3);
          const value = from.value + (to.value - from.value) * eased;
          el.textContent = (to.currency ? '$' : '') + value.toLocaleString(undefined, {
            minimumFractionDigits: to.decimals,
            maximumFractionDigits: to.decimals,
          });
          countUpHandles.set(id, requestAnimationFrame(step));
        };
        countUpHandles.set(id, requestAnimationFrame(step));
      });
    }
    function applyDashboardPayload(nextPayload) {
      const previousCardValues = captureCardValues();
      data = payloadRows(nextPayload);
      pricingConfigured = Boolean(nextPayload.pricing_configured);
      pricingSource = nextPayload.pricing_source || {};
      pricingSnapshotWarning = nextPayload.pricing_snapshot_warning || '';
      allowanceConfigured = Boolean(nextPayload.allowance_configured);
      allowanceSource = nextPayload.allowance_source || {};
      allowanceWindowSource = nextPayload.allowance_window_source || {};
      allowanceWindows = Array.isArray(nextPayload.allowance_windows) ? nextPayload.allowance_windows : [];
      allowanceError = nextPayload.allowance_error || '';
      providerLimitSnapshots = nextPayload.provider_limit_snapshots || {};
      providerLimitHistory = Array.isArray(nextPayload.provider_limit_history) ? nextPayload.provider_limit_history : [];
      rateCardError = nextPayload.rate_card_error || '';
      parserDiagnostics = nextPayload.parser_diagnostics || {};
      projectMetadataPrivacy = nextPayload.project_metadata_privacy || { mode: nextPayload.privacy_mode || 'normal' };
      apiToken = nextPayload.api_token || apiToken;
      contextApiEnabled = Boolean(nextPayload.context_api_enabled);
      actionThresholds = nextPayload.action_thresholds || actionThresholds;
      totalAvailableRows = Number(nextPayload.total_available_rows || data.length);
      activeAvailableRows = Number(nextPayload.active_available_rows || data.length);
      allHistoryAvailableRows = Number(nextPayload.all_history_available_rows || totalAvailableRows);
      archivedAvailableRows = Number(nextPayload.archived_available_rows || Math.max(allHistoryAvailableRows - activeAvailableRows, 0));
      sourceSummaries = Array.isArray(nextPayload.source_summaries) ? nextPayload.source_summaries : [];
      includeArchived = Boolean(nextPayload.include_archived);
      loadedLimit = payloadLimit(nextPayload);
      rebuildDashboardIndexes();
      rebuildFilterOptions();
      updatePricingSourceLine();
      updatePrivacyModeLine();
      updateParserDiagnosticsLine();
      updateHistoryScopeControl();
      render();
      runCardCountUps(previousCardValues);
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
      refreshDashboardEl.disabled = true;
      updateLiveStatus(manual ? 'Refreshing' : 'Checking', manual ? 'Refreshing local usage index...' : 'Checking for new usage...');
      try {
        const params = new URLSearchParams({
          refresh: '1',
          limit: 'all',
          include_archived: includeArchived ? '1' : '0',
          _: String(Date.now()),
        });
        const range = currentDateRange();
        if (range.active && !range.invalid) {
          const priorRange = previousPeriodRange(range);
          if (priorRange) {
            params.set('since', priorRange.start.toISOString());
          } else if (range.start) {
            params.set('since', range.start.toISOString());
          }
          if (range.endExclusive) params.set('until', range.endExclusive.toISOString());
        }
        const response = await fetch(`/api/usage?${params.toString()}`, {
          headers: {
            'Accept': 'application/json',
            'X-Codex-Usage-Token': apiToken,
          },
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const nextPayload = await response.json();
        if (nextPayload.error) throw new Error(nextPayload.error);
        applyDashboardPayload(nextPayload);
        const result = nextPayload.refresh_result || {};
        const indexed = result.inserted_or_updated_events === undefined
          ? ''
          : ` Indexed ${number.format(result.inserted_or_updated_events)} aggregate rows from ${number.format(result.scanned_files || 0)} logs.`;
        const skipped = result.skipped_events
          ? ` Skipped ${number.format(result.skipped_events)} malformed token-count events.`
          : '';
        updateLiveStatus(autoRefreshEl.checked ? 'Live' : 'Updated', `Updated ${formatTimestamp(nextPayload.refreshed_at)}. ${loadedRowsDescription()}. ${historyRowsDescription()}.${indexed}${skipped}`);
        pulseLiveStatus();
      } catch (error) {
        const message = error.message || String(error);
        updateLiveStatus('Refresh error', `Live refresh unavailable: ${message}${manual ? '. Reload this page after regenerating a static dashboard, or run ai-usage-dashboard serve-dashboard.' : ''}`);
        if (manual && message === 'HTTP 404') window.location.reload();
      } finally {
        refreshInFlight = false;
        refreshDashboardEl.disabled = false;
        if (refreshQueued) {
          refreshQueued = false;
          refreshDashboardData(manual);
        }
      }
    }
    function scheduleAutoRefresh() {
      if (autoRefreshTimer) window.clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
      if (!autoRefreshEl.checked || !liveRefreshSupported) return;
      autoRefreshTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshDashboardData(false);
      }, liveRefreshIntervalMs);
    }
    insightsViewEl.addEventListener('click', () => setView('insights'));
    callsViewEl.addEventListener('click', () => setView('calls'));
    threadsViewEl.addEventListener('click', () => setView('threads'));
    trendMetricTokensEl.addEventListener('click', () => {
      if (trendMetric === 'tokens') return;
      trendMetric = 'tokens';
      render();
    });
    trendMetricCostEl.addEventListener('click', () => {
      if (trendMetric === 'cost') return;
      trendMetric = 'cost';
      render();
    });
    clearPresetEl.addEventListener('click', clearPreset);
    copyViewLinkEl.addEventListener('click', copyCurrentViewLink);
    exportVisibleEl.addEventListener('click', exportCurrentRows);
    refreshDashboardEl.addEventListener('click', () => refreshDashboardData(true));
    historyScopeEl.addEventListener('change', () => {
      includeArchived = historyScopeEl.value === 'all';
      currentPage = 1;
      updateHistoryScopeControl();
      syncUrlState();
      if (liveRefreshSupported) {
        refreshDashboardData(true);
      } else {
        updateLiveStatus('Static', 'Run ai-usage-dashboard serve-dashboard to switch between active sessions and all history from the dashboard.');
      }
    });
    autoRefreshEl.addEventListener('change', () => {
      scheduleAutoRefresh();
      updateLiveStatus(autoRefreshEl.checked ? 'Live' : 'Paused', `${autoRefreshEl.checked ? `Live refresh every ${liveRefreshIntervalMs / 1000}s` : 'Live refresh paused'}. ${loadedRowsDescription()}. ${historyRowsDescription()}`);
      if (autoRefreshEl.checked) refreshDashboardData(false);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && autoRefreshEl.checked) refreshDashboardData(false);
    });
    document.addEventListener('keydown', event => {
      const target = event.target;
      const inEditable = target && target.closest && target.closest('input, select, textarea, button, [contenteditable="true"]');
      if (inEditable) return;
      if (event.key === '/') {
        event.preventDefault();
        searchEl.focus();
        return;
      }
      if (event.key === '1') setView('insights');
      if (event.key === '2') setView('calls');
      if (event.key === '3') setView('threads');
    });
    window.addEventListener('scroll', updateToTopVisibility, { passive: true });
    toTopEl.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    prevPageEl.addEventListener('click', () => {
      currentPage = Math.max(1, currentPage - 1);
      render();
    });
    nextPageEl.addEventListener('click', () => {
      currentPage += 1;
      render();
    });
    document.querySelectorAll('[data-sort-key]').forEach(button => {
      button.addEventListener('click', () => handleHeaderSort(button.dataset.sortKey));
    });
    rowsEl.addEventListener('mouseover', event => {
      const callRow = event.target.closest('.thread-call-row');
      if (!callRow || !rowsEl.contains(callRow)) return;
      const row = rowByRecordId.get(callRow.dataset.recordId);
      if (row) selectRow(row);
    });
    rowsEl.addEventListener('click', event => {
      const callRow = event.target.closest('.thread-call-row');
      if (!callRow || !rowsEl.contains(callRow)) return;
      const row = rowByRecordId.get(callRow.dataset.recordId);
      if (row) showDetail(row);
    });
    rowsEl.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const callRow = event.target.closest('.thread-call-row');
      if (!callRow || !rowsEl.contains(callRow)) return;
      event.preventDefault();
      const row = rowByRecordId.get(callRow.dataset.recordId);
      if (row) selectRow(row);
    });
    datePresetEl.addEventListener('input', () => {
      syncDatePresetInputs();
      toggleCustomDateFields();
      currentPage = 1;
      render();
      if (liveRefreshSupported) refreshDashboardData(true);
    });
    [dateStartEl, dateEndEl].forEach(el => el.addEventListener('input', () => {
      if (datePresetEl.value !== 'custom') datePresetEl.value = 'custom';
      el.value = cleanDateInput(el.value) || el.value;
      currentPage = 1;
      render();
      if (liveRefreshSupported) refreshDashboardData(true);
    }));
    providerEl.addEventListener('input', () => {
      if (providerEl.value && appEl.value && !sourceCatalogHas(providerEl.value, appEl.value)) {
        appEl.value = '';
      }
    });
    [searchEl, modelEl, providerEl, appEl, effortEl, pricingStatusEl, threadScopeEl].forEach(el => el.addEventListener('input', () => {
      currentPage = 1;
      render();
    }));
    sortEl.addEventListener('input', () => setSort(sortEl.value, defaultSortDirection(sortEl.value)));
    rebuildDashboardIndexes();
    rebuildFilterOptions();
    applyInitialState();
    updatePricingSourceLine();
    updatePrivacyModeLine();
    updateParserDiagnosticsLine();
    updateHistoryScopeControl();
    if (!liveRefreshSupported) {
      autoRefreshEl.checked = false;
      autoRefreshEl.disabled = true;
      historyScopeEl.disabled = true;
      updateLiveStatus('Static', `Static snapshot. ${loadedRowsDescription()}. ${historyRowsDescription()}`);
    } else {
      updateLiveStatus('Live', `Live refresh every ${liveRefreshIntervalMs / 1000}s. ${loadedRowsDescription()}. ${historyRowsDescription()}`);
      scheduleAutoRefresh();
      refreshDashboardData(false);
    }
    updateToTopVisibility();
    render();
