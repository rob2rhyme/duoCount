import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPackAudit, clusterPackJumps, offShiftCounts } from "../src/lib/scratch-audit.js";

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
  // the server-pinned moment of the last count rides along for the report line
  assert.ok(a.missing[0].lastTs instanceof Date);
  assert.equal(a.missing[0].lastTs.getTime(), daysAgo(3).getTime());
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

// ---- clusterPackJumps: the mass after-hours jump signature ----
// A pack "jumps" when it closes at one number and re-opens above it later; the
// movement window is [close ts, open ts]. Many packs sharing one window is the
// fingerprint of a single after-hours session touching a batch of books.
const jumped = (pack, { closeEnd = 30, openStart = 40, closeTs, openTs } = {}) => [
  count({ pack, startno: 0, endno: closeEnd, ts: closeTs, date: dstr(closeTs) }),
  count({ pack, startno: openStart, endno: openStart + 5, by: "Sam", ts: openTs, date: dstr(openTs) }),
];

test("no gaps => no clusters", () => {
  assert.deepEqual(clusterPackJumps([]), []);
});

test("N packs jumping across the SAME overnight window cluster into one mass event", () => {
  const closeTs = daysAgo(1, 22); // 10pm the night before
  const openTs = daysAgo(0, 8);   // 8am this morning
  const entries = [
    ...jumped("0447-1", { closeEnd: 30, openStart: 35, closeTs, openTs }),
    ...jumped("0447-2", { closeEnd: 50, openStart: 58, closeTs, openTs }),
    ...jumped("0447-3", { closeEnd: 10, openStart: 13, closeTs, openTs }),
  ];
  const clusters = clusterPackJumps(buildPackAudit(entries, { now: NOW }).gaps);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].count, 3);                         // 3 distinct packs
  assert.equal(clusters[0].totalMissing, 5 + 8 + 3);          // 16 tickets
  assert.equal(clusters[0].totalDollars, (5 + 8 + 3) * 5);    // $80 at $5
  assert.equal(clusters[0].windowStart.getTime(), closeTs.getTime()); // latest close
  assert.equal(clusters[0].windowEnd.getTime(), openTs.getTime());    // earliest open
});

test("only two packs jumping is below the mass threshold — no cluster", () => {
  const closeTs = daysAgo(1, 22), openTs = daysAgo(0, 8);
  const entries = [
    ...jumped("A", { closeTs, openTs }),
    ...jumped("B", { closeTs, openTs }),
  ];
  assert.equal(clusterPackJumps(buildPackAudit(entries, { now: NOW }).gaps).length, 0);
});

test("packs jumping in separate, non-overlapping windows do NOT cluster", () => {
  const entries = [
    ...jumped("A", { closeTs: daysAgo(6, 22), openTs: daysAgo(6, 23) }),
    ...jumped("B", { closeTs: daysAgo(4, 22), openTs: daysAgo(4, 23) }),
    ...jumped("C", { closeTs: daysAgo(2, 22), openTs: daysAgo(2, 23) }),
  ];
  assert.equal(clusterPackJumps(buildPackAudit(entries, { now: NOW }).gaps).length, 0);
});

test("cluster window is the tightest common interval across staggered jumps", () => {
  // Closes spread over the evening, opens over the morning; they still share the
  // deep-overnight instant. Window = [latest close, earliest open].
  const entries = [
    ...jumped("A", { closeTs: daysAgo(1, 20), openTs: daysAgo(0, 9) }), // 8pm -> 9am
    ...jumped("B", { closeTs: daysAgo(1, 23), openTs: daysAgo(0, 6) }), // 11pm -> 6am (tightest)
    ...jumped("C", { closeTs: daysAgo(1, 21), openTs: daysAgo(0, 8) }), // 9pm -> 8am
  ];
  const [c] = clusterPackJumps(buildPackAudit(entries, { now: NOW }).gaps);
  assert.equal(c.count, 3);
  assert.equal(c.windowStart.getTime(), daysAgo(1, 23).getTime()); // latest close (11pm)
  assert.equal(c.windowEnd.getTime(), daysAgo(0, 6).getTime());    // earliest open (6am)
});

