// Pure period aggregation — no emulator needed. Run: npm run test:report-build
//
// Two fixtures: (1) a tiny hand-built log with known-by-hand totals so every
// rollup is asserted exactly, and (2) the real demo seed (buildDemoData),
// checked with independent oracles recomputed straight from the raw docs — so a
// grouping bug can't hide behind matching-but-wrong internals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPeriodReport, buildLocationComparison } from "../src/lib/report-build.js";
import { buildDemoData } from "../src/lib/seed-data.js";

const round2 = (n) => Math.round(n * 100) / 100;
const D1 = "2026-03-10", D2 = "2026-03-11";
const RANGE = { startISO: D1, endISO: D2 };

// ---- hand fixture: 3 cash, 3 scratch, 3 inventory across 2 days, 2 locations ----
const entries = [
  { id: "c1", kind: "cash", date: D1, locationId: "loc_a", locationName: "Store A", drawerId: "drw_a", drawerName: "Drawer A",
    start: 200, sales: 400, paidout: 20, expected: 580, counted: 585, diff: 5, varianceStatus: "open", disputeStatus: "none", verifiedBy: null },
  { id: "c2", kind: "cash", date: D1, locationId: "loc_a", locationName: "Store A", drawerId: "drw_b", drawerName: "Drawer B",
    start: 200, sales: 300, paidout: 0, expected: 500, counted: 495, diff: -5, varianceStatus: "resolved", causeCode: "miscount", disputeStatus: "none", verifiedBy: "Mgr" },
  { id: "c3", kind: "cash", date: D2, locationId: "loc_b", locationName: "Store B", drawerId: "drw_c", drawerName: "Drawer C",
    start: 100, sales: 200, paidout: 10, expected: 290, counted: 290, diff: 0, varianceStatus: "none", disputeStatus: "under-review", verifiedBy: "Mgr" },
  { id: "s1", kind: "scratch", date: D1, locationId: "loc_a", game: "G5 Cashword", price: 5, sold: 10, dollars: 50, varianceStatus: "none", disputeStatus: "none", verifiedBy: "Mgr" },
  { id: "s2", kind: "scratch", date: D2, locationId: "loc_a", game: "G5 Cashword", price: 5, sold: 4, dollars: 20, varianceStatus: "none", disputeStatus: "none", verifiedBy: null },
  { id: "s3", kind: "scratch", date: D2, locationId: "loc_b", game: "G10 Colossal", price: 10, sold: 3, dollars: 30, varianceStatus: "none", disputeStatus: "none", verifiedBy: null },
  { id: "i1", kind: "inventory", date: D1, locationId: "loc_a", itemId: "itm_w", itemName: "Widget", unit: "each", counted: 18, diff: -2, varianceStatus: "open", disputeStatus: "none", verifiedBy: null },
  { id: "i2", kind: "inventory", date: D2, locationId: "loc_a", itemId: "itm_w", itemName: "Widget", unit: "each", counted: 25, diff: 0, varianceStatus: "none", disputeStatus: "none", verifiedBy: null },
  { id: "i3", kind: "inventory", date: D2, locationId: "loc_b", itemId: "itm_g", itemName: "Gadget", unit: "each", counted: 9, diff: 1, varianceStatus: "none", disputeStatus: "none", verifiedBy: null },
];

const punches = [
  // Ann (loc_a): 8h in range + an out-of-range Feb shift that must NOT count
  { userId: "u_ann", userName: "Ann", locationId: "loc_a", type: "in", ts: new Date("2026-03-10T14:00:00Z") },
  { userId: "u_ann", userName: "Ann", locationId: "loc_a", type: "out", ts: new Date("2026-03-10T22:00:00Z") },
  { userId: "u_ann", userName: "Ann", locationId: "loc_a", type: "in", ts: new Date("2026-02-01T09:00:00Z") },
  { userId: "u_ann", userName: "Ann", locationId: "loc_a", type: "out", ts: new Date("2026-02-01T17:00:00Z") },
  // Bob (loc_b): 7h in range
  { userId: "u_bob", userName: "Bob", locationId: "loc_b", type: "in", ts: new Date("2026-03-11T16:00:00Z") },
  { userId: "u_bob", userName: "Bob", locationId: "loc_b", type: "out", ts: new Date("2026-03-11T23:00:00Z") },
];

