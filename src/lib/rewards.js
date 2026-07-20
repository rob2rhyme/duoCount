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
  // Points expire after this many months of INACTIVITY (no earning visit) — the
  // breakage/liability control from the spec, disclosed to the customer on the
  // balance page and the counter sign. 0 = never expire. Expiry is materialized
  // as a signed "expire" ledger line the next time the account is touched, so it
  // is never a silent balance edit. Anchored on the last earn, else enrollment;
  // redeeming does not reset the clock (a visit is an earn).
  expiryMonths: 12,
  streakHours: 48,   // a next-day visit within this window extends the streak
  tiers: [],         // optional named reward tiers; empty → the single reward above
  // Referral bonus (loyalty-plan-review.md, port slice 4): when a new
  // enrollment names an enrolled customer as their referrer, both sides get
  // points as signed "referral" ledger lines. Owner-tunable; either value at
  // 0 zeroes that side, both at 0 turns the mechanic off entirely.
  referral: { referrer: 50, friend: 25 },
  // Punch cards (port slice 5): buy-N-get-one stamps, separate from points.
  // Each card is a named counter with a goal and a reward; empty = off.
  stamps: [],
  // Owner's ADDITIONAL excluded categories, on top of the always-excluded legal
  // base (tobacco, vape, alcohol, lottery, gift cards, fuel — a translated,
  // non-removable disclosure). Answers the spec's open question about
  // store-specific exclusions (money orders, phone top-ups, …). Free-form
  // labels the staff read at the register; empty by default.
  excludedCategories: [],
};

// The most custom exclusions an owner can add — a short store list, not a
// taxonomy. Kept small so the register hint stays readable.
export const MAX_EXCLUSIONS = 12;

// Normalize the owner's extra-exclusions setting from either an array or a
// comma/newline-separated string (the Admin field is plain text) into a clean,
// deduped, capped list of trimmed labels — the clamp-and-drop discipline the
// other list settings use.
export function resolveExclusions(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,\n]/);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const s = String(item ?? "").trim().slice(0, 40);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_EXCLUSIONS) break;
  }
  return out;
}

// At most this many punch cards — a card per product family, not a catalog.
export const MAX_STAMP_CARDS = 6;
const STAMP_GOAL = [2, 50];

// One punch card → { id, name, goal, reward }, or null if unusable — the same
// clamp-and-drop discipline as reward tiers. A nameless or goalless card is
// dropped; a blank reward text falls back to the card's name.
function resolveStampCard(raw, i) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name ?? "").trim().slice(0, 40);
  const goal = clampNum(raw.goal, STAMP_GOAL[0], STAMP_GOAL[1], true);
  if (!name || !Number.isFinite(goal)) return null;
  return {
    id: String(raw.id ?? "").trim() || `s${i}`, name, goal,
    reward: String(raw.reward ?? "").trim().slice(0, 60) || name,
  };
}

// At most this many named tiers — a c-store reward menu, not a catalog.
export const MAX_TIERS = 12;

// VIP status tiers (loyalty-plan-review.md, port slice 2): named lifetime-
// points milestones (Bronze/Silver/Gold) with an earn multiplier ≥ 1. Status
// derives from LIFETIME points, which only ever grow — redeeming never
// demotes anyone. Kept small: it's a status ladder, not a matrix.
export const MAX_VIP_TIERS = 5;
const VIP_THRESHOLD = [1, 10000000];
const VIP_MULTIPLIER = [1, 10];

// What a reward tier grants (loyalty-plan-review.md, port slice 1):
//   cash    — a flat $ off (the original model);
//   percent — a % off the sale, ALWAYS with a $ cap (uncapped % liability is
//             unbounded, so a percent tier without a cap is dropped);
//   item    — a named free item (value = its retail $, for the liability
//             figure), optionally requiring a purchase (withPurchase — the
//             plan's freebie_with_purchase).
export const TIER_TYPES = ["cash", "percent", "item"];

