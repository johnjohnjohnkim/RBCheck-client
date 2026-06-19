// ── State ─────────────────────────────────────────────────────────────────────

let filtered = [...TRANSACTIONS];  // the list of transactions currently shown (changes when filters are applied)
let spendingChart = null;           // reference to the bar chart so we can destroy it before redrawing
let merchantChart = null;           // reference to the donut chart, same reason
let weekCardMode = 'fixed';         // which "week" mode the top card shows: 'fixed' = Sun→today, 'rolling' = last 7 days
let editingTx = null;               // transaction being edited, null when adding

// ── Chart.js defaults ─────────────────────────────────────────────────────────

Chart.defaults.color = "#7a6e64";
Chart.defaults.borderColor = "rgb(214, 206, 195)";
Chart.defaults.font.family = "'Libre Caslon Text', Georgia, serif";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Takes a list of transactions and buckets the dollar amounts together by time period.
 *
 * Think of it like sorting receipts into labeled envelopes:
 *   - period = "month"  → one envelope per month  (e.g. "Jun 25")
 *   - period = "week"   → one envelope per week    (e.g. "Jun 1")
 *   - anything else     → one envelope per day     (e.g. "Jun 5")
 *
 * Returns a plain object like { "Jun 25": 412.50, "May 25": 310.00 }.
 */
function groupByPeriod(txs, period) {
  const map = {};
  for (const tx of txs) {
    let key;
    const d = new Date(tx.date + "T00:00:00");
    if (period === "month") {
      key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    } else if (period === "week") {
      // Rewind d back to the Sunday that starts its week, use that as the label
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      key = start.toLocaleDateString("default", { month: "short", day: "numeric" });
    } else {
      key = d.toLocaleDateString("default", { month: "short", day: "numeric" });
    }
    // Add this transaction's amount to whatever's already in that envelope (default 0)
    map[key] = (map[key] || 0) + tx.amount;
  }
  return map;
}

/**
 * Takes a list of transactions and adds up the total spent at each merchant.
 *
 * Like groupByPeriod but the envelopes are labeled by store name instead of date.
 * Returns { "Trader Joe's": 85.20, "Netflix": 15.99, ... }.
 */
function groupByMerchant(txs) {
  const map = {};
  for (const tx of txs) {
    map[tx.merchant] = (map[tx.merchant] || 0) + tx.amount;
  }
  return map;
}

// ── Render summary cards ──────────────────────────────────────────────────────

/**
 * Updates the three summary number cards at the top of the page:
 *   "Today"   – total spent today (always uses ALL transactions, not filtered)
 *   "Month"   – total spent this calendar month from the filtered list
 *   "Week"    – either Sun→today ("fixed") or the last 7 days ("rolling"),
 *               depending on the weekCardMode toggle
 *
 * It writes the dollar amounts and label text directly into the DOM elements
 * that already exist in the HTML.
 */
async function renderCards() {
  const now = new Date();
  const summary = await getSummary();

  document.getElementById("stat-daily").textContent = fmt(parseFloat(summary.daily) || 0);
  document.getElementById("stat-daily-sub").textContent =
    now.toLocaleDateString("default", { weekday: "long", month: "long", day: "numeric" });
  document.getElementById("stat-month").textContent = fmt(parseFloat(summary.monthly) || 0);
  document.getElementById("stat-month-label").textContent =
    now.toLocaleString("default", { month: "long", year: "numeric" });

  if (weekCardMode === 'fixed') {
    document.getElementById("stat-week").textContent = fmt(parseFloat(summary.weekly) || 0);
    document.getElementById("stat-week-label").textContent = "Monday - Sunday";
    document.getElementById("stat-week-title").textContent = "Spent This Week";
  } else {
    document.getElementById("stat-week").textContent = fmt(parseFloat(summary.rolling) || 0);
    document.getElementById("stat-week-label").textContent = "last 7 days";
    document.getElementById("stat-week-title").textContent = "Rolling 7 Days";
  }
}

// ── Render spending chart ─────────────────────────────────────────────────────

/**
 * Draws (or redraws) the bar chart that shows spending over time.
 *
 * Steps:
 *   1. Read the "group by" dropdown to know whether to bucket by day/week/month.
 *   2. Use groupByPeriod() to add up amounts per bucket.
 *   3. Destroy the old chart if one exists — Chart.js will leak memory otherwise.
 *   4. Create a new bar chart on the <canvas id="spending-chart"> element.
 */
function renderSpendingChart(txs) {
  const period = document.getElementById("group-by").value;
  const grouped = groupByPeriod(txs, period);
  const labels = Object.keys(grouped);    // x-axis labels (e.g. ["Jun 1", "Jun 8", ...])
  const data = Object.values(grouped);    // bar heights in dollars

  if (spendingChart) spendingChart.destroy();  // tear down the old canvas drawing first

  const ctx = document.getElementById("spending-chart").getContext("2d");
  spendingChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Spent",
        data,
        backgroundColor: "rgba(143, 172, 216, 0.8)",
        borderColor: "rgb(143, 172, 216)",
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => " " + fmt(ctx.raw) } }  // format tooltip as "$X.XX"
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => "$" + v }, grid: { color: "rgb(214, 206, 195)" } }
      }
    }
  });
}

