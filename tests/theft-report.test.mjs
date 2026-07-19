// Theft & loss composition — pure. Run: node --test tests/theft-report.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTheftReport } from "../src/lib/theft-report.js";

const cash = (over = {}) => ({
  kind: "cash", date: "2026-07-10", locationName: "Main", drawerName: "Reg 1",
  by: "Alex", expected: 500, counted: 480, diff: -20, flagged: true, ts: new Date("2026-07-10T21:00:00Z"), ...over,
});

test("buildTheftReport: composes flagged counts, pack gaps, totals; range-scoped", () => {
  const entries = [
    cash(),
    cash({ date: "2026-06-01", diff: -50 }), // outside range
    cash({ flagged: false, diff: -3 }),      // under threshold — not a signal
    { kind: "inventory", date: "2026-07-10", locationName: "Main", itemName: "Geekbar",
      unit: "unit", by: "Sam", expected: 10, counted: 7, diff: -3, flagged: true, ts: new Date("2026-07-10T21:00:00Z") },
    { kind: "scratch", date: "2026-07-10", locationId: "L1", pack: "1234-567890", game: "Monopoly",
      price: 50, startno: 22, endno: 23, sold: 1, soldOut: true, perPack: 25, by: "Alex", ts: new Date("2026-07-10T13:00:00Z") },
  ];
  const r = buildTheftReport(entries, [], { from: "2026-07-01", to: "2026-07-31" });
  assert.equal(r.flaggedCash.length, 1);
  assert.equal(r.cashShort, 20);
  assert.equal(r.flaggedInventory.length, 1);
  assert.equal(r.invShortUnits, 3);
  assert.equal(r.packGaps.length, 1);
  assert.equal(r.packGapTickets, 2);
  assert.equal(r.packGapDollars, 100); // 2 × $50
  assert.equal(r.totals.flags, 3);
});

test("buildTheftReport: clean range → zeroed totals, empty sections", () => {
  const r = buildTheftReport([cash({ flagged: false, diff: 0 })], [], { from: "2026-07-01", to: "2026-07-31" });
  assert.deepEqual([r.flaggedCash.length, r.flaggedInventory.length, r.packGaps.length, r.rewardAlerts.length], [0, 0, 0, 0]);
  assert.equal(r.totals.flags, 0);
});

// Regression: `flagged` is a client field firestore.rules never constrains,
// but an over-threshold |diff| IS forced to varianceStatus:'open'. A short
// written with flagged:false must still surface (and count toward the shortage)
// off the rules-enforced varianceStatus — otherwise the theft artifact is
// forgeable-invisible.
test("buildTheftReport: an over-threshold short with flagged:false still counts (keys off varianceStatus)", () => {
  const hidden = cash({ flagged: false, varianceStatus: "open", diff: -40, counted: 460 });
  const r = buildTheftReport([hidden], [], { from: "2026-07-01", to: "2026-07-31" });
  assert.equal(r.flaggedCash.length, 1);
  assert.equal(r.cashShort, 40);
  assert.equal(r.totals.flags, 1);

  const invHidden = {
    kind: "inventory", date: "2026-07-10", locationName: "Main", itemName: "Geekbar",
    unit: "unit", by: "Sam", expected: 20, counted: 12, diff: -8,
    flagged: false, varianceStatus: "open", ts: new Date("2026-07-10T21:00:00Z"),
  };
  const ri = buildTheftReport([invHidden], [], { from: "2026-07-01", to: "2026-07-31" });
  assert.equal(ri.flaggedInventory.length, 1);
  assert.equal(ri.invShortUnits, 8);
});

// A resolved short still walked out — it's explained, not erased — so it stays
// in the report even though flagged may have been cleared/untouched.
test("buildTheftReport: a resolved variance still appears", () => {
  const resolved = cash({ flagged: false, varianceStatus: "resolved", causeCode: "register-error", diff: -25, counted: 475 });
  const r = buildTheftReport([resolved], [], { from: "2026-07-01", to: "2026-07-31" });
  assert.equal(r.flaggedCash.length, 1);
  assert.equal(r.cashShort, 25);
});
