(function () {
  const ALLOWED_VIEWS = new Set(['overview', 'calls']);
  const ALLOWED_RANGES = new Set(['this-week', 'last-7-days', 'this-month', 'last-30-days', 'all', 'custom']);
  const ALLOWED_PROVIDERS = new Set(['openai', 'anthropic']);
  const ALLOWED_SORTS = new Set(['time', 'tokens', 'cost', 'cache']);
  const ALLOWED_DIRECTIONS = new Set(['asc', 'desc']);
  const STATE_KEYS = [
    'view',
    'q',
    'tokens',
    'date',
    'from',
    'to',
    'provider',
    'model',
    'effort',
    'confidence',
    'thread_type',
    'day',
    'sort',
    'direction',
    'page',
    'lpage',
    'thread',
    'record',
  ];

  function clean(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function positiveInt(value) {
    const parsed = Number(value || 1);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  }

  function read(params = new URLSearchParams(window.location.search)) {
    const range = clean(params.get('date'));
    return {
      view: ALLOWED_VIEWS.has(params.get('view')) ? params.get('view') : 'overview',
      search: clean(params.get('q')),
      tokensMetric: params.get('tokens') === 'uncached' ? 'uncached' : 'all',
      range: ALLOWED_RANGES.has(range) ? range : 'this-week',
      customStart: clean(params.get('from')),
      customEnd: clean(params.get('to')),
      provider: ALLOWED_PROVIDERS.has(params.get('provider')) ? params.get('provider') : '',
      fModel: clean(params.get('model')),
      fEffort: clean(params.get('effort')),
      fConfidence: clean(params.get('confidence')),
      fThreadType: clean(params.get('thread_type')),
      dayKey: clean(params.get('day')),
      sortKey: ALLOWED_SORTS.has(params.get('sort')) ? params.get('sort') : 'time',
      sortDir: ALLOWED_DIRECTIONS.has(params.get('direction')) ? params.get('direction') : '',
      page: positiveInt(params.get('page')),
      ledgerPage: positiveInt(params.get('lpage')),
      selectedThread: clean(params.get('thread')),
      selectedCall: clean(params.get('record')),
    };
  }

  function serialize(state) {
    const params = new URLSearchParams(window.location.search);
    STATE_KEYS.forEach(key => params.delete(key));
    set(params, 'view', state.view === 'calls' ? 'calls' : '');
    set(params, 'q', state.search);
    set(params, 'tokens', state.tokensMetric === 'uncached' ? 'uncached' : '');
    set(params, 'date', ALLOWED_RANGES.has(state.range) && state.range !== 'this-week' ? state.range : '');
    set(params, 'from', state.range === 'custom' ? state.customStart : '');
    set(params, 'to', state.range === 'custom' ? state.customEnd : '');
    set(params, 'provider', ALLOWED_PROVIDERS.has(state.provider) ? state.provider : '');
    set(params, 'model', state.fModel);
    set(params, 'effort', state.fEffort);
    set(params, 'confidence', state.fConfidence);
    set(params, 'thread_type', state.fThreadType);
    set(params, 'day', state.dayKey);
    set(params, 'sort', state.sortKey && state.sortKey !== 'time' ? state.sortKey : '');
    set(params, 'direction', ALLOWED_DIRECTIONS.has(state.sortDir) ? state.sortDir : '');
    set(params, 'page', state.page && Number(state.page) > 1 ? String(Math.floor(Number(state.page))) : '');
    set(params, 'lpage', state.ledgerPage && Number(state.ledgerPage) > 1 ? String(Math.floor(Number(state.ledgerPage))) : '');
    set(params, 'thread', state.selectedThread);
    set(params, 'record', state.selectedCall);
    return params;
  }

  function set(params, key, value) {
    const text = clean(value);
    if (text) params.set(key, text);
  }

  function urlFor(state) {
    const params = serialize(state);
    const query = params.toString();
    const base = window.location.href.split('#')[0].split('?')[0];
    return `${base}${query ? `?${query}` : ''}${window.location.hash || ''}`;
  }

  function replace(state) {
    if (!window.history || !window.history.replaceState) return;
    const nextUrl = urlFor(state);
    if (nextUrl === window.location.href) return;
    try {
      window.history.replaceState(null, '', nextUrl);
    } catch (error) {
      // Some environments (e.g. file: URLs) refuse history updates; the URL
      // echo is a convenience and must never break rendering.
    }
  }

  window.CodexUsageDashboardState = {
    read,
    replace,
    urlFor,
  };
}());
