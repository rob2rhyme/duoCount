// Pack-flow report — pure. Run: node --test tests/scratch-report.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPackFlow } from "../src/lib/scratch-report.js";

const e = (over = {}) => ({
  kind: "scratch", date: "2026-07-10", locationId: "L1", locationName: "Main",
  pack: "1234-567890", game: "Lucky 7s", price: 5,
  startno: 10, endno: 14, sold: 4, by: "Alex",
  ts: new Date(`${over.date || "2026-07-10"}T${over.time || "09:00"}:00Z`),
  ...over,
});

test("buildPackFlow: pairs the window's first start with its last end, sums sold", () => {
  const { rows, totals } = buildPackFlow([
    e({ date: "2026-07-10", time: "09:00", shift: "open", startno: 10, endno: 14, sold: 4, by: "Alex" }),
    e({ date: "2026-07-10", time: "21:00", shift: "close", startno: 14, endno: 20, sold: 6, by: "Sam" }),
    e({ date: "2026-07-11", time: "09:00", startno: 20, endno: 25, sold: 5, by: "Alex" }),
  ], { from: "2026-07-10", to: "2026-07-11" });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.openStart, 10);
  assert.equal(r.openBy, "Alex");
  assert.equal(r.closeEnd, 25);
  assert.equal(r.closeDate, "2026-07-11");
  assert.equal(r.sold, 15);
  assert.equal(r.dollars, 75);
  assert.equal(r.moved, 15);       // clean chain: moved == sold
  assert.equal(r.gapTickets, 0);
  assert.deepEqual(totals, { packs: 1, counts: 3, sold: 15, dollars: 75, gapTickets: 0, gapDollars: 0 });
});

test("buildPackFlow: a chain break inside the window becomes a named gap", () => {
  const { rows, totals } = buildPackFlow([
    e({ time: "09:00", startno: 10, endno: 14, sold: 4, by: "Alex" }),
    e({ time: "21:00", startno: 19, endno: 22, sold: 3, by: "Sam" }), // 14 → 19: 5 unaccounted
  ], { from: "2026-07-10", to: "2026-07-10" });
  const r = rows[0];
  assert.equal(r.gapTickets, 5);
  assert.equal(r.gapDollars, 25);
  assert.equal(r.gaps.length, 1);
  assert.equal(r.gaps[0].prevBy, "Alex");
  assert.equal(r.gaps[0].nextBy, "Sam");
  assert.equal(r.moved, 12);  // net movement includes the hole
  assert.equal(r.sold, 7);    // recorded sales don't
  assert.equal(totals.gapDollars, 25);
});

test("buildPackFlow: window and location filters; packs sort by game then pack", () => {
  const entries = [
    e({ date: "2026-07-01", pack: "1111-000001", game: "Zebra Cash" }),   // before window
    e({ date: "2026-07-10", pack: "1111-000001", game: "Zebra Cash" }),
    e({ date: "2026-07-10", pack: "2222-000002", game: "Aces High", price: 10, sold: 4 }),
    e({ date: "2026-07-10", pack: "3333-000003", game: "Other Store", locationId: "L2" }),
  ];
  const all = buildPackFlow(entries, { from: "2026-07-05", to: "2026-07-15" });
  assert.deepEqual(all.rows.map((r) => r.game), ["Aces High", "Other Store", "Zebra Cash"]);
  const scoped = buildPackFlow(entries, { from: "2026-07-05", to: "2026-07-15", locationId: "L1" });
  assert.deepEqual(scoped.rows.map((r) => r.game), ["Aces High", "Zebra Cash"]);
  // the out-of-window count didn't leak into the opening position
  assert.equal(scoped.rows.find((r) => r.game === "Zebra Cash").counts, 1);
});

test("buildPackFlow: non-scratch, packless, and empty inputs are ignored safely", () => {
  const { rows, totals } = buildPackFlow([
    { kind: "cash", date: "2026-07-10", sales: 100 },
    e({ pack: "  " }),
    null,
  ], { from: "2026-07-01", to: "2026-07-31" });
  assert.equal(rows.length, 0);
  assert.equal(totals.packs, 0);
});

test("buildPackFlow: the mid-shift sell-out story — FINAL closes clean, short flags", () => {
  // Alex opens Monopoly at #22 (25/pack), sells out mid-shift, FINALs it.
  const clean = buildPackFlow([
    e({ time: "09:00", startno: 22, endno: 22, sold: 0, by: "Alex", perPack: 25 }),
    e({ time: "13:00", startno: 22, endno: 25, sold: 3, by: "Alex", perPack: 25, soldOut: true }),
  ], { from: "2026-07-10", to: "2026-07-10" });
  assert.equal(clean.rows[0].soldOut, true);
  assert.equal(clean.rows[0].gapTickets, 0); // closed at the book's last ticket — clean
  // Same story but FINALed at #23: two tickets left the pack unaccounted.
  const short = buildPackFlow([
    e({ time: "13:00", startno: 22, endno: 23, sold: 1, by: "Alex", perPack: 25, soldOut: true }),
  ], { from: "2026-07-10", to: "2026-07-10" });
  assert.equal(short.rows[0].gapTickets, 2);
  assert.equal(short.rows[0].gaps[0].selloutShort, true);
  assert.equal(short.rows[0].gapDollars, 10); // 2 × $5
});
