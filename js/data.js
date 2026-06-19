// Shared data and tiny utility functions used by every other JS file.
// Loaded first so everything else can depend on TRANSACTIONS, fmt, and categoryPill.

// The master list of all transactions. Starts empty; init() in app.js fills it from the server.
let TRANSACTIONS = [];

/**
 * Formats a raw number as a dollar string with commas and two decimal places.
 *
 * Examples:
 *   fmt(9.5)      → "$9.50"
 *   fmt(1234.56)  → "$1,234.56"
 *   fmt(1000000)  → "$1,000,000.00"
 *
 * How it works:
 *   1. toFixed(2)  → always show exactly 2 decimal places ("9.50")
 *   2. The regex inserts commas every 3 digits before the decimal point
 */
const fmt = (n) => "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Background and text color for each spending category, used in category pills.
// Falls back to "Other" colors for any category not listed here.
const CATEGORY_COLORS = {
  Groceries: { bg: "rgba(90, 143, 106, 0.15)",  text: "#3a7a50" },
  Dining:    { bg: "rgba(193, 122, 58, 0.15)",   text: "#a85f1e" },
  Shopping:  { bg: "rgba(155, 107, 138, 0.15)",  text: "#7a3f6a" },
  Gas:       { bg: "rgba(90, 127, 168, 0.15)",   text: "#3a5f90" },
  Streaming: { bg: "rgba(143, 172, 216, 0.22)",  text: "#4a72b0" },
  Other:     { bg: "rgba(138, 121, 104, 0.15)",  text: "#6b5a48" },
};

/**
 * Returns an HTML <span> badge for a given category name.
 *
 * Looks up the category in CATEGORY_COLORS to get the right background/text color.
 * If the category isn't in the lookup table it falls back to the "Other" colors.
 *
 * Example output:
 *   categoryPill("Groceries")
 *   → '<span class="tx-category" style="background:rgba(90,143,106,0.15);color:#3a7a50">Groceries</span>'
 *
 * This HTML string is injected directly into table cell innerHTML.
 */
function categoryPill(cat) {
  const c = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
  return `<span class="tx-category" style="background:${c.bg};color:${c.text}">${cat}</span>`;
}
