// Stock-move audit — pure theft/anomaly detectors over the signed backroom
// movement ledger (stockMoves: one append-only line per pull/restock written by
// the trusted /api/stock-move route). Every other signed ledger already has a
// detector — counts → detectPatterns, scratch → pack-gap, rewards →
// buildRewardAudit — so the high-shrink backroom (cigarettes/vapes are the
// named targets) shouldn't be the one blind spot. Two questions in the
// product's "a question, not a verdict" voice, shaped EXACTLY like patterns.js
// alerts ({ id, kind, code, severity, params, title, detail }) so they ride the
// same Patterns card, digest section, and AI-narrative redactor:
//
//   1. OUTSIZED PULL — a single pull far larger than a "grab one for the front"
//      tap. Recorded per item (the biggest, and how many times).
//   2. CLERK-DOMINATED OUTFLOW — most of an item's backroom outflow traced to
//      one clerk, when more than one person pulled it. A pull-at-a-time skim.
//
// Pull-only (delta < 0); a restock (delta > 0) is never a shrink signal. Pure +
// clock-injectable, isomorphic (Dashboard + digest); Firestore ts via toDate.

import { toDate } from "./utils.js";
import { renderPattern } from "./pattern-format.js";

// Thresholds — deliberately simple; tune on pull, like PATTERN_RULES/reward-audit.
const BIG_PULL_MIN = 15;    // units in ONE pull to call it outsized
const BIG_PULL_HIGH = 30;   // ...and this big => high severity
const CONC_MIN_TOTAL = 30;  // an item needs this much window outflow for concentration to matter
const CONC_MIN_CLERK = 20;  // and the dominant clerk at least this many units
const CONC_SHARE = 0.7;     // and this share of the item's outflow

const alert = (a) => {
  const { title, detail } = renderPattern({ code: a.code, params: a.params }, "en");
  return { ...a, kind: a.code, title, detail };
};

/**
 * @param {Array} moves  stockMoves docs ({ itemId, itemName, locationId, delta, by, byId, ts })
 * @param {Object} opts   { days = 30, now = new Date(), locationId = "" }
 * @returns {{ alerts, totals: { pulls, units } }}
 */
export function buildStockMoveAudit(moves = [], { days = 30, now = new Date(), locationId = "" } = {}) {
  const cut = now.getTime() - days * 24 * 3600 * 1000;

  // Pulls only, inside the window, at the requested location.
  const pulls = [];
  for (const m of moves) {
    if (!m || !m.itemId) continue;
    if (locationId && m.locationId !== locationId) continue;
    const d = toDate(m.ts);
    if (!d || d.getTime() < cut || d.getTime() > now.getTime()) continue;
    const delta = Math.trunc(Number(m.delta) || 0);
    if (delta >= 0) continue; // restock / no-op — not a shrink signal
    pulls.push({
      itemId: m.itemId, name: m.itemName || "—", units: -delta,
      by: m.by || "—", byId: m.byId || null,
    });
  }

  const alerts = [];

  // 1. outsized single pulls, aggregated per item (biggest + how many)
  const bigByItem = new Map(); // itemId -> { name, count, biggest }
  for (const p of pulls) {
    if (p.units < BIG_PULL_MIN) continue;
    const cur = bigByItem.get(p.itemId) || { name: p.name, count: 0, biggest: 0 };
    cur.count += 1;
    cur.biggest = Math.max(cur.biggest, p.units);
    bigByItem.set(p.itemId, cur);
  }
  for (const [itemId, g] of bigByItem.entries()) {
    alerts.push(alert({
      id: `stock-big-pull:${itemId}`, code: "stock-big-pull",
      severity: g.biggest >= BIG_PULL_HIGH ? "high" : "medium",
      params: { item: g.name, biggest: g.biggest, count: g.count, days },
    }));
  }

  // 2. one clerk dominating an item's outflow (needs >= 2 pullers to "dominate")
  const perItem = new Map(); // itemId -> { name, total, byClerk: Map(byId -> { name, units }) }
  for (const p of pulls) {
    const it = perItem.get(p.itemId) || { name: p.name, total: 0, byClerk: new Map() };
    it.total += p.units;
    const c = it.byClerk.get(p.byId) || { name: p.by, units: 0 };
    c.units += p.units;
    it.byClerk.set(p.byId, c);
    perItem.set(p.itemId, it);
  }
  for (const [itemId, it] of perItem.entries()) {
    if (it.total < CONC_MIN_TOTAL || it.byClerk.size < 2) continue;
    let top = null;
    for (const c of it.byClerk.values()) if (!top || c.units > top.units) top = c;
    if (!top || top.units < CONC_MIN_CLERK) continue;
    const share = top.units / it.total;
    if (share < CONC_SHARE) continue;
    alerts.push(alert({
      id: `stock-clerk-outflow:${itemId}`, code: "stock-clerk-outflow",
      severity: share >= 0.85 && top.units >= CONC_MIN_CLERK * 2 ? "high" : "medium",
      params: { name: top.name, item: it.name, units: top.units, total: it.total, pct: Math.round(share * 100), days },
    }));
  }

  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  return { alerts, totals: { pulls: pulls.length, units: pulls.reduce((s, p) => s + p.units, 0) } };
}
