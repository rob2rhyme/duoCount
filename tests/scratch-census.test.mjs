// buildCensusReconcile is pure — no emulator. Run: npm run test:scratch-census
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCensusReconcile } from "../src/lib/scratch-census.js";

const census = (packs, over = {}) => ({
  packs, by: "Eve", locationId: "loc1", date: "2026-07-10",
  ts: new Date("2026-07-10T20:00:00Z"), ...over,
});
// A minimal scratch count entry (for counted / sold-out / game lookup).
const count = (pack, over = {}) => ({
  kind: "scratch", pack, game: `Game ${pack}`, locationId: "loc1",
  startno: 0, endno: 10, ts: new Date("2026-07-09T12:00:00Z"), date: "2026-07-09", ...over,
});

test("no censuses → empty reconcile", () => {
  assert.deepEqual(buildCensusReconcile([], []), { latest: null, prior: null, walked: [], uncounted: [] });
});

test("a pack in the previous census, gone from the latest and not sold out, is WALKED", () => {
  const censuses = [
    census(["A", "B", "C"], { date: "2026-07-10", ts: new Date("2026-07-10T20:00:00Z") }),
    census(["A", "C"], { date: "2026-07-17", ts: new Date("2026-07-17T20:00:00Z") }), // B gone
  ];
  const entries = [count("A"), count("B"), count("C")];
  const r = buildCensusReconcile(censuses, entries);
  assert.deepEqual(r.walked.map((w) => w.pack), ["B"]);
  assert.equal(r.walked[0].game, "Game B");
  assert.equal(r.latest.count, 2);
  assert.equal(r.prior.count, 3);
});

test("a sold-out book gone from the latest census is NOT walked (it legitimately finished)", () => {
  const censuses = [
    census(["A", "B"], { date: "2026-07-10", ts: new Date("2026-07-10T20:00:00Z") }),
    census(["A"], { date: "2026-07-17", ts: new Date("2026-07-17T20:00:00Z") }),
  ];
  const entries = [count("A"), count("B", { soldOut: true, endno: 100 })];
  assert.deepEqual(buildCensusReconcile(censuses, entries).walked, []);
});

test("a book still present in the latest census is not walked", () => {
  const censuses = [
    census(["A", "B"], { date: "2026-07-10", ts: new Date("2026-07-10T20:00:00Z") }),
    census(["A", "B"], { date: "2026-07-17", ts: new Date("2026-07-17T20:00:00Z") }),
  ];
  assert.deepEqual(buildCensusReconcile(censuses, [count("A"), count("B")]).walked, []);
});

test("a pack on hand in the latest census with no ticket count is UNCOUNTED (the blind-spot catch)", () => {
  // D is physically present but was never counted — exactly the never-counted
  // book a skim would hide. Surfaced so staff get it into the count trail.
  const censuses = [census(["A", "D"], { date: "2026-07-17", ts: new Date("2026-07-17T20:00:00Z") })];
  const r = buildCensusReconcile(censuses, [count("A")]);
  assert.deepEqual(r.uncounted.map((u) => u.pack), ["D"]);
});

test("a counted book on hand is not flagged uncounted", () => {
  const censuses = [census(["A"], { date: "2026-07-17", ts: new Date("2026-07-17T20:00:00Z") })];
  assert.deepEqual(buildCensusReconcile(censuses, [count("A")]).uncounted, []);
});

test("a single census gives no walked (no prior) but still finds uncounted books", () => {
  const censuses = [census(["A", "X"], { date: "2026-07-17", ts: new Date("2026-07-17T20:00:00Z") })];
  const r = buildCensusReconcile(censuses, [count("A")]);
  assert.equal(r.prior, null);
  assert.deepEqual(r.walked, []);
  assert.deepEqual(r.uncounted.map((u) => u.pack), ["X"]);
});

test("reconcile scopes to one location — another store's census/counts don't cross", () => {
  const censuses = [
    census(["A", "B"], { locationId: "loc1", date: "2026-07-10", ts: new Date("2026-07-10T20:00:00Z") }),
    census(["A"], { locationId: "loc1", date: "2026-07-17", ts: new Date("2026-07-17T20:00:00Z") }),
    census(["Z"], { locationId: "loc2", date: "2026-07-17", ts: new Date("2026-07-17T21:00:00Z") }),
  ];
  const r = buildCensusReconcile(censuses, [count("A"), count("B")], { locationId: "loc1" });
  assert.deepEqual(r.walked.map((w) => w.pack), ["B"]); // loc2's Z never enters
  assert.equal(r.latest.count, 1);
});

test("blank pack ids are ignored on both sides", () => {
  const censuses = [
    census(["A", "  ", "B"], { date: "2026-07-10", ts: new Date("2026-07-10T20:00:00Z") }),
    census(["A"], { date: "2026-07-17", ts: new Date("2026-07-17T20:00:00Z") }),
  ];
  const r = buildCensusReconcile(censuses, [count("A"), count("B")]);
  assert.deepEqual(r.walked.map((w) => w.pack), ["B"]);
});
