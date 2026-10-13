// All network calls to the backend live here. Every function returns a Promise.
// The base URL comes from js/config.js; token handling comes from js/auth.js.
const API = (() => {
  const BASE = window.RBCHECK_API_BASE;
  const tokens = Auth.createTokenStore((() => {
    try { return window.localStorage; } catch { return null; }
  })());
  let onUnauthorized = () => {};

  // The server's own explanation of a failed response
  // (FastAPI sends {detail: "..."} or, for validation errors, a list).
  async function detailOf(r) {
    try {
      const body = await r.json();
      return Array.isArray(body.detail) ? body.detail.map(d => d.msg).join('; ') : body.detail || '';
    } catch {
      return '';   // the body wasn't JSON
    }
  }

  async function request(path, options = {}) {
    let r;
    const sent = tokens.get();
    try {
      // The token travels only in this header, never in the URL.
      r = await fetch(BASE + path, { ...options, headers: { ...(options.headers || {}), ...Auth.bearer(sent) } });
    } catch {
      throw new Error('Cannot reach the server');
    }
    if (r.status === 401) {
      // Forget the token and ask again, but only if it is still the one that was
      // rejected: a late reply for an old token must not discard a newly entered one,
      // and several parallel requests rejected together prompt only once.
      if (tokens.get() === sent) {
        tokens.clear();
        onUnauthorized();
      }
      throw new Auth.AuthError('Your session has ended.', 401);
    }
    await failOn(r);
    return r.json();
  }

  async function failOn(r) {
    if (!r.ok) {
      const detail = await detailOf(r);
      throw new Error(detail ? `${detail} (${r.status})` : `Server error: ${r.status}`);
    }
  }

  const get = path => request(path);
  const send = (path, method, body) => request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    token: tokens,
    hasToken: () => Boolean(tokens.get()),
    // Called (once per rejected request) when the server says the token is not valid.
    onUnauthorized: fn => { onUnauthorized = fn; },
    // Swaps an email and password for a token (POST /login, a form post) and keeps it.
    async login(email, password) {
      let r;
      try {
        r = await fetch(BASE + '/login', { method: 'POST', body: new URLSearchParams({ username: email, password }) });
      } catch {
        throw new Error('Cannot reach the server');
      }
      if (r.status === 403) throw new Auth.AuthError('Wrong email or password.', 403);
      await failOn(r);
      tokens.set((await r.json()).access_token);
    },

    summary:    ()              => get('/transactions/summary'),
    all:        (offset, limit) => get(`/transactions/?offset=${offset}&limit=${limit}`),
    byDate:     (mdy)           => get(`/transactions/date?date_str=${encodeURIComponent(mdy)}`),
    weekly:     ()              => get('/transactions/weekly'),
    past7:      ()              => get('/transactions/past_7_days'),
    month:      ()              => get('/transactions/month'),
    range:      (start, end)    => get(`/transactions/date_range?start_date=${start}&end_date=${end}`),
    merchant:   (m)             => get(`/transactions/merchant?merchant=${encodeURIComponent(m)}`),
    priceRange: (min, max)      => get(`/transactions/price_range?range_start=${min}&range_end=${max}`),
    one:        (id)            => get(`/transactions/${id}`),
    insightsToday:   ()         => get('/insights/today'),
    insightsHistory: (days)     => get(`/insights/history?days=${days}`),
    create:     (data)          => send('/transactions', 'POST', data),
    update:     (id, data)      => send(`/transactions/${id}`, 'PATCH', data),
  };
})();
