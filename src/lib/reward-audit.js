// Rewards audit — pure detectors over the signed rewards ledger
// (rewards-program-spec.md, Phase 2). Three questions, each in the product's
// "a question, not a verdict" voice, shaped exactly like patterns.js alerts
// ({ id, kind, code, severity, params, title, detail }) so they ride the same
// Patterns card, digest section, and AI-narrative plumbing:
//
//   1. OUTPACED SALES — points issued in the window exceed what the
//      countersigned cash-sales totals support. This is the reconciliation no
//      competitor has: DuoCount holds both the ledger AND the signed sales
//      denominator, so invented points show up as arithmetic.
//   2. MULTI-EARN — one customer account earning several times in a single
//      day. The classic skim: a clerk scanning their own number on customers'
//      purchases.
//   3. REDEMPTION BURST — one clerk recording several redemptions in one day.
//      Each redemption should match a register discount; bursts are worth a
//      match-up.
//   4. CLERK AFFINITY — one account whose earns (or stamps) are recorded by the
//      SAME clerk far more often than that clerk's overall share of the window
//      explains. This is the patient version of the skim, and the one nothing
//      else here can see: attaching your own account to OTHER people's real
//      purchases steals the customer's points, not the store's cash, so
//      OUTPACED SALES is blind to it by construction — the points issued are
//      exactly what the cash denominator supports. Two earns a day also never
//      trips MULTI-EARN. What gives it away is who rang them.
//   5. MULTI-STAMP — one punch card stamped several times in a day, when the
//      model is one stamp per visit.
//
// Pure and isomorphic (Dashboard + digest); Firestore Timestamp `ts` shapes
// are handled via toDate, like scratch-audit.

import { toDate } from "./utils.js";
import { resolveRewards, pointDollarValue, pointsForSale, maskPhone, effectiveBalance } from "./rewards.js";
import { renderPattern } from "./pattern-format.js";

const money = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const dayOf = (e) => toDate(e.ts)?.toISOString().slice(0, 10) || null;

// Thresholds — deliberately simple; tune on pull like PATTERN_RULES.
const MULTI_EARN_MIN = 3;      // earns by one customer in one day
const MULTI_EARN_HIGH = 5;
const REDEEM_BURST_MIN = 3;    // redemptions by one clerk in one day
const REDEEM_BURST_HIGH = 5;
const REFERRAL_BURST_MIN = 3;  // referral enrollments by one clerk in one day
const REFERRAL_BURST_HIGH = 5;
const REFERRAL_FARM_MIN = 4;   // referral bonuses credited to ONE account across the window
const REFERRAL_FARM_HIGH = 8;
const OUTPACE_SLACK = 1.1;     // 10% grace over the supported points
const OUTPACE_FLOOR = 20;      // and at least this many unexplained points
const MULTI_STAMP_MIN = 3;     // stamps on one card, one customer, one day
const MULTI_STAMP_HIGH = 5;
// Affinity is judged by probability, not by a share threshold, so it adapts to
// the store instead of needing a number per rota. A clerk who works most shifts
// legitimately rings most of everyone's earns; what matters is whether ONE
// account is lopsided even against that. Below these odds of happening by
// chance, it is worth a question.
const AFFINITY_MIN = 5;        // too few visits to say anything either way
const AFFINITY_P = 0.01;       // 1-in-100
const AFFINITY_P_HIGH = 0.001; // 1-in-1000

/**
 * P(X >= k) for k of n trials at rate p — the odds this clerk rang at least
 * this many of one account's visits by chance, given how much of the window's
 * work they did overall.
 *
 * Exact binomial, iterated so nothing overflows at these sizes (a customer's
 * visits in a fortnight). Two boundaries matter and both fall out of the maths
 * rather than needing a special case: a single-clerk store has p = 1, so the
 * tail is 1 and nothing is ever flagged; and a clerk who rang every earn in the
 * window is likewise p = 1 and unremarkable.
 */
export function binomialTail(k, n, p) {
  if (!(n > 0) || k <= 0) return 1;
  if (k > n) return 0;
  if (!(p > 0)) return 0;
  if (p >= 1) return 1;
  let term = Math.pow(1 - p, n); // i = 0
  let cum = term;
  for (let i = 0; i < k - 1; i++) {
    term *= ((n - i) / (i + 1)) * (p / (1 - p));
    cum += term;
  }
  return Math.min(1, Math.max(0, 1 - cum));
}

