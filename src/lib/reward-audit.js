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
//
// Pure and isomorphic (Dashboard + digest); Firestore Timestamp `ts` shapes
// are handled via toDate, like scratch-audit.

import { toDate } from "./utils.js";
import { resolveRewards, pointsForSale, maskPhone } from "./rewards.js";
import { renderPattern } from "./pattern-format.js";

const money = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const dayOf = (e) => toDate(e.ts)?.toISOString().slice(0, 10) || null;

// Thresholds — deliberately simple; tune on pull like PATTERN_RULES.
const MULTI_EARN_MIN = 3;      // earns by one customer in one day
const MULTI_EARN_HIGH = 5;
const REDEEM_BURST_MIN = 3;    // redemptions by one clerk in one day
const REDEEM_BURST_HIGH = 5;
const OUTPACE_SLACK = 1.1;     // 10% grace over the supported points
const OUTPACE_FLOOR = 20;      // and at least this many unexplained points

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

  // 1. points issued vs the signed cash-sales denominator
  const windowSales = entries
    .filter((e) => e && e.kind === "cash" && (e.date || dayOf(e) || "") >= cut)
    .reduce((s, e) => s + (Number(e.sales) || 0), 0);
  const supported = pointsForSale(windowSales, R);
  if (totals.earned > supported * OUTPACE_SLACK && totals.earned - supported >= OUTPACE_FLOOR) {
    alerts.push(alert({
      id: "reward-outpaced-sales", code: "reward-outpaced-sales", severity: "high",
      params: {
        points: totals.earned, supported, excess: totals.earned - supported,
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

  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  return { alerts, totals };
}

// The outstanding-points liability (rewards-program-spec.md §Compliance 7):
// what the store owes at the current settings if every point were redeemed.
// Linear on purpose — a conservative ceiling the owner and the bookkeeper can
// reason about; breakage only ever makes reality smaller.
export function outstandingLiability(customersList = [], rules) {
  const R = resolveRewards(rules);
  const points = (customersList || []).reduce((s, c) => s + Math.max(0, Number(c?.pointsBalance) || 0), 0);
  return { points, dollars: Math.round((points / R.redeemPoints) * R.redeemValue * 100) / 100 };
}