const incidents = [
  { id: "n1", locationId: "loc_a", status: "open", ts: new Date("2026-03-10T12:00:00Z"), ackAt: null, closedAt: null },
  { id: "n2", locationId: "loc_a", status: "acknowledged", ts: new Date("2026-02-01T12:00:00Z"), ackAt: new Date("2026-03-11T09:00:00Z"), closedAt: null },
  { id: "n3", locationId: "loc_b", status: "closed", ts: new Date("2026-01-01T00:00:00Z"), ackAt: new Date("2026-01-02T00:00:00Z"), closedAt: new Date("2026-03-10T18:00:00Z") },
  { id: "n4", locationId: "loc_a", status: "open", ts: new Date("2026-06-01T00:00:00Z"), ackAt: null, closedAt: null },
];

const pick = (arr, k, v) => arr.find((x) => x[k] === v);

// ------------------------------------------------------------------ cash ----
test("cash totals, by-drawer and by-location", () => {
  const r = buildPeriodReport(entries, RANGE, "all");
  assert.deepEqual(r.counts, { cash: 3, scratch: 3, inventory: 3, total: 9 });
  assert.equal(r.empty, false);
  assert.equal(r.cash.count, 3);
  assert.equal(r.cash.sales, 900);
  assert.equal(r.cash.paidout, 30);
  assert.equal(r.cash.counted, 1370);
  assert.equal(r.cash.netDiff, 0); // +5 and -5 cancel

  // by-location
  assert.deepEqual(r.cash.byLocation.map((l) => l.locationId), ["loc_a", "loc_b"]); // sorted by name
  const a = pick(r.cash.byLocation, "locationId", "loc_a");
  assert.deepEqual([a.count, a.sales, a.paidout, a.counted, a.netDiff], [2, 700, 20, 1080, 0]);
  const b = pick(r.cash.byLocation, "locationId", "loc_b");
  assert.deepEqual([b.count, b.sales, b.netDiff], [1, 200, 0]);

  // by-drawer
  assert.deepEqual(r.cash.byDrawer.map((d) => d.drawerId), ["drw_a", "drw_b", "drw_c"]);
  assert.equal(pick(r.cash.byDrawer, "drawerId", "drw_a").netDiff, 5);
  assert.equal(pick(r.cash.byDrawer, "drawerId", "drw_b").netDiff, -5);
  assert.equal(pick(r.cash.byDrawer, "drawerId", "drw_c").netDiff, 0);
});

// --------------------------------------------------------------- scratch ----
test("scratch tickets, gross dollars and by-game", () => {
  const r = buildPeriodReport(entries, RANGE, "all");
  assert.equal(r.scratch.count, 3);
  assert.equal(r.scratch.tickets, 17);
  assert.equal(r.scratch.dollars, 100);
  const g5 = pick(r.scratch.byGame, "game", "G5 Cashword");
  assert.deepEqual([g5.count, g5.tickets, g5.dollars, g5.price], [2, 14, 70, 5]);
  const g10 = pick(r.scratch.byGame, "game", "G10 Colossal");
  assert.deepEqual([g10.count, g10.tickets, g10.dollars], [1, 3, 30]);
});

