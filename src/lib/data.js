import { db, auth } from "./firebase";
import { fetchJson } from "./api";
import {
  collection, doc, addDoc, getDoc, updateDoc, deleteDoc, writeBatch,
  query, where, orderBy, onSnapshot,
} from "firebase/firestore";

/* All data lives under vendors/{vendorId}/... — every helper is tenant-scoped. */

const vcol = (vendorId, name) => collection(db, "vendors", vendorId, name);

/* ---------- vendor ---------- */
export async function getVendor(vendorId) {
  const s = await getDoc(doc(db, "vendors", vendorId));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function updateVendorSettings(vendorId, patch) {
  const allowed = {};
  const keys = ["name", "logoUrl", "sharingMode", "blindCounts", "varianceThreshold", "digest", "invVarianceThreshold", "patternRules"];
  for (const k of keys) if (k in patch) allowed[k] = patch[k];
  await updateDoc(doc(db, "vendors", vendorId), allowed);
}

/* ---------- locations & drawers ---------- */
export function watchLocations(vendorId, cb) {
  return onSnapshot(query(vcol(vendorId, "locations"), orderBy("createdAt", "asc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addLocation(vendorId, name) {
  await addDoc(vcol(vendorId, "locations"), { name: name.trim(), active: true, createdAt: new Date() });
}
export async function updateLocation(vendorId, id, patch) {
  await updateDoc(doc(db, "vendors", vendorId, "locations", id), patch);
}

export function watchDrawers(vendorId, cb) {
  return onSnapshot(query(vcol(vendorId, "drawers"), orderBy("createdAt", "asc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addDrawer(vendorId, name, locationId) {
  await addDoc(vcol(vendorId, "drawers"), { name: name.trim(), locationId, active: true, createdAt: new Date() });
}
export async function updateDrawer(vendorId, id, patch) {
  await updateDoc(doc(db, "vendors", vendorId, "drawers", id), patch);
}

/* ---------- tracked inventory items (managed like drawers) ---------- */
export function watchItems(vendorId, cb) {
  return onSnapshot(query(vcol(vendorId, "items"), orderBy("createdAt", "asc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addItem(vendorId, { name, category, unit, locationId, barcode }) {
  await addDoc(vcol(vendorId, "items"), {
    name: name.trim(), category: (category || "").trim() || null,
    unit: (unit || "unit").trim(), barcode: (barcode || "").trim() || null,
    locationId, active: true, createdAt: new Date(),
  });
}
export async function updateItem(vendorId, id, patch) {
  await updateDoc(doc(db, "vendors", vendorId, "items", id), patch);
}

/* ---------- scratch-off packs (forward-only lifecycle) ---------- */
export function watchPacks(vendorId, cb) {
  return onSnapshot(query(vcol(vendorId, "packs"), orderBy("createdAt", "desc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addPack(vendorId, pack) {
  await addDoc(vcol(vendorId, "packs"), { ...pack, createdAt: new Date() });
}
export async function updatePack(vendorId, id, patch) {
  await updateDoc(doc(db, "vendors", vendorId, "packs", id), patch);
}

/* ---------- staff (reads client-side; writes via /api/staff) ---------- */
export function watchStaff(vendorId, cb) {
  return onSnapshot(query(vcol(vendorId, "users"), orderBy("createdAt", "asc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
async function idToken() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  return u.getIdToken();
}
export async function apiCreateStaff(payload) {
  return fetchJson("/api/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify(payload),
  });
}
export async function apiUpdateStaff(payload) {
  return fetchJson("/api/staff", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify(payload),
  });
}
// Owner-triggered test send of the daily digest (ignores lastSentDate).
export async function apiTestDigest() {
  return fetchJson("/api/digest/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${await idToken()}` },
  });
}
// Owner-only demo data: action is "load" (write seed-tagged sample data,
// idempotent) or "clear" (delete only seed-tagged docs).
export async function apiSeedDemo(action) {
  return fetchJson("/api/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify({ action }),
  });
}

/* ---------- entries ---------- */
// lockedLocationId: pass an id to query only that location (required for
// employees in per-location mode so reads satisfy the security rules).
export function watchEntries(vendorId, lockedLocationId, cb) {
  const base = vcol(vendorId, "entries");
  const q = lockedLocationId
    ? query(base, where("locationId", "==", lockedLocationId), orderBy("ts", "desc"))
    : query(base, orderBy("ts", "desc"));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addEntry(vendorId, entry) {
  // Tier-one fields default to their safe values; callers (e.g. the cash form)
  // may override flagged / varianceStatus / blind before the spread.
  await addDoc(vcol(vendorId, "entries"), {
    flagged: false, varianceStatus: "none", disputeStatus: "none",
    causeCode: null, causeNote: null, blind: false,
    commentCount: 0, lastCommentAt: null,
    ...entry, verifiedBy: null, verifiedAt: null, ts: new Date(),
  });
}
export async function verifyEntry(vendorId, entryId, managerName) {
  await updateDoc(doc(db, "vendors", vendorId, "entries", entryId), {
    verifiedBy: managerName, verifiedAt: new Date(),
  });
}

/* ---------- tier one: variance investigation ---------- */
// Managers move open -> under-review -> resolved; resolving requires a cause
// code (also enforced by rules) and stamps the resolver.
export async function investigateEntry(vendorId, entryId, patch) {
  await updateDoc(doc(db, "vendors", vendorId, "entries", entryId), patch);
}

/* ---------- tier one: disputes & comments ---------- */
// The dispute flag flips alone (rules allow only that key for the author).
export async function setDisputeStatus(vendorId, entryId, status) {
  await updateDoc(doc(db, "vendors", vendorId, "entries", entryId), { disputeStatus: status });
}
// Comment + counter bump ship in one batch so commentCount can't drift.
export async function addComment(vendorId, entry, { text, kind = "comment" }, profile) {
  const b = writeBatch(db);
  const cRef = doc(collection(db, "vendors", vendorId, "entries", entry.id, "comments"));
  b.set(cRef, {
    text, kind, by: profile.name, byId: profile.id, byRole: profile.role, ts: new Date(),
  });
  b.update(doc(db, "vendors", vendorId, "entries", entry.id), {
    commentCount: (entry.commentCount || 0) + 1, lastCommentAt: new Date(),
  });
  await b.commit();
}
export function watchComments(vendorId, entryId, cb) {
  return onSnapshot(
    query(collection(db, "vendors", vendorId, "entries", entryId, "comments"), orderBy("ts", "asc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/* ---------- tier two: incidents (write-ups) ---------- */
// selfId: pass the viewer's user id for employees — the rules only let them
// read incidents where they are the subject, so the query must match.
export function watchIncidents(vendorId, selfId, cb) {
  const base = vcol(vendorId, "incidents");
  const q = selfId
    ? query(base, where("subjectId", "==", selfId), orderBy("ts", "desc"))
    : query(base, orderBy("ts", "desc"));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addIncident(vendorId, incident) {
  await addDoc(vcol(vendorId, "incidents"), {
    ...incident, status: "open",
    ackAt: null, ackNote: null, closedBy: null, closedAt: null, ts: new Date(),
  });
}
// Subject-only, once, while open (enforced by rules).
export async function ackIncident(vendorId, id, note) {
  await updateDoc(doc(db, "vendors", vendorId, "incidents", id), {
    status: "acknowledged", ackAt: new Date(),
    ackNote: (note || "").trim().slice(0, 1000) || null,
  });
}
export async function closeIncident(vendorId, id, managerName) {
  await updateDoc(doc(db, "vendors", vendorId, "incidents", id), {
    status: "closed", closedBy: managerName, closedAt: new Date(),
  });
}

/* ---------- time clock (append-only in/out punches) ---------- */
// Managers pass selfId=null to watch every punch; employees pass their own id
// (the rules only let them read their own anyway). Newest first.
export function watchPunches(vendorId, selfId, cb) {
  const base = vcol(vendorId, "timeclock");
  const q = selfId
    ? query(base, where("userId", "==", selfId), orderBy("ts", "desc"))
    : query(base, orderBy("ts", "desc"));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addPunch(vendorId, punch) {
  await addDoc(vcol(vendorId, "timeclock"), {
    ...punch, ts: new Date(), day: new Date().toISOString().slice(0, 10),
  });
}

/* ---------- shift scheduling (manager-managed roster) ---------- */
// A schedule is a plan, not an audit trail: managers create/delete shifts.
// Managers watch the whole roster (selfId=null); employees see only their own.
export function watchSchedule(vendorId, selfId, cb) {
  const base = vcol(vendorId, "schedule");
  const q = selfId
    ? query(base, where("userId", "==", selfId), orderBy("date", "asc"))
    : query(base, orderBy("date", "asc"));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addScheduledShift(vendorId, shift) {
  await addDoc(vcol(vendorId, "schedule"), { ...shift, ts: new Date() });
}
export async function deleteScheduledShift(vendorId, id) {
  await deleteDoc(doc(db, "vendors", vendorId, "schedule", id));
}
// Generic patch (used by the swap flow); rules enforce which fields each role
// may change and in which state.
export async function updateScheduledShift(vendorId, id, patch) {
  await updateDoc(doc(db, "vendors", vendorId, "schedule", id), patch);
}
// The swap board: shifts anyone has offered up or claimed, so employees can see
// and pick up coworkers' shifts (managers already watch the whole roster).
export function watchSwapBoard(vendorId, cb) {
  const q = query(vcol(vendorId, "schedule"), where("swapStatus", "in", ["offered", "claimed"]), orderBy("date", "asc"));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
// One-click "copy last week" writes many shifts at once.
export async function addScheduledShiftsBatch(vendorId, shifts) {
  if (!shifts.length) return 0;
  const batch = writeBatch(db);
  const col = vcol(vendorId, "schedule");
  for (const s of shifts) batch.set(doc(col), { ...s, ts: new Date() });
  await batch.commit();
  return shifts.length;
}

/* ---------- staff availability (employee-authored, manager-visible) ---------- */
// Employees mark dates they can't work; managers see everyone's while rostering.
export function watchAvailability(vendorId, selfId, cb) {
  const base = vcol(vendorId, "availability");
  const q = selfId
    ? query(base, where("userId", "==", selfId), orderBy("date", "asc"))
    : query(base, orderBy("date", "asc"));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addUnavailable(vendorId, entry) {
  await addDoc(vcol(vendorId, "availability"), { ...entry, ts: new Date() });
}
export async function deleteUnavailable(vendorId, id) {
  await deleteDoc(doc(db, "vendors", vendorId, "availability", id));
}

/* ---------- tier one: shift notes ---------- */
export function watchNotes(vendorId, lockedLocationId, cb) {
  const base = vcol(vendorId, "notes");
  const q = lockedLocationId
    ? query(base, where("locationId", "==", lockedLocationId), orderBy("ts", "desc"))
    : query(base, orderBy("ts", "desc"));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addNote(vendorId, note) {
  await addDoc(vcol(vendorId, "notes"), { ...note, pinned: false, active: true, ts: new Date() });
}
export async function updateNote(vendorId, id, patch) {
  await updateDoc(doc(db, "vendors", vendorId, "notes", id), patch);
}
