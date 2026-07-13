// Shift scheduling / rostering — pure and isomorphic (no Firebase imports), so
// the component and the tests share one module. Unlike time-clock punches (an
// immutable audit trail), a schedule is a *plan*: managers create, edit, and
// delete scheduled shifts. This module does the planning math — durations,
// weekly hours, double-booking detection, and day-level reconciliation against
// the actual punches (via each punch's business `day` string, so no timezone
// juggling is needed to line a plan up with what happened).

/* ---------- date helpers (YYYY-MM-DD strings, UTC math, no Date.now) ---------- */
function parseDay(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}
const fmtDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY_MS = 86_400_000;

export function addDays(dateStr, n) {
  return fmtDay(parseDay(dateStr) + n * DAY_MS);
}
/** Monday of the week containing dateStr. */
export function weekStartMonday(dateStr) {
  const ms = parseDay(dateStr);
  const dow = new Date(ms).getUTCDay();     // 0=Sun … 6=Sat
  return fmtDay(ms - ((dow + 6) % 7) * DAY_MS); // back up to Monday
}
/** The 7 date strings Mon…Sun starting at startStr. */
export function weekDates(startStr) {
  return Array.from({ length: 7 }, (_, i) => addDays(startStr, i));
}

/* ---------- time helpers ---------- */
export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}
/** Minutes worked, treating end <= start as an overnight shift (+24h). */
export function shiftMinutes(start, end) {
  const a = parseHHMM(start), b = parseHHMM(end);
  if (a == null || b == null) return 0;
  const d = b - a;
  return d > 0 ? d : d + 24 * 60;
}
/** True when a shift crosses midnight (same end<=start convention as shiftMinutes). */
export function crossesMidnight(s) {
  const a = parseHHMM(s?.start), b = parseHHMM(s?.end);
  return a != null && b != null && b <= a;
}

/* ---------- aggregation ---------- */
/** Scheduled hours per employee over an optional inclusive [from,to] date range. */
export function scheduledHours(shifts = [], { from = null, to = null } = {}) {
  const byUser = new Map();
  for (const s of shifts) {
    if (!s.userId) continue; // unassigned (open) shifts aren't anyone's hours
    if (from && s.date < from) continue;
    if (to && s.date > to) continue;
    const u = byUser.get(s.userId) || { userId: s.userId, userName: s.userName, mins: 0, shifts: 0 };
    u.mins += shiftMinutes(s.start, s.end);
    u.shifts += 1;
    u.userName = s.userName || u.userName;
    byUser.set(s.userId, u);
  }
  return [...byUser.values()]
    .map((u) => ({ ...u, hours: Math.round((u.mins / 60) * 100) / 100 }))
    .sort((a, b) => (a.userName || "").localeCompare(b.userName || ""));
}

/**
 * Ids of shifts that double-book one employee. Shifts are compared as ABSOLUTE
 * intervals (date + time), grouped per employee rather than per day, so an
 * overnight shift is checked across the midnight boundary too — Mon 22:00–06:00
 * collides with Tue 05:00–13:00, which a per-day grouping could never see.
 */
export function findOverlaps(shifts = []) {
  const groups = new Map();
  for (const s of shifts) {
    if (!s.userId) continue; // two open shifts on a day aren't a double-booking
    if (!groups.has(s.userId)) groups.set(s.userId, []);
    groups.get(s.userId).push(s);
  }
  const overlap = new Set();
  for (const list of groups.values()) {
    const iv = list
      .map((s) => {
        const a = parseDay(s.date) / 60000 + (parseHHMM(s.start) ?? 0); // absolute minutes
        return { id: s.id, a, b: a + shiftMinutes(s.start, s.end) };
      })
      .sort((x, y) => x.a - y.a);
    // Full pairwise within the (tiny) per-employee group. Comparing only
    // adjacent intervals missed a long shift swallowing a later short one — e.g.
    // 09:00-17:00 then 09:05-09:20 then 12:00-13:00: the noon shift starts after
    // the 09:05 one ends, so an adjacent-only check never notices it still sits
    // inside the 09:00-17:00 shift. Standard interval-overlap test, order-agnostic.
    for (let i = 0; i < iv.length; i++) {
      for (let j = i + 1; j < iv.length; j++) {
        if (iv[i].a < iv[j].b && iv[j].a < iv[i].b) {
          overlap.add(iv[i].id); overlap.add(iv[j].id);
        }
      }
    }
  }
  return overlap;
}

/**
 * Duplicate a set of shifts into another week (shifted by offsetDays), returning
 * plain specs to write. Skips any that already exist in `existing` (matched on
 * employee + new date + start), so re-running "copy last week" never doubles up.
 */
export function copyShiftsToWeek(sourceShifts = [], { offsetDays = 7, existing = [] } = {}) {
  const have = new Set(existing.map((s) => `${s.userId}|${s.date}|${s.start}`));
  const out = [];
  for (const s of sourceShifts) {
    const date = addDays(s.date, offsetDays);
    const key = `${s.userId}|${date}|${s.start}`;
    if (have.has(key)) continue;
    have.add(key);
    out.push({
      userId: s.userId, userName: s.userName,
      locationId: s.locationId ?? null, locationName: s.locationName ?? null,
      date, start: s.start, end: s.end,
      // An unassigned (open) shift must carry open:true or the create rule
      // rejects it (userId null with no open flag). Assigned shifts omit it.
      ...(s.userId == null ? { open: true } : {}),
    });
  }
  return out;
}

