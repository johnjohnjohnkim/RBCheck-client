// Turns /insights digests into HTML. Pure functions (no DOM, no fetch) so they
// can be unit tested in Node: `node --test tests/`. In the browser this file
// defines the global `Insights`.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Insights = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // The API sends money as strings ("50.00"); anything unreadable counts as zero.
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

  function money(v) {
    const n = num(v);
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '−$' : '$') + s;
  }

  // "2026-07-10" -> "Fri, Jul 10". Parsed by hand so the browser's timezone can't shift the day.
  function dayLabel(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // M/D/YYYY, the format GET /transactions/date expects.
  function mdy(iso) {
    const [y, m, d] = String(iso).split('-');
    return `${m}/${d}/${y}`;
  }

  // Spending up is bad (red), down is good (green).
  function deltaView(pct) {
    // Number('') is 0, which would read as a real 0% change, so blanks count as missing.
    const blank = pct === null || pct === undefined || (typeof pct === 'string' && pct.trim() === '');
    const value = blank ? NaN : Number(pct);
    if (!Number.isFinite(value)) return { text: 'no 7-day baseline yet', cls: '' };
    const p = Math.round(value);
    return {
      text: `${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% vs your previous 7-day average`,
      cls: p >= 0 ? 'bad' : 'good',
    };
  }

  function todayView(d) {
    const merchants = (d.top_merchants || []).map(m => ({ name: m.name, total: money(m.total), count: m.count }));
    const unusual = (d.unusual || []).map(u => ({ place: u.place, amount: money(u.amount), reason: u.reason }));
    const projected = d.projected_month_end;
    return {
      title: d.final ? 'Final tally' : 'So far today',
      spend: money(d.spend),
      delta: deltaView(d.pct_vs_avg),
      average: money(d.avg_previous_7),
      monthToDate: money(d.month_to_date),
      projected: projected === null || projected === undefined ? '—' : money(projected),
      projectedNote: projected === null || projected === undefined
        ? 'needs 3 full days of the month'
        : (d.final ? 'month-end pace' : 'at the current pace'),
      purchases: d.purchase_count || 0,
      merchants,
      unusual,
    };
  }

  function todayHtml(d) {
    const v = todayView(d);
    const merchants = v.merchants.length
      ? v.merchants.map(m => `
        <div class="dg-row"><span class="dg-name" title="${esc(m.name)}">${esc(m.name)}</span>
          <span class="dg-meta">${esc(Number(m.count) || 0)}×</span><span class="dg-total">${esc(m.total)}</span></div>`).join('')
      : '<div class="muted-note">No purchases yet.</div>';
    const unusual = v.unusual.length
      ? v.unusual.map(u => `
        <div class="dg-flag"><div class="dg-row"><span class="dg-name">${esc(u.place)}</span>
          <span class="dg-total">${esc(u.amount)}</span></div>
          <div class="dg-reason">${esc(u.reason)}</div></div>`).join('')
      : '<div class="muted-note">Nothing unusual.</div>';
    return `
      <div class="dg-head">
        <span class="dg-amount">${esc(v.spend)}</span>
        <span class="delta ${v.delta.cls}">${esc(v.delta.text)}</span>
        <span class="dg-meta">${esc(v.purchases)} ${v.purchases === 1 ? 'purchase' : 'purchases'}</span>
      </div>
      <div class="dg-stats">
        <div><span class="ins-label">Month so far</span><span class="dg-num">${esc(v.monthToDate)}</span></div>
        <div><span class="ins-label">On pace for</span><span class="dg-num">${esc(v.projected)}</span>
          <span class="ins-sub">${esc(v.projectedNote)}</span></div>
        <div><span class="ins-label">7-day average</span><span class="dg-num">${esc(v.average)}</span></div>
      </div>
      <h3 class="dg-sub">Where it went</h3>${merchants}
      <h3 class="dg-sub">Worth a look</h3>${unusual}`;
  }

  // One row per day with a bar scaled to the biggest day shown.
  function historyView(list) {
    // Rows without a real YYYY-MM-DD day are skipped: they could not be opened in the ledger.
    const rows = (list || []).filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(String(d.day)))
      .map(d => ({ day: d.day, spend: num(d.spend), digest: d }));
    const max = Math.max(0, ...rows.map(r => r.spend));
    return rows.map(r => ({
      day: r.day,
      label: dayLabel(r.day),
      spend: money(r.spend),
      width: r.spend > 0 && max > 0 ? Math.max(3, Math.round(r.spend / max * 100)) : 0,
      delta: deltaView(r.digest.pct_vs_avg),
      flagged: (r.digest.unusual || []).length,
    }));
  }

  function historyHtml(list) {
    const rows = historyView(list);
    if (!rows.length) return '<div class="muted-note">No days to show yet.</div>';
    return rows.map(r => `
      <button type="button" class="dg-day" data-mdy="${esc(mdy(r.day))}" data-label="${esc(r.label)}">
        <span class="dg-name">${esc(r.label)}${r.flagged ? ' <span class="dg-flagmark" role="img" aria-label="unusual charge" title="unusual charge">⚑</span>' : ''}</span>
        <span class="dg-total">${esc(r.spend)}</span>
        <span class="dg-bar" style="width:${r.width}%"></span>
      </button>`).join('');
  }

  return { esc, money, dayLabel, mdy, deltaView, todayView, todayHtml, historyView, historyHtml };
});
