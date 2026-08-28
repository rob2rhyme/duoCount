import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReorderAlerts } from "../src/lib/scratch-reorder.js";

// A signed scratch count. ts as a Date; perPack optional (falls back to catalog).
const sc = (over = {}) => ({
  kind: "scratch", locationId: "loc1", locationName: "Main", game: "Wild Side",
  pack: "1792-0011361", price: 5, perPack: 30, endno: 27, soldOut: false,
  ts: new Date("2026-01-10T10:00:00Z"), by: "Ana", byId: "u1", ...over,
});

test("fires at/under the threshold, not above it", () => {
  const rows = buildReorderAlerts([
    sc({ pack: "1792-0000001", endno: 27 }), // 3 left → fire
    sc({ pack: "1792-0000002", endno: 25 }), // 5 left → fire (boundary)
    sc({ pack: "1792-0000003", endno: 24 }), // 6 left → no
  ], { threshold: 5 });
  const packs = rows.map((r) => r.pack).sort();
  assert.deepEqual(packs, ["1792-0000001", "1792-0000002"]);
  assert.equal(rows.find((r) => r.pack === "1792-0000001").remaining, 3);
});

test("does not fire on a full/over book (remaining <= 0)", () => {
  const rows = buildReorderAlerts([
    sc({ pack: "1792-0000001", endno: 30 }), // 0 left (a full book) → no
    sc({ pack: "1792-0000002", endno: 31 }), // -1 (over) → no
  ], { threshold: 5 });
  assert.deepEqual(rows, []);
});

test("skips a sold-out book (latest count soldOut) even when near-empty", () => {
  const rows = buildReorderAlerts([
    sc({ pack: "1792-0000001", endno: 20, ts: new Date("2026-01-10T09:00:00Z") }),
    sc({ pack: "1792-0000001", endno: 28, soldOut: true, ts: new Date("2026-01-10T18:00:00Z") }),
  ], { threshold: 5 });
  assert.deepEqual(rows, []);
});

test("uses the LATEST count per book", () => {
  const rows = buildReorderAlerts([
    sc({ pack: "1792-0000001", endno: 10, ts: new Date("2026-01-10T09:00:00Z") }),
    sc({ pack: "1792-0000001", endno: 28, ts: new Date("2026-01-10T18:00:00Z") }), // 2 left
  ], { threshold: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].remaining, 2);
});

test("excludes dismissed books; a replacement book (new id) re-arms", () => {
  const entries = [
    sc({ pack: "1792-0000001", endno: 27 }), // dismissed
    sc({ pack: "1792-0000009", endno: 27 }), // a fresh replacement book → fires
  ];
  const rows = buildReorderAlerts(entries, { threshold: 5, dismissed: ["1792-0000001"] });
  assert.deepEqual(rows.map((r) => r.pack), ["1792-0000009"]);
});

test("perPack falls back to the catalog when the count lacks it; unknown game is skipped", () => {
  const rows = buildReorderAlerts([
    // no perPack on the entry; game 1792 → catalog perPack 60, endno 57 → 3 left
    sc({ pack: "17920011361", endno: 57, perPack: undefined }),
    // unknown game, no perPack → can't judge → skipped
    sc({ pack: "9999-0000001", endno: 3, perPack: undefined }),
  ], { threshold: 5 });
  assert.deepEqual(rows.map((r) => r.pack), ["17920011361"]);
  assert.equal(rows[0].remaining, 3);
  assert.equal(rows[0].perPack, 60);
});

test("threshold 0 / off yields no reminders", () => {
  assert.deepEqual(buildReorderAlerts([sc({ endno: 29 })], { threshold: 0 }), []);
  assert.deepEqual(buildReorderAlerts([sc({ endno: 29 })], { threshold: NaN }), []);
});

test("sorted fewest-left first", () => {
  const rows = buildReorderAlerts([
    sc({ pack: "1792-0000001", endno: 26 }), // 4 left
    sc({ pack: "1792-0000002", endno: 29 }), // 1 left
    sc({ pack: "1792-0000003", endno: 27 }), // 3 left
  ], { threshold: 5 });
  assert.deepEqual(rows.map((r) => r.remaining), [1, 3, 4]);
});

test("ignores non-scratch and packless entries", () => {
  const rows = buildReorderAlerts([
    { kind: "cash", ts: new Date() },
    sc({ pack: "", endno: 29 }),
    sc({ pack: "1792-0000001", endno: 28 }), // 2 left → fire
  ], { threshold: 5 });
  assert.deepEqual(rows.map((r) => r.pack), ["1792-0000001"]);
});
