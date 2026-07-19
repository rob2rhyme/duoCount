// Staff time-off pure helpers. Run: node --test tests/timeoff.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateTimeOff, daysCount, rangesOverlap, clashes,
  canDecide, canCancel, compareTimeOff, pendingTimeOff,
} from "../src/lib/timeoff.js";

const TODAY = "2026-07-19";

test("validateTimeOff: a clean request → pending; defaults; reason trimmed", () => {
  const r = validateTimeOff({ type: "vacation", startDate: "2026-08-01", endDate: "2026-08-05", reason: "  family trip  " }, { today: TODAY });
  assert.deepEqual(r.fields, {
    type: "vacation", kind: "request", startDate: "2026-08-01", endDate: "2026-08-05",
    allDay: true, startTime: null, endTime: null, reason: "family trip", status: "pending",
  });
  // single-day: endDate defaults to startDate
  assert.equal(validateTimeOff({ startDate: "2026-08-01" }, { today: TODAY }).fields.endDate, "2026-08-01");
  // unknown type → other
  assert.equal(validateTimeOff({ type: "zzz", startDate: "2026-08-01" }, { today: TODAY }).fields.type, "other");
});

test("validateTimeOff: an event heads-up starts planned and must be future", () => {
  assert.equal(validateTimeOff({ kind: "event", startDate: "2026-08-01" }, { today: TODAY }).fields.status, "planned");
  assert.equal(validateTimeOff({ kind: "event", startDate: "2026-07-01", endDate: "2026-07-02" }, { today: TODAY }).error, "past_event");
  // a formal request may be retroactive (sick yesterday) — no past guard
  assert.ok(validateTimeOff({ kind: "request", startDate: "2026-07-18", endDate: "2026-07-18", type: "sick" }, { today: TODAY }).fields);
});

test("validateTimeOff: date + time validation", () => {
  assert.equal(validateTimeOff({ startDate: "bad" }, { today: TODAY }).error, "bad_start");
  assert.equal(validateTimeOff({ startDate: "2026-08-05", endDate: "2026-08-01" }, { today: TODAY }).error, "end_before_start");
  assert.equal(validateTimeOff({ startDate: "2026-08-01", allDay: false, startTime: "9:00", endTime: "17:00" }, { today: TODAY }).error, "bad_time");
  const timed = validateTimeOff({ startDate: "2026-08-01", allDay: false, startTime: "09:00", endTime: "17:00" }, { today: TODAY });
  assert.equal(timed.fields.allDay, false);
  assert.equal(timed.fields.startTime, "09:00");
  assert.equal(validateTimeOff({ startDate: "2026-08-01", endDate: "2026-08-01", allDay: false, startTime: "17:00", endTime: "09:00" }, { today: TODAY }).error, "time_order");
});

test("daysCount: inclusive span", () => {
  assert.equal(daysCount("2026-08-01", "2026-08-01"), 1);
  assert.equal(daysCount("2026-08-01", "2026-08-05"), 5);
  assert.equal(daysCount("2026-08-05", "2026-08-01"), 0);
});

test("rangesOverlap + clashes: inclusive, excludes self, only live", () => {
  assert.equal(rangesOverlap({ startDate: "2026-08-01", endDate: "2026-08-03" }, { startDate: "2026-08-03", endDate: "2026-08-04" }), true);
  assert.equal(rangesOverlap({ startDate: "2026-08-01", endDate: "2026-08-02" }, { startDate: "2026-08-03", endDate: "2026-08-04" }), false);
  const list = [
    { id: "a", userId: "u2", status: "approved", startDate: "2026-08-02", endDate: "2026-08-04" },
    { id: "b", userId: "u3", status: "denied", startDate: "2026-08-02", endDate: "2026-08-04" }, // denied → ignored
    { id: "c", userId: "u4", status: "pending", startDate: "2026-08-10", endDate: "2026-08-11" }, // no overlap
    { id: "self", userId: "u1", status: "approved", startDate: "2026-08-01", endDate: "2026-08-09" },
  ];
  const hit = clashes({ startDate: "2026-08-01", endDate: "2026-08-03" }, list, { excludeUserId: "u1" });
  assert.deepEqual(hit.map((r) => r.id), ["a"]);
});

test("canDecide / canCancel: manager transitions; requester cancels open only", () => {
  assert.equal(canDecide("pending", "approved", true), true);
  assert.equal(canDecide("approved", "pending", true), true);   // reconsider
  assert.equal(canDecide("canceled", "approved", true), false); // terminal
  assert.equal(canDecide("pending", "approved", false), false); // not a manager
  assert.equal(canDecide("pending", "bogus", true), false);
  assert.equal(canCancel("pending"), true);
  assert.equal(canCancel("planned"), true);
  assert.equal(canCancel("approved"), false);
});

test("compareTimeOff + pendingTimeOff: pending first, then soonest; badge counts pending", () => {
  const rows = [
    { status: "approved", startDate: "2026-08-01" },
    { status: "pending", startDate: "2026-09-01" },
    { status: "pending", startDate: "2026-08-15" },
    { status: "planned", startDate: "2026-08-01" },
  ];
  const sorted = [...rows].sort(compareTimeOff);
  assert.deepEqual(sorted.map((r) => `${r.status}/${r.startDate}`),
    ["pending/2026-08-15", "pending/2026-09-01", "planned/2026-08-01", "approved/2026-08-01"]);
  assert.equal(pendingTimeOff(rows), 2);
});
