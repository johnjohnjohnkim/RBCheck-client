# RBCheck-client

A static, no-build HTML/CSS/JS frontend for [RBCheck](../RBCheck), a personal spending tracker built from parsed RBC (Royal Bank of Canada) SMS transaction alerts.

There is no package manager, bundler, or dev server in this repo. It is plain HTML/CSS/JS served as-is, with [Chart.js](https://www.chartjs.org/) pulled in via CDN.

## The Daily Ledger

`index.html` is a single-page, newspaper-styled dashboard: masthead, spend ticker, a hero stat with a 7-day sparkline, a quick-entry box, an insights row, a spending chart, a month heatmap, a merchant leaderboard, and a full ledger table with search, amount and date filters, paging, CSV export and an edit modal.

## Backend

The API address is set in one place, `js/config.js`, and defaults to `https://api.rbcheck.gwanwoo.dev`. To use a local RBCheck instance, serve this folder from localhost and open the page with an `api` query parameter:

```
http://127.0.0.1:3000/index.html?api=http://127.0.0.1:8000
```

The override only works when the page itself is served from `localhost` or `127.0.0.1`.

See the [RBCheck README](../RBCheck/README.md) for the endpoints these files call.

Manual entries made with Quick Entry are sent without an id; the server assigns one.

## Project structure

```
RBCheck-client/
├── index.html      The Daily Ledger
├── css/styles.css
└── js/
    ├── config.js   API base URL
    ├── api.js      API client (error messages come from the server's `detail`)
    └── app.js      Rendering and state
```

## Running locally

```bash
python -m http.server 3000
```

Then visit `http://127.0.0.1:3000/index.html`. The RBCheck backend's CORS policy allows `localhost`/`127.0.0.1` on any port.

## Tests

No test suite is present in this repository.
