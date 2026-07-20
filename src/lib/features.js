// Per-store feature toggles. An owner turns whole modules on or off in
// Admin → Features; a disabled module hides from the app — its tab, its
// Dashboard card(s), its attention badge, its keyboard shortcut — so a store
// that doesn't sell scratch-offs (or doesn't track backroom inventory) isn't
// shown screens it never uses.
//
// Shape mirrors resolveRewards: the defaults below are spread UNDER the vendor's
// stored `features` map, so an existing store with no `features` object keeps
// every default — nothing changes for anyone on upgrade. Only per-module
// booleans the owner actually flipped override a default. `scratch`/`inventory`
// default ON (existing stores rely on them); new optional modules default OFF,
// the same posture as rewards.
//
// Not every screen is toggleable — Cash, the Log, the Dashboard, Team (Time /
// Incidents / Notes) and Admin are core and always present, so they aren't
// listed here. Rewards keeps its own richer settings object (vendor.rewards),
// so it isn't duplicated in this map.
export const FEATURES = {
  scratch: true,      // scratch-off / lottery tracking
  inventory: true,    // backroom live stock + per-shift inventory counts
  gaming: false,      // amusement/gaming-machine collection ledger (new)
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
