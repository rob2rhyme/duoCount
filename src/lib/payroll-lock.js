// Pay-period approval — pure helpers over the payrollLocks collection. A lock
// is ONE DOC PER LOCKED BUSINESS DAY (doc id == the YYYY-MM-DD day), written in
// Mon–Sun week batches. Locking doesn't touch the punches (they're already
// immutable, server-timed); it freezes MANAGER CORRECTIONS for those days — the
// one write that can change approved hours after the fact. The security rules
// enforce it (timeclock create branch (b) checks the target day's lock doc);
// these helpers just derive UI state, so they stay Firebase-free and testable.
//
// Lifecycle per day-doc, every transition signed + server-timestamped:
//   approve (manager)  -> { day, weekStart, byId, byName, ts }
//   release (owner)    -> + { released: true, releasedById, releasedBy, releasedAt }
//   re-approve (manager, after release) -> released: false + fresh byId/byName/ts
import { weekDates } from "./schedule.js";

/** Days (YYYY-MM-DD) currently under an ACTIVE lock (released ones don't count). */
export function activeLockDays(locks = []) {
  return new Set(locks.filter((l) => l?.day && l.released !== true).map((l) => l.day));
}

export const isDayLocked = (daySet, day) => daySet.has(day);

/**
 * One week's approval state for the UI:
 *   approved — all 7 days actively locked ({ byName, ts } from the week's docs)
 *   partial  — some but not all days locked (shouldn't happen via the app's
 *              week-batch writes; surfaced rather than hidden if it ever does)
 *   released — the week was approved and then released ({ byName, ts } = releaser)
 *   open     — never approved
 */
export function weekLockInfo(locks = [], weekStart) {
  const days = weekDates(weekStart);
  const byDay = new Map(locks.filter((l) => days.includes(l?.day)).map((l) => [l.day, l]));
  const active = days.filter((d) => byDay.has(d) && byDay.get(d).released !== true);

  if (active.length === days.length) {
    const w = byDay.get(weekStart) || byDay.get(active[0]);
    return { state: "approved", byName: w?.byName ?? null, ts: w?.ts ?? null };
  }
  if (active.length > 0) return { state: "partial", byName: null, ts: null };
  const released = days.map((d) => byDay.get(d)).find((l) => l && l.released === true);
  if (released) return { state: "released", byName: released.releasedBy ?? null, ts: released.releasedAt ?? null };
  return { state: "open", byName: null, ts: null };
}