/**
 * Accounts whose lines are lopsided toward one clerk. `lines` are the ledger
 * rows of a single kind; the baseline is that clerk's share of ALL of them.
 * Returns [{ customerId, byId, name, count, total, share, baseline, p }].
 */
export function clerkAffinity(lines, { minCount = AFFINITY_MIN, maxP = AFFINITY_P } = {}) {
  const usable = (lines || []).filter((e) => e && e.customerId && e.byId && !e.reversedBy);
  if (!usable.length) return [];
  const byClerk = new Map();
  for (const e of usable) byClerk.set(e.byId, (byClerk.get(e.byId) || 0) + 1);

  const perCustomer = new Map(); // customerId -> Map(byId -> count)
  for (const e of usable) {
    if (!perCustomer.has(e.customerId)) perCustomer.set(e.customerId, new Map());
    const m = perCustomer.get(e.customerId);
    m.set(e.byId, (m.get(e.byId) || 0) + 1);
  }
  const nameOf = new Map(usable.map((e) => [e.byId, e.by || "—"]));

  const out = [];
  for (const [customerId, clerks] of perCustomer.entries()) {
    const total = [...clerks.values()].reduce((a, b) => a + b, 0);
    if (total < minCount) continue;
    for (const [byId, count] of clerks.entries()) {
      // Baseline EXCLUDES this customer, so a single dominant account can't
      // inflate the very rate it is then measured against.
      const clerkElsewhere = (byClerk.get(byId) || 0) - count;
      const allElsewhere = usable.length - total;
      if (allElsewhere <= 0) continue;           // nothing to compare against
      const baseline = clerkElsewhere / allElsewhere;
      const p = binomialTail(count, total, baseline);
      if (p > maxP) continue;
      out.push({ customerId, byId, name: nameOf.get(byId) || "—", count, total,
        share: count / total, baseline, p });
    }
  }
  return out.sort((a, b) => a.p - b.p);
}

const alert = (a) => {
  const { title, detail } = renderPattern({ code: a.code, params: a.params }, "en");
  return { ...a, kind: a.code, title, detail };
};

/**
 * @param {Array} events   rewardEvents in the lookback window
 * @param {Array} entries  count entries in the SAME window (the denominator)
 * @param {Object} opts    { rules: vendor.rewards, customers?, windowDays = 14,
 *                           now = new Date() }
 * @returns {{ alerts, totals: { earned, redeemed, earns, redemptions } }}
 */
