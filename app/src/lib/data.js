import { db, auth } from "./firebase";
import {
  collection, doc, addDoc, getDoc, updateDoc, writeBatch,
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
  const keys = ["name", "logoUrl", "sharingMode", "blindCounts", "varianceThreshold", "digest", "invVarianceThreshold"];
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
export async function addItem(vendorId, { name, category, unit, locationId }) {
  await addDoc(vcol(vendorId, "items"), {
    name: name.trim(), category: (category || "").trim() || null,
    unit: (unit || "unit").trim(), locationId, active: true, createdAt: new Date(),
  });
}
export async function updateItem(vendorId, id, patch) {
  await updateDoc(doc(db, "vendors", vendorId, "items", id), patch);
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
  const res = await fetch("/api/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify(payload),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "Failed");
  return j;
}
export async function apiUpdateStaff(payload) {
  const res = await fetch("/api/staff", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify(payload),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "Failed");
  return j;
}
// Owner-triggered test send of the daily digest (ignores lastSentDate).
export async function apiTestDigest() {
  const res = await fetch("/api/digest/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${await idToken()}` },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || "Failed");
  return j;
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
