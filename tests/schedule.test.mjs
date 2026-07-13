// Pure scheduling core. No emulator needed. Run: npm run test:schedule
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, weekStartMonday, weekDates, parseHHMM, shiftMinutes, crossesMidnight,
  scheduledHours, findOverlaps, groupByDate, reconcile,
  copyShiftsToWeek, availabilityConflicts, isUnavailable,
  dayOffset, weekShiftsToTemplate, templateToShifts,
} from "../src/lib/schedule.js";

const shift = (userId, date, start, end, over = {}) =>
  ({ id: `${userId}-${date}-${start}`, userId, userName: userId === "u1" ? "Eve" : "Bob", date, start, end, ...over });

test("date helpers: addDays, week start (Monday), and 7-day span", () => {
  assert.equal(addDays("2026-07-11", 1), "2026-07-12");
  assert.equal(addDays("2026-07-01", -1), "2026-06-30");     // month boundary
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");     // 2026 not a leap year
  // 2026-07-11 is a Saturday -> week's Monday is 2026-07-06
  assert.equal(weekStartMonday("2026-07-11"), "2026-07-06");
  assert.equal(weekStartMonday("2026-07-06"), "2026-07-06"); // Monday maps to itself
  const wk = weekDates("2026-07-06");
  assert.equal(wk.length, 7);
  assert.deepEqual([wk[0], wk[6]], ["2026-07-06", "2026-07-12"]);
});

test("time parsing and shift duration, including overnight", () => {
  assert.equal(parseHHMM("09:30"), 570);
  assert.equal(parseHHMM("24:00"), null);
  assert.equal(parseHHMM("9:5"), null);
  assert.equal(parseHHMM("bad"), null);
  assert.equal(shiftMinutes("09:00", "17:00"), 480);   // 8h
  assert.equal(shiftMinutes("22:00", "06:00"), 480);   // overnight 8h
  assert.equal(shiftMinutes("09:00", "09:00"), 24 * 60); // treated as full overnight
  assert.equal(shiftMinutes("bad", "17:00"), 0);
});

test("scheduledHours totals per employee and honors the date range", () => {
  const shifts = [
    shift("u1", "2026-07-06", "09:00", "17:00"), // 8h
    shift("u1", "2026-07-07", "09:00", "12:30"), // 3.5h
    shift("u2", "2026-07-06", "10:00", "18:00"), // 8h
    shift("u1", "2026-07-20", "09:00", "17:00"), // out of range
  ];
  const rows = scheduledHours(shifts, { from: "2026-07-06", to: "2026-07-12" });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.userName), ["Bob", "Eve"]); // sorted by name
  assert.equal(rows.find((r) => r.userId === "u1").hours, 11.5);
  assert.equal(rows.find((r) => r.userId === "u1").shifts, 2);
  assert.equal(rows.find((r) => r.userId === "u2").hours, 8);
});

test("findOverlaps flags a double-booked employee; other days/people don't collide", () => {
  const shifts = [
    shift("u1", "2026-07-06", "09:00", "13:00"),
    shift("u1", "2026-07-06", "12:00", "17:00"), // overlaps the first
    shift("u1", "2026-07-07", "09:00", "17:00"), // different day, no overlap
    shift("u2", "2026-07-06", "09:00", "13:00"), // different person, no overlap
  ];
  const ov = findOverlaps(shifts);
  assert.equal(ov.size, 2);
  assert.ok(ov.has("u1-2026-07-06-09:00"));
  assert.ok(ov.has("u1-2026-07-06-12:00"));
  assert.ok(!ov.has("u1-2026-07-07-09:00"));

  // back-to-back (end == next start) is NOT an overlap
  const abut = [shift("u1", "2026-07-06", "09:00", "13:00"), shift("u1", "2026-07-06", "13:00", "17:00")];
  assert.equal(findOverlaps(abut).size, 0);
});

test("findOverlaps catches a long shift swallowing a later, non-adjacent one", () => {
  // 09:00-17:00 covers the whole day; 09:05-09:20 overlaps its front; 12:00-13:00
  // starts AFTER the 09:05 shift ends but still sits inside the long one. An
  // adjacent-only check (compare i to i-1) misses the noon shift — full pairwise
  // must flag all three.
  const shifts = [
    shift("u1", "2026-07-06", "09:00", "17:00"),
    shift("u1", "2026-07-06", "09:05", "09:20"),
    shift("u1", "2026-07-06", "12:00", "13:00"),
  ];
  const ov = findOverlaps(shifts);
  assert.equal(ov.size, 3);
  assert.ok(ov.has("u1-2026-07-06-09:00"));
  assert.ok(ov.has("u1-2026-07-06-09:05"));
  assert.ok(ov.has("u1-2026-07-06-12:00")); // the one the old code missed
});