export function buildRewardAudit(events = [], entries = [], { rules, customers = [], windowDays = 14, now = new Date() } = {}) {
  const R = resolveRewards(rules);
  const cut = new Date(now.getTime() - windowDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const inWindow = events.filter((e) => e && (dayOf(e) || "") >= cut);
  const earnsList = inWindow.filter((e) => e.kind === "earn");
  const redeemsList = inWindow.filter((e) => e.kind === "redeem");

  const totals = {
    earned: earnsList.reduce((s, e) => s + (Number(e.points) || 0), 0),
    redeemed: redeemsList.reduce((s, e) => s + Math.abs(Number(e.points) || 0), 0),
    earns: earnsList.length,
    redemptions: redeemsList.length,
  };

  const alerts = [];

  // 1. points issued vs the signed cash-sales denominator. Each earn is
  // normalized back to the BASE rate by the multiplier its (server-signed)
  // ledger line recorded, so a VIP customer's ×1.5 earn doesn't read as
  // invented points — while raw points with no recorded multiplier still do.
  const windowSales = entries
    .filter((e) => e && e.kind === "cash" && (e.date || dayOf(e) || "") >= cut)
    .reduce((s, e) => s + (Number(e.sales) || 0), 0);
  const supported = pointsForSale(windowSales, R);
  const earnedBase = Math.round(earnsList.reduce((s, e) => {
    const m = Number(e.multiplier);
    return s + (Number(e.points) || 0) / (m >= 1 ? m : 1);
  }, 0));
  if (earnedBase > supported * OUTPACE_SLACK && earnedBase - supported >= OUTPACE_FLOOR) {
    alerts.push(alert({
      id: "reward-outpaced-sales", code: "reward-outpaced-sales", severity: "high",
      params: {
        points: totals.earned, supported, excess: earnedBase - supported,
        sales: money(windowSales), windowDays,
      },
    }));
  }

  // 2. one customer, several earns in one day
  const phoneById = new Map((customers || []).map((c) => [c.id, maskPhone(c.phone)]));
  const byCustomerDay = new Map(); // customerId|day -> count
  for (const e of earnsList) {
    const d = dayOf(e);
    if (!e.customerId || !d) continue;
    const key = `${e.customerId}|${d}`;
    byCustomerDay.set(key, (byCustomerDay.get(key) || 0) + 1);
  }
  for (const [key, count] of byCustomerDay.entries()) {
    if (count < MULTI_EARN_MIN) continue;
    const [customerId, day] = key.split("|");
    alerts.push(alert({
      id: `reward-multi-earn:${key}`, code: "reward-multi-earn",
      severity: count >= MULTI_EARN_HIGH ? "high" : "medium",
      params: { who: phoneById.get(customerId) || "?", count, day },
    }));
  }

  // 3. one clerk, several redemptions in one day
  const byClerkDay = new Map(); // byId|day -> { name, count }
  for (const e of redeemsList) {
    const d = dayOf(e);
    if (!e.byId || !d) continue;
    const key = `${e.byId}|${d}`;
    const cur = byClerkDay.get(key) || { name: e.by || "—", count: 0 };
    cur.count += 1;
    byClerkDay.set(key, cur);
  }
  for (const [key, { name, count }] of byClerkDay.entries()) {
    if (count < REDEEM_BURST_MIN) continue;
    const day = key.split("|")[1];
    alerts.push(alert({
      id: `reward-clerk-redemptions:${key.split("|")[0]}|${day}`, code: "reward-clerk-redemptions",
      severity: count >= REDEEM_BURST_HIGH ? "high" : "medium",
      params: { name, count, day },
    }));
  }

  // 4. referral farming — the enrollment-referral bonus injects points with no
  // sale behind it, and none of the detectors above watch kind:'referral', so a
  // clerk enrolling throwaway numbers that name one account as referrer harvests
  // the referrer bonus invisibly. Count the REFERRER-credit line (the one that
  // actually pays the referrer — it alone carries referredCustomerId, one per
  // referral enrollment); skip lines already reversed/undone.
  const referralCredits = inWindow.filter(
    (e) => e.kind === "referral" && e.referredCustomerId && !e.reversedBy);

  // 4a. one clerk booking a burst of referral enrollments in a day (the actor)
  const refByClerkDay = new Map(); // byId|day -> { name, count }
  for (const e of referralCredits) {
    const d = dayOf(e);
    if (!e.byId || !d) continue;
    const key = `${e.byId}|${d}`;
    const cur = refByClerkDay.get(key) || { name: e.by || "—", count: 0 };
    cur.count += 1;
    refByClerkDay.set(key, cur);
  }
  for (const [key, { name, count }] of refByClerkDay.entries()) {
    if (count < REFERRAL_BURST_MIN) continue;
    const day = key.split("|")[1];
    alerts.push(alert({
      id: `reward-referral-burst:${key.split("|")[0]}|${day}`, code: "reward-referral-burst",
      severity: count >= REFERRAL_BURST_HIGH ? "high" : "medium",
      params: { name, count, day },
    }));
  }

  // 4b. one account credited as referrer over and over across the window — the
  // farmed account (the self-referral loop), even if spread across clerks/days.
  const refByAccount = new Map(); // customerId -> { count, points }
  for (const e of referralCredits) {
    if (!e.customerId) continue;
    const cur = refByAccount.get(e.customerId) || { count: 0, points: 0 };
    cur.count += 1;
    cur.points += Number(e.points) || 0;
    refByAccount.set(e.customerId, cur);
  }
  for (const [customerId, { count, points }] of refByAccount.entries()) {
    if (count < REFERRAL_FARM_MIN) continue;
    alerts.push(alert({
      id: `reward-referral-farm:${customerId}`, code: "reward-referral-farm",
      severity: count >= REFERRAL_FARM_HIGH ? "high" : "medium",
      params: { who: phoneById.get(customerId) || "?", count, points, windowDays },
    }));
  }

  // 5. one account's earns rung disproportionately by one clerk. The patient
  // skim: attach your own number to other people's real purchases. Nothing
  // above sees it — the points ARE supported by the cash denominator, so
  // OUTPACED SALES is blind, and two a day never trips MULTI-EARN.
  for (const a of clerkAffinity(earnsList)) {
    alerts.push(alert({
      id: `reward-clerk-affinity:${a.customerId}|${a.byId}`, code: "reward-clerk-affinity",
      severity: a.p <= AFFINITY_P_HIGH ? "high" : "medium",
      params: {
        who: phoneById.get(a.customerId) || "?", name: a.name,
        count: a.count, total: a.total,
        share: Math.round(a.share * 100), baseline: Math.round(a.baseline * 100),
        windowDays,
      },
    }));
  }

  // 6. the same question for punch cards, which carry no dollar figure and so
  // have no outpaced-sales equivalent at all — affinity is the only handle.
  const stampsList = inWindow.filter((e) => e.kind === "stamp");
  for (const a of clerkAffinity(stampsList)) {
    alerts.push(alert({
      id: `reward-stamp-affinity:${a.customerId}|${a.byId}`, code: "reward-stamp-affinity",
      severity: a.p <= AFFINITY_P_HIGH ? "high" : "medium",
      params: {
        who: phoneById.get(a.customerId) || "?", name: a.name,
        count: a.count, total: a.total,
        share: Math.round(a.share * 100), baseline: Math.round(a.baseline * 100),
        windowDays,
      },
    }));
  }

  // 7. one card stamped several times in a day, when the model is one per visit.
  const stampByCardDay = new Map(); // customerId|cardId|day -> count
  for (const e of stampsList) {
    const d = dayOf(e);
    if (!e.customerId || !d || e.reversedBy) continue;
    const key = `${e.customerId}|${e.cardId || "?"}|${d}`;
    stampByCardDay.set(key, (stampByCardDay.get(key) || 0) + 1);
  }
  for (const [key, count] of stampByCardDay.entries()) {
    if (count < MULTI_STAMP_MIN) continue;
    const [customerId, , day] = key.split("|");
    alerts.push(alert({
      id: `reward-multi-stamp:${key}`, code: "reward-multi-stamp",
      severity: count >= MULTI_STAMP_HIGH ? "high" : "medium",
      params: { who: phoneById.get(customerId) || "?", count, day },
    }));
  }

  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  return { alerts, totals };
}

// The outstanding-points liability (rewards-program-spec.md §Compliance 7):
// what the store owes at the current settings if every point were redeemed.
// Linear on purpose — a conservative ceiling the owner and the bookkeeper can
// reason about; breakage only ever makes reality smaller. Balances already
// lapsed under the inactivity-expiry policy are excluded (that IS the breakage
// the spec calls for), using the same effectiveBalance the customer sees.
export function outstandingLiability(customersList = [], rules, now = new Date()) {
  const points = (customersList || []).reduce((s, c) => s + effectiveBalance(c, rules, now), 0);
  // Punch cards are an obligation too, and were missing from this figure: a
  // completed card owes a physical item. They are reported as COUNTS, not
  // dollars — a card's reward is free text ("a free coffee") with no price
  // attached anywhere, so costing it would mean inventing a number. Stamps
  // don't expire with the points clock either, so no effectiveBalance analogue.
  const cards = resolveRewards(rules).stamps || [];
  let stamps = 0;
  let stampRewards = 0;
  for (const c of customersList || []) {
    for (const card of cards) {
      const n = Math.max(0, Math.trunc(Number(c?.stamps?.[card.id]) || 0));
      stamps += n;
      if (card.goal > 0) stampRewards += Math.floor(n / card.goal);
    }
  }
  // Value every point at the MOST generous reward's dollars-per-point, so a
  // tiered menu is costed at its worst case (never understated).
  return {
    points, dollars: Math.round(points * pointDollarValue(rules) * 100) / 100,
    stamps, stampRewards,
  };
}
