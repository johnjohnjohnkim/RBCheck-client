import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Loads the real js/api.js in an isolated context with a scripted fetch.
function load(responses) {
  const calls = [];
  const queue = [...responses];
  const sandbox = {
    window: { RBCHECK_API_BASE: 'http://api.test' },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const API = vm.runInNewContext(fs.readFileSync(new URL('../js/api.js', import.meta.url), 'utf8') + '\n;API', sandbox);
  return { API, calls };
}

const reply = (status, body) => ({
  status, ok: status >= 200 && status < 300,
  json: async () => { if (body === undefined) throw new Error('no body'); return body; },
});

test('reads go to the configured API with no credentials', async () => {
  const { API, calls } = load([reply(200, { daily: '1.00' })]);
  assert.deepEqual(await API.summary(), { daily: '1.00' });
  await API.merchant('tim hortons');
  assert.equal(calls[0].url, 'http://api.test/transactions/summary');
  assert.equal(calls[1].url, 'http://api.test/transactions/merchant?merchant=tim%20hortons');
  for (const call of calls) assert.ok(!('Authorization' in (call.options.headers || {})));
});

test('writes send JSON', async () => {
  const { API, calls } = load([reply(201, { transaction_id: -1 })]);
  await API.create({ place: 'x', amount: 1 });
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { place: 'x', amount: 1 });
});

test('a network failure says the server cannot be reached', async () => {
  const { API } = load([new TypeError('fetch failed')]);
  await assert.rejects(API.summary(), err => err.message === 'Cannot reach the server');
});

test('server errors keep their explanation', async () => {
  await assert.rejects(load([reply(409, { detail: 'Transaction 5 already exists.' })]).API.create({}),
    err => err.message === 'Transaction 5 already exists. (409)');
  await assert.rejects(load([reply(422, { detail: [{ msg: 'bad date' }, { msg: 'bad amount' }] })]).API.summary(),
    err => err.message === 'bad date; bad amount (422)');
  await assert.rejects(load([reply(502)]).API.summary(), err => err.message === 'Server error: 502');
});
