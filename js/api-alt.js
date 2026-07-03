// API layer for the alternative frontend (index-alt.html).
// Covers every endpoint the backend exposes. All functions return Promises.
const API = (() => {
  const BASE = 'https://api.rbcheckdemo.gwanwoo.dev';

  async function get(path) {
    const r = await fetch(BASE + path);
    if (!r.ok) throw new Error(`Server error: ${r.status}`);
    return r.json();
  }

  async function send(path, method, body) {
    const r = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Server error: ${r.status}`);
    return r.json();
  }

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