const BOUNDS = {
  earnPerDollar: [0.1, 100],
  redeemPoints: [10, 100000],
  redeemValue: [0.5, 1000],
  expiryMonths: [0, 60], // 0 = never; up to 5 years of inactivity
  streakHours: [12, 168], // how long a streak survives between visits
};
const TIER_POINTS = [10, 100000];
const TIER_VALUE = [0, 1000];
const TIER_PERCENT = [1, 100];

// A clamped number, or NaN when the input isn't a usable number.
function clampNum(v, lo, hi, whole) {
  const n = v === "" || v === null || v === undefined ? NaN : Number(v);
  if (!Number.isFinite(n)) return NaN;
  const c = Math.min(hi, Math.max(lo, n));
  return whole ? Math.round(c) : Math.round(c * 100) / 100;
}

// One reward tier → a typed grant, or null if unusable. Same clamp-and-drop
// discipline as the scalar knobs: a nameless, non-numeric-points, or
// uncapped-percent tier is dropped rather than allowed to break the menu.
// A tier without a type is the original cash-off shape (backward compatible).
function resolveTier(raw, i) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name ?? "").trim().slice(0, 60);
  const points = clampNum(raw.points, TIER_POINTS[0], TIER_POINTS[1], true);
  if (!name || !Number.isFinite(points)) return null;
  const id = String(raw.id ?? "").trim() || `t${i}`;
  const type = TIER_TYPES.includes(raw.type) ? raw.type : "cash";
  if (type === "percent") {
    const percent = clampNum(raw.percent, TIER_PERCENT[0], TIER_PERCENT[1], true);
    const cap = clampNum(raw.cap, TIER_VALUE[0], TIER_VALUE[1], false);
    if (!Number.isFinite(percent) || !Number.isFinite(cap) || cap <= 0) return null;
    return { id, name, points, type, percent, cap };
  }
  const value = clampNum(raw.value, TIER_VALUE[0], TIER_VALUE[1], false);
  const v = Number.isFinite(value) ? value : 0;
  if (type === "item") return { id, name, points, type, value: v, withPurchase: raw.withPurchase === true };
  return { id, name, points, type: "cash", value: v };
}

// The worst-case $ a tier can cost when redeemed — cash/item: the configured
// value; percent: its cap. Drives the liability figure and the % -back caution.
export function tierDollarValue(tier) {
  if (!tier) return 0;
  return tier.type === "percent" ? tier.cap : (Number(tier.value) || 0);
}

// One VIP tier → { id, name, threshold, multiplier }, or null if unusable —
// the tier clamp-and-drop discipline. Multiplier floors at 1: a status tier
// can never earn LESS than the base rate.
function resolveVipTier(raw, i) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name ?? "").trim().slice(0, 40);
  const threshold = clampNum(raw.threshold, VIP_THRESHOLD[0], VIP_THRESHOLD[1], true);
  if (!name || !Number.isFinite(threshold)) return null;
  const multiplier = clampNum(raw.multiplier, VIP_MULTIPLIER[0], VIP_MULTIPLIER[1], false);
  return {
    id: String(raw.id ?? "").trim() || `v${i}`, name, threshold,
    multiplier: Number.isFinite(multiplier) ? multiplier : 1,
  };
}

export function resolveRewards(raw = {}) {
  const out = { enabled: raw?.enabled === true };
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    const whole = key === "redeemPoints" || key === "streakHours" || key === "expiryMonths";
    const n = clampNum(raw?.[key], lo, hi, whole);
    out[key] = Number.isFinite(n) ? n : REWARDS[key];
  }
  const rawTiers = Array.isArray(raw?.tiers) ? raw.tiers.slice(0, MAX_TIERS) : [];
  out.tiers = rawTiers.map(resolveTier).filter(Boolean).sort((a, b) => a.points - b.points);
  const rawVip = Array.isArray(raw?.vip) ? raw.vip.slice(0, MAX_VIP_TIERS) : [];
  out.vip = rawVip.map(resolveVipTier).filter(Boolean).sort((a, b) => a.threshold - b.threshold);
  const refR = clampNum(raw?.referral?.referrer, 0, 10000, true);
  const refF = clampNum(raw?.referral?.friend, 0, 10000, true);
  out.referral = {
    referrer: Number.isFinite(refR) ? refR : REWARDS.referral.referrer,
    friend: Number.isFinite(refF) ? refF : REWARDS.referral.friend,
  };
  const rawStamps = Array.isArray(raw?.stamps) ? raw.stamps.slice(0, MAX_STAMP_CARDS) : [];
  out.stamps = rawStamps.map(resolveStampCard).filter(Boolean);
  out.excludedCategories = resolveExclusions(raw?.excludedCategories);
  return out;
}

