import test from 'node:test';
import assert from 'node:assert/strict';
import Auth from '../js/auth.js';

const { AuthError, createTokenStore, bearer } = Auth;

function fakeStorage() {
  const data = new Map();
  return {
    data,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
  };
}

const brokenStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
};

test('the token is remembered and can be cleared', () => {
  const storage = fakeStorage();
  const store = createTokenStore(storage);
  assert.equal(store.get(), '');
  store.set('abc');
  assert.equal(store.get(), 'abc');
  assert.equal(createTokenStore(storage).get(), 'abc');   // a new page load finds it
  store.clear();
  assert.equal(store.get(), '');
  assert.equal(storage.data.size, 0);
});

test('blocked or missing storage falls back to memory instead of throwing', () => {
  for (const storage of [brokenStorage, null, undefined]) {
    const store = createTokenStore(storage);
    assert.doesNotThrow(() => store.set('abc'));
    assert.equal(store.get(), 'abc');
    assert.doesNotThrow(() => store.clear());
    assert.equal(store.get(), '');
  }
});

test('clearing forgets the token even when storage refuses', () => {
  const store = createTokenStore(brokenStorage);
  store.set('abc');
  store.clear();
  assert.equal(store.get(), '');
});

test('the bearer header is built only when there is a token', () => {
  assert.deepEqual(bearer('abc'), { Authorization: 'Bearer abc' });
  assert.deepEqual(bearer(''), {});
});

test('auth errors carry their status and are errors', () => {
  const err = new AuthError('nope', 403);
  assert.ok(err instanceof Error);
  assert.equal(err.status, 403);
  assert.equal(err.name, 'AuthError');
});

test('a token set with persist:false lives in memory only', () => {
  const storage = fakeStorage();
  const store = createTokenStore(storage);
  store.set('unchecked', { persist: false });
  assert.equal(store.get(), 'unchecked');
  assert.equal(storage.data.size, 0);              // nothing written yet
  assert.equal(createTokenStore(storage).get(), '');   // a reload would not find it
  store.set('unchecked');                           // validated: remember it
  assert.equal(createTokenStore(storage).get(), 'unchecked');
});

test('a token entered now wins over an older stored one', () => {
  const storage = fakeStorage();
  storage.setItem('rbcheck-token', 'old');
  const store = createTokenStore(storage);
  assert.equal(store.get(), 'old');
  store.set('new', { persist: false });
  assert.equal(store.get(), 'new');
});
