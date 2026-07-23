// Support desk — pure helpers for the in-app help/issue system (owner reports
// an app problem; the platform developer works it). No Firestore, no network:
// the trusted /api/support + /api/dev routes re-run these, and the UI mirrors
// them, so validation lives in exactly one testable place.
//
// Design (support-desk research → the small-app subset):
//   • Lifecycle: open → pending (dev replied / waiting on owner) → resolved,
//     with reopen. The owner can open/resolve/reopen their own ticket; the
//     developer can also set `pending` and resolve WITH A REASON. Status moves
//     and replies are one append-only message thread — nothing is ever edited.
//   • Categories triage the dev's inbox (bug / how-to / billing / account /
//     feature / other).
//   • Screenshots ride along as downscaled data-URIs, hard-capped so a ticket
//     doc can never exceed Firestore's 1 MB limit.

export const TICKET_STATUS = ["open", "pending", "resolved"];
export const TICKET_CATEGORIES = ["bug", "howto", "billing", "account", "feature", "other"];
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"];

// Field bounds — the same clamp-or-reject discipline as the rewards/settings
// resolvers. Subjects/bodies are trimmed and length-capped; a too-short
// subject or empty body is rejected (returns an error code the UI localizes).
export const SUBJECT_MAX = 120;
export const BODY_MAX = 4000;
export const MSG_MAX = 4000;
export const REASON_MAX = 1000;

// Attachment caps — the whole point is to stay comfortably under the 1 MB
// Firestore document limit even with the ticket's own text + thread. Each
// screenshot is a client-downscaled data-URI; we bound per-image bytes and
// per-message count, and the route re-checks.
export const ATTACH_MAX_PER_MSG = 3;
export const ATTACH_MAX_BYTES = 360 * 1024; // ~360 KB per downscaled image
const DATA_URI_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

const str = (v) => String(v ?? "");
const clean = (v, max) => str(v).replace(/\s+/g, " ").trim().slice(0, max);
// Bodies/messages keep newlines (only trims the ends + caps length).
const cleanMultiline = (v, max) => str(v).replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, max);

// Rough decoded byte size of a `data:...;base64,XXXX` URI without decoding it.
export function dataUriBytes(uri) {
  const i = str(uri).indexOf("base64,");
  if (i < 0) return 0;
  const b64 = uri.slice(i + 7);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
}

// Validate one attachment → { ok } or { ok:false, code }. Images only, bounded.
export function validateAttachment(a) {
  if (!a || typeof a !== "object") return { ok: false, code: "attach_bad" };
  if (!DATA_URI_RE.test(str(a.dataUri))) return { ok: false, code: "attach_type" };
  if (dataUriBytes(a.dataUri) > ATTACH_MAX_BYTES) return { ok: false, code: "attach_big" };
  return { ok: true };
}

// Validate + normalize an attachment list (a message can carry a few).
export function sanitizeAttachments(list) {
  const arr = Array.isArray(list) ? list.slice(0, ATTACH_MAX_PER_MSG) : [];
  const out = [];
  for (const a of arr) {
    const v = validateAttachment(a);
    if (!v.ok) return { error: v.code };
    out.push({ dataUri: str(a.dataUri), name: clean(a.name, 80) || "screenshot" });
  }
  return { attachments: out };
}

// A new ticket from the owner → the fields to store, or { error }.
export function buildTicket(raw = {}) {
  const subject = clean(raw.subject, SUBJECT_MAX);
  if (subject.length < 3) return { error: "subject_short" };
  const body = cleanMultiline(raw.body, BODY_MAX);
  if (!body) return { error: "body_required" };
  const category = TICKET_CATEGORIES.includes(raw.category) ? raw.category : "other";
  const priority = TICKET_PRIORITIES.includes(raw.priority) ? raw.priority : "normal";
  const att = sanitizeAttachments(raw.attachments);
  if (att.error) return { error: att.error };
  return { fields: { subject, body, category, priority, attachments: att.attachments } };
}

// A reply/message on an existing ticket → normalized, or { error }.
export function buildMessage(raw = {}) {
  const text = cleanMultiline(raw.text, MSG_MAX);
  const att = sanitizeAttachments(raw.attachments);
  if (att.error) return { error: att.error };
  if (!text && !att.attachments.length) return { error: "msg_empty" };
  return { message: { text, attachments: att.attachments } };
}

// Is a status transition allowed for this actor? "owner" or "dev".
//   owner: open↔resolved (report / take back / reopen); never `pending`.
//   dev:   any of open/pending/resolved (resolve needs a reason — checked by
//          the route, not here, since the reason is a separate field).
// A no-op (same status) is always allowed (idempotent).
export function canTransition(from, to, actor) {
  if (!TICKET_STATUS.includes(to)) return false;
  if (from === to) return true;
  if (actor === "dev") return true;
  if (actor === "owner") return to === "open" || to === "resolved";
  return false;
}

// Unread badge: from the owner's side, a ticket is "unread" when its last
// activity came from the dev after the owner last opened it. `seenAt` is the
// owner's last-viewed time (ms), `lastActorRole`/`lastActivityAt` on the ticket.
export function ownerUnread(ticket = {}, seenMs = 0) {
  if (ticket.lastActorRole !== "dev") return false;
  const last = toMs(ticket.lastActivityAt);
  return last != null && last > (Number(seenMs) || 0);
}

// Dev inbox ordering weight: open first, then pending, resolved last; within a
// status, higher priority first, then most-recent activity. Pure comparator.
const STATUS_RANK = { open: 0, pending: 1, resolved: 2 };
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
export function compareTickets(a, b) {
  const s = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
  if (s) return s;
  const p = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  if (p) return p;
  return (toMs(b.lastActivityAt) || 0) - (toMs(a.lastActivityAt) || 0);
}

// Firestore Timestamp | Date | ISO | ms → ms, or null.
export function toMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  // A live client-SDK Firestore Timestamp still has toDate().
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
  }
  // An Admin-SDK Timestamp serialized over a JSON API route (e.g. /api/dev) loses
  // its toDate() method and arrives as a plain { _seconds, _nanoseconds } object
  // (some SDK versions use { seconds, nanoseconds }). Without this it fell through
  // to new Date(obj) → Invalid Date → null, so every dev-console timestamp (audit,
  // tickets, store createdAt) rendered blank.
  const secs = typeof v?._seconds === "number" ? v._seconds
    : typeof v?.seconds === "number" ? v.seconds : null;
  if (secs !== null) {
    const nanos = v?._nanoseconds ?? v?.nanoseconds ?? 0;
    return secs * 1000 + Math.floor(nanos / 1e6);
  }
  const d = new Date(v);
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
}
