// Pure time-clock aggregation. No emulator needed. Run: npm run test:timeclock
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeShifts, summarizeHours, openShiftFor, hoursDecimal, formatDuration, applyCorrections, dayISO } from "../src/lib/timeclock.js";

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

// ---- manager punch corrections (append-only supersede) -------------------
const idPunch = (id, userId, type, hours, over = {}) =>
  ({ id, userId, userName: userId === "u1" ? "Eve" : "Bob", type, ts: at(hours), ...over });
// audit time `ts` defaults late so a correction applies after the base punches
const corr = (over = {}) => ({ kind: "correction", ts: at(100), byId: "m1", byName: "Mgr", reason: "fix", ...over });

test("a plain punch list passes through applyCorrections unchanged", () => {
  const base = [idPunch("p1", "u1", "in", 9), idPunch("p2", "u1", "out", 17)];
  assert.equal(applyCorrections(base).length, 2);
  const s = computeShifts(base);
  assert.equal(s[0].inId, "p1");
  assert.equal(s[0].outId, "p2");
  assert.equal(s[0].corrected, false);
});

test("edit correction overrides a punch's time and marks the shift corrected", () => {
  const s = computeShifts([
    idPunch("p1", "u1", "in", 9),
    idPunch("p2", "u1", "out", 18),   // mis-punched; really left at 17:00
    corr({ action: "edit", targetId: "p2", type: "out", at: at(17), userId: "u1" }),
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].ms, 8 * H);        // 9 -> 17, not 9 -> 18
  assert.equal(s[0].corrected, true);
  assert.equal(s[0].outId, "p2");      // still the same original punch, superseded
});

test("add correction supplies a forgotten clock-out and closes the open shift", () => {
  const s = computeShifts([
    idPunch("p1", "u1", "in", 9),      // open shift, no hours on its own
    corr({ id: "c1", action: "add", type: "out", at: at(17), userId: "u1", userName: "Eve" }),
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].open, false);
  assert.equal(s[0].ms, 8 * H);
  assert.equal(s[0].corrected, true);
  assert.equal(s[0].outId, "c1");
});

test("add correction supplies a forgotten clock-IN for an orphan out", () => {
  const s = computeShifts([
    idPunch("p1", "u1", "out", 17),    // orphan out — ignored on its own
    corr({ id: "c1", action: "add", type: "in", at: at(9), userId: "u1", userName: "Eve" }),
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].ms, 8 * H);
  assert.equal(s[0].inId, "c1");
});

test("void correction drops an accidental double clock-in", () => {
  const withDouble = [
    idPunch("p1", "u1", "in", 9),
    idPunch("p2", "u1", "in", 9.1),    // accidental second punch
    idPunch("p3", "u1", "out", 17),
  ];
  // without the void: an open 9:00 shift + a 7.9h shift
  assert.equal(computeShifts(withDouble).length, 2);
  const s = computeShifts([...withDouble, corr({ action: "void", targetId: "p2", userId: "u1" })]);
  assert.equal(s.length, 1);
  assert.equal(s[0].ms, 8 * H);        // clean 9 -> 17
});

test("the newest correction to a punch wins (ordered by audit ts)", () => {
  const s = computeShifts([
    idPunch("p1", "u1", "in", 9), idPunch("p2", "u1", "out", 18),
    corr({ action: "edit", targetId: "p2", at: at(17), userId: "u1", ts: at(50) }),
    corr({ action: "edit", targetId: "p2", at: at(16), userId: "u1", ts: at(60) }), // later
  ]);
  assert.equal(s[0].ms, 7 * H);        // final override: 9 -> 16
});

test("a void after an edit still removes the punch (open shift, no hours)", () => {
  const s = computeShifts([
    idPunch("p1", "u1", "in", 9), idPunch("p2", "u1", "out", 18),
    corr({ action: "edit", targetId: "p2", at: at(17), userId: "u1", ts: at(50) }),
    corr({ action: "void", targetId: "p2", userId: "u1", ts: at(60) }),
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].open, true);
  assert.equal(s[0].ms, null);
});

test("corrections targeting nothing, or missing a time, are harmless no-ops", () => {
  const s = computeShifts([
    idPunch("p1", "u1", "in", 9), idPunch("p2", "u1", "out", 17),
    corr({ action: "edit", targetId: "ghost", at: at(5), userId: "u1" }),
    corr({ action: "void", targetId: "ghost", userId: "u1" }),
    corr({ action: "add", type: "in", at: null, userId: "u1" }),        // no time -> ignored
    corr({ action: "add", type: "bogus", at: at(3), userId: "u1" }),    // bad type -> ignored
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].ms, 8 * H);
});

test("corrections flow through summarizeHours (payroll reflects the fix)", () => {
  const rows = summarizeHours([
    idPunch("p1", "u1", "in", 9), idPunch("p2", "u1", "out", 18),
    corr({ action: "edit", targetId: "p2", at: at(17), userId: "u1" }),
  ]);
  assert.equal(rows.find((r) => r.userId === "u1").hours, 8); // corrected 8h, not 9h
});

// dayISO — the LOCAL business day of an instant, the fix for evening US punches
// filing onto the next (UTC) day and no longer matching their shift date.
// offsetMin pins the timezone so the assertion doesn't depend on the runner TZ.
test("dayISO returns the local business day, not the UTC date", () => {
  // 00:30 UTC on Jul 21 == 8:30pm ET on Jul 20 (UTC-5, offset +300).
  const evening = Date.parse("2026-07-21T00:30:00Z");
  assert.equal(dayISO(evening, 300), "2026-07-20"); // store's local day (correct)
  assert.equal(dayISO(evening, 0), "2026-07-21");   // UTC (the old, buggy result)

  // A daytime punch is unaffected — same day either way.
  const morning = Date.parse("2026-07-20T14:00:00Z"); // 10am ET
  assert.equal(dayISO(morning, 300), "2026-07-20");
  assert.equal(dayISO(morning, 0), "2026-07-20");

  // West-coast late night crosses even further: 2am UTC Jul 21 == 7pm PT Jul 20.
  assert.equal(dayISO(Date.parse("2026-07-21T02:00:00Z"), 420), "2026-07-20");

  // A positive-offset zone that pushes INTO the next local day still resolves.
  // 23:30 UTC Jul 20 == 8:30am Jul 21 in UTC+9.
  assert.equal(dayISO(Date.parse("2026-07-20T23:30:00Z"), -540), "2026-07-21");
});
