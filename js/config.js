// The one place the API address is set. Edit it here to point at another backend.
// For local development, open the page from localhost with ?api=http://127.0.0.1:8000
// The override is ignored on any other host and must itself point at localhost.
(function () {
  const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const override = new URLSearchParams(location.search).get('api');
  const onLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
  window.RBCHECK_API_BASE =
    (onLocalhost && override && LOCAL.test(override) ? override : null) ||
    'https://api.rbcheck.gwanwoo.dev';
})();
