// All network calls to the backend live here.
// Every function is async — it returns a Promise, so callers must await it.
const BASE_URL = 'http://localhost:8000'

/**
 * Fetches a high-level summary of all transactions from the server.
 * (e.g. totals by category, overall spend — whatever the /transactions/summary endpoint returns)
 * Returns the parsed JSON response directly.
 */
async function getSummary() {
  const r = await fetch(`${BASE_URL}/transactions/summary`)
  if (!r.ok) throw new Error(`Server error: ${r.status}`);
  return r.json()
}

/**
 * Fetches a list of transactions from the server, with optional filters.
 *
 * `params` is a plain object like { from: "2025-01-01", merchant: "Target" }.
 * It gets converted to a URL query string automatically — so passing
 *   { from: "2025-01-01" }  →  GET /transactions?from=2025-01-01
 *
 * Throws an error if the server responds with a non-2xx status,
 * so the caller can catch it and show an error instead of silently returning garbage.
 */
async function searchTransactions() {
  // const query = new URLSearchParams(params).toString()
  // const r = await fetch(`${BASE_URL}/transactions?${query}`)
  const r = await fetch(`${BASE_URL}/transactions/month`)
  if (!r.ok) throw new Error(`Server error: %{r.status}`);
  return r.json();
}

/**
 * Sends a new transaction to the server to be saved.
 *
 * `data` should be an object with at least { date, merchant, category, amount }.
 * It is serialized to JSON and POSTed to /transactions.
 * Returns the server's response (typically the newly created transaction with an ID).
 */
async function createTransaction(data) {
  const r = await fetch(`${BASE_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },  // tell the server we're sending JSON
    body: JSON.stringify(data)
  })
  return r.json()
}

async function editTransaction(data, id){
  const r = await fetch(`${BASE_URL}/transactions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },  // tell the server we're sending JSON
    body: JSON.stringify(data)
  })
  return r.json()
}