// ── Render merchant donut ─────────────────────────────────────────────────────

/**
 * Draws (or redraws) the doughnut chart that shows the top 6 merchants by spending.
 *
 * Steps:
 *   1. Use groupByMerchant() to total up each merchant.
 *   2. Sort merchants from highest to lowest spend, then keep only the top 6.
 *   3. Destroy the old chart if one exists.
 *   4. Draw a doughnut chart with a fixed 6-color palette.
 */
function renderMerchantChart(txs) {
  const grouped = groupByMerchant(txs);
  // Sort descending by total, take top 6
  const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const labels = sorted.map(e => e[0]);   // merchant names
  const data = sorted.map(e => e[1]);     // dollar totals
  const palette = ["#6c63ff","#34d399","#f87171","#fbbf24","#38bdf8","#a78bfa"];

  if (merchantChart) merchantChart.destroy();

  const ctx = document.getElementById("merchant-chart").getContext("2d");
  merchantChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: palette, borderWidth: 2, borderColor: "rgb(255, 252, 248)" }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",   // how big the hole in the middle is (higher % = bigger hole)
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => " " + fmt(ctx.raw) } }
      }
    }
  });
}

// ── Render today's transactions table ─────────────────────────────────────────

/**
 * Fills in the "Today" transactions table at the bottom of the page.
 *
 * Always uses ALL transactions (not the filtered list) so the today section
 * isn't accidentally hidden by a date-range filter.
 *
 * If there are no transactions today it shows a friendly "No transactions today." message.
 * Otherwise it builds one <tr> row per transaction with merchant, category pill, and amount.
 */
