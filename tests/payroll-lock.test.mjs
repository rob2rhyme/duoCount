// Pure pay-period-approval helpers. No emulator needed. Run: npm run test:payroll
import { test } from "node:test";
import assert from "node:assert/strict";
import { activeLockDays, isDayLocked, weekLockInfo } from "../src/lib/payroll-lock.js";
import { weekDates } from "../src/lib/schedule.js";

const WEEK = "2026-07-06"; // a Monday
const lock = (day, over = {}) =>
  ({ day, weekStart: WEEK, byId: "u-mgr", byName: "Mia", ts: 1, ...over });
const fullWeek = (over = {}) => weekDates(WEEK).map((d) => lock(d, over));

test("activeLockDays collects locked days and ignores released ones", () => {
  const days = activeLockDays([lock("2026-07-06"), lock("2026-07-07", { released: true }), {}]);
  assert.ok(isDayLocked(days, "2026-07-06"));
  assert.ok(!isDayLocked(days, "2026-07-07")); // released
  assert.ok(!isDayLocked(days, "2026-07-08")); // never locked
});

test("weekLockInfo: a fully locked week is approved, attributed to the approver", () => {
  const info = weekLockInfo(fullWeek(), WEEK);
  assert.equal(info.state, "approved");
  assert.equal(info.byName, "Mia");
});

test("weekLockInfo: an untouched week is open; another week's locks don't bleed in", () => {
  assert.equal(weekLockInfo([], WEEK).state, "open");
  const nextWeekLocks = weekDates("2026-07-13").map((d) => lock(d, { weekStart: "2026-07-13" }));
  assert.equal(weekLockInfo(nextWeekLocks, WEEK).state, "open");
});

test("weekLockInfo: released everywhere reads as released, attributed to the releaser", () => {
  const info = weekLockInfo(
    fullWeek({ released: true, releasedBy: "Owner O", releasedAt: 2 }), WEEK);
  assert.equal(info.state, "released");
  assert.equal(info.byName, "Owner O");
});

test("weekLockInfo: a mixed week is surfaced as partial, not hidden", () => {
  const locks = fullWeek();
  locks[3] = { ...locks[3], released: true };
  assert.equal(weekLockInfo(locks, WEEK).state, "partial");
});

test("re-approval after a release reads as approved again", () => {
  // released:false + fresh signature is the re-approve transition
  const locks = fullWeek({ released: false, releasedBy: "Owner O", releasedAt: 2, byName: "Mia" });
  const info = weekLockInfo(locks, WEEK);
  assert.equal(info.state, "approved");
  assert.equal(info.byName, "Mia");
});
