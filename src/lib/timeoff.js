// Staff time-off — pure helpers (validation, overlap, status machine). Mirrors
// the availability + swap-board posture: employees author their own requests,
// managers approve/deny with a reason, and everything is a client Firestore
// write gated by rules — so this pure logic (which the UI runs) and the rules
// (which independently enforce it) can be unit-tested apart and can't drift.
//
// Two shapes, one collection:
//   • kind "request" — a formal ask that NEEDS a decision (starts `pending`);
//   • kind "event"   — a predictable FUTURE event that will need time off, a
//                      forward heads-up for the manager (starts `planned`).
// A manager can approve or deny either; the requester sees the live status and
// the manager's reason. The requester may cancel their own still-open one.

export const TIMEOFF_TYPES = ["vacation", "sick", "personal", "appointment", "other"];
export const TIMEOFF_KINDS = ["request", "event"];
export const TIMEOFF_STATUS = ["pending", "planned", "approved", "denied", "canceled"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const todayStr = () => new Date().toISOString().slice(0, 10);

// Validate a submit form → { fields } to write, or { error } (a stable code the
// UI localizes). Dates are "YYYY-MM-DD" strings (the app-wide convention);
// string comparison is a valid date-order test for that format.
export function validateTimeOff(form = {}, { today = todayStr() } = {}) {
  const type = TIMEOFF_TYPES.includes(form.type) ? form.type : "other";
  const kind = form.kind === "event" ? "event" : "request";
  const startDate = String(form.startDate || "");
  const endDate = String(form.endDate || startDate);
  if (!DATE_RE.test(startDate)) return { error: "bad_start" };
  if (!DATE_RE.test(endDate)) return { error: "bad_end" };
  if (endDate < startDate) return { error: "end_before_start" };
  // A "future event" heads-up must actually be in the future. A formal request
  // may be dated today or even back a day (retroactive sick), so it isn't
  // past-guarded — the manager decides.
  if (kind === "event" && endDate < today) return { error: "past_event" };

  const allDay = form.allDay !== false;
  let startTime = null;
  let endTime = null;
  if (!allDay) {
    startTime = String(form.startTime || "");
    endTime = String(form.endTime || "");
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return { error: "bad_time" };
    if (startDate === endDate && endTime <= startTime) return { error: "time_order" };
  }
  const reason = String(form.reason ?? "").trim().slice(0, 500);
  return {
    fields: {
      type, kind, startDate, endDate, allDay, startTime, endTime, reason,
      status: kind === "event" ? "planned" : "pending",
    },
  };
}

// Inclusive day span of a range (1 for a single day). 0 for a bad range.
export function daysCount(startDate, endDate) {
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

// Do two inclusive [startDate, endDate] ranges overlap? (for clash warnings.)
export function rangesOverlap(a, b) {
  return !!a && !!b && a.startDate <= b.endDate && b.startDate <= a.endDate;
}

// Other people's APPROVED/PENDING time off that clashes with a range — what a
// manager should see before approving one, and a requester before asking.
export function clashes(range, list = [], { excludeId = null, excludeUserId = null } = {}) {
  return list.filter((r) =>
    r && r.id !== excludeId && r.userId !== excludeUserId
    && (r.status === "approved" || r.status === "pending")
    && rangesOverlap(range, r));
}

// Manager decision transitions. A decided-then-reset back to pending is allowed
// (a manager reconsiders); a canceled request is terminal.
export function canDecide(from, to, isManager) {
  if (!isManager) return false;
  if (!["approved", "denied", "pending", "planned"].includes(to)) return false;
  if (from === "canceled") return false;
  return true;
}

// The requester may cancel only their own still-open (undecided) request.
export function canCancel(status) {
  return status === "pending" || status === "planned";
}

// Inbox ordering: pending first (needs action), then future events, then
// decided/canceled; within a group, soonest start first.
const RANK = { pending: 0, planned: 1, approved: 2, denied: 3, canceled: 4 };
export function compareTimeOff(a, b) {
  const r = (RANK[a?.status] ?? 9) - (RANK[b?.status] ?? 9);
  if (r) return r;
  return String(a?.startDate || "").localeCompare(String(b?.startDate || ""));
}

// The manager's Time-tab badge: requests awaiting a decision.
export function pendingTimeOff(list = []) {
  return list.filter((r) => r && r.status === "pending").length;
}
