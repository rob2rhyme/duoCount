// Owner portfolio rollups — pure and isomorphic (no Firebase, no DOM), same
// posture as report-build.js. Everything here is a lens over the append-only
// log: the leaderboard DECORATES buildLocationComparison's tested per-location
// rows (rates + rank — never a second pass over raw entries), the consolidated
// summary IS buildPeriodReport(…, "all") so the portfolio total reconciles with
// the Report center to the penny, and the employee rollup is the one genuinely
// new grouping (by stable byId, across locations). See
// docs/multi-store-rollup-spec.md.

import { buildPeriodReport, buildLocationComparison } from "./report-build.js";

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

// A rate whose denominator is 0 is null — the UI renders "—", never NaN.
const rate = (numer, denom) => (denom ? round4(numer / denom) : null);

/* --------------------------- buildStoreLeaderboard --------------------------- */

// Attention score: how much this store needs the owner's eye. Both terms live
// in [0, 1] — unverified share, plus |over/short| as a share of cash sales
// (capped so one wild day can't drown the verification signal). An idle store
// (no entries in the window) scores 0: idleness is visible in its zeroed row,
// but it shouldn't outrank a store with real, bad numbers.
function attentionScore(row) {
  if (!row.total) return 0;
  const unverified = 1 - (row.verificationRate || 0);
  const osRate = Math.min(1, Math.abs(row.cashNetRate ?? 0) * 10);
  return round4(unverified + osRate);
}

/**
 * Ranked, rate-normalized store leaderboard for one period.
 * Decorates buildLocationComparison's rows (every raw figure equals that
 * location's own report) with rates + rank, sorted worst-attention-first by
 * default.
 * @param {Array} entries    period entries, UNSCOPED (all locations).
 * @param {{startISO, endISO}} range
 * @param {Array<{id, name}>} locations
 * @param {{ sortBy?: string, dir?: "asc"|"desc" }} [opts]  re-sort by any
 *   numeric column; default is the attention order.
 * @returns {{ range, rows: Array<object>, total: object }}
 */
export function buildStoreLeaderboard(entries = [], range = {}, locations = [], opts = {}) {
  const cmp = buildLocationComparison(entries, range, locations);

  const decorate = (r) => ({
    ...r,
    // over/short per sales dollar — the honest way to compare a $2k store to a $20k one
    cashNetRate: rate(r.cashNet, r.cashSales),
    // shrink per inventory count (units are not dollars; see the spec's caveat)
    shrinkPerCount: rate(r.invShrink, r.invCount),
    flagRate: rate(r.flagged, r.total),
    disputeRate: rate(r.disputed, r.total),
  });

  let rows = cmp.locations.map(decorate).map((r) => ({ ...r, attention: attentionScore(r) }));

  const { sortBy, dir } = opts;
  if (sortBy) {
    const sign = dir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = a[sortBy]; const bv = b[sortBy];
      const an = av == null ? -Infinity : num(av);
      const bn = bv == null ? -Infinity : num(bv);
      return sign * (an - bn) || a.locName.localeCompare(b.locName);
    });
  } else {
    rows = [...rows].sort((a, b) => (b.attention - a.attention) || a.locName.localeCompare(b.locName));
  }

  rows = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  return { range: cmp.range, rows, total: decorate(cmp.total) };
}

/* ---------------------------- buildEmployeeRollup ---------------------------- */

const entryTsMs = (ts) => {
  if (ts == null) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  if (typeof ts.__ts__ === "string") return new Date(ts.__ts__).getTime();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

/**
 * One person's numbers across every location they worked — the grouping the
 * single-store Dashboard can't do. Groups by stable `byId` (an old row missing
 * an id falls back to a name key and is never merged into someone else); the
 * display name is the latest `by` seen (by ts), so a renamed person shows once
 * under their current name.
 * @param {Array} entries    period entries, UNSCOPED.
 * @param {{startISO, endISO}} range
 * @param {Array<{id, name}>} locations   resolves location display names.
 * @returns {{ range, rows: Array<{ key, byId, name, entries, cashNet, shorts,
 *   scratchDollars, verified, verificationRate, byLocation: Array }> }}
 */
export function buildEmployeeRollup(entries = [], range = {}, locations = []) {
  const { startISO, endISO } = range;
  if (!startISO || !endISO) throw new Error("buildEmployeeRollup needs { startISO, endISO }");
  if (startISO > endISO) throw new Error(`Range start ${startISO} is after end ${endISO}`);

  const locName = (id, fallback) =>
    (locations || []).find((l) => l && l.id === id)?.name || fallback || "—";
  const rows = entries.filter((e) => e && e.date >= startISO && e.date <= endISO);

  const people = new Map();
  for (const e of rows) {
    const key = e.byId || `name:${String(e.by || "—").trim().toLowerCase()}`;
    let p = people.get(key);
    if (!p) {
      p = { key, byId: e.byId || null, name: e.by || "—", nameTs: -1,
        entries: 0, cashNet: 0, shorts: 0, scratchDollars: 0, verified: 0, locs: new Map() };
      people.set(key, p);
    }
    // prefer the latest `by` for display (name drift shows the current name)
    const ts = entryTsMs(e.ts);
    if (e.by && ts >= p.nameTs) { p.name = e.by; p.nameTs = ts; }

    const lk = e.locationId || e.locationName || "—";
    let loc = p.locs.get(lk);
    if (!loc) {
      loc = { locationId: e.locationId || null, locationName: locName(e.locationId, e.locationName),
        entries: 0, cashNet: 0, shorts: 0, scratchDollars: 0, verified: 0 };
      p.locs.set(lk, loc);
    }

    for (const g of [p, loc]) {
      g.entries += 1;
      if (e.verifiedBy) g.verified += 1;
      if (e.kind === "cash") {
        g.cashNet += num(e.diff);
        if (num(e.diff) < -0.005) g.shorts += 1;
      }
      if (e.kind === "scratch") g.scratchDollars += num(e.dollars);
    }
  }

  const finish = (g) => ({
    ...g,
    cashNet: round2(g.cashNet),
    scratchDollars: round2(g.scratchDollars),
    verificationRate: g.entries ? round4(g.verified / g.entries) : 0,
  });

  const out = [...people.values()]
    .map(({ locs, nameTs, ...p }) => ({
      ...finish(p),
      byLocation: [...locs.values()].map(finish)
        .sort((a, b) => (a.locationName || "").localeCompare(b.locationName || "")),
    }))
    // worst first: most cash short at the top, then most entries, then name
    .sort((a, b) => (a.cashNet - b.cashNet) || (b.entries - a.entries) || a.name.localeCompare(b.name));

  return { range: { startISO, endISO }, rows: out };
}

/* --------------------------- buildPortfolioSummary --------------------------- */

// The consolidated close — literally the report's scope-"all" rollup, so the
// portfolio header can never disagree with the Report center.
export function buildPortfolioSummary(entries = [], range = {}, opts = {}) {
  return buildPeriodReport(entries, range, "all", opts);
}
