// RBCheck — alternative frontend.
// Single-page app driving index-alt.html. Network calls live in js/api-alt.js.

// ── Tiny helpers ──────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const fmt = n => {
  n = Number(n) || 0;
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '−$' : '$') + s;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titleCase = s => s.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1));

const localKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mdy = d => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
const toLocalISO = d => `${localKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const dkey = tx => (tx.transaction_datetime || '').slice(0, 10);
const amt = tx => parseFloat(tx.amount) || 0;
// How each entry counts toward spending. Matched on substrings because the
// backend emits full names ("Credit Card Payment", "Credit Refund", "Deposit",
// "CC Purchase", "Withdrawal"). "payment" must be checked before "credit" so
// "Credit Card Payment" isn't mistaken for a refund.
//   payment          → card payment: grey, ignored in spending math
//   deposit          → money in: green, ignored in spending math
//   credit / refund  → money back: green, subtracts from spending
//   anything else    → spending
function kindOf(tx) {
  const t = String(tx.transaction_type || '').toLowerCase();
  if (t.includes('payment')) return 'payment';
  if (t.includes('deposit')) return 'deposit';
  if (t.includes('refund') || t.includes('credit')) return 'refund';
  return 'spend';
}
const spendVal = tx => {
  const k = kindOf(tx);
  return k === 'spend' ? amt(tx) : k === 'refund' ? -amt(tx) : 0;
};
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const FONT = "'Libre Caslon Text', Georgia, serif";

function timeLabel(tx) {
  const t = (tx.transaction_datetime || '').slice(11, 16);
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
}

// Transaction types get a colored pill. Known types are pinned to a hue,
// anything else is hashed onto the palette so it stays consistent.
function pill(type) {
  const label = type || 'other';
  const kind = kindOf({ transaction_type: label });
  let idx;
  if (kind === 'payment') idx = 6;                          // grey
  else if (kind === 'deposit' || kind === 'refund') idx = 1; // green
  else {
    const t = String(label).toLowerCase();
    let h = 0;
    for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    idx = h % 6;
  }
  return `<span class="pill pill-${idx}">${esc(label)}</span>`;
}

// ── State ─────────────────────────────────────────────────────────────────────

const S = {
  view: { mode: 'month' },   // what the ledger is currently showing
  lastPreset: 'month',       // preset to fall back to when search is cleared
  rows: [],                  // rows in the ledger right now
  monthRows: [],             // this month's transactions (heatmap, leaderboard, insights)
  past7Rows: [],             // past-7-days transactions (sparkline, hero delta)
  summary: null,             // SpendingDisplay from /transactions/summary
  offset: 0,
  limit: 50,
  hasMore: false,
  editing: null,
  qa: null,                  // last parsed quick-add preview
};

// ── Toasts ────────────────────────────────────────────────────────────────────

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(t, save = true) {
  document.documentElement.dataset.theme = t;
  if (save) localStorage.setItem('rb-theme', t);
  $('theme-toggle').textContent = t === 'dark' ? '☀' : '☾';
  renderChart();
  renderSpark();
}

$('theme-toggle').addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

// ── Masthead / ticker / hero ──────────────────────────────────────────────────

function setDateline() {
  $('masthead-date').textContent = new Date().toLocaleDateString('default',
    { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function renderTicker() {
  const s = S.summary || {};
  $('tick-today').textContent = fmt(s.daily);
  $('tick-week').textContent = fmt(s.weekly);
  $('tick-rolling').textContent = fmt(s.rolling);
  $('tick-month').textContent = fmt(s.monthly);
}

function renderHero() {
  const daily = parseFloat(S.summary?.daily) || 0;
  $('hero-amount').textContent = fmt(daily);
  $('hero-date').textContent = new Date().toLocaleDateString('default',
    { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const total7 = S.past7Rows.reduce((s, r) => s + spendVal(r), 0);
  const avg7 = total7 / 7;
  const el = $('hero-delta');
  if (avg7 > 0) {
    const pct = Math.round((daily - avg7) / avg7 * 100);
    el.textContent = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs your 7-day average`;
    el.className = 'delta ' + (pct >= 0 ? 'bad' : 'good');
  } else {
    el.textContent = '';
  }
}