// Visit streaks (loyalty-plan-review.md, port slice 3): consecutive visit-DAYS.
// Given the customer's last earn + current streak, the streak after a visit at
// `now` is: same (UTC) day → unchanged (multiple earns in one day are one
// visit); a new day within `streakHours` of the last visit → +1; anything
// later (or no history / junk state) → back to 1. Pure — the server route
// applies it inside the earn transaction; the UI only displays it.
export function nextStreak(c = {}, now = new Date(), rules) {
  const r = resolveRewards(rules);
  const raw = c.lastEarnAt;
  const last = raw?.toDate ? raw.toDate() : (raw ? new Date(raw) : null);
  const cur = Math.max(0, Math.trunc(Number(c.currentStreak) || 0));
  if (!last || Number.isNaN(last.getTime()) || last > now) return 1;
  if (last.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) return Math.max(1, cur);
  const hours = (now.getTime() - last.getTime()) / 3600000;
  return hours <= r.streakHours ? Math.max(1, cur) + 1 : 1;
}

// The customer's current VIP status: the highest tier whose lifetime-points
// bar they've crossed, or null when below every tier (or none configured).
export function vipTierFor(lifetimePoints, rules) {
  const r = resolveRewards(rules);
  const n = Math.max(0, Number(lifetimePoints) || 0);
  let hit = null;
  for (const t of r.vip) if (n >= t.threshold) hit = t;
  return hit;
}

// The reward tiers actually offered at the register: the configured ones, or a
// single implicit tier from the legacy redeemPoints/redeemValue so a store that
// never adds tiers behaves exactly as before. Always ≥ 1, sorted cheapest-first.
export function rewardTiers(rules) {
  const r = resolveRewards(rules);
  if (r.tiers.length) return r.tiers;
  return [{ id: "default", name: "", points: r.redeemPoints, type: "cash", value: r.redeemValue }];
}

// The dollars-per-point of the MOST generous reward — the worst-case giveback,
// so the settings caution and the liability estimate never understate exposure.
function bestRate(rules) {
  return Math.max(...rewardTiers(rules).map((t) => (t.points > 0 ? tierDollarValue(t) / t.points : 0)));
}

