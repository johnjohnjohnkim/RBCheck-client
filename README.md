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

## Unlocking

The API needs a token, so the page opens locked and loads nothing until one is accepted. Paste either of the API's tokens into the unlock screen:

- the **read** token shows the whole ledger, with Quick Entry and editing switched off (the badge in the masthead says *Read-only*);
- the **write** token also allows adding and editing (*Full access*).

The token is kept in this browser's `localStorage` (or just in memory if storage is blocked), sent only in an `Authorization` header and never in the URL. A wrong or changed token is forgotten and the prompt returns. **Lock** in the masthead forgets it on this device. Use the read token on devices you don't fully trust; the write token is the one your Mac poller holds.

Local development also needs the API to allow this page's origin: add `http://127.0.0.1:3000` to the API's `CORS_ORIGINS`. (The demo server already does, and prints its public demo read token.)

## Project structure

```
RBCheck-client/
├── index.html      The Daily Ledger
├── css/styles.css
└── js/
    ├── config.js   API base URL
    ├── auth.js     Token storage and helpers (pure, unit tested)
    ├── api.js      API client (sends the token; 401 clears it and re-prompts; 403 means read-only)
    ├── insights.js Digest rendering helpers (pure functions, unit tested)
    └── app.js      Rendering, state and the unlock flow
```

## Running locally

```bash
python -m http.server 3000
```

Then visit `http://127.0.0.1:3000/index.html`.

## Trying it without real data

The RBCheck backend can serve made-up spending from an in-memory database, with no Postgres:

```bash
# in the RBCheck repo
python -m app.scripts.demo_server        # http://127.0.0.1:8000, prints its demo read token
# in this repo
python -m http.server 3000
# then open http://127.0.0.1:3000/index.html?api=http://127.0.0.1:8000 and paste the demo read token
```

The demo tokens are public fixed values (`demo-read-token-for-local-use-only`, `demo-write-token-for-local-use-only`) that protect nothing real.

## Tests

```bash
node --test
```

Runs `tests/*.test.mjs` (Node 18+, no dependencies). They cover the digest rendering helpers in `js/insights.js` (formatting, empty and partial digests, HTML escaping, history bars), the token helpers in `js/auth.js`, and the real `js/api.js` against a scripted `fetch` (the token goes in a header and never the URL, a 401 clears it and triggers the prompt, a 403 keeps it, network failures are not mistaken for auth failures).
