// Pure time-clock aggregation. No emulator needed. Run: npm run test:timeclock
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeShifts, summarizeHours, openShiftFor, hoursDecimal, formatDuration } from "../src/lib/timeclock.js";

const H = 3_600_000;
// fixed epoch base (Date.now not used — literals keep tests deterministic)
const T0 = 1_700_000_000_000;
const at = (hours) => T0 + hours * H;
const punch = (userId, type, hours, over = {}) =>
  ({ userId, userName: userId === "u1" ? "Eve" : "Bob", type, ts: at(hours), ...over });

test("a clean in→out makes one closed shift with the right duration", () => {
  const s = computeShifts([punch("u1", "in", 9), punch("u1", "out", 17)]);
  assert.equal(s.length, 1);
  assert.equal(s[0].open, false);
  assert.equal(s[0].ms, 8 * H);
  assert.equal(hoursDecimal(s[0].ms), 8);
});

test("an unpaired in is an open shift contributing no hours", () => {
  const s = computeShifts([punch("u1", "in", 9)]);
  assert.equal(s.length, 1);
  assert.equal(s[0].open, true);
  assert.equal(s[0].ms, null);
  assert.deepEqual(summarizeHours([punch("u1", "in", 9)]), []);
});

test("a forgotten clock-out (two ins) closes the first as open, keeps the second live", () => {
  const s = computeShifts([punch("u1", "in", 9), punch("u1", "in", 14), punch("u1", "out", 18)]);
  assert.equal(s.length, 2);
  assert.equal(s[0].open, true);   // 9:00 in, never punched out
  assert.equal(s[0].ms, null);
  assert.equal(s[1].open, false);  // 14:00 → 18:00
  assert.equal(s[1].ms, 4 * H);
});

test("an orphan out (nothing open) is ignored", () => {
  const s = computeShifts([punch("u1", "out", 17), punch("u1", "in", 9), punch("u1", "out", 12)]);
  // sorted: in@9, out@12, out@17(orphan) -> one 3h shift
  assert.equal(s.length, 1);
  assert.equal(s[0].ms, 3 * H);
});

test("punches are paired per user, not across users", () => {
  const s = computeShifts([
    punch("u1", "in", 9), punch("u2", "in", 10), punch("u1", "out", 13), punch("u2", "out", 15),
  ]);
  assert.equal(s.length, 2);
  const eve = s.find((x) => x.userId === "u1");
  const bob = s.find((x) => x.userId === "u2");
  assert.equal(eve.ms, 4 * H);
  assert.equal(bob.ms, 5 * H);
});

test("out-of-order punches sort by time before pairing", () => {
  const s = computeShifts([punch("u1", "out", 17), punch("u1", "in", 9)]);
  assert.equal(s.length, 1);
  assert.equal(s[0].ms, 8 * H);
});

test("summarizeHours totals per user and rounds to 2dp", () => {
  const punches = [
    punch("u1", "in", 9), punch("u1", "out", 12.5),  // 3.5h
    punch("u1", "in", 13), punch("u1", "out", 17),   // 4h
    punch("u2", "in", 8), punch("u2", "out", 16),    // 8h
  ];
  const rows = summarizeHours(punches);
  assert.equal(rows.length, 2);
  const eve = rows.find((r) => r.userId === "u1");
  assert.equal(eve.hours, 7.5);
  assert.equal(eve.shifts, 2);
  assert.equal(rows.find((r) => r.userId === "u2").hours, 8);
  // sorted by name: Bob before Eve
  assert.deepEqual(rows.map((r) => r.userName), ["Bob", "Eve"]);
});

test("summarizeHours honors the [from,to] window by shift start", () => {
  const punches = [
    punch("u1", "in", 1), punch("u1", "out", 3),    // starts at +1h
    punch("u1", "in", 50), punch("u1", "out", 52),  // starts at +50h
  ];
  const rows = summarizeHours(punches, { fromMs: at(10), toMs: at(100) });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hours, 2); // only the +50h shift is in range
});

test("openShiftFor returns the live shift or null", () => {
  const punches = [punch("u1", "in", 9), punch("u2", "in", 10), punch("u2", "out", 15)];
  assert.equal(openShiftFor(punches, "u1").open, true);
  assert.equal(openShiftFor(punches, "u2"), null);
  assert.equal(openShiftFor(punches, "nobody"), null);
});

test("malformed punches (bad type / missing ts) are skipped, not crashed", () => {
  const s = computeShifts([
    { userId: "u1", type: "in", ts: null },
    { userId: "u1", type: "lunch", ts: at(9) },
    punch("u1", "in", 9), punch("u1", "out", 10),
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].ms, 1 * H);
});

test("formatDuration renders h/m and guards nulls", () => {
  assert.equal(formatDuration(8 * H), "8h 0m");
  assert.equal(formatDuration(45 * 60_000), "45m");
  assert.equal(formatDuration(6 * H + 45 * 60_000), "6h 45m");
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(-5), "—");
});

test("Firestore-style timestamps ({seconds} / {toDate}) are accepted", () => {
  const s = computeShifts([
    { userId: "u1", userName: "Eve", type: "in", ts: { seconds: T0 / 1000 } },
    { userId: "u1", userName: "Eve", type: "out", ts: { toDate: () => new Date(T0 + 2 * H) } },
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].ms, 2 * H);
});