// ── Sparkline (past 7 days, hand-drawn canvas) ────────────────────────────────

function renderSpark() {
  const c = $('spark');
  if (!c || !c.parentElement) return;
  const w = c.parentElement.clientWidth || 280;
  const h = 96;
  const dpr = window.devicePixelRatio || 1;
  c.width = w * dpr;
  c.height = h * dpr;
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(localKey(d));
  }
  const totals = {};
  for (const r of S.past7Rows) totals[dkey(r)] = (totals[dkey(r)] || 0) + spendVal(r);
  const data = days.map(k => Math.max(0, totals[k] || 0));
  const total = data.reduce((s, v) => s + v, 0);
  $('spark-caption').textContent = `${fmt(total)} total · ${fmt(total / 7)} a day`;

  const max = Math.max(...data, 1);
  const px = 8, py = 10;
  const X = i => px + i * (w - px * 2) / 6;
  const Y = v => h - py - (v / max) * (h - py * 2);
  const accent = cssVar('--accent');

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(X(0), h - py);
  data.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
  ctx.lineTo(X(6), h - py);
  ctx.closePath();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  data.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(X(6), Y(data[6]), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

// ── Insights strip ────────────────────────────────────────────────────────────

function renderInsights() {
  const rows = S.monthRows.filter(r => kindOf(r) === 'spend' || kindOf(r) === 'refund');
  const total = rows.reduce((s, r) => s + spendVal(r), 0);
  $('ins-avg').textContent = fmt(total / new Date().getDate());

  const byDay = {};
  for (const r of rows) byDay[dkey(r)] = (byDay[dkey(r)] || 0) + spendVal(r);
  const peak = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  $('ins-peak').textContent = peak ? fmt(peak[1]) : '—';
  $('ins-peak-sub').textContent = peak
    ? new Date(peak[0] + 'T00:00:00').toLocaleDateString('default', { month: 'long', day: 'numeric' })
    : 'no entries yet';

  const byPlace = {};
  for (const r of rows) byPlace[r.place || '—'] = (byPlace[r.place || '—'] || 0) + spendVal(r);
  const top = Object.entries(byPlace).sort((a, b) => b[1] - a[1])[0];
  $('ins-top').textContent = top ? top[0] : '—';
  $('ins-top-sub').textContent = top ? fmt(top[1]) + ' this month' : 'no entries yet';

  $('ins-count').textContent = S.monthRows.length;
}

// ── Main chart (mirrors whatever the ledger shows) ────────────────────────────

let chart = null;

// Buckets ledger rows by day, week, or month — granularity picked automatically
// from how long a span the rows cover.
function bucketRows(rows) {
  const keys = [...new Set(rows.map(dkey))].filter(Boolean).sort();
  if (!keys.length) return { labels: [], data: [], note: '' };
  const span = (new Date(keys[keys.length - 1]) - new Date(keys[0])) / 864e5;
  const mode = span > 180 ? 'month' : span > 42 ? 'week' : 'day';

  const map = new Map();
  for (const r of rows) {
    if (spendVal(r) === 0) continue;
    const k0 = dkey(r);
    if (!k0) continue;
    const d = new Date(k0 + 'T00:00:00');
    let k, label;
    if (mode === 'month') {
      k = k0.slice(0, 7);
      label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    } else if (mode === 'week') {
      const s = new Date(d);
      s.setDate(d.getDate() - d.getDay());
      k = localKey(s);
      label = 'wk ' + s.toLocaleDateString('default', { month: 'short', day: 'numeric' });
    } else {
      k = k0;
      label = d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
    }
    if (!map.has(k)) map.set(k, { label, total: 0 });
    map.get(k).total += spendVal(r);
  }
  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    labels: entries.map(e => e[1].label),
    data: entries.map(e => e[1].total),
    note: 'by ' + mode,
  };
}

