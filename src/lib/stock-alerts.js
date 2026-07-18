// Stock attention — pure functions over the item catalog's synced stock fields
// (pos-inventory-sync-spec.md, Phase 1). Two lists a manager actually acts on:
//
//   EXPIRING — items whose (optional) `expiresAt` date is within the owner's
//   warning window ("Expiring soon", default ≤ 30 days; already-expired items
//   are included and sort first — they're the most urgent).
//   LOW STOCK — items whose (optional) synced `quantity` has fallen below the
//   owner's reorder threshold ("Need order", default < 5 units).
//
// Items without an expiry date, or without a synced quantity, simply don't
// participate in that list — the alerts only ever speak about data the store
// actually maintains. Mirrors the patterns.js posture: pure + isomorphic (the
// Dashboard runs it in the browser, the digest runs it server-side), with the
// same clamp-and-resolve settings pattern as resolvePatternRules.

export const STOCK_ALERTS = {
  expiryDays: 30,   // "Expiring soon" when expiresAt is within this many days
  lowStockUnits: 5, // "Need order" when quantity < this many units
};

const BOUNDS = { expiryDays: [1, 365], lowStockUnits: [0, 999] };

// Owner-entered values coerced into safe bounds — missing/non-numeric falls
// back to the default, out-of-range clamps (same rules as resolvePatternRules).
export function resolveStockAlerts(raw = {}) {
  const out = {};
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    const v = raw?.[key];
    const n = v === "" || v === null || v === undefined ? NaN : Number(v);
    if (!Number.isFinite(n)) { out[key] = STOCK_ALERTS[key]; continue; }
    out[key] = Math.round(Math.min(hi, Math.max(lo, n)));
  }
  return out;
}

const DAY_MS = 24 * 3600 * 1000;
const dateUTC = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""))) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * @param {Array} items  the item catalog (inactive items are ignored)
 * @param {Object} opts  { now = new Date(), rules } — rules = raw vendor.stockAlerts
 * @returns {{ expiring: Array<{item, daysLeft}>, lowStock: Array<{item, quantity}>, rules }}
 *   expiring sorted most-urgent first (expired, then fewest days left);
 *   lowStock sorted emptiest first. `rules` is the resolved settings, so the
 *   caller can label the lists ("≤ 30 days", "< 5 left") without re-resolving.
 */
export function buildStockAlerts(items = [], { now = new Date(), rules } = {}) {
  const R = resolveStockAlerts(rules);
  const today = dateUTC(now.toISOString().slice(0, 10));

  const expiring = [];
  const lowStock = [];
  for (const item of items) {
    if (!item || item.active === false) continue;

    const exp = dateUTC(item.expiresAt);
    if (exp && today) {
      const daysLeft = Math.round((exp.getTime() - today.getTime()) / DAY_MS);
      if (daysLeft <= R.expiryDays) expiring.push({ item, daysLeft });
    }

    const qty = Number(item.quantity);
    if (item.quantity !== undefined && item.quantity !== null && Number.isFinite(qty) && qty < R.lowStockUnits) {
      lowStock.push({ item, quantity: qty });
    }
  }

  expiring.sort((a, b) => a.daysLeft - b.daysLeft || String(a.item.name).localeCompare(String(b.item.name)));
  lowStock.sort((a, b) => a.quantity - b.quantity || String(a.item.name).localeCompare(String(b.item.name)));
  return { expiring, lowStock, rules: R };
}
