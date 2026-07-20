// Stock-move audit — pure. Run: node --test tests/stockmove-audit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStockMoveAudit } from "../src/lib/stockmove-audit.js";

const NOW = new Date("2026-07-20T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);

// A stock move: item pulled (negative delta) or restocked (positive) by a clerk.
const move = (over = {}) => ({
  itemId: "i1", itemName: "Geekbar", locationId: "L1",
  delta: -1, by: "Eve", byId: "u1", ts: daysAgo(1), ...over,
});

test("no signal from small pulls and restocks", () => {
  const moves = [
    move({ delta: -1 }), move({ delta: -3 }),
    move({ delta: 40, by: "Sam", byId: "u2" }), // a big RESTOCK is never a shrink signal
  ];
  const a = buildStockMoveAudit(moves, { now: NOW });
  assert.equal(a.alerts.length, 0);
  assert.equal(a.totals.pulls, 2);
  assert.equal(a.totals.units, 4);
});

test("an outsized single pull is flagged per item, high when very large", () => {
  const a = buildStockMoveAudit([move({ delta: -35 })], { now: NOW });
  const big = a.alerts.find((x) => x.code === "stock-big-pull");
  assert.ok(big);
  assert.equal(big.severity, "high"); // 35 >= 30
  assert.equal(big.params.biggest, 35);
  assert.equal(big.params.count, 1);
  assert.equal(big.params.item, "Geekbar");

  // a merely-notable pull is medium
  const med = buildStockMoveAudit([move({ delta: -18 })], { now: NOW }).alerts[0];
  assert.equal(med.severity, "medium"); // 15 <= 18 < 30
});

test("big pulls aggregate per item (biggest + count)", () => {
  const moves = [move({ delta: -16 }), move({ delta: -22 }), move({ delta: -3 })];
  const a = buildStockMoveAudit(moves, { now: NOW });
  const big = a.alerts.filter((x) => x.code === "stock-big-pull");
  assert.equal(big.length, 1);
  assert.equal(big[0].params.count, 2);   // the -16 and -22
  assert.equal(big[0].params.biggest, 22);
});

test("clerk-dominated outflow flags when one clerk owns most of an item's pulls (2+ pullers)", () => {
  const moves = [
    ...Array.from({ length: 8 }, () => move({ delta: -5, by: "Eve", byId: "u1" })),  // 40 units by Eve
    move({ delta: -5, by: "Sam", byId: "u2" }),                                       // 5 by Sam
  ];
  const a = buildStockMoveAudit(moves, { now: NOW });
  const conc = a.alerts.find((x) => x.code === "stock-clerk-outflow");
  assert.ok(conc);
  assert.equal(conc.params.name, "Eve");
  assert.equal(conc.params.units, 40);
  assert.equal(conc.params.total, 45);
  assert.equal(conc.params.pct, 89); // 40/45
});

test("no concentration alert when a lone clerk pulls (nothing to dominate over)", () => {
  const moves = Array.from({ length: 10 }, () => move({ delta: -5, by: "Eve", byId: "u1" })); // 50 units, one clerk
  const a = buildStockMoveAudit(moves, { now: NOW });
  assert.equal(a.alerts.some((x) => x.code === "stock-clerk-outflow"), false);
});

test("moves outside the window and other locations are ignored", () => {
  const moves = [
    move({ delta: -35, ts: daysAgo(60) }),                 // outside 30d
    move({ delta: -35, locationId: "L2" }),                // other location (when scoped)
  ];
  assert.equal(buildStockMoveAudit(moves, { now: NOW }).alerts.length, 1);           // L2 counts when unscoped
  assert.equal(buildStockMoveAudit(moves, { now: NOW, locationId: "L1" }).alerts.length, 0); // scoped out
});

test("alerts carry pre-rendered English title/detail and sort high-first", () => {
  const moves = [
    move({ delta: -18 }),                                                            // medium big-pull
    ...Array.from({ length: 8 }, () => move({ itemId: "i2", itemName: "Marlboro", delta: -6, by: "Eve", byId: "u1" })),
    move({ itemId: "i2", itemName: "Marlboro", delta: -6, by: "Sam", byId: "u2" }),
  ];
  const a = buildStockMoveAudit(moves, { now: NOW });
  assert.ok(a.alerts.length >= 2);
  assert.ok(a.alerts[0].title && a.alerts[0].detail); // rendered
  // high (48/54 = 89% concentration, 48 units) sorts before the medium big-pull
  assert.equal(a.alerts[0].severity, "high");
});