function renderChart() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = FONT;
  const { labels, data, note } = bucketRows(S.rows);
  $('chart-note').textContent = note;
  if (chart) chart.destroy();
  const ink = cssVar('--ink-soft');
  const line = cssVar('--line');
  const accent = cssVar('--accent');
  chart = new Chart($('main-chart'), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: accent, borderRadius: 3, maxBarThickness: 38 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: ink } },
        y: { ticks: { color: ink, callback: v => '$' + v }, grid: { color: line } },
      },
    },
  });
}

// ── Heatmap calendar (this month) ─────────────────────────────────────────────

function renderHeatmap() {
  const now = new Date();
  $('heatmap-title').textContent = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  const totals = {};
  for (const r of S.monthRows) totals[dkey(r)] = (totals[dkey(r)] || 0) + spendVal(r);
  const max = Math.max(0, ...Object.values(totals));

  const y = now.getFullYear(), m = now.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();

  let html = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span class="hm-dow">${d}</span>`).join('');
  for (let i = 0; i < firstDow; i++) html += '<span class="hm-blank"></span>';
  for (let day = 1; day <= dim; day++) {
    const d = new Date(y, m, day);
    const total = totals[localKey(d)] || 0;
    const pct = max > 0 ? Math.round(8 + (total / max) * 72) : 0;
    const style = total > 0 ? ` style="background:color-mix(in srgb, var(--accent) ${pct}%, transparent)"` : '';
    const cls = 'hm-cell' + (total <= 0 ? ' hm-zero' : '') + (day === now.getDate() ? ' hm-today' : '');
    const label = d.toLocaleDateString('default', { month: 'long', day: 'numeric' });
    html += `<button class="${cls}"${style} data-mdy="${mdy(d)}" data-label="${label}"` +
      ` title="${label} — ${fmt(total)}">${day}</button>`;
  }
  $('heatmap').innerHTML = html;
}

$('heatmap').addEventListener('click', e => {
  const cell = e.target.closest('.hm-cell');
  if (!cell) return;
  $('ledger-search').value = '';
  setPresetActive(null);
  loadViewSafe({ mode: 'date', mdy: cell.dataset.mdy, label: cell.dataset.label });
  $('ledger').scrollIntoView({ behavior: 'smooth' });
});

// ── Merchant leaderboard (this month) ─────────────────────────────────────────

function renderLeaderboard() {
  const byPlace = {};
  for (const r of S.monthRows) {
    const k = kindOf(r);
    if (k === 'deposit' || k === 'payment') continue;
    const p = r.place || '—';
    byPlace[p] = byPlace[p] || { total: 0, count: 0 };
    byPlace[p].total += spendVal(r);
    byPlace[p].count++;
  }
  const top = Object.entries(byPlace).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  if (!top.length) {
    $('leaderboard').innerHTML = '<div class="muted-note">No entries yet this month.</div>';
    return;
  }
  const max = top[0][1].total || 1;
  $('leaderboard').innerHTML = top.map(([name, v], i) => `
    <button class="lb-row" data-merchant="${esc(name)}">
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-name">${esc(name)}</span>
      <span class="lb-meta">${v.count}×</span>
      <span class="lb-total">${fmt(v.total)}</span>
      <span class="lb-bar" style="width:${Math.max(4, v.total / max * 100)}%"></span>
    </button>`).join('');
}

$('leaderboard').addEventListener('click', e => {
  const row = e.target.closest('.lb-row');
  if (!row) return;
  $('ledger-search').value = row.dataset.merchant;
  setPresetActive(null);
  loadViewSafe({ mode: 'merchant', q: row.dataset.merchant });
  $('ledger').scrollIntoView({ behavior: 'smooth' });
});

// ── Ledger views ──────────────────────────────────────────────────────────────

function viewLabel(v) {
  const now = new Date();
  switch (v.mode) {
    case 'month':    return now.toLocaleString('default', { month: 'long', year: 'numeric' });
    case 'today':    return 'Today';
    case 'week':     return 'This week';
    case 'past7':    return 'Past seven days';
    case 'all':      return 'Everything, newest first';
    case 'merchant': return `Merchant — “${v.q}”`;
    case 'price':    return `Between ${fmt(v.min)} and ${fmt(v.max)}`;
    case 'range':    return `${v.start} → ${v.end}`;
    case 'date':     return v.label || v.mdy;
  }
}

async function loadView(view) {
  S.view = view;
  let rows;
  switch (view.mode) {
    case 'all':      rows = await API.all(S.offset, S.limit); S.hasMore = (rows || []).length === S.limit; break;
    case 'today':    rows = await API.byDate(mdy(new Date())); break;
    case 'week':     rows = await API.weekly(); break;
    case 'past7':    rows = await API.past7(); break;
    case 'month':    rows = await API.month(); break;
    case 'range':    rows = await API.range(view.start, view.end); break;
    case 'merchant': rows = await API.merchant(view.q); break;
    case 'price':    rows = await API.priceRange(view.min, view.max); break;
    case 'date':     rows = await API.byDate(view.mdy); break;
  }
  S.rows = (rows || []).slice().sort((a, b) =>
    (b.transaction_datetime || '').localeCompare(a.transaction_datetime || ''));
  $('ledger-label').textContent = viewLabel(view);
  renderLedger();
  renderChart();
}

async function loadViewSafe(view) {
  try {
    await loadView(view);
  } catch (err) {
    console.error(err);
    toast('Could not load entries: ' + err.message, 'error');
  }
}

function renderLedger() {
  const tb = $('ledger-body');
  const rows = S.rows;
  $('ledger-count').textContent = rows.length + (rows.length === 1 ? ' entry' : ' entries');

  const pager = $('pager');
  if (S.view.mode === 'all') {
    pager.hidden = false;
    $('pg-label').textContent = rows.length ? `${S.offset + 1}–${S.offset + rows.length}` : '—';
    $('pg-prev').disabled = S.offset === 0;
    $('pg-next').disabled = !S.hasMore;
  } else {
    pager.hidden = true;
  }

  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="4"><div class="empty">Nothing here — the ledger is clean.</div></td></tr>`;
    return;
  }

  // Group rows by day (rows are already sorted newest-first) with a subtotal per day.
  const groups = new Map();
  for (const r of rows) {
    const k = dkey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  let html = '';
  for (const [day, list] of groups) {
    const subtotal = list.reduce((s, r) => s + spendVal(r), 0);
    const label = new Date(day + 'T00:00:00').toLocaleDateString('default',
      { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    html += `<tr class="day-row"><td colspan="3">${label}</td><td class="day-sum">${fmt(subtotal)}</td></tr>`;
    html += list.map(r => {
      const k = kindOf(r);
      const moneyIn = k === 'deposit' || k === 'refund';
      return `
      <tr class="lrow${k === 'payment' ? ' lrow--muted' : ''}" data-id="${r.transaction_id}">
        <td class="l-time">${timeLabel(r)}</td>
        <td class="l-place">${esc(r.place || '—')}</td>
        <td>${pill(r.transaction_type)}</td>
        <td class="l-amt${moneyIn ? ' l-amt--in' : ''}">${moneyIn ? '+' : ''}${fmt(amt(r))}</td>
      </tr>`;
    }).join('');
  }
  tb.innerHTML = html;
}

// ── Ledger controls ───────────────────────────────────────────────────────────

function setPresetActive(name) {
  document.querySelectorAll('[data-preset]').forEach(b =>
    b.classList.toggle('active', !!name && b.dataset.preset === name));
}

document.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
  const p = btn.dataset.preset;
  S.offset = 0;
  S.lastPreset = p;
  $('ledger-search').value = '';
  setPresetActive(p);
  loadViewSafe({ mode: p });
  if (btn.closest('.ticker')) $('ledger').scrollIntoView({ behavior: 'smooth' });
}));

