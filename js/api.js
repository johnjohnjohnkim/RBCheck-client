// All network calls to the backend live here. Every function returns a Promise.
// The base URL comes from js/config.js.
const API = (() => {
  const BASE = window.RBCHECK_API_BASE;

  // Turns a failed response into an Error carrying the server's own explanation
  // (FastAPI sends {detail: "..."} or, for validation errors, a list).
  async function fail(r) {
    let detail = '';
    try {
      const body = await r.json();
      detail = Array.isArray(body.detail) ? body.detail.map(d => d.msg).join('; ') : body.detail || '';
    } catch { /* body wasn't JSON */ }
    throw new Error(detail ? `${detail} (${r.status})` : `Server error: ${r.status}`);
  }

  async function request(path, options) {
    let r;
    try {
      r = await fetch(BASE + path, options);
    } catch {
      throw new Error('Cannot reach the server');
    }
    if (!r.ok) await fail(r);
    return r.json();
  }

  const get = path => request(path);
  const send = (path, method, body) => request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
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
    create:     (data)          => send('/transactions', 'POST', data),
    update:     (id, data)      => send(`/transactions/${id}`, 'PATCH', data),
  };
})();
