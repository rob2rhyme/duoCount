// Customer rewards — pure helpers (rewards-program-spec.md, Phase 1).
//
// The owner-tunable economics live on the vendor doc as `vendor.rewards`,
// resolved through the same clamp-and-fallback pattern as patternRules /
// stockAlerts so a bad number can never produce a broken program. Defaults:
// $1 = 1 point, 100 points = $5 off, OFF until the owner enables it.
//
// Everything here is pure and isomorphic: the Admin settings card computes the
// live "effective % back" with it, the register flow computes points with it,
// and the server route (`/api/rewards`) re-computes with the SAME functions so
// the client's arithmetic is never trusted.

export const REWARDS = {
  enabled: false,
  earnPerDollar: 1,  // points per $1 of qualifying sale
  redeemPoints: 100, // points needed for one reward
  redeemValue: 5,    // dollars off per redemption
};

const BOUNDS = {
  earnPerDollar: [0.1, 100],
  redeemPoints: [10, 100000],
  redeemValue: [0.5, 1000],
};

export function resolveRewards(raw = {}) {
  const out = { enabled: raw?.enabled === true };
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    const v = raw?.[key];
    const n = v === "" || v === null || v === undefined ? NaN : Number(v);
    if (!Number.isFinite(n)) { out[key] = REWARDS[key]; continue; }
    const clamped = Math.min(hi, Math.max(lo, n));
    // redeemPoints is a whole-point threshold; the dollar knobs keep cents.
    out[key] = key === "redeemPoints" ? Math.round(clamped) : Math.round(clamped * 100) / 100;
  }
  return out;
}

// The giveback rate the settings card must surface (rewards-program-spec.md):
// at the defaults, 100 pts = $5 on $100 spent = 5.0% back. One decimal.
export function effectivePercent(rules) {
  const r = resolveRewards(rules);
  return Math.round((r.redeemValue / r.redeemPoints) * r.earnPerDollar * 100 * 10) / 10;
}

// Points earned on a qualifying sale total. Round-half-up to a whole point;
// a non-positive or non-numeric sale earns nothing.
export function pointsForSale(saleDollars, rules) {
  const r = resolveRewards(rules);
  const d = Number(saleDollars);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.round(d * r.earnPerDollar);
}

export function canRedeem(balance, rules) {
  const r = resolveRewards(rules);
  return Number(balance) >= r.redeemPoints;
}

// Phone number = the customer's identity (the Fivestars-style zero-hardware
// enrollment). Normalize to digits; an 11-digit US number with a leading 1
// drops it so "+1 (555) 123-4567" and "555-123-4567" are the same customer.
// Anything outside 7–15 digits is invalid ("" — the caller shows the error).
export function normalizePhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length >= 7 && d.length <= 15 ? d : "";
}

// Display mask: never echo the whole number back onto a shared register
// screen — the last 4 digits identify the customer to themselves.
export function maskPhone(phone) {
  const d = String(phone ?? "");
  return d.length >= 4 ? `•••-${d.slice(-4)}` : d;
}