test("one pack alone never forms a mass cluster (distinct-pack floor)", () => {
  const entries = [
    count({ pack: "solo", startno: 0, endno: 10, ts: daysAgo(3), date: dstr(daysAgo(3)) }),
    count({ pack: "solo", startno: 20, endno: 30, ts: daysAgo(2), date: dstr(daysAgo(2)) }),
    count({ pack: "solo", startno: 40, endno: 50, ts: daysAgo(1), date: dstr(daysAgo(1)) }),
  ];
  assert.equal(clusterPackJumps(buildPackAudit(entries, { now: NOW }).gaps).length, 0);
});

// ---- offShiftCounts: scratch counts logged while the store was unmanned ----
const punch = (userId, userName, type, iso) => ({ userId, userName, type, ts: new Date(iso) });

test("a count logged during a worked shift is not flagged", () => {
  const punches = [punch("u1", "Eve", "in", "2026-07-15T09:00:00Z"), punch("u1", "Eve", "out", "2026-07-15T17:00:00Z")];
  const entries = [count({ byId: "u1", by: "Eve", ts: new Date("2026-07-15T14:00:00Z") })];
  assert.deepEqual(offShiftCounts(entries, punches), []);
});

test("a count when nobody was clocked in is flagged and attributed to the signer", () => {
  const punches = [punch("u1", "Eve", "in", "2026-07-15T09:00:00Z"), punch("u1", "Eve", "out", "2026-07-15T17:00:00Z")];
  const entries = [count({ byId: "u2", by: "Sam", ts: new Date("2026-07-16T02:00:00Z") })];
  const off = offShiftCounts(entries, punches);
  assert.equal(off.length, 1);
  assert.equal(off[0].key, "u2");
  assert.equal(off[0].name, "Sam");
  assert.equal(off[0].count, 1);
});

test("a count while ANY coworker is on shift is fine (store-level, not per-author)", () => {
  const punches = [punch("u1", "Eve", "in", "2026-07-15T09:00:00Z"), punch("u1", "Eve", "out", "2026-07-15T17:00:00Z")];
  // Sam never punched, but logs a count at 2pm while Eve is on the clock.
  const entries = [count({ byId: "u2", by: "Sam", ts: new Date("2026-07-15T14:00:00Z") })];
  assert.deepEqual(offShiftCounts(entries, punches), []);
});

test("an open shift (no clock-out yet) keeps the store staffed — a late count is fine", () => {
  const punches = [punch("u1", "Eve", "in", "2026-07-15T09:00:00Z")]; // still on the clock
  const entries = [count({ byId: "u1", by: "Eve", ts: new Date("2026-07-15T23:00:00Z") })];
  assert.deepEqual(offShiftCounts(entries, punches), []);
});

test("a count within the grace window just after clock-out is not flagged", () => {
  const punches = [punch("u1", "Eve", "in", "2026-07-15T09:00:00Z"), punch("u1", "Eve", "out", "2026-07-15T17:00:00Z")];
  const entries = [count({ byId: "u1", by: "Eve", ts: new Date("2026-07-15T17:30:00Z") })]; // +30m, within 60m grace
  assert.deepEqual(offShiftCounts(entries, punches), []);
});

test("no punches at all → the store isn't using the time clock → flag nothing (fail-open)", () => {
  const entries = [count({ byId: "u1", by: "Eve", ts: new Date("2026-07-16T02:00:00Z") })];
  assert.deepEqual(offShiftCounts(entries, []), []);
});

test("only scratch counts are considered — an off-hours cash entry is ignored", () => {
  const punches = [punch("u1", "Eve", "in", "2026-07-15T09:00:00Z"), punch("u1", "Eve", "out", "2026-07-15T17:00:00Z")];
  const entries = [{ kind: "cash", byId: "u2", by: "Sam", ts: new Date("2026-07-16T02:00:00Z"), diff: -5 }];
  assert.deepEqual(offShiftCounts(entries, punches), []);
});

test("multiple off-hours counts by one signer roll up with a count and samples", () => {
  const punches = [punch("u1", "Eve", "in", "2026-07-15T09:00:00Z"), punch("u1", "Eve", "out", "2026-07-15T17:00:00Z")];
  const entries = [
    count({ byId: "u1", by: "Eve", pack: "P1", ts: new Date("2026-07-16T02:00:00Z") }),
    count({ byId: "u1", by: "Eve", pack: "P2", ts: new Date("2026-07-16T03:00:00Z") }),
  ];
  const off = offShiftCounts(entries, punches);
  assert.equal(off.length, 1);
  assert.equal(off[0].count, 2);
  assert.equal(off[0].sample.length, 2);
});