// ------------------------------------------------------------- inventory ----
test("inventory counted and net shrink counts only negative diffs", () => {
  const r = buildPeriodReport(entries, RANGE, "all");
  assert.equal(r.inventory.count, 3);
  assert.equal(r.inventory.counted, 52);
  assert.equal(r.inventory.netShrink, -2); // -2 from Widget; the +1 Gadget overage does NOT offset
  const w = pick(r.inventory.byItem, "itemId", "itm_w");
  assert.deepEqual([w.count, w.counted, w.netShrink], [2, 43, -2]);
  const g = pick(r.inventory.byItem, "itemId", "itm_g");
  assert.deepEqual([g.count, g.counted, g.netShrink], [1, 9, 0]);
});

// ------------------------------------------------------------- integrity ----
test("integrity: flagged, disputed, resolved-with-cause, verification rate", () => {
  const r = buildPeriodReport(entries, RANGE, "all").integrity;
  assert.equal(r.total, 9);
  assert.equal(r.flagged, 2);            // c1 open + i1 open
  assert.equal(r.disputed, 1);           // c3 under-review
  assert.equal(r.resolvedWithCause, 1);  // c2 resolved + miscount
  assert.equal(r.verified, 3);           // c2, c3, s1
  assert.equal(r.verificationRate, 0.3333); // 3/9
});

// ----------------------------------------------------------------- trend ----
test("trend: per-day buckets for a short span, cash over/short subtotals", () => {
  const r = buildPeriodReport(entries, RANGE, "all");
  assert.equal(r.trendBy, "day");
  assert.deepEqual(r.trend.map((b) => b.key), [D1, D2]);
  assert.deepEqual([r.trend[0].count, r.trend[0].sales, r.trend[0].netDiff], [2, 700, 0]);
  assert.deepEqual([r.trend[1].count, r.trend[1].sales, r.trend[1].netDiff], [1, 200, 0]);
});

