// Per-store feature toggles. An owner turns whole modules on or off in
// Admin → Features; a disabled module hides from the app — its tab, its
// Dashboard card(s), its attention badge, its keyboard shortcut — so a store
// that doesn't sell scratch-offs (or doesn't run a time clock) isn't shown
// screens it never uses.
//
// Shape mirrors resolveRewards: the defaults below are spread UNDER the vendor's
// stored `features` map, so an existing store with no `features` object keeps
// every default — nothing changes for anyone on upgrade. Only per-module
// booleans the owner actually flipped override a default. Everything defaults
// ON except `gaming` (a store opts into it), so an existing store sees the exact
// same set of tabs it did before this map grew.
//
// Every main tab is listed here and therefore hide/unhide-able EXCEPT two that
// are deliberately always-on: the Dashboard and Admin. Those are the owner's way
// back in — if they could be hidden, an owner could lock themselves out of the
// very screen that turns modules back on. Rewards isn't listed either: it keeps
// its own richer settings object (vendor.rewards) whose `enabled` flag already
// shows/hides its tab, so duplicating it here would double-gate it.
export const FEATURES = {
  cash: true,         // cash-drawer counts
  scratch: true,      // scratch-off / lottery tracking
  inventory: true,    // backroom live stock + per-shift inventory counts
  gaming: false,      // amusement/gaming-machine collection ledger
  log: true,          // shift activity log
  notes: true,        // shift notes / handoff
  incidents: true,    // incident reports
  time: true,         // time clock
  portfolio: true,    // multi-store portfolio (owner)
};

// The order/keys shown in the Admin → Features card.
export const FEATURE_KEYS = Object.keys(FEATURES);

export function resolveFeatures(vendor) {
  const stored = vendor?.features || {};
  const out = {};
  for (const k of FEATURE_KEYS) {
    out[k] = typeof stored[k] === "boolean" ? stored[k] : FEATURES[k];
  }
  return out;
}

// True when the module `key` is on for this vendor (unknown keys → true, so a
// screen that isn't a toggleable module is never accidentally hidden).
export function featureEnabled(vendor, key) {
  if (!(key in FEATURES)) return true;
  return resolveFeatures(vendor)[key];
}
