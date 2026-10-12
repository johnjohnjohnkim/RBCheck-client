// Where the API lives, and the login token every request needs.
// Load this before api.js / api-alt.js on every page.

// Pages served from this machine talk to a local API; everywhere else, production.
const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:8000'
  : 'https://api.gwanwoo.dev';

const Auth = (() => {
  const KEY = 'rbcheck.token';
  const onLoginPage = location.pathname.endsWith('login.html');

  // Storage can be unavailable (private windows, blocked site data).
  function token() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }

  function goToLogin() {
    const here = (location.pathname.split('/').pop() || 'index.html') + location.hash;
    location.replace('login.html?next=' + encodeURIComponent(here));
  }

  function logout() {
    try { localStorage.removeItem(KEY); } catch {}
    goToLogin();
  }

  /**
   * fetch() against the API with the login token attached. An expired or
   * missing login sends the browser to the login page.
   */
  async function apiFetch(path, options = {}) {
    const r = await fetch(API_BASE + path, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token()}` },
    });
    if (r.status === 401) {
      logout();
      throw new Error('Signed out');
    }
    return r;
  }

  /** Exchanges email and password for a token and keeps it. */
  async function login(email, password) {
    const r = await fetch(API_BASE + '/login', {
      method: 'POST',
      body: new URLSearchParams({ username: email, password }),  // the API expects a form, not JSON
    });
    if (r.status === 403) throw new Error('Wrong email or password.');
    if (!r.ok) throw new Error(`Server error: ${r.status}`);
    const { access_token } = await r.json();
    try {
      localStorage.setItem(KEY, access_token);
    } catch {
      throw new Error('This browser is blocking storage, so the login can’t be kept.');
    }
  }

  /** Where to go after logging in: the page that sent us here, if it is one of ours. */
  function nextPage() {
    const next = new URLSearchParams(location.search).get('next') || '';
    return /^[\w-]+\.html(#[\w-]*)?$/.test(next) ? next : 'index.html';
  }

  // Every other page needs a login before it loads any data.
  if (!onLoginPage && !token()) goToLogin();

  return { fetch: apiFetch, login, logout, nextPage };
})();
