// Pure scheduling core. No emulator needed. Run: npm run test:schedule
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, weekStartMonday, weekDates, parseHHMM, shiftMinutes,
  scheduledHours, findOverlaps, groupByDate, reconcile,
  copyShiftsToWeek, availabilityConflicts, isUnavailable,
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

test("findOverlaps flags an employee double-booked on the same day only", () => {
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
