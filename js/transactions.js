// ── State ─────────────────────────────────────────────────────────────────────

let filtered = [];
let currentPage = 1;
let pageSize = 50;
let hasMore = true;
let editingTx = null;

// ── Render table ──────────────────────────────────────────────────────────────

/**
 * Rebuilds the full transactions table from whatever is currently in `filtered`.
 *
 * - Updates the "X results" count at the top.
 * - Shows a friendly message if there's nothing to display.
 * - Groups rows by date: the first transaction on a new date gets a bold date-header row
 *   above it (like a separator). Subsequent transactions on the same date skip the header.
 */
function totalPages() {
  return Math.max(1, Math.ceil(filtered.length / pageSize));
}

function renderTable() {
  const tbody = document.getElementById("tx-body");
  const pages = totalPages();
  if (currentPage > pages) currentPage = pages;

  document.getElementById("table-count").textContent =
    filtered.length + " result" + (filtered.length !== 1 ? "s" : "");
  document.getElementById("page-info").textContent = `Page ${currentPage} of ${pages}`;
  document.getElementById("prev-page").disabled = currentPage <= 1 && offset === 0;
  document.getElementById("next-page").disabled = currentPage >= pages && !hasMore;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">No transactions match your filters.</div></td></tr>`;
    return;
  }

  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  let lastDate = null;
  tbody.innerHTML = pageItems.map(t => {
    let dateHeader = "";
    let date = t.transaction_datetime.slice(0,10)
    if (date != lastDate) {
      // Date changed — emit a full-width header row before this transaction
      lastDate = date;
      const label = new Date(date + "T00:00:00").toLocaleDateString("default", {
        weekday: "short", month: "short", day: "numeric", year: "numeric"
      });
      dateHeader = `<tr class="date-group-row"><td colspan="4">${label}</td></tr>`;
    }
    return dateHeader + `
      <tr data-id="${t.transaction_id}">
        <td class="tx-date">${new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</td>
        <td class="tx-merchant">${t.place}</td>
        <td>${categoryPill(t.category)}</td>
        <td class="tx-amount">${fmt(t.amount)}</td>
      </tr>`;
  }).join("");
}

// ── Filter logic ──────────────────────────────────────────────────────────────

/**
 * Reads all four filter inputs and rebuilds `filtered`, then re-renders the table.
 *
 * All conditions are AND — a transaction must pass every active filter to appear:
 *   - date-from        → exclude transactions before this date
 *   - date-to          → exclude transactions after this date
 *   - merchant-search  → exclude transactions whose merchant doesn't contain the search text
 *   - category-filter  → exclude transactions that don't match the selected category exactly
 *
 * Empty/blank filters are ignored (the field is treated as "no restriction").
 */
function applyFilters() {
  const from     = document.getElementById("date-from").value;
  const to       = document.getElementById("date-to").value;
  const query    = document.getElementById("merchant-search").value.trim().toLowerCase();
  const category = document.getElementById("category-filter").value;

  filtered = TRANSACTIONS.filter(t => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (query && !t.merchant.toLowerCase().includes(query)) return false;
    if (category && t.category !== category) return false;
    return true;
  });

  currentPage = 1;
  renderTable();
}

// ── Modal ─────────────────────────────────────────────────────────────────────

const overlay = document.getElementById("modal-overlay");

/**
 * Opens the "Add Transaction" modal.
 *
 * Pre-fills the date with today and resets all other fields so stale values
 * from the last submission don't show up. Adds the "open" CSS class to make
 * the overlay visible, then moves focus to the merchant field immediately.
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

// Every possible way to open or dismiss the modal
document.getElementById("add-tx-btn").addEventListener("click", openModal);
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });  // click the backdrop
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); }); // press Escape

/**
 * Handles form submission when the user clicks "Add" inside the modal.
 *
 * 1. Prevents the default browser submit (which would navigate away / reload).
 * 2. Validates all four fields — silently does nothing if anything is missing or invalid.
 * 3. Inserts the new transaction at the front of TRANSACTIONS with unshift(),
 *    then sorts the whole array by date descending so the list stays ordered
 *    even if the user entered a past date.
 * 4. Closes the modal and re-runs the current filters so the new row appears immediately.
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

// ── Events ────────────────────────────────────────────────────────────────────

// "Apply" button manually triggers a filter pass
document.getElementById("apply-filters").addEventListener("click", applyFilters);
// Live search — re-filter on every keystroke
document.getElementById("merchant-search").addEventListener("input", applyFilters);
// Category dropdown — re-filter immediately on change
document.getElementById("category-filter").addEventListener("change", applyFilters);

// "Clear" button resets all inputs and shows every transaction
document.getElementById("clear-filters").addEventListener("click", () => {
  document.getElementById("date-from").value = "";
  document.getElementById("date-to").value = "";
  document.getElementById("merchant-search").value = "";
  document.getElementById("category-filter").value = "";
  filtered = [...TRANSACTIONS];
  currentPage = 1;
  renderTable();
});

document.getElementById("page-size").addEventListener("change", async e => {
  pageSize = parseInt(e.target.value);
  limit = pageSize;
  offset = 0;
  currentPage = 1;
  await fetchBatch();
  renderTable();
});

document.getElementById("prev-page").addEventListener("click", async () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  } else if (offset > 0) {
    offset -= limit;
    if (offset < 0) offset = 0;
    await fetchBatch();
    currentPage = totalPages();
    renderTable();
  }
});

document.getElementById("next-page").addEventListener("click", async () => {
  if (currentPage < totalPages()) {
    currentPage++;
    renderTable();
  } else if (hasMore) {
    offset += limit;
    currentPage = 1;
    await fetchBatch();
    renderTable();
  }
});

// ── Batch fetch ───────────────────────────────────────────────────────────────

async function fetchBatch() {
  TRANSACTIONS = await allTransactions();
  hasMore = TRANSACTIONS.length === limit;
  const from     = document.getElementById("date-from").value;
  const to       = document.getElementById("date-to").value;
  const query    = document.getElementById("merchant-search").value.trim().toLowerCase();
  const category = document.getElementById("category-filter").value;
  filtered = TRANSACTIONS.filter(t => {
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    if (query && !t.merchant.toLowerCase().includes(query)) return false;
    if (category && t.category !== category) return false;
    return true;
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    await fetchBatch();
    renderTable();
  } catch(err) {
    console.error('Failed to load transactions:', err);
  }
}

init();