test("trend: per-month buckets for a long span, empty months emitted as zero", () => {
  const r = buildPeriodReport(entries, { startISO: "2026-01-01", endISO: "2026-03-31" }, "all");
  assert.equal(r.trendBy, "month");
  assert.deepEqual(r.trend.map((b) => b.key), ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual([r.trend[0].count, r.trend[1].count], [0, 0]);
  assert.deepEqual([r.trend[2].count, r.trend[2].sales, r.trend[2].netDiff], [3, 900, 0]);
});

test("trend: caller can force the bucket granularity", () => {
  const r = buildPeriodReport(entries, RANGE, "all", { trendBy: "month" });
  assert.deepEqual(r.trend.map((b) => b.key), ["2026-03"]);
  assert.equal(r.trend[0].count, 3);
});

test("trendBy auto-selects day for <= 45d spans and month beyond", () => {
  assert.equal(buildPeriodReport([], { startISO: "2026-07-06", endISO: "2026-07-12" }).trendBy, "day");   // a week
  assert.equal(buildPeriodReport([], { startISO: "2026-07-01", endISO: "2026-09-30" }).trendBy, "month"); // a quarter
});

// ----------------------------------------------------------------- labor ----
test("labor: hours per employee, only shifts that started in range", () => {
  const r = buildPeriodReport(entries, RANGE, "all", { punches });
  assert.equal(r.labor.length, 2);
  assert.deepEqual(r.labor.map((u) => u.userName), ["Ann", "Bob"]); // sorted by name
  assert.equal(pick(r.labor, "userId", "u_ann").hours, 8);          // Feb shift excluded
  assert.equal(pick(r.labor, "userId", "u_bob").hours, 7);
});

test("labor is null when no punches are supplied", () => {
  assert.equal(buildPeriodReport(entries, RANGE, "all").labor, null);
});

test("labor honors location scope — a per-location report is a per-location payroll", () => {
  const r = buildPeriodReport(entries, RANGE, "loc_a", { punches });
  assert.equal(r.labor.length, 1);            // only loc_a staff
  assert.equal(r.labor[0].userId, "u_ann");
  assert.equal(r.labor[0].hours, 8);
  assert.ok(!r.labor.some((u) => u.userId === "u_bob")); // loc_b staff excluded
});

// ------------------------------------------------------------- incidents ----
test("incidents: opened / acknowledged / closed within the range", () => {
  const r = buildPeriodReport(entries, RANGE, "all", { incidents });
  assert.deepEqual(r.incidents, { opened: 1, acknowledged: 1, closed: 1 });
  // n1 opened 03-10; n2 acked 03-11; n3 closed 03-10; n4 (06-01) is fully outside
});

test("incidents is null when none are supplied", () => {
  assert.equal(buildPeriodReport(entries, RANGE, "all").incidents, null);
});

// ----------------------------------------------------------- loc scoping ----
test("location scope filters entries and incidents", () => {
  const r = buildPeriodReport(entries, RANGE, "loc_a", { punches, incidents });
  assert.deepEqual(r.counts, { cash: 2, scratch: 2, inventory: 2, total: 6 });
  assert.equal(r.cash.netDiff, 0);
  assert.equal(r.cash.sales, 700);
  assert.equal(r.cash.byLocation.length, 1);
  assert.equal(r.cash.byLocation[0].locationId, "loc_a");
  assert.equal(r.scratch.tickets, 14);
  assert.equal(r.inventory.netShrink, -2);
  assert.equal(r.integrity.total, 6);
  assert.equal(r.integrity.disputed, 0); // the under-review entry is loc_b
  // incidents scoped to loc_a: n1 opened, n2 acked, n3 (loc_b) excluded from closed
  assert.deepEqual(r.incidents, { opened: 1, acknowledged: 1, closed: 0 });
});

// --------------------------------------------------------- empty period ----
test("an empty period is valid: everything zeroes and empty is true", () => {
  const r = buildPeriodReport(entries, { startISO: "2027-01-01", endISO: "2027-01-31" }, "all", { punches, incidents });
  assert.equal(r.empty, true);
  assert.deepEqual(r.counts, { cash: 0, scratch: 0, inventory: 0, total: 0 });
  assert.equal(r.cash.netDiff, 0);
  assert.deepEqual(r.cash.byDrawer, []);
  assert.equal(r.scratch.tickets, 0);
  assert.equal(r.inventory.netShrink, 0);
  assert.equal(r.integrity.verificationRate, 0);
  assert.equal(r.trend.length, 31);                       // Jan 2027, day buckets
  assert.ok(r.trend.every((b) => b.count === 0 && b.netDiff === 0));
  assert.deepEqual(r.labor, []);
  assert.deepEqual(r.incidents, { opened: 0, acknowledged: 0, closed: 0 });
});

// ------------------------------------------------------------ bad input ----
test("buildPeriodReport rejects a missing or inverted range", () => {
  assert.throws(() => buildPeriodReport(entries, {}), /needs \{ startISO, endISO \}/);
  assert.throws(() => buildPeriodReport(entries, { startISO: "2026-03-11", endISO: "2026-03-10" }), /after end/);
});

// --------------------------------------------------- location comparison ----
const LOCS = [{ id: "loc_a", name: "Store A" }, { id: "loc_b", name: "Store B" }];

test("comparison: one KPI row per location (input order) + an all-locations total", () => {
  const c = buildLocationComparison(entries, RANGE, LOCS);
  assert.deepEqual(c.locations.map((l) => l.locId), ["loc_a", "loc_b"]);
  const a = pick(c.locations, "locId", "loc_a");
  assert.deepEqual([a.cashCount, a.cashSales, a.cashNet], [2, 700, 0]);
  assert.deepEqual([a.scratchCount, a.scratchDollars], [2, 70]);
  assert.deepEqual([a.invCount, a.invShrink], [2, -2]);
  assert.deepEqual([a.total, a.verified, a.flagged, a.disputed], [6, 2, 2, 0]);
  assert.equal(a.verificationRate, 0.3333);
  const b = pick(c.locations, "locId", "loc_b");
  assert.deepEqual([b.cashCount, b.cashSales, b.cashNet], [1, 200, 0]);
  assert.deepEqual([b.scratchDollars, b.invShrink], [30, 0]);
  assert.deepEqual([b.total, b.verified, b.flagged, b.disputed], [3, 1, 0, 1]);
});

test("comparison: the total row equals the all-scope report and rows sum back", () => {
  const c = buildLocationComparison(entries, RANGE, LOCS);
  const all = buildPeriodReport(entries, RANGE, "all");
  assert.equal(c.total.locId, "all");
  assert.deepEqual([c.total.cashCount, c.total.cashSales, c.total.cashNet], [all.counts.cash, all.cash.sales, all.cash.netDiff]);
  assert.equal(c.total.total, all.integrity.total);
  // no orphan entries in this fixture, so per-location rows sum to the total
  assert.equal(c.locations.reduce((s, l) => s + l.cashCount, 0), c.total.cashCount);
  assert.equal(round2(c.locations.reduce((s, l) => s + l.cashSales, 0)), c.total.cashSales);
  assert.equal(c.locations.reduce((s, l) => s + l.total, 0), c.total.total);
});

test("comparison: each row is identical to that location's own report", () => {
  const c = buildLocationComparison(entries, RANGE, LOCS);
  for (const l of LOCS) {
    const r = buildPeriodReport(entries, RANGE, l.id);
    const cr = pick(c.locations, "locId", l.id);
    assert.equal(cr.cashNet, r.cash.netDiff);
    assert.equal(cr.scratchDollars, r.scratch.dollars);
    assert.equal(cr.invShrink, r.inventory.netShrink);
    assert.equal(cr.verificationRate, r.integrity.verificationRate);
  }
});

test("comparison: no locations → just the total; a bad range throws", () => {
  const c = buildLocationComparison(entries, RANGE, []);
  assert.deepEqual(c.locations, []);
  assert.equal(c.total.cashCount, 3);
  assert.throws(() => buildLocationComparison(entries, {}, LOCS), /needs \{ startISO, endISO \}/);
});

// =================================================================================
// Demo seed as a realistic fixture — independent oracles recomputed from raw docs
// =================================================================================
const NOW = new Date("2026-07-11T12:00:00Z");
const owner = { id: "owner1", name: "Jordan Price", role: "owner" };
const WHOLE = { startISO: "2026-01-01", endISO: "2026-07-31" }; // covers the ~120-day window

test("demo seed: totals reconcile against a plain recompute of the raw log", () => {
  const d = buildDemoData({ owner, now: NOW });
  const r = buildPeriodReport(d.entries, WHOLE, "all");

  const of = (k) => d.entries.filter((e) => e.kind === k);
  // Every entry falls inside the window, so counts must equal the raw tallies.
  assert.equal(r.counts.cash, of("cash").length);
  assert.equal(r.counts.scratch, of("scratch").length);
  assert.equal(r.counts.inventory, of("inventory").length);
  assert.equal(r.counts.total, d.entries.length);
  assert.ok(r.counts.cash > 0 && r.counts.scratch > 0 && r.counts.inventory > 0);

  assert.equal(r.cash.netDiff, round2(of("cash").reduce((s, e) => s + (e.diff || 0), 0)));
  assert.equal(r.cash.sales, round2(of("cash").reduce((s, e) => s + (e.sales || 0), 0)));
  assert.equal(r.scratch.tickets, of("scratch").reduce((s, e) => s + (e.sold || 0), 0));
  assert.equal(r.scratch.dollars, round2(of("scratch").reduce((s, e) => s + (e.dollars || 0), 0)));
  assert.equal(r.inventory.netShrink, of("inventory").reduce((s, e) => s + Math.min(0, e.diff || 0), 0));
  assert.equal(r.integrity.verified, d.entries.filter((e) => e.verifiedBy).length);
  assert.ok(r.integrity.verificationRate >= 0 && r.integrity.verificationRate <= 1);
});

test("demo seed: breakdowns and trend sum back to their totals", () => {
  const d = buildDemoData({ owner, now: NOW });
  const r = buildPeriodReport(d.entries, WHOLE, "all");

  assert.equal(r.cash.byLocation.reduce((s, l) => s + l.count, 0), r.cash.count);
  assert.equal(round2(r.cash.byLocation.reduce((s, l) => s + l.netDiff, 0)), r.cash.netDiff);
  assert.equal(r.cash.byDrawer.reduce((s, x) => s + x.count, 0), r.cash.count);
  assert.equal(r.scratch.byGame.reduce((s, g) => s + g.tickets, 0), r.scratch.tickets);
  assert.equal(r.inventory.byItem.reduce((s, x) => s + x.counted, 0), r.inventory.counted);

  assert.equal(r.trendBy, "month"); // 7-month window
  assert.equal(r.trend.reduce((s, b) => s + b.count, 0), r.cash.count);
  assert.equal(round2(r.trend.reduce((s, b) => s + b.netDiff, 0)), r.cash.netDiff);
});

test("demo seed: location scope narrows to one location (kiosk is cash-only)", () => {
  const d = buildDemoData({ owner, now: NOW });
  const all = buildPeriodReport(d.entries, WHOLE, "all");
  const kiosk = buildPeriodReport(d.entries, WHOLE, "seed_loc_kiosk");

  assert.ok(kiosk.counts.total < all.counts.total);
  assert.ok(kiosk.cash.count > 0);
  assert.equal(kiosk.scratch.count, 0);
  assert.equal(kiosk.inventory.count, 0);
  assert.equal(kiosk.cash.byLocation.length, 1);
  assert.equal(kiosk.cash.byLocation[0].locationId, "seed_loc_kiosk");
});

test("demo seed: labor roll-up sums each employee's in-range punches", () => {
  const d = buildDemoData({ owner, now: NOW });
  const r = buildPeriodReport(d.entries, { startISO: "2026-06-01", endISO: "2026-07-11" }, "all", { punches: d.timeclock });
  assert.ok(Array.isArray(r.labor) && r.labor.length >= 2);
  for (const u of r.labor) assert.ok(u.hours > 0 && u.shifts > 0);
  const names = r.labor.map((u) => u.userName);
  assert.ok(names.includes("Sam Rivera") && names.includes("Alex Kim"));
});

test("demo seed: location comparison reconciles with per-location reports", () => {
  const d = buildDemoData({ owner, now: NOW });
  const locs = d.locations.map((l) => ({ id: l.id, name: l.name }));
  const c = buildLocationComparison(d.entries, WHOLE, locs);
  assert.equal(c.locations.length, locs.length);
  for (const l of locs) {
    const r = buildPeriodReport(d.entries, WHOLE, l.id);
    const cr = pick(c.locations, "locId", l.id);
    assert.equal(cr.cashNet, r.cash.netDiff);
    assert.equal(cr.scratchDollars, r.scratch.dollars);
    assert.equal(cr.total, r.integrity.total);
  }
  // every seed entry belongs to a known location, so the rows sum to the total
  assert.equal(c.locations.reduce((s, l) => s + l.total, 0), c.total.total);
  assert.equal(round2(c.locations.reduce((s, l) => s + l.cashSales, 0)), c.total.cashSales);
});

test("demo seed: incident tally matches the seed's own statuses", () => {
  const d = buildDemoData({ owner, now: NOW });
  const r = buildPeriodReport(d.entries, WHOLE, "all", { incidents: d.incidents });
  // all seed incidents fall inside the wide window
  assert.equal(r.incidents.opened, d.incidents.length);
  assert.equal(r.incidents.closed, d.incidents.filter((i) => i.status === "closed").length);
  assert.equal(r.incidents.acknowledged, d.incidents.filter((i) => i.status !== "open").length);
});
