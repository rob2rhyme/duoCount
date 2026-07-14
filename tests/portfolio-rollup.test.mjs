import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStoreLeaderboard, buildEmployeeRollup, buildPortfolioSummary } from "../src/lib/portfolio-rollup.js";
import { buildPeriodReport } from "../src/lib/report-build.js";

// Fixed two-store fixture. Main runs clean and verified; Riverside runs short,
// unverified, and flagged — so the attention order is hand-predictable.
const LOCS = [
  { id: "l1", name: "Main St" },
  { id: "l2", name: "Riverside" },
  { id: "l3", name: "Idle Depot" }, // no entries in the window
];
const RANGE = { startISO: "2026-07-01", endISO: "2026-07-07" };

const cash = (loc, date, diff, sales, over = {}) => ({
  kind: "cash", date, locationId: loc, locationName: LOCS.find((l) => l.id === loc)?.name,
  sales, paidout: 0, counted: 0, diff,
  varianceStatus: over.flagged ? "open" : "none", disputeStatus: "none",
  by: over.by || "Ann", byId: over.byId ?? "u-ann", verifiedBy: over.verifiedBy ?? null,
  ts: over.ts || new Date(`${date}T12:00:00Z`),
  ...over,
});
const scratch = (loc, date, dollars, over = {}) => ({
  kind: "scratch", date, locationId: loc, locationName: LOCS.find((l) => l.id === loc)?.name,
  sold: 10, dollars, varianceStatus: "none", disputeStatus: "none",
  by: over.by || "Ann", byId: over.byId ?? "u-ann", verifiedBy: over.verifiedBy ?? null,
  ts: over.ts || new Date(`${date}T12:00:00Z`), ...over,
});
const inv = (loc, date, diff, over = {}) => ({
  kind: "inventory", date, locationId: loc, locationName: LOCS.find((l) => l.id === loc)?.name,
  counted: 20, diff, varianceStatus: "none", disputeStatus: "none",
  by: over.by || "Bo Chen", byId: over.byId ?? "u-bo", verifiedBy: over.verifiedBy ?? null,
  ts: over.ts || new Date(`${date}T12:00:00Z`), ...over,
});

const ENTRIES = [
  // Main St: balanced-ish, verified
  cash("l1", "2026-07-01", 0, 1000, { verifiedBy: "Mgr" }),
  cash("l1", "2026-07-02", 2, 1000, { verifiedBy: "Mgr" }),
  scratch("l1", "2026-07-02", 150, { verifiedBy: "Mgr" }),
  inv("l1", "2026-07-03", 0, { verifiedBy: "Mgr" }),
  // Riverside: short, unverified, one flagged; Ann works here too
  cash("l2", "2026-07-01", -20, 500, { flagged: true }),
  cash("l2", "2026-07-03", -10, 500, { by: "Ann", byId: "u-ann" }),
  inv("l2", "2026-07-04", -3, {}),
  // outside the window — must be ignored everywhere
  cash("l2", "2026-06-30", -999, 500, {}),
];

/* ------------------------------ reconciliation ------------------------------ */

test("summary reconciles exactly with buildPeriodReport(all)", () => {
  const summary = buildPortfolioSummary(ENTRIES, RANGE);
  const report = buildPeriodReport(ENTRIES, RANGE, "all");
  assert.deepEqual(summary, report);
});

test("each leaderboard row's raw fields equal that location's own report", () => {
  const { rows } = buildStoreLeaderboard(ENTRIES, RANGE, LOCS);
  for (const row of rows) {
    const r = buildPeriodReport(ENTRIES, RANGE, row.locId);
    assert.equal(row.cashNet, r.cash.netDiff, row.locId);
    assert.equal(row.cashSales, r.cash.sales, row.locId);
    assert.equal(row.scratchDollars, r.scratch.dollars, row.locId);
    assert.equal(row.invShrink, r.inventory.netShrink, row.locId);
    assert.equal(row.total, r.integrity.total, row.locId);
    assert.equal(row.verificationRate, r.integrity.verificationRate, row.locId);
  }
});

/* ------------------------------- leaderboard ------------------------------- */

test("rates match hand-computed values and idle stores never emit NaN", () => {
  const { rows } = buildStoreLeaderboard(ENTRIES, RANGE, LOCS);
  const main = rows.find((r) => r.locId === "l1");
  const river = rows.find((r) => r.locId === "l2");
  const idle = rows.find((r) => r.locId === "l3");
  // Riverside: cashNet −30 over 1000 sales; 1 flagged of 3 entries; 0 verified
  assert.equal(river.cashNetRate, -0.03);
  assert.equal(river.flagRate, round(1 / 3));
  assert.equal(river.verificationRate, 0);
  assert.equal(river.shrinkPerCount, -3); // −3 units over 1 inventory count
  // Main: +2 over 2000 sales; all 4 verified
  assert.equal(main.cashNetRate, 0.001);
  assert.equal(main.verificationRate, 1);
  // Idle Depot: all denominators 0 → null rates, zero attention, still listed
  assert.equal(idle.total, 0);
  assert.equal(idle.cashNetRate, null);
  assert.equal(idle.flagRate, null);
  assert.equal(idle.attention, 0);
  for (const v of Object.values(idle)) assert.ok(!Number.isNaN(v), "no NaN fields");
  function round(n) { return Math.round(n * 10000) / 10000; }
});