function renderTodayTable() {
  const today = new Date().toISOString().slice(0, 10);  // "YYYY-MM-DD"
  const todayTxs = TRANSACTIONS.filter(t => t.transaction_datetime.slice(0, 10) === today);
  const tbody = document.getElementById("tx-body");
  const todayLabel = new Date().toLocaleDateString("default", { weekday: "long", month: "long", day: "numeric" });

  document.getElementById("today-date-label").textContent = todayLabel;
  // Show the running total only if there are transactions; otherwise leave blank
  document.getElementById("today-tx-total").textContent =
    todayTxs.length ? fmt(todayTxs.reduce((s, t) => s + t.amount, 0)) : "";

  if (!todayTxs.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">No transactions today.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = todayTxs.map(t => `
    <tr data-id="${t.transaction_id}">
      <td class="tx-merchant">${t.place}</td>
      <td>${categoryPill(t.category)}</td>
      <td class="tx-amount">${fmt(t.amount)}</td>
    </tr>
  `).join("");
}

// ── Render all ────────────────────────────────────────────────────────────────

/**
 * Master re-render: calls every individual render function in the right order,
 * then updates the date-range label above the chart to reflect what's shown.
 *
 * Call this any time the data or filters change and you want the whole page to update.
 */
async function render() {
  await renderCards();
  renderSpendingChart(filtered);
  renderMerchantChart(filtered);
  renderTodayTable();

  // Build a human-readable range label like "2025-01-01 → 2025-06-05" or "All time"
  const from = document.getElementById("date-from").value;
  const to = document.getElementById("date-to").value;
  const label = from && to ? `${from} → ${to}` : from ? `From ${from}` : to ? `To ${to}` : "All time";
  document.getElementById("chart-range-label").textContent = label;
}

// ── Filter logic ──────────────────────────────────────────────────────────────

/**
 * Reads the current filter inputs and rebuilds the `filtered` array, then re-renders everything.
 *
 * The three filters work like AND conditions — a transaction must pass ALL of them to be included:
 *   - date-from  → exclude anything before this date
 *   - date-to    → exclude anything after this date
 *   - merchant-search → exclude anything whose merchant name doesn't contain the search text
 */
function applyFilters() {
  const from = document.getElementById("date-from").value;
  const to = document.getElementById("date-to").value;
  const query = document.getElementById("merchant-search").value.trim().toLowerCase();

  filtered = TRANSACTIONS.filter(t => {
    if (from && t.date < from) return false;   // too early
    if (to && t.date > to) return false;       // too late
    if (query && !t.merchant.toLowerCase().includes(query)) return false;  // wrong merchant
    return true;
  });

  render();
}

// ── Modal ─────────────────────────────────────────────────────────────────────

const overlay = document.getElementById("modal-overlay");

/**
 * Opens the "Add Transaction" modal dialog.
 *
 * Pre-fills the date field with today so the user doesn't have to type it,
 * clears any leftover values from the last time the form was used,
 * adds the "open" CSS class which makes the overlay visible,
 * and moves keyboard focus to the merchant field so you can start typing immediately.
 */
function openModal() {
  editingTx = null;
  document.querySelector(".modal-header h2").textContent = "Add Transaction";
  document.querySelector("#add-tx-form button[type=submit]").textContent = "Add Transaction";
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("tx-date").value = today;
  document.getElementById("tx-merchant").value = "";
  document.getElementById("tx-amount").value = "";
  document.getElementById("tx-category").value = "Groceries";
  overlay.classList.add("open");
  document.getElementById("tx-merchant").focus();
}

function openEditModal(tx) {
  editingTx = tx;
  document.querySelector(".modal-header h2").textContent = "Edit Transaction";
  document.querySelector("#add-tx-form button[type=submit]").textContent = "Save Changes";
  document.getElementById("tx-date").value = tx.date || tx.transaction_datetime.slice(0, 10);
  document.getElementById("tx-merchant").value = tx.place || "";
  document.getElementById("tx-amount").value = tx.amount;
  document.getElementById("tx-category").value = tx.category;
  overlay.classList.add("open");
  document.getElementById("tx-merchant").focus();
}

function closeModal() { overlay.classList.remove("open"); }

// Wire up every way a user might open or close the modal
document.getElementById("add-tx-btn").addEventListener("click", openModal);
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });  // click outside = close
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); }); // Esc key = close

/**
 * Handles the "Add Transaction" form submission.
 *
 * 1. Prevents the default browser form-submit (which would reload the page).
 * 2. Reads and validates all four fields — bails silently if anything is missing or invalid.
 * 3. Pushes the new transaction to the front of TRANSACTIONS, then re-sorts by date descending
 *    so the list stays in order even if the user picked a past date.
 * 4. Closes the modal and re-applies filters so the new transaction shows up immediately.
 */
document.getElementById("add-tx-form").addEventListener("submit", async e => {
  e.preventDefault();
  const date     = document.getElementById("tx-date").value;
  const merchant = document.getElementById("tx-merchant").value.trim();
  const category = document.getElementById("tx-category").value;
  const amount   = parseFloat(document.getElementById("tx-amount").value);

  if (!date || !merchant || isNaN(amount) || amount <= 0) return;

  if (editingTx) {
    const updated = await editTransaction({ date, place: merchant, category, amount }, editingTx.transaction_id);
    const idx = TRANSACTIONS.findIndex(t => t.transaction_id === editingTx.transaction_id);
    if (idx !== -1) TRANSACTIONS[idx] = { ...TRANSACTIONS[idx], ...updated };
    TRANSACTIONS.sort((a, b) => (b.date || b.transaction_datetime).localeCompare(a.date || a.transaction_datetime));
  } else {
    TRANSACTIONS.unshift({ date, merchant, category, amount });
    TRANSACTIONS.sort((a, b) => b.date.localeCompare(a.date));
  }

  closeModal();
  applyFilters();
});

document.getElementById("tx-body").addEventListener("click", e => {
  const row = e.target.closest("tr[data-id]");
  if (!row) return;
  const tx = TRANSACTIONS.find(t => t.transaction_id === parseInt(row.dataset.id));
  if (tx) openEditModal(tx);
});

// ── Filter events ─────────────────────────────────────────────────────────────

// "Apply" button manually triggers the filter
document.getElementById("apply-filters").addEventListener("click", applyFilters);

// "Clear" button wipes all three filter inputs, resets to all transactions, and re-renders
document.getElementById("clear-filters").addEventListener("click", () => {
  document.getElementById("date-from").value = "";
  document.getElementById("date-to").value = "";
  document.getElementById("merchant-search").value = "";
  filtered = [...TRANSACTIONS];
  render();
});

// Live search: re-filter on every keystroke in the merchant search box
document.getElementById("merchant-search").addEventListener("input", applyFilters);
// Changing the "group by" dropdown immediately redraws the chart with the new bucketing
document.getElementById("group-by").addEventListener("change", applyFilters);

// ── Week card toggle ──────────────────────────────────────────────────────────

// Clicking the "Week" card toggles between fixed-week and rolling-7-days mode,
// then re-renders just the cards (no need to touch the charts)
document.getElementById("card-week").addEventListener("click", () => {
  weekCardMode = weekCardMode === 'fixed' ? 'rolling' : 'fixed';
  renderCards();
});

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Entry point — runs once when the page loads.
 *
 * Fetches all transactions from the server via searchTransactions(),
 * stores them in TRANSACTIONS, copies them into `filtered`,
 * and kicks off the first full render.
 *
 * Wrapped in try/catch so a network error doesn't silently crash the page —
 * it logs to the console instead.
 */
async function init(){
  try{
    TRANSACTIONS = await getTransactions(); //fetch from server
    filtered = [...TRANSACTIONS];
    render();
  } catch(err) {
    console.error('Failed to load transactions:', err);
  }
}

init();