test("groupByDate buckets and sorts each day by start time", () => {
  const by = groupByDate([
    shift("u1", "2026-07-06", "14:00", "18:00"),
    shift("u2", "2026-07-06", "08:00", "12:00"),
  ]);
  assert.deepEqual(by.get("2026-07-06").map((s) => s.start), ["08:00", "14:00"]);
});

test("reconcile matches scheduled vs worked by business day, only over given dates", () => {
  const scheduled = [
    shift("u1", "2026-07-06", "09:00", "17:00"),
    shift("u2", "2026-07-06", "09:00", "17:00"),
    shift("u1", "2026-07-07", "09:00", "17:00"), // no punch -> no-show
    shift("u1", "2026-07-20", "09:00", "17:00"), // outside dates -> ignored
  ];
  const punches = [
    { userId: "u1", day: "2026-07-06", type: "in" },
    { userId: "u2", day: "2026-07-06", type: "in" },
    { userId: "u3", day: "2026-07-06", type: "in" }, // worked but not scheduled
  ];
  const dates = ["2026-07-06", "2026-07-07"];
  const r = reconcile(scheduled, punches, { dates });
  assert.equal(r.scheduled, 3);      // 3 scheduled within dates
  assert.equal(r.worked, 2);         // u1 & u2 on the 6th
  assert.equal(r.noShow.length, 1);  // u1 on the 7th
  assert.equal(r.noShow[0].userId, "u1");
  assert.equal(r.noShow[0].date, "2026-07-07");
  assert.equal(r.unscheduled.length, 1); // u3 on the 6th
  assert.equal(r.unscheduled[0].userId, "u3");
});

test("reconcile ignores a worked day that falls outside the requested dates", () => {
  const r = reconcile([], [{ userId: "u1", day: "2026-01-01", type: "in" }], { dates: ["2026-07-06"] });
  assert.equal(r.unscheduled.length, 0);
  assert.equal(r.scheduled, 0);
});

test("copyShiftsToWeek shifts dates by a week and preserves employee + times", () => {
  const src = [
    shift("u1", "2026-07-06", "09:00", "17:00", { locationId: "l1", locationName: "Downtown" }),
    shift("u2", "2026-07-07", "10:00", "18:00"),
  ];
  const out = copyShiftsToWeek(src, { offsetDays: 7 });
  assert.equal(out.length, 2);
  assert.equal(out[0].date, "2026-07-13");
  assert.equal(out[0].userId, "u1");
  assert.equal(out[0].start, "09:00");
  assert.equal(out[0].locationName, "Downtown");
  assert.equal(out[1].date, "2026-07-14");
  // no id/by fields — those are stamped at write time
  assert.equal(out[0].id, undefined);
});

test("copyShiftsToWeek skips shifts that already exist in the target week", () => {
  const src = [shift("u1", "2026-07-06", "09:00", "17:00"), shift("u1", "2026-07-07", "09:00", "17:00")];
  const existing = [shift("u1", "2026-07-13", "09:00", "17:00")]; // already copied Monday
  const out = copyShiftsToWeek(src, { offsetDays: 7, existing });
  assert.equal(out.length, 1);
  assert.equal(out[0].date, "2026-07-14"); // only Tuesday gets copied
});

test("copy-week and templates carry open:true so a null-user spec stays writable", () => {
  const open = { id: "o1", userId: null, userName: null, date: "2026-07-06", start: "09:00", end: "17:00", open: true };
  const assigned = shift("u1", "2026-07-07", "10:00", "18:00");

  // copyShiftsToWeek: the open shift keeps open:true; the assigned one omits it.
  const copied = copyShiftsToWeek([open, assigned], { offsetDays: 7 });
  const copiedOpen = copied.find((s) => s.userId == null);
  const copiedAssigned = copied.find((s) => s.userId === "u1");
  assert.equal(copiedOpen.open, true);
  assert.equal(copiedOpen.date, "2026-07-13");
  assert.equal("open" in copiedAssigned, false);

  // Round-trip through a template: saved spec preserves open, and stamping it
  // onto a week re-emits open:true (so the create rule accepts the null user).
  const tpl = weekShiftsToTemplate([open, assigned], "2026-07-06");
  const tplOpen = tpl.find((t) => t.userId == null);
  assert.equal(tplOpen.open, true);
  const stamped = templateToShifts(tpl, "2026-07-13");
  const stampedOpen = stamped.find((s) => s.userId == null);
  assert.equal(stampedOpen.open, true);
  assert.equal("open" in stamped.find((s) => s.userId === "u1"), false);
});

