import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPackAudit } from "../src/lib/scratch-audit.js";

const NOW = new Date("2026-07-15T12:00:00Z");
const daysAgo = (n, h = 12) => new Date(NOW.getTime() - n * 24 * 3600 * 1000 + (h - 12) * 3600 * 1000);
const dstr = (d) => d.toISOString().slice(0, 10);

// A scratch count: pack P at location L, start→end, by a named clerk.
const count = (over = {}) => ({
  kind: "scratch", pack: "0447-233", game: "$5 Lucky 7s", price: 5,
  locationId: "loc1", locationName: "Main", by: "Eve", byId: "u1",
  startno: 10, endno: 20, ts: daysAgo(1), date: dstr(daysAgo(1)), ...over,
});

test("clean chain — end # feeds the next start # — produces no gaps", () => {
  const entries = [
    count({ startno: 0, endno: 12, ts: daysAgo(2), date: dstr(daysAgo(2)) }),
    count({ startno: 12, endno: 25, ts: daysAgo(1), date: dstr(daysAgo(1)) }),
    count({ startno: 25, endno: 31, ts: daysAgo(0), date: dstr(daysAgo(0)) }),
  ];
  const a = buildPackAudit(entries, { now: NOW });
  assert.equal(a.gaps.length, 0);
  assert.equal(a.packsSeen, 1);
});

test("a positive gap names both signers, counts tickets, and prices the loss", () => {
  const entries = [
    count({ startno: 0, endno: 37, by: "Eve", ts: daysAgo(1, 22), date: dstr(daysAgo(1)) }),
    count({ startno: 41, endno: 50, by: "Sam", ts: daysAgo(0, 8), date: dstr(daysAgo(0)) }),
  ];
  const a = buildPackAudit(entries, { now: NOW });
  assert.equal(a.gaps.length, 1);
  const g = a.gaps[0];
  assert.equal(g.totalMissing, 4);
  assert.equal(g.missingDollars, 20);
  assert.equal(g.events.length, 1);
  assert.equal(g.events[0].prevBy, "Eve");
  assert.equal(g.events[0].nextBy, "Sam");
  assert.equal(g.events[0].prevEnd, 37);
  assert.equal(g.events[0].nextStart, 41);
});

test("a negative gap (rollback) is reported but not added to totalMissing", () => {
  const entries = [
    count({ startno: 0, endno: 30, ts: daysAgo(1) , date: dstr(daysAgo(1)) }),
    count({ startno: 27, endno: 33, ts: daysAgo(0), date: dstr(daysAgo(0)) }),
  ];
  const a = buildPackAudit(entries, { now: NOW });
  assert.equal(a.gaps.length, 1);
  assert.equal(a.gaps[0].totalMissing, 0);
  assert.equal(a.gaps[0].events[0].missing, -3);
});

test("packs are scoped per location — same pack # at two stores never cross-chains", () => {
  const entries = [
    count({ locationId: "loc1", startno: 0, endno: 10, ts: daysAgo(1), date: dstr(daysAgo(1)) }),
    count({ locationId: "loc2", locationName: "East", startno: 50, endno: 60, ts: daysAgo(0), date: dstr(daysAgo(0)) }),
  ];
  const a = buildPackAudit(entries, { now: NOW });
  assert.equal(a.gaps.length, 0);
  assert.equal(a.packsSeen, 2);
});

test("missing log: a pack absent from later counting days is flagged with missedDays", () => {
  const entries = [
    // pack A counted 3 days ago only; pack B counted every day since — so the
    // location has counting days after A's last count.
    count({ pack: "A-1", startno: 0, endno: 10, ts: daysAgo(3), date: dstr(daysAgo(3)) }),
    count({ pack: "B-2", startno: 0, endno: 5, ts: daysAgo(2), date: dstr(daysAgo(2)) }),
    count({ pack: "B-2", startno: 5, endno: 9, ts: daysAgo(1), date: dstr(daysAgo(1)) }),
  ];
  const a = buildPackAudit(entries, { now: NOW });
  assert.equal(a.missing.length, 1);
  assert.equal(a.missing[0].pack, "A-1");
  assert.equal(a.missing[0].missedDays, 2);
  assert.equal(a.missing[0].lastEnd, 10);
  // the still-counted pack is not flagged
  assert.ok(!a.missing.some((m) => m.pack === "B-2"));
});

test("window: counts older than `days` are ignored entirely", () => {
  const entries = [
    count({ startno: 0, endno: 10, ts: daysAgo(30), date: dstr(daysAgo(30)) }),
    count({ startno: 90, endno: 95, ts: daysAgo(1), date: dstr(daysAgo(1)) }),
  ];
  const a = buildPackAudit(entries, { days: 14, now: NOW });
  // the 30-day-old count is outside the window, so there's no pair to compare
  assert.equal(a.gaps.length, 0);
});

