import { db, auth } from "./firebase";
import {
  collection, doc, addDoc, getDoc, updateDoc,
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
  for (const k of ["name", "logoUrl", "sharingMode"]) if (k in patch) allowed[k] = patch[k];
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
  await addDoc(vcol(vendorId, "entries"), { ...entry, verifiedBy: null, verifiedAt: null, ts: new Date() });
}
export async function verifyEntry(vendorId, entryId, managerName) {
  await updateDoc(doc(db, "vendors", vendorId, "entries", entryId), {
    verifiedBy: managerName, verifiedAt: new Date(),
  });
}
