// Period report aggregation for the Reports center — pure and isomorphic (no
// Firebase, no DOM), so the report UI and the tests share one module. This
// generalizes the single-day End-of-Day rollup (ReportModal.buildReport) to an
// arbitrary INCLUSIVE [startISO, endISO] range with richer breakdowns:
//   • cash    — sales / paid-out / counted / net over-short, by drawer & location
//   • scratch — tickets sold + gross dollars, by game
//   • inventory — units counted + net shrink (Σ negative diff), by item
//   • integrity — flagged / disputed / resolved-with-cause / verification rate
//   • trend   — per-sub-period cash subtotals (per-day for short spans, per-month
//               for long ones) so the PDF can draw a small over/short trend
//   • labor   — (optional) hours per employee via summarizeHours, bounded to range
//   • incidents — (optional) opened / acknowledged / closed within the range
//
// It only READS the append-only log — a report is a lens over recorded history,
// never a mutation — so it needs no rules and can't corrupt the signed record.
// An empty period is valid: every rollup zeroes and `empty` is true.

import { summarizeHours } from "./timeclock.js";

const DAY_MS = 86_400_000;
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

const parse = (dateStr) => {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const pad2 = (n) => String(n).padStart(2, "0");

// Normalize the many timestamp shapes (Date, ms, Firestore Timestamp, the demo
// seed's { __ts__ }, ISO string) to a UTC YYYY-MM-DD, or null if unreadable.
function tsToISODate(ts) {
  if (ts == null) return null;
  let d = null;
  if (ts instanceof Date) d = ts;
  else if (typeof ts === "number") d = new Date(ts);
  else if (typeof ts.toDate === "function") d = ts.toDate();
  else if (typeof ts.seconds === "number") d = new Date(ts.seconds * 1000);
  else if (typeof ts.__ts__ === "string") d = new Date(ts.__ts__);
  else d = new Date(ts);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

const FLAG_OPEN = ["open", "under-review"];

// Even sub-period buckets spanning [startISO, endISO] inclusive, per-day or
// per-month. Every bucket is emitted (even zero-activity ones) so a trend line
// is continuous.
function trendBuckets(startISO, endISO, by) {
  const buckets = [];
  if (by === "month") {
    const [sy, sm] = startISO.split("-").map(Number);
    const [ey, em] = endISO.split("-").map(Number);
    let y = sy, m0 = sm - 1;
    while (y < ey || (y === ey && m0 <= em - 1)) {
      const key = `${y}-${pad2(m0 + 1)}`;
      buckets.push({ key, label: key, startISO: fmt(Date.UTC(y, m0, 1)), endISO: fmt(Date.UTC(y, m0 + 1, 1) - DAY_MS) });
      m0 += 1;
      if (m0 > 11) { m0 = 0; y += 1; }
    }
  } else {
    for (let ms = parse(startISO); ms <= parse(endISO); ms += DAY_MS) {
      const key = fmt(ms);
      buckets.push({ key, label: key, startISO: key, endISO: key });
    }
  }
  return buckets;
}

// Short spans (≤ 45 days: day / week / month) trend per-day; longer (quarter+)
// per-month. Callers can override with opts.trendBy = "day" | "month".
function autoTrendBy(startISO, endISO) {
  const spanDays = Math.round((parse(endISO) - parse(startISO)) / DAY_MS) + 1;
  return spanDays <= 45 ? "day" : "month";
}

const bucketKeyOf = (dateStr, by) => (by === "month" ? String(dateStr).slice(0, 7) : String(dateStr).slice(0, 10));

/**
 * Build a period report over recorded entries.
 * @param {Array} entries  the append-only log (cash / scratch / inventory docs).
 * @param {{ startISO: string, endISO: string }} range  inclusive bounds.
 * @param {string} [locId="all"]  a locationId, or "all" (also null/undefined) for every location.
 * @param {{ punches?: Array, incidents?: Array, trendBy?: "day"|"month" }} [opts]
 * @returns {object} rollups; see the file header. `labor` / `incidents` are null
 *   unless the matching option is supplied.
 */
export function buildPeriodReport(entries = [], range = {}, locId = "all", opts = {}) {
  const { startISO, endISO } = range;
  if (!startISO || !endISO) throw new Error("buildPeriodReport needs { startISO, endISO }");
  if (startISO > endISO) throw new Error(`Range start ${startISO} is after end ${endISO}`);

  const scoped = (x) => (locId == null || locId === "all" || x.locationId === locId);
  const rows = entries.filter((e) => e && e.date >= startISO && e.date <= endISO && scoped(e));

  const cash = rows.filter((e) => e.kind === "cash");
  const scratch = rows.filter((e) => e.kind === "scratch");
  const inv = rows.filter((e) => e.kind === "inventory");

  // ---- cash: totals + by-drawer + by-location ----
  const cashTotals = {
    count: cash.length,
    sales: round2(cash.reduce((s, e) => s + num(e.sales), 0)),
    paidout: round2(cash.reduce((s, e) => s + num(e.paidout), 0)),
    counted: round2(cash.reduce((s, e) => s + num(e.counted), 0)),
    netDiff: round2(cash.reduce((s, e) => s + num(e.diff), 0)),
  };
  const groupCash = (keyOf, meta) => {
    const m = new Map();
    for (const e of cash) {
      const k = keyOf(e);
      const g = m.get(k) || { ...meta(e), count: 0, sales: 0, paidout: 0, counted: 0, netDiff: 0 };
      g.count += 1;
      g.sales += num(e.sales);
      g.paidout += num(e.paidout);
      g.counted += num(e.counted);
      g.netDiff += num(e.diff);
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({
      ...g, sales: round2(g.sales), paidout: round2(g.paidout), counted: round2(g.counted), netDiff: round2(g.netDiff),
    }));
  };
  const cashByDrawer = groupCash(
    (e) => e.drawerId || e.drawerName || "—",
    (e) => ({ drawerId: e.drawerId || null, drawerName: e.drawerName || "—", locationId: e.locationId || null, locationName: e.locationName || "" }),
  ).sort((a, b) => (a.locationName || "").localeCompare(b.locationName || "") || (a.drawerName || "").localeCompare(b.drawerName || ""));
  const cashByLocation = groupCash(
    (e) => e.locationId || e.locationName || "—",
    (e) => ({ locationId: e.locationId || null, locationName: e.locationName || "" }),
  ).sort((a, b) => (a.locationName || "").localeCompare(b.locationName || ""));

  // ---- scratch: tickets + gross dollars + by-game ----
  const scratchTotals = {
    count: scratch.length,
    tickets: scratch.reduce((s, e) => s + num(e.sold), 0),
    dollars: round2(scratch.reduce((s, e) => s + num(e.dollars), 0)),
  };
  const scratchByGame = (() => {
    const m = new Map();
    for (const e of scratch) {
      const k = e.game || e.pack || "—";
      const g = m.get(k) || { game: e.game || "—", price: num(e.price), count: 0, tickets: 0, dollars: 0 };
      g.count += 1;
      g.tickets += num(e.sold);
      g.dollars += num(e.dollars);
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({ ...g, dollars: round2(g.dollars) })).sort((a, b) => (a.game || "").localeCompare(b.game || ""));
  })();

  // ---- inventory: units counted + net shrink (Σ negative diff only) + by-item ----
  const invTotals = {
    count: inv.length,
    counted: inv.reduce((s, e) => s + num(e.counted), 0),
    netShrink: inv.reduce((s, e) => s + Math.min(0, num(e.diff)), 0),
  };
  const invByItem = (() => {
    const m = new Map();
    for (const e of inv) {
      const k = e.itemId || e.itemName || "—";
      const g = m.get(k) || { itemId: e.itemId || null, itemName: e.itemName || "—", unit: e.unit || "", count: 0, counted: 0, netShrink: 0 };
      g.count += 1;
      g.counted += num(e.counted);
      g.netShrink += Math.min(0, num(e.diff));
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => (a.itemName || "").localeCompare(b.itemName || ""));
  })();

  // ---- integrity / verification (across all kinds in scope) ----
  const flagged = rows.filter((e) => FLAG_OPEN.includes(e.varianceStatus)).length;
  const disputed = rows.filter((e) => FLAG_OPEN.includes(e.disputeStatus)).length;
  const resolvedWithCause = rows.filter((e) => e.varianceStatus === "resolved" && e.causeCode).length;
  const verified = rows.filter((e) => e.verifiedBy).length;
  const integrity = {
    total: rows.length,
    flagged,
    disputed,
    resolvedWithCause,
    verified,
    verificationRate: rows.length ? round4(verified / rows.length) : 0,
  };

  // ---- trend: per-sub-period cash subtotals (over/short) ----
  const trendBy = opts.trendBy || autoTrendBy(startISO, endISO);
  const trend = (() => {
    const buckets = trendBuckets(startISO, endISO, trendBy);
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const acc = buckets.map((b) => ({ ...b, count: 0, sales: 0, netDiff: 0 }));
    for (const e of cash) {
      const i = idx.get(bucketKeyOf(e.date, trendBy));
      if (i == null) continue;
      acc[i].count += 1;
      acc[i].sales += num(e.sales);
      acc[i].netDiff += num(e.diff);
    }
    return acc.map((b) => ({ ...b, sales: round2(b.sales), netDiff: round2(b.netDiff) }));
  })();

  // ---- labor (optional): hours per employee, shifts that STARTED in range ----
  // Scoped by location like the entry and incident sections, so a per-location
  // report yields a per-location payroll roll-up (not other stores' staff).
  let labor = null;
  if (opts.punches) {
    const fromMs = parse(startISO);
    const toMs = parse(endISO) + DAY_MS - 1; // inclusive end-of-day (23:59:59.999 UTC)
    labor = summarizeHours(opts.punches.filter((p) => p && scoped(p)), { fromMs, toMs });
  }

  // ---- incidents (optional): opened / acknowledged / closed within range ----
  let incidents = null;
  if (opts.incidents) {
    const inRange = (ts) => {
      const d = tsToISODate(ts);
      return d != null && d >= startISO && d <= endISO;
    };
    const scopedInc = opts.incidents.filter((i) => i && scoped(i));
    incidents = {
      opened: scopedInc.filter((i) => inRange(i.ts)).length,
      acknowledged: scopedInc.filter((i) => inRange(i.ackAt)).length,
      closed: scopedInc.filter((i) => inRange(i.closedAt)).length,
    };
  }

  return {
    range: { startISO, endISO },
    locId: locId ?? "all",
    trendBy,
    counts: { cash: cash.length, scratch: scratch.length, inventory: inv.length, total: rows.length },
    empty: rows.length === 0,
    cash: { ...cashTotals, byDrawer: cashByDrawer, byLocation: cashByLocation },
    scratch: { ...scratchTotals, byGame: scratchByGame },
    inventory: { ...invTotals, byItem: invByItem },
    integrity,
    trend,
    labor,
    incidents,
  };
}