test("unassigned (open) shifts don't count as hours, overlaps, or no-shows", () => {
  const open1 = { id: "o1", userId: null, userName: null, date: "2026-07-06", start: "09:00", end: "17:00" };
  const open2 = { id: "o2", userId: null, userName: null, date: "2026-07-06", start: "12:00", end: "20:00" };
  // two open shifts overlapping in time on the same day are NOT a double-booking
  assert.equal(findOverlaps([open1, open2]).size, 0);
  // open shifts contribute no scheduled hours
  assert.deepEqual(scheduledHours([open1, open2]), []);
  // an unclaimed open shift on an elapsed day is not a no-show
  const r = reconcile([open1], [], { dates: ["2026-07-06"] });
  assert.equal(r.scheduled, 0);
  assert.equal(r.noShow.length, 0);
});

test("dayOffset gives the 0-6 weekday index within a week", () => {
  assert.equal(dayOffset("2026-07-06", "2026-07-06"), 0); // Monday
  assert.equal(dayOffset("2026-07-06", "2026-07-09"), 3); // Thursday
  assert.equal(dayOffset("2026-07-06", "2026-07-12"), 6); // Sunday
});

test("weekShiftsToTemplate keys shifts by weekday and strips date/id/swap state", () => {
  const wk = [
    { id: "x", userId: "u1", userName: "Eve", date: "2026-07-06", start: "09:00", end: "17:00", locationId: "l1", locationName: "Downtown", swapStatus: "offered" },
    { id: "y", userId: "u2", userName: "Bob", date: "2026-07-08", start: "10:00", end: "18:00" },
  ];
  const tpl = weekShiftsToTemplate(wk, "2026-07-06");
  assert.deepEqual(tpl[0], { dow: 0, userId: "u1", userName: "Eve", start: "09:00", end: "17:00", locationId: "l1", locationName: "Downtown" });
  assert.equal(tpl[1].dow, 2);
  assert.equal("swapStatus" in tpl[0], false);
  assert.equal("date" in tpl[0], false);
  assert.equal("id" in tpl[0], false);
});

test("templateToShifts stamps a template onto a target week", () => {
  const tpl = [
    { dow: 0, userId: "u1", userName: "Eve", start: "09:00", end: "17:00", locationName: "Downtown" },
    { dow: 4, userId: "u2", userName: "Bob", start: "10:00", end: "18:00" },
  ];
  const out = templateToShifts(tpl, "2026-07-13"); // the following week
  assert.equal(out.length, 2);
  assert.equal(out[0].date, "2026-07-13"); // Monday
  assert.equal(out[0].userId, "u1");
  assert.equal(out[0].locationName, "Downtown");
  assert.equal(out[1].date, "2026-07-17"); // Friday
  assert.equal(out[0].id, undefined); // ids/by stamped at write time
});

test("applying a template is idempotent against existing shifts", () => {
  const tpl = [{ dow: 0, userId: "u1", userName: "Eve", start: "09:00", end: "17:00" }];
  const existing = [{ userId: "u1", date: "2026-07-13", start: "09:00", end: "17:00" }];
  assert.equal(templateToShifts(tpl, "2026-07-13", { existing }).length, 0);
  // round-trip: save a week, re-apply to the SAME week -> nothing new
  const wk = [{ id: "a", userId: "u1", userName: "Eve", date: "2026-07-06", start: "09:00", end: "17:00" }];
  const rebuilt = weekShiftsToTemplate(wk, "2026-07-06");
  assert.equal(templateToShifts(rebuilt, "2026-07-06", { existing: wk }).length, 0);
});

test("availabilityConflicts flags shifts on an employee's unavailable day", () => {
  const shifts = [
    shift("u1", "2026-07-06", "09:00", "17:00"),
    shift("u1", "2026-07-07", "09:00", "17:00"),
    shift("u2", "2026-07-06", "09:00", "17:00"),
  ];
  const unavailable = [{ userId: "u1", date: "2026-07-06" }];
  const ids = availabilityConflicts(shifts, unavailable);
  assert.equal(ids.size, 1);
  assert.ok(ids.has("u1-2026-07-06-09:00"));
  assert.ok(!ids.has("u1-2026-07-07-09:00")); // different day
  assert.ok(!ids.has("u2-2026-07-06-09:00")); // different person

  assert.equal(isUnavailable(unavailable, "u1", "2026-07-06"), true);
  assert.equal(isUnavailable(unavailable, "u1", "2026-07-07"), false);
  assert.equal(isUnavailable(unavailable, "u2", "2026-07-06"), false);
});

