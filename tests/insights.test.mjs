import test from 'node:test';
import assert from 'node:assert/strict';
import Insights from '../js/insights.js';

const { money, dayLabel, mdy, deltaView, todayView, todayHtml, historyView, historyHtml } = Insights;

// Shaped exactly like GET /insights/today (money arrives as strings).
const digest = {
  day: '2026-07-10', final: false, spend: '50.00', avg_previous_7: '7.86', pct_vs_avg: 536.4,
  month_to_date: '120.00', projected_month_end: '241.11', purchase_count: 3, computed_at: '2026-07-10T20:00:00Z',
  top_merchants: [{ name: 'STORE', total: '50.00', count: 1 }, { name: 'CAFE', total: '10.00', count: 2 }],
  unusual: [{ transaction_id: 7, place: 'COFFEE', amount: '30.00', reason: '6.0x your usual $5.00 at COFFEE' }],
};

test('money formats strings, negatives and junk', () => {
  assert.equal(money('1234.5'), '$1,234.50');
  assert.equal(money('-12'), '−$12.00');
  assert.equal(money(undefined), '$0.00');
  assert.equal(money('abc'), '$0.00');
});

test('dates are not shifted by the timezone', () => {
  assert.equal(dayLabel('2026-07-10'), 'Fri, Jul 10');
  assert.equal(mdy('2026-07-10'), '07/10/2026');
});

test('delta: up is bad, down is good, no baseline is neutral', () => {
  assert.deepEqual(deltaView(536.4), { text: '▲ 536% vs your previous 7-day average', cls: 'bad' });
  assert.deepEqual(deltaView(-12.4), { text: '▼ 12% vs your previous 7-day average', cls: 'good' });
  assert.equal(deltaView(null).cls, '');
  assert.match(deltaView(null).text, /no 7-day baseline/);
});

test('today view for a day in progress', () => {
  const v = todayView(digest);
  assert.equal(v.title, 'So far today');
  assert.equal(v.spend, '$50.00');
  assert.equal(v.projected, '$241.11');
  assert.equal(v.projectedNote, 'at the current pace');
  assert.deepEqual(v.merchants[1], { name: 'CAFE', total: '$10.00', count: 2 });
});

test('projection missing shows a dash and explains why', () => {
  const v = todayView({ ...digest, projected_month_end: null });
  assert.equal(v.projected, '—');
  assert.match(v.projectedNote, /3 full days/);
});

test('an empty day renders friendly empty states, not blanks', () => {
  const html = todayHtml({ day: '2026-07-10', spend: '0.00', avg_previous_7: '0.00', pct_vs_avg: null,
    month_to_date: '0.00', projected_month_end: null, top_merchants: [], unusual: [] });
  assert.match(html, /No purchases yet/);
  assert.match(html, /Nothing unusual/);
  assert.match(html, /\$0\.00/);
});

test('a digest with missing fields does not throw', () => {
  assert.doesNotThrow(() => todayHtml({}));
  assert.doesNotThrow(() => historyHtml([{ day: '2026-07-10' }]));
});

test('merchant names and reasons are escaped', () => {
  const html = todayHtml({ ...digest,
    top_merchants: [{ name: '<img src=x onerror=alert(1)>', total: '1.00', count: 1 }],
    unusual: [{ place: '"><script>', amount: '5', reason: '<b>big</b>' }] });
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<b>'));
  assert.match(html, /&lt;img/);
});

test('history bars scale to the biggest day; refund days get no bar', () => {
  const rows = historyView([
    { day: '2026-07-10', spend: '50.00', pct_vs_avg: 536.4, unusual: [{}] },
    { day: '2026-07-09', spend: '25.00', pct_vs_avg: null, unusual: [] },
    { day: '2026-07-08', spend: '-12.00', pct_vs_avg: null, unusual: [] },
    { day: '2026-07-07', spend: '0.10', pct_vs_avg: null, unusual: [] },
  ]);
  assert.deepEqual(rows.map(r => r.width), [100, 50, 0, 3]);
  assert.equal(rows[2].spend, '−$12.00');
  assert.equal(rows[0].flagged, 1);
});

test('history rows carry the date the ledger needs', () => {
  const html = historyHtml([{ day: '2026-07-10', spend: '50.00', pct_vs_avg: null, unusual: [] }]);
  assert.match(html, /data-mdy="07\/10\/2026"/);
  assert.match(html, /Fri, Jul 10/);
});

test('history with no days says so', () => {
  assert.match(historyHtml([]), /No days to show/);
});

test('hostile count values are escaped or coerced', () => {
  const html = todayHtml({ ...digest, top_merchants: [{ name: 'A', total: '1', count: '<img src=x onerror=1>' }] });
  assert.ok(!html.includes('<img'));
  assert.match(html, /0×/);
});

test('a non-numeric or infinite percentage is treated as no baseline', () => {
  for (const bad of ['abc', NaN, Infinity, {}, '']) {
    const d = deltaView(bad);
    assert.equal(d.cls, '', String(bad));
    assert.match(d.text, /no 7-day baseline/);
  }
  assert.equal(deltaView('12.5').cls, 'bad');   // numeric strings are fine
  assert.equal(deltaView(0).cls, 'bad');        // exactly flat is rendered as up by 0%, not hidden
});

test('a finished day is labelled final with a month-end pace', () => {
  const v = todayView({ ...digest, final: true });
  assert.equal(v.title, 'Final tally');
  assert.equal(v.projectedNote, 'month-end pace');
});

test('the purchase count is shown with correct pluralisation', () => {
  assert.match(todayHtml({ ...digest, purchase_count: 1 }), /1 purchase</);
  assert.match(todayHtml({ ...digest, purchase_count: 3 }), /3 purchases</);
  assert.match(todayHtml({ ...digest, purchase_count: 0 }), /0 purchases</);
});

test('history rows with malformed days are skipped, not sent to the ledger', () => {
  const html = historyHtml([
    { day: 'garbage', spend: '5.00' },
    { day: '2026-07-10', spend: '5.00', pct_vs_avg: null, unusual: [] },
    null,
  ]);
  assert.ok(!html.includes('Invalid Date'));
  assert.ok(!html.includes('undefined'));
  assert.equal((html.match(/class="dg-day"/g) || []).length, 1);
});

test('data attributes cannot be broken out of by quotes', () => {
  const html = historyHtml([{ day: '2026-07-10', spend: '5', pct_vs_avg: null, unusual: [] }]);
  assert.match(html, /data-label="Fri, Jul 10"/);
  assert.match(html, /type="button"/);
});

test('flag marks are announced to assistive tech', () => {
  const html = historyHtml([{ day: '2026-07-10', spend: '5', pct_vs_avg: null, unusual: [{ reason: 'x' }] }]);
  assert.match(html, /aria-label="unusual charge"/);
});
