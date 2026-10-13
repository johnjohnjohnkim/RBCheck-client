# RBCheck-client

A static, no-build HTML/CSS/JS frontend for [RBCheck](../RBCheck), a personal spending tracker built from parsed RBC (Royal Bank of Canada) SMS transaction alerts.

There is no package manager, bundler, or dev server in this repo. It is plain HTML/CSS/JS served as-is, with [Chart.js](https://www.chartjs.org/) pulled in via CDN.

## The Daily Ledger

`index.html` is a single-page, newspaper-styled dashboard: masthead, spend ticker, a hero stat with a 7-day sparkline, a quick-entry box, an insights row, a **Daily Digest** (today's spend against your previous 7-day average, where it went, unusual charges, month-end pace, plus a list of past days you can tap to open in the ledger), a spending chart, a month heatmap, a merchant leaderboard, and a full ledger table with search, amount and date filters, paging, CSV export and an edit modal.

## Backend

The API address is set in one place, `js/config.js`, and defaults to `https://api.rbcheck.gwanwoo.dev`. To use a local RBCheck instance, serve this folder from localhost and open the page with an `api` query parameter:

```
http://127.0.0.1:3000/index.html?api=http://127.0.0.1:8000
```

The override only works when the page itself is served from `localhost` or `127.0.0.1`.

See the [RBCheck README](../RBCheck/README.md) for the endpoints these files call.

Manual entries made with Quick Entry are sent without an id; the server assigns one.

## Signing in

The page opens on a sign-in screen and loads nothing until it succeeds. Sign in with the email and password created on the server with `python -m app.scripts.create_user`. There is one login, with full access.

The token the API returns is kept in this browser's `localStorage` (or just in memory if storage is blocked) and sent only in an `Authorization` header, never in the URL. When it expires (after the API's `ACCESS_TOKEN_EXPIRE_MINUTES`) or is rejected, it is forgotten and the sign-in screen returns. **Sign out** in the masthead forgets it on this device.

The API allows `localhost` and `127.0.0.1` on any port, so a local page can talk to a local API without extra setup.

## Project structure

```
RBCheck-client/
├── index.html      The Daily Ledger
├── css/styles.css
└── js/
    ├── config.js   API base URL
    ├── auth.js     Token storage helpers (pure, unit tested)
    ├── api.js      API client (signs in; sends the token; a 401 clears it and shows sign-in again)
    ├── insights.js Digest rendering helpers (pure functions, unit tested)
    └── app.js      Rendering, state and the sign-in flow
```

## Running locally

```bash
python -m http.server 3000
```

Then visit `http://127.0.0.1:3000/index.html`.

## Trying it against a local API

```bash
# in the RBCheck-api repo
uvicorn app.main:app                     # http://127.0.0.1:8000
python -m app.scripts.create_user you@example.com
# in this repo
python -m http.server 3000
# then open http://127.0.0.1:3000/index.html?api=http://127.0.0.1:8000
```

## Tests

```bash
node --test
```

Runs `tests/*.test.mjs` (Node 18+, no dependencies). They cover the digest rendering helpers in `js/insights.js` (formatting, empty and partial digests, HTML escaping, history bars), the token helpers in `js/auth.js`, and the real `js/api.js` against a scripted `fetch` (sign-in sends a form and keeps the token, a wrong password stores nothing, the token goes in a header and never the URL, a 401 clears it and shows sign-in, network failures are not mistaken for auth failures).
