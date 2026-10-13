import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Runs the real js/config.js as if the page were at `href`.
function apiFor(href) {
  const url = new URL(href);
  const window = {};
  vm.runInNewContext(fs.readFileSync(new URL('../js/config.js', import.meta.url), 'utf8'),
    { window, location: url, URLSearchParams });
  return window.RBCHECK_API_BASE;
}

test('the demo site uses the demo API and every other site the real one', () => {
  assert.equal(apiFor('https://rbcheckdemo.gwanwoo.dev/'), 'https://api.rbcheckdemo.gwanwoo.dev');
  assert.equal(apiFor('https://rbcheck.gwanwoo.dev/'), 'https://api.rbcheck.gwanwoo.dev');
  assert.equal(apiFor('https://rbcheck-client.example.workers.dev/'), 'https://api.rbcheck.gwanwoo.dev');
});

test('?api= only works from localhost and only towards localhost', () => {
  assert.equal(apiFor('http://127.0.0.1:3000/?api=http://127.0.0.1:8000'), 'http://127.0.0.1:8000');
  assert.equal(apiFor('http://127.0.0.1:3000/?api=https://evil.example'), 'https://api.rbcheck.gwanwoo.dev');
  assert.equal(apiFor('https://rbcheckdemo.gwanwoo.dev/?api=http://127.0.0.1:8000'), 'https://api.rbcheckdemo.gwanwoo.dev');
});
