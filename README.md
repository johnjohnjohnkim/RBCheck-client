# RBCheck-client

A static, no-build HTML/CSS/JS frontend for [RBCheck](../RBCheck), a personal spending tracker built from parsed RBC (Royal Bank of Canada) SMS transaction alerts.

There is no package manager, bundler, or dev server in this repo — it's plain HTML/CSS/JS served as-is, with [Chart.js](https://www.chartjs.org/) pulled in via CDN.

## Two frontend implementations

This repo currently contains two independent, unrelated UI implementations of the same data. They don't share markup or styling, though the "alt"-suffixed JS/CSS files are wired up to the non-"alt" HTML page and vice versa — see the file map below.

### 1. The Ledger (`index.html`)

A single-page, newspaper-styled dashboard ("The Daily Ledger") — masthead, spend ticker, hero stat with a 7-day sparkline, a quick-entry text box, an insights row, a spending chart, a merchant leaderboard, and a full transaction ledger table with search/filter/paging — all on one page (the ledger table lives in the `#ledger` section).

- Markup: `index.html`
- Styles: `css/styles-alt.css`
- Scripts: `js/api-alt.js` (API client), `js/app-alt.js` (rendering/state, 750+ lines)

### 2. Sidebar dashboard (`index-alt.html` + `transactions-alt.html`)

A more conventional two-page app with a persistent sidebar nav: a "Home" page with summary cards and charts, and a separate "Transactions" page with a searchable, paginated table and an add/edit modal.

- Markup: `index-alt.html` (Home), `transactions-alt.html` (Transactions)
- Styles: `css/styles.css`
- Scripts: `js/data.js` (shared `TRANSACTIONS` state, `fmt()`, category color helpers), `js/api.js` (API client), `js/app.js` (Home page logic), `js/transactions.js` (Transactions page logic)

### `transactions.html`

A stub that meta-refreshes to `index-alt.html#ledger`. This looks stale/broken: `index-alt.html` doesn't define a `#ledger` element (that ID only exists in `index.html`), so the redirect doesn't land where its own comment says it should.

## Backend

Both `js/api.js` and `js/api-alt.js` hardcode the API base URL to:

```
https://api.rbcheck.gwanwoo.dev
```

There's no `.env` or config file — to point at a different backend (e.g. a local RBCheck instance), edit the `BASE_URL`/`BASE` constant at the top of the relevant `js/api*.js` file.

See the [RBCheck README](../RBCheck/README.md) for the endpoints these files call (`/transactions/summary`, `/transactions/`, `/transactions/date`, `/transactions/weekly`, `/transactions/past_7_days`, `/transactions/month`, `/transactions/date_range`, `/transactions/merchant`, `/transactions/price_range`, `/transactions/{id}`, plus `POST`/`PATCH`).

## Project structure

```
RBCheck-client/
├── index.html               The Ledger — single-page newspaper-style dashboard
├── index-alt.html           Sidebar dashboard — Home page
├── transactions-alt.html    Sidebar dashboard — Transactions page
├── transactions.html        Stub redirect (see note above)
├── css/
│   ├── styles-alt.css       Styles for index.html (The Ledger)
│   └── styles.css           Styles for index-alt.html / transactions-alt.html
└── js/
    ├── api-alt.js           API client used by index.html
    ├── app-alt.js           Rendering/state logic for index.html
    ├── api.js                API client used by index-alt.html / transactions-alt.html
    ├── app.js                Home page logic for index-alt.html
    ├── data.js               Shared state + formatting helpers for the sidebar dashboard
    └── transactions.js       Transactions page logic for transactions-alt.html
```

## Running locally

No build step is required. Either open a page directly in a browser, or serve the directory so relative fetches behave the same as in production:

```bash
python -m http.server 3000
```

Then visit `http://127.0.0.1:3000/index.html` or `http://127.0.0.1:3000/index-alt.html`. The RBCheck backend's CORS policy allows `localhost`/`127.0.0.1` on any port.

## Tests

No test suite is present in this repository.
