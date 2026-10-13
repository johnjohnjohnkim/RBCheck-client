import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Auth from '../js/auth.js';

// Loads the real js/api.js in an isolated context with a scripted fetch.
function load({ responses, storage, onFetch } = {}) {
  const calls = [];
  const queue = [...(responses || [])];
  const sandbox = {
    Auth,
    window: { RBCHECK_API_BASE: 'http://api.test', localStorage: storage },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (onFetch) onFetch(url, options);
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

function memoryStorage(initial) {
  const data = new Map(initial ? [['rbcheck-token', initial]] : []);
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}

test('every request carries the stored token in a header and never in the URL', async () => {
  const { API, calls } = load({ responses: [reply(200, {})], storage: memoryStorage('s3cret-token') });
  await API.summary();
  await API.merchant('coffee');
  await API.create({ place: 'x' });
  for (const call of calls) {
    assert.equal(call.options.headers.Authorization, 'Bearer s3cret-token');
    assert.ok(!call.url.includes('s3cret-token'));
  }
  assert.equal(calls[2].options.headers['Content-Type'], 'application/json');   // write headers are kept
});

test('without a token no Authorization header is sent', async () => {
  const { API, calls } = load({ responses: [reply(200, {})] });
  await API.summary();
  assert.ok(!('Authorization' in calls[0].options.headers));
  assert.equal(API.hasToken(), false);
});

test('a 401 clears the stored token and triggers the prompt', async () => {
  const storage = memoryStorage('old-token');
  const { API } = load({ responses: [reply(401, { detail: 'Missing or invalid token.' })], storage });
  let prompts = 0;
  API.onUnauthorized(() => { prompts += 1; });
  await assert.rejects(API.summary(), err => err instanceof Auth.AuthError && err.status === 401);
  assert.equal(prompts, 1);
  assert.equal(API.hasToken(), false);
  assert.equal(storage.data.size, 0);
});

test('a 403 keeps the token and reports that it is read-only', async () => {
  const storage = memoryStorage('read-token');
  const { API } = load({ responses: [reply(403, { detail: 'This token is read-only.' })], storage });
  let prompts = 0;
  API.onUnauthorized(() => { prompts += 1; });
  await assert.rejects(API.create({}), err => err instanceof Auth.AuthError && err.status === 403 &&
    err.message === 'This token is read-only.');
  assert.equal(prompts, 0);
  assert.equal(API.hasToken(), true);
});

test('probeWrite: write token yes, read token no, bad token rethrows', async () => {
  assert.equal(await load({ responses: [reply(200, { cursor: 5 })], storage: memoryStorage('w') }).API.probeWrite(), true);
  assert.equal(await load({ responses: [reply(403, {})], storage: memoryStorage('r') }).API.probeWrite(), false);
  const bad = load({ responses: [reply(401, {})], storage: memoryStorage('x') });
  await assert.rejects(bad.API.probeWrite(), err => err.status === 401);
  assert.equal(bad.API.hasToken(), false);
});

test('a network failure is not an auth error and does not forget the token', async () => {
  const { API } = load({ responses: [new TypeError('fetch failed')], storage: memoryStorage('keep-me') });
  let prompts = 0;
  API.onUnauthorized(() => { prompts += 1; });
  await assert.rejects(API.summary(), err => !(err instanceof Auth.AuthError) && err.message === 'Cannot reach the server');
  assert.equal(prompts, 0);
  assert.equal(API.hasToken(), true);
});

test('other server errors keep their explanation', async () => {
  const { API } = load({ responses: [reply(409, { detail: 'Transaction 5 already exists.' })], storage: memoryStorage('t') });
  await assert.rejects(API.create({}), err => err.message === 'Transaction 5 already exists. (409)');
  const html = load({ responses: [reply(502)], storage: memoryStorage('t') });
  await assert.rejects(html.API.summary(), err => err.message === 'Server error: 502');
});

test('it still works when localStorage is blocked: the token lives in memory', async () => {
  const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  const { API, calls } = load({ responses: [reply(200, {})], storage: blocked });
  API.token.set('mem-token');
  await API.summary();
  assert.equal(calls[0].options.headers.Authorization, 'Bearer mem-token');
});

test('a late 401 for an old token does not discard a newly entered one', async () => {
  const storage = memoryStorage('token-A');
  let api;
  const loaded = load({
    responses: [reply(401, {})], storage,
    // while the request for token A is in flight the user pastes token B
    onFetch: () => api.token.set('token-B'),
  });
  api = loaded.API;
  let prompts = 0;
  api.onUnauthorized(() => { prompts += 1; });
  await assert.rejects(api.summary(), err => err.status === 401);
  assert.equal(api.token.get(), 'token-B');
  assert.equal(prompts, 0);
});

test('parallel requests rejected together prompt only once', async () => {
  const { API } = load({ responses: [reply(401, {})], storage: memoryStorage('bad') });
  let prompts = 0;
  API.onUnauthorized(() => { prompts += 1; });
  await Promise.allSettled([API.summary(), API.month(), API.past7(), API.insightsToday()]);
  assert.equal(prompts, 1);
});

test('probeWrite: a missing or failing endpoint is a server problem, not a verdict on the token', async () => {
  for (const status of [404, 500, 503]) {
    const { API } = load({ responses: [reply(status, {})], storage: memoryStorage('good-token') });
    await assert.rejects(API.probeWrite(), err => !(err instanceof Auth.AuthError), String(status));
    assert.equal(API.token.get(), 'good-token');
  }
  const down = load({ responses: [new TypeError('fetch failed')], storage: memoryStorage('good-token') });
  await assert.rejects(down.API.probeWrite(), err => err.message === 'Cannot reach the server');
  assert.equal(down.API.token.get(), 'good-token');
});