// The giveback rate the settings card must surface (rewards-program-spec.md):
// at the defaults, 100 pts = $5 on $100 spent = 5.0% back. One decimal.
// Worst case across the menu AND the VIP ladder: the most generous reward at
// the highest earn multiplier, so the >2% caution never understates.
export function effectivePercent(rules) {
  const r = resolveRewards(rules);
  const maxMult = r.vip.length ? Math.max(...r.vip.map((t) => t.multiplier)) : 1;
  return Math.round(bestRate(rules) * r.earnPerDollar * maxMult * 100 * 10) / 10;
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

// CRM profile fields on the customer card (the Loyalzoo-style profile: note,
// email, birthday, address). Owner-editable through the trusted route only.
// Partial-patch semantics like the name/phone edit: only keys PRESENT in
// `raw` appear in the patch; a blank value clears the field to null. Returns
// { patch, error } — error is a stable code the register UI localizes.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb 29 allowed — a birthday, not a date
export function sanitizeProfile(raw = {}) {
  const patch = {};
  if (raw.note !== undefined) patch.note = String(raw.note ?? "").trim().slice(0, 300) || null;
  if (raw.address !== undefined) patch.address = String(raw.address ?? "").trim().slice(0, 200) || null;
  // A store-assigned member/customer number (optional, free-form) — distinct from
  // the Firestore doc id. Handy for tying the rewards record to a POS or an
  // existing membership list.
  if (raw.customerId !== undefined) patch.customerId = String(raw.customerId ?? "").trim().slice(0, 40) || null;
  if (raw.email !== undefined) {
    const e = String(raw.email ?? "").trim();
    if (e && (!EMAIL_RE.test(e) || e.length > 200)) return { patch: {}, error: "bad_email" };
    patch.email = e || null;
  }
  if (raw.birthdayMonth !== undefined || raw.birthdayDay !== undefined) {
    const m = String(raw.birthdayMonth ?? "").trim();
    const d = String(raw.birthdayDay ?? "").trim();
    const mm = m === "" ? null : Number(m);
    const dd = d === "" ? null : Number(d);
    if (mm !== null && (!Number.isInteger(mm) || mm < 1 || mm > 12)) return { patch: {}, error: "bad_birthday" };
    if (dd !== null && (!Number.isInteger(dd) || dd < 1)) return { patch: {}, error: "bad_birthday" };
    if (dd !== null && mm === null) return { patch: {}, error: "bad_birthday" }; // a day needs a month
    if (mm !== null && dd !== null && dd > MONTH_DAYS[mm - 1]) return { patch: {}, error: "bad_birthday" };
    patch.birthdayMonth = mm;
    patch.birthdayDay = dd;
  }
  return { patch };
}

// Points-expiry status for a customer (rewards-program-spec.md §Compliance 7 —
// breakage/liability control). Pure so the register route materializes it, the
// public balance page displays it, and the liability figure discounts it, all
// from ONE definition. Inactivity is measured from the last EARN (a visit),
// falling back to enrollment when they've never earned; a redeem is not a visit
// and does not reset the clock. `expiryMonths` 0 (or no anchor date) → never
// expires. `now` is injectable for tests.
export function pointsExpiry(c = {}, rules, now = new Date()) {
  const months = resolveRewards(rules).expiryMonths;
  if (!months || months <= 0) return { months: 0, anchor: null, expiresAt: null, expired: false };
  const raw = c.lastEarnAt || c.createdAt;
  const anchor = raw?.toDate ? raw.toDate() : (raw ? new Date(raw) : null);
  if (!anchor || Number.isNaN(anchor.getTime())) return { months, anchor: null, expiresAt: null, expired: false };
  const expiresAt = new Date(anchor.getTime());
  expiresAt.setMonth(expiresAt.getMonth() + months);
  return { months, anchor, expiresAt, expired: now.getTime() >= expiresAt.getTime() };
}

// The spendable balance after applying expiry — 0 once an inactive account has
// lapsed, otherwise the stored balance. The single source of truth both the
// public balance page and the liability figure read.
export function effectiveBalance(c = {}, rules, now = new Date()) {
  if (pointsExpiry(c, rules, now).expired) return 0;
  return Math.max(0, Number(c.pointsBalance) || 0);
}

// Whole days since a Firestore Timestamp / Date / ISO string — for the
// "Visited N days ago" line. null when there's no usable date.
export function daysSince(v, now = new Date()) {
  const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null);
  if (!d || Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
}

// The list's NEW badge: enrolled within the last 14 days.
export function isNewCustomer(c = {}, now = new Date()) {
  const since = daysSince(c.createdAt, now);
  return since !== null && since <= 14;
}

// The 🎂 chip: the customer's birthday month (from the CRM profile) is the
// current month — a nudge to wish them well or grant a bonus at the register.
export function isBirthdayMonth(c = {}, now = new Date()) {
  const m = Number(c.birthdayMonth);
  return Number.isInteger(m) && m >= 1 && m <= 12 && m === now.getMonth() + 1;
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
