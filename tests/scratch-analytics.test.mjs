// Pure scratch-off report analytics — no emulator.
// Run: node --test tests/scratch-analytics.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterScratch, buildScratchAnalytics, buildScratchStaffCSV, buildScratchReportCSV,
} from "../src/lib/scratch-analytics.js";

const e = (over = {}) => ({
  kind: "scratch", date: "2026-07-20", shift: "open", locationId: "loc1", locationName: "Main",
  game: "Wild Side", pack: "17920011361", price: 5, startno: 0, endno: 10, sold: 10, dollars: 50,
  soldOut: false, by: "Ada", byId: "u1", byRole: "employee", ts: new Date("2026-07-20T10:00:00Z"), ...over,
});

const DATA = [
  e({ byId: "u1", by: "Ada", shift: "open", date: "2026-07-20", sold: 10, dollars: 50, pack: "17920011361" }),
  e({ byId: "u1", by: "Ada", shift: "close", date: "2026-07-20", sold: 5, dollars: 25, pack: "17920011361", startno: 10, endno: 15 }),
  e({ byId: "u2", by: "Bo", shift: "open", date: "2026-07-21", sold: 8, dollars: 16, price: 2, game: "Super 7s", pack: "17890022222", soldOut: true }),
  e({ kind: "cash", date: "2026-07-20", sold: undefined, dollars: 999 }), // not scratch → ignored
];

test("filterScratch ignores non-scratch and respects date/location/staff bounds", () => {
  assert.equal(filterScratch(DATA).length, 3);
  assert.equal(filterScratch(DATA, { from: "2026-07-21" }).length, 1);
  assert.equal(filterScratch(DATA, { to: "2026-07-20" }).length, 2);
  assert.equal(filterScratch(DATA, { locationId: "loc1" }).length, 3);
  assert.equal(filterScratch(DATA, { locationId: "loc2" }).length, 0);
  assert.equal(filterScratch(DATA, { staffId: "u1" }).length, 2);
});

test("totals sum tickets, dollars, distinct packs, sold-out count", () => {
  const a = buildScratchAnalytics(DATA);
  assert.equal(a.totals.tickets, 23);   // 10 + 5 + 8
  assert.equal(a.totals.dollars, 91);   // 50 + 25 + 16
  assert.equal(a.totals.packs, 2);      // two distinct pack ids
  assert.equal(a.totals.soldOut, 1);
  assert.equal(a.totals.counts, 3);
});

test("byStaff groups per person, sorted by dollars desc", () => {
  const { byStaff } = buildScratchAnalytics(DATA);
  assert.equal(byStaff.length, 2);
  assert.equal(byStaff[0].by, "Ada");
  assert.equal(byStaff[0].tickets, 15);
  assert.equal(byStaff[0].dollars, 75);
  assert.equal(byStaff[1].by, "Bo");
  assert.equal(byStaff[1].dollars, 16);
});

test("byShift splits open vs close", () => {
  const { byShift } = buildScratchAnalytics(DATA);
  assert.equal(byShift.open.tickets, 18);   // 10 + 8
  assert.equal(byShift.open.dollars, 66);   // 50 + 16
  assert.equal(byShift.close.tickets, 5);
  assert.equal(byShift.close.dollars, 25);
});

test("byDay is a sorted time series with per-shift dollars", () => {
  const { byDay } = buildScratchAnalytics(DATA);
  assert.deepEqual(byDay.map((d) => d.date), ["2026-07-20", "2026-07-21"]);
  assert.equal(byDay[0].dollars, 75);
  assert.equal(byDay[0].openDollars, 50);
  assert.equal(byDay[0].closeDollars, 25);
  assert.equal(byDay[1].openDollars, 16);
  assert.equal(byDay[1].closeDollars, 0);
});

test("byGame and byStaffShift break down correctly", () => {
  const { byGame, byStaffShift } = buildScratchAnalytics(DATA);
  assert.equal(byGame[0].game, "Wild Side");
  assert.equal(byGame[0].tickets, 15);
  assert.equal(byGame[1].game, "Super 7s");
  assert.equal(byStaffShift.length, 3); // Ada/open, Ada/close, Bo/open
  const adaOpen = byStaffShift.find((s) => s.by === "Ada" && s.shift === "open");
  assert.equal(adaOpen.dollars, 50);
});

test("staffId scoping limits the aggregates to one clerk", () => {
  const a = buildScratchAnalytics(DATA, { staffId: "u1" });
  assert.equal(a.totals.tickets, 15);
  assert.equal(a.byStaff.length, 1);
  assert.equal(a.byStaff[0].by, "Ada");
});

test("CSV builders emit headers + rows", () => {
  const a = buildScratchAnalytics(DATA);
  const staffCsv = buildScratchStaffCSV(a, { rangeLabel: "Jul 2026" });
  assert.match(staffCsv, /"Staff","Role","Shift"/);
  assert.match(staffCsv, /"Ada"/);
  assert.match(staffCsv, /"Opening"/);
  const rptCsv = buildScratchReportCSV(a, { rangeLabel: "Jul 2026" });
  assert.match(rptCsv, /"By game"/);
  assert.match(rptCsv, /"Wild Side"/);
  assert.match(rptCsv, /"By staff"/);
});