test("non-scratch entries, blank packs, and non-numeric ticket #s are skipped", () => {
  const entries = [
    { kind: "cash", diff: -3, ts: daysAgo(1), date: dstr(daysAgo(1)) },
    count({ pack: "  ", ts: daysAgo(1), date: dstr(daysAgo(1)) }),
    count({ startno: 0, endno: "x", ts: daysAgo(2), date: dstr(daysAgo(2)) }),
    count({ startno: 12, endno: 20, ts: daysAgo(1), date: dstr(daysAgo(1)) }),
  ];
  const a = buildPackAudit(entries, { now: NOW });
  assert.equal(a.gaps.length, 0); // the "x" end makes that pair uncomparable
});

test("gaps sort worst-dollars first; missing sorts most-missed-days first", () => {
  const entries = [
    count({ pack: "cheap", price: 1, startno: 0, endno: 10, ts: daysAgo(2), date: dstr(daysAgo(2)) }),
    count({ pack: "cheap", price: 1, startno: 15, endno: 20, ts: daysAgo(1), date: dstr(daysAgo(1)) }),
    count({ pack: "dear", price: 20, startno: 0, endno: 10, ts: daysAgo(2), date: dstr(daysAgo(2)) }),
    count({ pack: "dear", price: 20, startno: 12, endno: 20, ts: daysAgo(1), date: dstr(daysAgo(1)) }),
  ];
  const a = buildPackAudit(entries, { now: NOW });
  assert.equal(a.gaps[0].pack, "dear");   // 2 × $20 = $40 beats 5 × $1
  assert.equal(a.gaps[1].pack, "cheap");
});

test("pack audit: a FINALED (sold-out) book is retired — never 'missing'", async () => {
  const { buildPackAudit } = await import("../src/lib/scratch-audit.js");
  const mk = (over) => ({
    kind: "scratch", locationId: "L1", locationName: "Main", pack: "1234-567890",
    game: "Monopoly", price: 50, startno: 22, endno: 25, by: "Alex",
    date: "2026-07-10", ts: new Date("2026-07-10T13:00:00Z"), ...over,
  });
  const entries = [
    mk({ soldOut: true }),                                     // old book FINALED
    mk({ pack: "1234-999999", startno: 0, endno: 5, date: "2026-07-11", ts: new Date("2026-07-11T21:00:00Z") }), // fresh book counted next day
  ];
  const { missing } = buildPackAudit(entries, { now: new Date("2026-07-12T00:00:00Z") });
  // Without soldOut the old book would be "missing" (a counting day passed
  // without it). FINALED → retired, nothing to vouch for.
  assert.equal(missing.some((m) => m.pack === "1234-567890"), false);
});

test("sold-out-short: a FINALED book closed below its pack size raises a gap the live audit can see", () => {
  // Book of 100 tickets marked sold out at ticket 60 — 40 tickets left the
  // drawer unaccounted (the classic sell-out skim). Previously invisible to the
  // pack audit; only the on-demand printed report caught it.
  const entries = [
    count({ pack: "SKM-1", price: 10, perPack: 100, startno: 0, endno: 60, soldOut: true, by: "Alex",
      ts: daysAgo(1), date: dstr(daysAgo(1)) }),
  ];
  const a = buildPackAudit(entries, { now: NOW });
  assert.equal(a.gaps.length, 1);
  const g = a.gaps[0];
  assert.equal(g.totalMissing, 40);
  assert.equal(g.missingDollars, 400);      // 40 × $10
  assert.equal(g.events.length, 1);
  assert.equal(g.events[0].selloutShort, true);
  assert.equal(g.events[0].prevEnd, 60);
  assert.equal(g.events[0].nextStart, 100);
  assert.equal(g.events[0].prevBy, "Alex");
  // Still retired from the missing-log (the book no longer exists).
  assert.equal(a.missing.some((m) => m.pack === "SKM-1"), false);
});

test("sold-out-short: a clean sell-out (closed AT pack size) raises nothing", () => {
  const entries = [
    count({ pack: "OK-1", perPack: 50, startno: 0, endno: 50, soldOut: true, ts: daysAgo(1), date: dstr(daysAgo(1)) }),
  ];
  const a = buildPackAudit(entries, { now: NOW });
  assert.equal(a.gaps.length, 0);
});

test("sold-out-short: no perPack recorded → no sellout gap (can't compute the size)", () => {
  const entries = [
    count({ pack: "NP-1", startno: 0, endno: 30, soldOut: true, ts: daysAgo(1), date: dstr(daysAgo(1)) }),
  ];
  const a = buildPackAudit(entries, { now: NOW });
  assert.equal(a.gaps.length, 0);
});
