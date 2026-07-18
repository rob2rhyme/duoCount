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
  redeemPoints: 100, // points needed for one reward (the base/legacy reward)
  redeemValue: 5,    // dollars off per redemption (the base/legacy reward)
  tiers: [],         // optional named reward tiers; empty → the single reward above
};

// At most this many named tiers — a c-store reward menu, not a catalog.
export const MAX_TIERS = 8;

const BOUNDS = {
  earnPerDollar: [0.1, 100],
  redeemPoints: [10, 100000],
  redeemValue: [0.5, 1000],
};
const TIER_POINTS = [10, 100000];
const TIER_VALUE = [0, 1000];

// A clamped number, or NaN when the input isn't a usable number.
function clampNum(v, lo, hi, whole) {
  const n = v === "" || v === null || v === undefined ? NaN : Number(v);
  if (!Number.isFinite(n)) return NaN;
  const c = Math.min(hi, Math.max(lo, n));
  return whole ? Math.round(c) : Math.round(c * 100) / 100;
}

// One reward tier → { id, name, points, value }, or null if unusable. Same
// clamp-and-drop discipline as the scalar knobs: a nameless or non-numeric-
// points tier is dropped rather than allowed to break the reward menu.
function resolveTier(raw, i) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name ?? "").trim().slice(0, 60);
  const points = clampNum(raw.points, TIER_POINTS[0], TIER_POINTS[1], true);
  const value = clampNum(raw.value, TIER_VALUE[0], TIER_VALUE[1], false);
  if (!name || !Number.isFinite(points)) return null;
  return { id: String(raw.id ?? "").trim() || `t${i}`, name, points, value: Number.isFinite(value) ? value : 0 };
}

export function resolveRewards(raw = {}) {
  const out = { enabled: raw?.enabled === true };
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    const n = clampNum(raw?.[key], lo, hi, key === "redeemPoints");
    out[key] = Number.isFinite(n) ? n : REWARDS[key];
  }
  const rawTiers = Array.isArray(raw?.tiers) ? raw.tiers.slice(0, MAX_TIERS) : [];
  out.tiers = rawTiers.map(resolveTier).filter(Boolean).sort((a, b) => a.points - b.points);
  return out;
}

// The reward tiers actually offered at the register: the configured ones, or a
// single implicit tier from the legacy redeemPoints/redeemValue so a store that
// never adds tiers behaves exactly as before. Always ≥ 1, sorted cheapest-first.
export function rewardTiers(rules) {
  const r = resolveRewards(rules);
  if (r.tiers.length) return r.tiers;
  return [{ id: "default", name: "", points: r.redeemPoints, value: r.redeemValue }];
}

// The dollars-per-point of the MOST generous reward — the worst-case giveback,
// so the settings caution and the liability estimate never understate exposure.
function bestRate(rules) {
  return Math.max(...rewardTiers(rules).map((t) => (t.points > 0 ? t.value / t.points : 0)));
}

// The giveback rate the settings card must surface (rewards-program-spec.md):
// at the defaults, 100 pts = $5 on $100 spent = 5.0% back. One decimal.
export function effectivePercent(rules) {
  const r = resolveRewards(rules);
  return Math.round(bestRate(rules) * r.earnPerDollar * 100 * 10) / 10;
}

// Dollars-per-point of the most generous reward — for the outstanding-liability
// estimate (reward-audit.js), so a tiered menu is valued at its worst case.
export function pointDollarValue(rules) {
  return bestRate(rules);
}

// Points earned on a qualifying sale total. Round-half-up to a whole point;
// a non-positive or non-numeric sale earns nothing.
export function pointsForSale(saleDollars, rules) {
  const r = resolveRewards(rules);
  const d = Number(saleDollars);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.round(d * r.earnPerDollar);
}

// Can the balance redeem SOMETHING (the cheapest tier)?
export function canRedeem(balance, rules) {
  const cheapest = Math.min(...rewardTiers(rules).map((t) => t.points));
  return Number(balance) >= cheapest;
}

// Can the balance redeem this specific tier?
export function canRedeemTier(balance, tier) {
  return !!tier && Number(balance) >= Number(tier.points);
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
