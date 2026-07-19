// Backroom flow aggregation — pure. Run: node --test tests/stock-flow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStockFlow, flowShare } from "../src/lib/stock-flow.js";

const now = new Date("2026-07-19T12:00:00Z");
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 3600 * 1000);
const mv = (itemId, name, delta, ago = 1, over = {}) => ({
  itemId, itemName: name, locationId: "L1", delta, newQty: 0, ts: daysAgo(ago), ...over,
});

test("buildStockFlow: splits in/out per item, sorts by outflow, totals add up", () => {
  const { rows, totals } = buildStockFlow([
    mv("g", "Geekbar", -1, 1), mv("g", "Geekbar", -2, 2), mv("g", "Geekbar", +10, 3),
    mv("j", "Juul", -5, 4),
    mv("s", "Slow Soda", +3, 5), // restock only — zero outflow
  ], { now });
  assert.deepEqual(rows.map((r) => r.name), ["Juul", "Geekbar", "Slow Soda"]);
  const g = rows.find((r) => r.itemId === "g");
  assert.equal(g.out, 3);
  assert.equal(g.in, 10);
  assert.equal(g.net, 7);
  assert.equal(g.moves, 3);
  assert.deepEqual(totals, { out: 8, in: 13, moves: 5 });
});

test("buildStockFlow: window and location filters; junk ignored", () => {
  const { rows } = buildStockFlow([
    mv("g", "Geekbar", -1, 1),
    mv("g", "Geekbar", -9, 45),                       // outside the 30-day window
    mv("x", "Other Store", -4, 1, { locationId: "L2" }),
    { itemId: null, delta: -1, ts: daysAgo(1) },       // no item
    null,
  ], { now, locationId: "L1" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].out, 1);
});

test("flowShare: top-N plus a single Other fold; restock-only items excluded", () => {
  const rows = [
    { itemId: "a", name: "A", out: 50 }, { itemId: "b", name: "B", out: 20 },
    { itemId: "c", name: "C", out: 10 }, { itemId: "d", name: "D", out: 8 },
    { itemId: "e", name: "E", out: 6 }, { itemId: "f", name: "F", out: 4 },
    { itemId: "g", name: "G", out: 2 }, { itemId: "h", name: "H", out: 0 },
  ];
  const share = flowShare(rows, 5);
  assert.equal(share.length, 6);                      // top 5 + Other
  assert.deepEqual(share.slice(0, 2).map((s) => s.name), ["A", "B"]);
  const otherSlice = share[5];
  assert.equal(otherSlice.other, true);
  assert.equal(otherSlice.value, 6);                  // F + G; H (0 out) excluded
  assert.equal(flowShare([], 5).length, 0);
  assert.equal(flowShare(rows.slice(0, 3), 5).length, 3); // fewer than cap → no Other
});
