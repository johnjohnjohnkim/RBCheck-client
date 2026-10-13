// Token handling, kept free of the DOM and of fetch so it can be unit tested in
// Node (`node --test`). In the browser this defines the global `Auth`.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Auth = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const KEY = 'rbcheck-token';

  // 401 = the token is missing, expired or wrong; 403 = a wrong email or password at sign-in.
  class AuthError extends Error {
    constructor(message, status) {
      super(message);
      this.name = 'AuthError';
      this.status = status;
    }
  }

  // Remembers the token in `storage` (localStorage in the browser). Storage can be
  // missing or throw (private windows, blocked site data), so every access is
  // guarded and the token is also held in memory for the life of the page.
  function createTokenStore(storage) {
    let memory = '';
    return {
      get() {
        if (memory) return memory;
        try { return storage.getItem(KEY) || ''; } catch { return ''; }
      },
      // persist:false keeps the token for this page only.
      set(token, { persist = true } = {}) {
        memory = token;
        if (!persist) return;
        try { storage.setItem(KEY, token); } catch { /* memory only */ }
      },
      clear() {
        memory = '';
        try { storage.removeItem(KEY); } catch { /* nothing to clear */ }
      },
    };
  }

  function bearer(token) {
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  return { AuthError, createTokenStore, bearer };
});