/* ---------- overnight shifts straddling two calendar days ---------- */

test("crossesMidnight matches shiftMinutes' end<=start convention", () => {
  assert.equal(crossesMidnight({ start: "22:00", end: "06:00" }), true);
  assert.equal(crossesMidnight({ start: "09:00", end: "09:00" }), true);  // full 24h
  assert.equal(crossesMidnight({ start: "09:00", end: "17:00" }), false);
  assert.equal(crossesMidnight({ start: "bad", end: "17:00" }), false);   // unparseable -> not overnight
});

test("findOverlaps catches an overnight shift colliding with the next morning", () => {
  const shifts = [
    shift("u1", "2026-07-06", "22:00", "06:00"), // Mon night, runs to Tue 06:00
    shift("u1", "2026-07-07", "05:00", "13:00"), // Tue morning — overlaps 05:00–06:00
    shift("u2", "2026-07-07", "05:00", "13:00"), // other person, no conflict
  ];
  const ov = findOverlaps(shifts);
  assert.equal(ov.size, 2);
  assert.ok(ov.has("u1-2026-07-06-22:00"));
  assert.ok(ov.has("u1-2026-07-07-05:00"));

  // abutting across midnight (out 06:00, in 06:00) is NOT an overlap
  const abut = [shift("u1", "2026-07-06", "22:00", "06:00"), shift("u1", "2026-07-07", "06:00", "14:00")];
  assert.equal(findOverlaps(abut).size, 0);

  // two clean nights in a row are fine
  const nights = [shift("u1", "2026-07-06", "22:00", "06:00"), shift("u1", "2026-07-07", "22:00", "06:00")];
  assert.equal(findOverlaps(nights).size, 0);
});

test("reconcile: an overnight shift accepts its punches landing on the next day", () => {
  const scheduled = [shift("u1", "2026-07-06", "22:00", "06:00")];
  // clocked in a few minutes past midnight — the punch day is already the 7th
  const r = reconcile(scheduled, [{ userId: "u1", day: "2026-07-07", type: "in" }],
    { dates: ["2026-07-06", "2026-07-07"] });
  assert.equal(r.worked, 1);
  assert.equal(r.noShow.length, 0);
  assert.equal(r.unscheduled.length, 0); // the spill punch isn't "unscheduled" on the 7th
});

test("reconcile: an overnight clock-out next morning isn't an unscheduled day", () => {
  // The everyday overnight case: in-punch stamps Mon, out-punch stamps Tue.
  const scheduled = [shift("u1", "2026-07-06", "22:00", "06:00")];
  const punches = [
    { userId: "u1", day: "2026-07-06", type: "in" },
    { userId: "u1", day: "2026-07-07", type: "out" },
  ];
  const r = reconcile(scheduled, punches, { dates: ["2026-07-06", "2026-07-07"] });
  assert.equal(r.worked, 1);
  assert.equal(r.noShow.length, 0);
  assert.equal(r.unscheduled.length, 0); // Tue's out-punch belongs to Mon's shift
});

test("reconcile: a DAY shift still never matches a punch from the following day", () => {
  const scheduled = [shift("u1", "2026-07-06", "09:00", "17:00")];
  const r = reconcile(scheduled, [{ userId: "u1", day: "2026-07-07", type: "in" }],
    { dates: ["2026-07-06", "2026-07-07"] });
  assert.equal(r.worked, 0);
  assert.equal(r.noShow.length, 1);      // the 6th really was missed
  assert.equal(r.unscheduled.length, 1); // and the 7th really is unscheduled
});

test("availabilityConflicts flags an overnight shift spilling into an unavailable day", () => {
  const shifts = [
    shift("u1", "2026-07-06", "22:00", "06:00"), // spills into the 7th — conflict
    shift("u1", "2026-07-08", "22:00", "06:00"), // spills into the 9th — fine
    shift("u2", "2026-07-06", "22:00", "06:00"), // other person — fine
  ];
  const unavailable = [{ userId: "u1", date: "2026-07-07" }];
  const ids = availabilityConflicts(shifts, unavailable);
  assert.equal(ids.size, 1);
  assert.ok(ids.has("u1-2026-07-06-22:00"));
});