/** Day-of-week offset (0 = the week's Monday … 6 = Sunday) of `date`. */
export function dayOffset(weekStart, date) {
  return Math.round((parseDay(date) - parseDay(weekStart)) / DAY_MS);
}

/**
 * Turn a week's shifts into a reusable template — specs keyed by day-of-week
 * (0-6), stripped of dates, ids, and swap state. Shifts outside the Mon-Sun
 * window are dropped.
 */
export function weekShiftsToTemplate(weekShifts = [], weekStart) {
  return weekShifts
    .map((s) => ({
      dow: dayOffset(weekStart, s.date),
      userId: s.userId, userName: s.userName,
      start: s.start, end: s.end,
      locationId: s.locationId ?? null, locationName: s.locationName ?? null,
      // Preserve the open flag so a saved template can hold an open shift and
      // re-stamp it as one (templateToShifts derives open from a null userId,
      // but keeping it here makes the stored template self-describing).
      ...(s.userId == null ? { open: true } : {}),
    }))
    .filter((t) => t.dow >= 0 && t.dow <= 6);
}

/**
 * Stamp a template's day-of-week specs onto a target week, returning shift specs
 * to write — skipping any that already exist (employee + date + start), so
 * applying a template twice is idempotent.
 */
export function templateToShifts(templateShifts = [], weekStart, { existing = [] } = {}) {
  const have = new Set(existing.map((s) => `${s.userId}|${s.date}|${s.start}`));
  const out = [];
  for (const t of templateShifts) {
    if (!(t.dow >= 0 && t.dow <= 6)) continue;
    const date = addDays(weekStart, t.dow);
    const key = `${t.userId}|${date}|${t.start}`;
    if (have.has(key)) continue;
    have.add(key);
    out.push({
      userId: t.userId, userName: t.userName,
      locationId: t.locationId ?? null, locationName: t.locationName ?? null,
      date, start: t.start, end: t.end,
      // Same open-shift rule as copyShiftsToWeek: a null-user spec must be open.
      ...(t.userId == null ? { open: true } : {}),
    });
  }
  return out;
}

/**
 * Ids of scheduled shifts that land on a date the employee marked unavailable.
 * `unavailable` is a list of { userId, date }. An overnight shift also conflicts
 * when it SPILLS into an unavailable day — Mon 22:00–06:00 runs into Tuesday,
 * so a Tuesday day-off blocks it too.
 */
export function availabilityConflicts(shifts = [], unavailable = []) {
  const off = new Set(unavailable.map((u) => `${u.userId}|${u.date}`));
  const ids = new Set();
  for (const s of shifts) {
    if (off.has(`${s.userId}|${s.date}`)
      || (crossesMidnight(s) && off.has(`${s.userId}|${addDays(s.date, 1)}`))) ids.add(s.id);
  }
  return ids;
}

/** Is this employee marked unavailable on this date? (form-time guard.) */
export function isUnavailable(unavailable = [], userId, date) {
  return unavailable.some((u) => u.userId === userId && u.date === date);
}

/** date -> shifts on that date, each list sorted by start time. */
export function groupByDate(shifts = []) {
  const by = new Map();
  for (const s of shifts) {
    if (!by.has(s.date)) by.set(s.date, []);
    by.get(s.date).push(s);
  }
  for (const list of by.values()) list.sort((a, b) => (parseHHMM(a.start) ?? 0) - (parseHHMM(b.start) ?? 0));
  return by;
}

/**
 * Day-level attendance reconciliation over the given business dates. A punch's
 * `day` string is compared directly to a shift's `date`, so no timezone math is
 * needed. Pass only ELAPSED dates (<= today) — a future scheduled shift isn't a
 * no-show. Returns totals + the no-show and unscheduled lists.
 *
 * Overnight shifts (end <= start) straddle two business days: the clock-out —
 * and, for someone who starts a few minutes past midnight, even the clock-in —
 * gets stamped with the NEXT day's `day`. So an overnight shift also accepts a
 * next-day punch as attendance, and the next day itself is treated as covered
 * by the shift rather than reported as "worked but not scheduled". (Day-level
 * granularity: a next-day punch can't be told apart from the night shift's own
 * spill, so the forgiving reading wins — consistent with the rest of this file.)
 */
export function reconcile(scheduled = [], punches = [], { dates = [] } = {}) {
  const inRange = new Set(dates);
  const sched = new Map(); // `${userId}|${date}` -> {userId, userName, date}
  const spillCovered = new Set(); // next-day keys an overnight shift accounts for
  for (const s of scheduled) {
    if (!s.userId || !inRange.has(s.date)) continue;
    sched.set(`${s.userId}|${s.date}`, s);
    if (crossesMidnight(s)) spillCovered.add(`${s.userId}|${addDays(s.date, 1)}`);
  }

  const worked = new Set(); // `${userId}|${day}`
  for (const p of punches) if (p.userId && p.day) worked.add(`${p.userId}|${p.day}`);

  const noShow = [];
  let workedCount = 0;
  for (const [key, s] of sched) {
    const spill = crossesMidnight(s) && worked.has(`${s.userId}|${addDays(s.date, 1)}`);
    if (worked.has(key) || spill) workedCount += 1;
    else noShow.push({ userId: s.userId, userName: s.userName, date: s.date });
  }
  const unscheduled = [];
  for (const key of worked) {
    const [userId, day] = key.split("|");
    if (inRange.has(day) && !sched.has(key) && !spillCovered.has(key))
      unscheduled.push({ userId, date: day });
  }
  return { scheduled: sched.size, worked: workedCount, noShow, unscheduled };
}