let searchTimer;
$('ledger-search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  searchTimer = setTimeout(() => {
    S.offset = 0;
    if (!q) {
      setPresetActive(S.lastPreset);
      loadViewSafe({ mode: S.lastPreset });
    } else {
      setPresetActive(null);
      loadViewSafe({ mode: 'merchant', q });
    }
  }, 350);
});

$('price-apply').addEventListener('click', () => {
  const min = parseFloat($('price-min').value);
  const max = parseFloat($('price-max').value);
  if (isNaN(min) || isNaN(max) || max < min) return toast('Enter a valid amount range', 'error');
  setPresetActive(null);
  loadViewSafe({ mode: 'price', min, max });
});

$('range-apply').addEventListener('click', () => {
  const start = $('range-from').value;
  const end = $('range-to').value;
  if (!start || !end || end < start) return toast('Pick a valid date range', 'error');
  setPresetActive(null);
  loadViewSafe({ mode: 'range', start, end });
});

$('pg-prev').addEventListener('click', () => {
  S.offset = Math.max(0, S.offset - S.limit);
  loadViewSafe({ mode: 'all' });
});

$('pg-next').addEventListener('click', () => {
  S.offset += S.limit;
  loadViewSafe({ mode: 'all' });
});

$('export-csv').addEventListener('click', () => {
  if (!S.rows.length) return toast('Nothing to export', 'error');
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    'date,time,merchant,type,amount',
    ...S.rows.map(r => [
      dkey(r),
      (r.transaction_datetime || '').slice(11, 16),
      q(r.place),
      q(r.transaction_type),
      amt(r).toFixed(2),
    ].join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rbcheck-${localKey(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Exported ${S.rows.length} entries`);
});

// ── Quick entry (natural-language parser) ─────────────────────────────────────

/**
 * Parses free text like “coffee at Blue Bottle $6.75 yesterday” into
 * { amount, place, date, type }. Heuristics, in order:
 *   type   — a transaction-type word anywhere (debit/credit/refund/…)
 *   date   — “today”, “yesterday”, or an M/D[/YYYY] token; defaults to today
 *   amount — a $-prefixed number, else the last decimal, else the last number
 *   place  — whatever follows “at/@/from”, else the remaining words
 */
function parseQuick(text) {
  let t = ' ' + text.trim() + ' ';
  const out = { amount: null, place: '', date: new Date(), type: 'debit' };

  const ty = t.match(/\b(credit|refund|payment|transfer|deposit|debit)\b/i);
  if (ty) { out.type = ty[1].toLowerCase(); t = t.replace(ty[0], ' '); }

  if (/\byesterday\b/i.test(t)) {
    out.date.setDate(out.date.getDate() - 1);
    t = t.replace(/\byesterday\b/i, ' ');
  } else if (/\btoday\b/i.test(t)) {
    t = t.replace(/\btoday\b/i, ' ');
  } else {
    const dm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (dm) {
      const year = dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : new Date().getFullYear();
      const d = new Date(year, +dm[1] - 1, +dm[2]);
      if (!isNaN(d)) { out.date = d; t = t.replace(dm[0], ' '); }
    }
  }

  const dollar = t.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  if (dollar) {
    out.amount = parseFloat(dollar[1]);
    t = t.replace(dollar[0], ' ');
  } else {
    const decimals = [...t.matchAll(/\b\d+\.\d{1,2}\b/g)];
    const numbers = decimals.length ? decimals : [...t.matchAll(/\b\d+(?:\.\d+)?\b/g)];
    if (numbers.length) {
      const last = numbers[numbers.length - 1];
      out.amount = parseFloat(last[0]);
      t = t.slice(0, last.index) + ' ' + t.slice(last.index + last[0].length);
    }
  }

  const at = t.match(/\b(?:at|@|from)\s+(.+)/i);
  let place = at ? at[1] : t;
  place = place
    .replace(/\b(spent|paid|bought|got|grabbed|for|on|a|an|the)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}'&\-. ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  out.place = place ? titleCase(place) : '';
  return out;
}

function renderQaPreview() {
  const text = $('qa-input').value;
  const box = $('qa-preview');
  if (!text.trim()) {
    box.hidden = true;
    $('qa-submit').disabled = true;
    S.qa = null;
    return;
  }
  const p = parseQuick(text);
  S.qa = p;
  $('qa-submit').disabled = !(p.amount > 0 && p.place);
  box.hidden = false;
  const chip = (label, val, missing) =>
    `<span class="chip${missing ? ' chip-missing' : ''}"><b>${label}</b>${esc(val)}</span>`;
  box.innerHTML =
    chip('Merchant', p.place || 'who?', !p.place) +
    chip('Amount', p.amount > 0 ? fmt(p.amount) : 'how much?', !(p.amount > 0)) +
    chip('Date', p.date.toLocaleDateString('default', { month: 'short', day: 'numeric' }), false) +
    chip('Type', p.type, false);
}

$('qa-input').addEventListener('input', renderQaPreview);
$('qa-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('qa-submit').click(); }
});

$('qa-submit').addEventListener('click', async () => {
  const p = S.qa;
  if (!p || !(p.amount > 0) || !p.place) return;
  const now = new Date();
  const dt = new Date(p.date);
  if (dt.toDateString() === now.toDateString()) dt.setHours(now.getHours(), now.getMinutes(), 0, 0);
  else dt.setHours(12, 0, 0, 0);
  try {
    await API.create({
      transaction_id: Date.now(),
      amount: p.amount,
      place: p.place,
      transaction_datetime: toLocalISO(dt),
      transaction_type: p.type,
    });
    $('qa-input').value = '';
    renderQaPreview();
    toast(`Logged ${fmt(p.amount)} at ${p.place}`);
    refreshAll();
  } catch (err) {
    toast('Could not save: ' + err.message, 'error');
  }
});

// ── Edit modal ────────────────────────────────────────────────────────────────

function openEdit(tx) {
  S.editing = tx;
  $('ed-title').textContent = `Edit Entry №${tx.transaction_id}`;
  $('ed-date').value = dkey(tx);
  $('ed-time').value = (tx.transaction_datetime || '').slice(11, 16);
  $('ed-place').value = tx.place || '';
  $('ed-amount').value = amt(tx) || '';
  $('ed-type').value = tx.transaction_type || '';
  const seen = [...new Set([...S.monthRows, ...S.rows].map(r => r.transaction_type).filter(Boolean))];
  $('type-options').innerHTML = seen.map(t => `<option value="${esc(t)}">`).join('');
  $('ed-overlay').classList.add('open');
  $('ed-place').focus();
}

function closeEdit() {
  $('ed-overlay').classList.remove('open');
  S.editing = null;
}

$('ledger-body').addEventListener('click', e => {
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const tx = S.rows.find(r => r.transaction_id === +row.dataset.id);
  if (tx) openEdit(tx);
});

$('ed-close').addEventListener('click', closeEdit);
$('ed-cancel').addEventListener('click', closeEdit);
$('ed-overlay').addEventListener('click', e => { if (e.target === $('ed-overlay')) closeEdit(); });

$('ed-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!S.editing) return;
  const date = $('ed-date').value;
  const time = $('ed-time').value || '12:00';
  const amount = parseFloat($('ed-amount').value);
  const place = $('ed-place').value.trim();
  if (!date || !place || isNaN(amount) || amount <= 0) return;
  const [y, mo, d] = date.split('-');
  try {
    await API.update(S.editing.transaction_id, {
      transaction_id: S.editing.transaction_id,
      date: `${mo}/${d}/${y}`,
      amount,
      place,
      transaction_datetime: `${date}T${time}:00`,
      transaction_type: $('ed-type').value.trim() || S.editing.transaction_type || 'debit',
    });
    closeEdit();
    toast('Entry updated');
    refreshAll();
  } catch (err) {
    toast('Could not save: ' + err.message, 'error');
  }
});

// ── Keyboard shortcuts & resize ───────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') return closeEdit();
  const tag = (document.activeElement || {}).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === '/') { e.preventDefault(); $('ledger-search').focus(); }
  if (e.key === 'n') { e.preventDefault(); $('qa-input').focus(); }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderSpark, 150);
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function refreshAll() {
  try {
    const [summary, monthRows, p7] = await Promise.all([API.summary(), API.month(), API.past7()]);
    S.summary = summary;
    S.monthRows = monthRows || [];
    S.past7Rows = p7 || [];
    renderTicker();
    renderHero();
    renderSpark();
    renderInsights();
    renderHeatmap();
    renderLeaderboard();
    await loadView(S.view);
  } catch (err) {
    console.error(err);
    toast('Could not reach the RBCheck server', 'error');
  }
}

(function boot() {
  applyTheme(localStorage.getItem('rb-theme') || 'light', false);
  setDateline();
  setPresetActive('month');
  refreshAll();
})();