test("default attention order puts the worst store first and the idle store last", () => {
  const { rows } = buildStoreLeaderboard(ENTRIES, RANGE, LOCS);
  assert.deepEqual(rows.map((r) => r.locId), ["l2", "l1", "l3"]);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
});

test("column re-sort is deterministic and honors direction", () => {
  const bySales = buildStoreLeaderboard(ENTRIES, RANGE, LOCS, { sortBy: "cashSales", dir: "desc" });
  assert.deepEqual(bySales.rows.map((r) => r.locId), ["l1", "l2", "l3"]);
  // ascending cash net: Riverside −30, Idle 0, Main +2
  const asc = buildStoreLeaderboard(ENTRIES, RANGE, LOCS, { sortBy: "cashNet", dir: "asc" });
  assert.deepEqual(asc.rows.map((r) => r.locId), ["l2", "l3", "l1"]);
});

test("single-location input yields a one-row leaderboard without throwing", () => {
  const { rows } = buildStoreLeaderboard(ENTRIES, RANGE, [LOCS[0]]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rank, 1);
});

test("empty period → all-zero rows, reconciling with the report's empty contract", () => {
  const range = { startISO: "2025-01-01", endISO: "2025-01-07" };
  const summary = buildPortfolioSummary(ENTRIES, range);
  assert.equal(summary.empty, true);
  const { rows } = buildStoreLeaderboard(ENTRIES, range, LOCS);
  assert.ok(rows.every((r) => r.total === 0 && r.attention === 0));
});

/* ----------------------------- employee rollup ----------------------------- */

test("groups one person across two locations by byId with a correct split", () => {
  const { rows } = buildEmployeeRollup(ENTRIES, RANGE, LOCS);
  const ann = rows.find((r) => r.byId === "u-ann");
  assert.ok(ann);
  // Ann: l1 → 2 cash (+2 net) + 1 scratch; l2 → 2 cash (−30 net)
  assert.equal(ann.entries, 5);
  assert.equal(ann.cashNet, -28);
  assert.equal(ann.shorts, 2);
  assert.equal(ann.scratchDollars, 150);
  assert.equal(ann.byLocation.length, 2);
  const atMain = ann.byLocation.find((l) => l.locationId === "l1");
  const atRiver = ann.byLocation.find((l) => l.locationId === "l2");
  assert.equal(atMain.cashNet, 2);
  assert.equal(atMain.verificationRate, 1);
  assert.equal(atRiver.cashNet, -30);
  assert.equal(atRiver.verificationRate, 0);
});

test("a row missing byId falls back to the name and is never merged into someone else", () => {
  const extra = [...ENTRIES, cash("l1", "2026-07-05", -5, 100, { by: "Ann", byId: null })];
  const { rows } = buildEmployeeRollup(extra, RANGE, LOCS);
  const withId = rows.find((r) => r.byId === "u-ann");
  const nameOnly = rows.find((r) => r.byId === null && r.name === "Ann");
  assert.ok(withId && nameOnly);
  assert.equal(withId.entries, 5);   // unchanged
  assert.equal(nameOnly.entries, 1); // its own row
});

test("display name follows the latest entry (name drift shows the current name)", () => {
  const extra = [...ENTRIES,
    cash("l1", "2026-07-06", 0, 100, { by: "Ann Lee", byId: "u-ann", ts: new Date("2026-07-06T12:00:00Z") })];
  const { rows } = buildEmployeeRollup(extra, RANGE, LOCS);
  const ann = rows.find((r) => r.byId === "u-ann");
  assert.equal(ann.name, "Ann Lee");
  assert.equal(rows.filter((r) => r.byId === "u-ann").length, 1); // still one person
});

test("worst cash-short person sorts first", () => {
  const { rows } = buildEmployeeRollup(ENTRIES, RANGE, LOCS);
  assert.equal(rows[0].byId, "u-ann"); // −28 net, worst in the fixture
});

test("bad range throws the same way the report does", () => {
  assert.throws(() => buildEmployeeRollup(ENTRIES, { startISO: "2026-07-07", endISO: "2026-07-01" }, LOCS));
  assert.throws(() => buildEmployeeRollup(ENTRIES, {}, LOCS));
});
