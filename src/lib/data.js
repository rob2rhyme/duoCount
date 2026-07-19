import { db, auth } from "./firebase";
import { fetchJson } from "./api";
import { weekDates } from "./schedule";
import { VENDOR_SETTING_KEYS } from "./vendor-settings";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, writeBatch,
  query, where, orderBy, onSnapshot, getDocs, serverTimestamp, increment,
} from "firebase/firestore";

/* All data lives under vendors/{vendorId}/... — every helper is tenant-scoped. */

const vcol = (vendorId, name) => collection(db, "vendors", vendorId, name);

/* ---------- vendor ---------- */
export async function updateVendorSettings(vendorId, patch) {
  const allowed = {};
  // Allow-list must match the firestore.rules vendor-update hasOnly() set —
  // kept in one place so they can't drift (see vendor-settings.js).
  for (const k of VENDOR_SETTING_KEYS) if (k in patch) allowed[k] = patch[k];
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

// The scratch pack lifecycle (packs collection) was retired — the shift-boundary
// ticket #s on scratch count entries are the record; settlement is the lottery's
// job. Legacy pack docs are untouched; demo Clear still sweeps them.

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
// Publish a week: emails each employee (with an address) their shifts.
export async function apiPublishSchedule(weekStart) {
  return fetchJson("/api/schedule/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify({ weekStart }),
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
// Owner-only bulk import: type "items" | "staff" | "baselines", mode "preview"
// (validate, no writes) or "commit" (validate again server-side, then write).
// `mapping` is the confirmed column→field map; `rows` is the parsed CSV
// ({ line, values }[]). Baselines are all-or-nothing on error unless
// allowPartial is set (the owner's explicit opt-in).
export async function apiImport({ type, mode, mapping, rows, allowPartial }) {
  return fetchJson("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify({ type, mode, mapping, rows, allowPartial: !!allowPartial }),
  });
}
// Rewards audit feeds (manager-only subscribers): the ledger window for the
// fraud detectors, and the customer list for the outstanding-liability figure.
// Reads only — the rules allow no client writes to either collection.
export function watchRewardEvents(vendorId, since, cb) {
  const q = query(vcol(vendorId, "rewardEvents"), where("ts", ">=", since));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export function watchCustomers(vendorId, cb) {
  return onSnapshot(vcol(vendorId, "customers"),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
// The owner-uploaded scratch-game catalog (one doc: game# -> {name, price,
// perPack}). Read-only for the team; written only via /api/import. cb gets the
// games map, or null when no catalog has been uploaded (the scratch form then
// falls back to the bundled state catalog).
export function watchScratchCatalog(vendorId, cb) {
  return onSnapshot(doc(db, "vendors", vendorId, "catalog", "scratch"),
    (s) => {
      const games = s.exists() ? s.data().games : null;
      // An empty catalog counts as none, so a scan still falls back to the bundle.
      cb(games && Object.keys(games).length ? games : null);
    },
    () => cb(null)); // a transient listen error just falls back to the bundle
}
// Rewards register flow — every ledger write happens server-side (route signs
// the event and moves the balance transactionally); the client only asks.
export async function apiRewards(payload) {
  return fetchJson("/api/rewards", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify(payload),
  });
}
// Manager-only natural-language log search: turns a query into a filter object
// (ai-log-search-spec.md). Returns { filter } or { filter: null } — the caller
// falls back to keyword search on null.
export async function apiLogSearch(q, vocabulary) {
  return fetchJson("/api/log-search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify({ query: q, vocabulary }),
  });
}
// Manager-only on-demand narrative over the Dashboard's pattern alerts
// (ai-pattern-narrative-spec.md). Returns { narrative } or { narrative: null }.
export async function apiPatternNarrative(payload) {
  return fetchJson("/api/pattern-narrative", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
    body: JSON.stringify(payload),
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
// One-shot snapshot of entries whose business `date` falls within
// [startISO, endISO] (inclusive), optionally scoped to one location — the data
// source for the Reports center. A report is a point-in-time export, not a live
// view, so this is a bounded getDocs rather than watchEntries' unbounded stream
// (which is fine for a day but wasteful for a year). We range-query the `date`
// STRING (not ts) so an entry lands in the period it is FOR, not when it was
// written — a count backdated by the form still reports under its own date. The
// unscoped range uses the automatic single-field index on `date`; the scoped
// query uses the (locationId, date) composite index in firestore.indexes.json.
// Managers already have read access to every entry, so no rules change is needed.
export async function fetchEntriesInRange(vendorId, startISO, endISO, locationId = null) {
  const base = vcol(vendorId, "entries");
  const q = locationId
    ? query(base, where("locationId", "==", locationId), where("date", ">=", startISO), where("date", "<=", endISO), orderBy("date", "asc"))
    : query(base, where("date", ">=", startISO), where("date", "<=", endISO), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// One-shot rewards-ledger slice for the Admin engagement audit's on-demand
// range (the live feed covers 90 days; this reaches any period). rewardEvents
// carry a server-stamped `ts` (never backdated), so a ts range query IS the
// business period; the end is extended one day to make `endISO` inclusive.
// Rides the automatic single-field `ts` index; manager read access already
// covers the collection, so no rules change.
export async function fetchRewardEventsInRange(vendorId, startISO, endISO) {
  const endPlus = new Date(Date.parse(`${endISO}T00:00:00`) + 86_400_000);
  const q = query(vcol(vendorId, "rewardEvents"),
    where("ts", ">=", new Date(`${startISO}T00:00:00`)),
    where("ts", "<", endPlus),
    orderBy("ts", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// One-shot punches for a report's labor roll-up, fetched by business `day`
// (punches are never backdated — `day` is stamped at write time). The end is
// extended by one day so an overnight shift that clocked IN within the period
// can still pair its clock-OUT the next morning; the roll-up only counts shifts
// that STARTED in range, so the extra day's own shifts are excluded downstream.
// No location filter (the report scopes labor by location) and no new index —
// the range rides the automatic single-field `day` index.
export async function fetchPunchesInRange(vendorId, startISO, endISO) {
  const endPlus = new Date(Date.parse(`${endISO}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const q = query(vcol(vendorId, "timeclock"), where("day", ">=", startISO), where("day", "<=", endPlus), orderBy("day", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
// Comment + counter bump ship in one batch so commentCount can't drift. The
// counter uses increment(1) — computed server-side against the live value — so a
// stale cached entry.commentCount can never make the bump miss or overwrite a
// concurrent comment (M7). lastCommentId names the comment created in this same
// batch; the rules require it to point at a brand-new comment doc, so the counter
// can't be inflated without a real comment behind it (M4).
export async function addComment(vendorId, entry, { text, kind = "comment" }, profile) {
  const b = writeBatch(db);
  const cRef = doc(collection(db, "vendors", vendorId, "entries", entry.id, "comments"));
  b.set(cRef, {
    text, kind, by: profile.name, byId: profile.id, byRole: profile.role, ts: serverTimestamp(),
  });
  b.update(doc(db, "vendors", vendorId, "entries", entry.id), {
    commentCount: increment(1), lastCommentAt: serverTimestamp(), lastCommentId: cRef.id,
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
  // ts is the server clock (rules require ts == request.time so paid hours can't
  // be forged); `day` stays the client's local business-day label.
  await addDoc(vcol(vendorId, "timeclock"), {
    ...punch, ts: serverTimestamp(), day: new Date().toISOString().slice(0, 10),
  });
}

// Manager-only append-only correction that supersedes a punch (see the rules'
// timeclock branch (b) and `applyCorrections` in lib/timeclock). The original
// punch is never touched. `atMs` is the manager-chosen effective punch time
// (for edit/add); `ts` is the server audit clock (rules pin it to request.time).
// `day` is stamped from the effective time so the report's by-`day` fetch finds it.
export async function addPunchCorrection(vendorId, { action, targetId = null, type = null, atMs = null, userId, userName, locationId = null, locationName = null, byId, byName, reason }) {
  const effective = atMs != null ? new Date(atMs) : null;
  await addDoc(vcol(vendorId, "timeclock"), {
    kind: "correction", action, targetId, type,
    at: effective,
    userId, userName, locationId, locationName,
    byId, byName, reason,
    ts: serverTimestamp(),
    day: (effective || new Date()).toISOString().slice(0, 10),
  });
}

/* ---------- payroll locks (pay-period approval) ---------- */
// One doc per locked business day, doc id == YYYY-MM-DD (see lib/payroll-lock
// and the payrollLocks rules). Manager-only reads per the rules.
export function watchPayrollLocks(vendorId, cb) {
  return onSnapshot(vcol(vendorId, "payrollLocks"), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
// Approve a Mon–Sun week: create fresh day docs, or flip a previously released
// day back to locked via the restricted re-approve update the rules allow.
// Already-active days are left alone, so re-running is idempotent.
export async function approvePayrollWeek(vendorId, weekStart, locks, by) {
  const batch = writeBatch(db);
  const byDay = new Map(locks.map((l) => [l.day, l]));
  for (const day of weekDates(weekStart)) {
    const ref = doc(db, "vendors", vendorId, "payrollLocks", day);
    const cur = byDay.get(day);
    if (!cur) batch.set(ref, { day, weekStart, byId: by.byId, byName: by.byName, ts: serverTimestamp() });
    else if (cur.released === true)
      batch.update(ref, { released: false, byId: by.byId, byName: by.byName, ts: serverTimestamp() });
  }
  await batch.commit();
}
// Owner-only (rules-enforced): release a week's locks so corrections are
// possible again. The approval record stays; release is audited on the doc.
export async function releasePayrollWeek(vendorId, weekStart, locks, by) {
  const batch = writeBatch(db);
  const days = new Set(weekDates(weekStart));
  for (const l of locks) {
    if (!days.has(l.day) || l.released === true) continue;
    batch.update(doc(db, "vendors", vendorId, "payrollLocks", l.day), {
      released: true, releasedById: by.byId, releasedBy: by.byName, releasedAt: serverTimestamp(),
    });
  }
  await batch.commit();
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
// Open (unassigned) shifts a manager posted for anyone to grab.
export function watchOpenShifts(vendorId, cb) {
  const q = query(vcol(vendorId, "schedule"), where("open", "==", true), orderBy("date", "asc"));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
// Publish records (one per week, keyed by weekStart) — manager-read, server-write.
export function watchPublished(vendorId, cb) {
  return onSnapshot(vcol(vendorId, "schedulePublished"),
    (s) => cb(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))));
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

/* ---------- week templates (manager-managed roster patterns) ---------- */
export function watchTemplates(vendorId, cb) {
  return onSnapshot(query(vcol(vendorId, "templates"), orderBy("ts", "desc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function addTemplate(vendorId, tpl) {
  await addDoc(vcol(vendorId, "templates"), { ...tpl, ts: new Date() });
}
export async function deleteTemplate(vendorId, id) {
  await deleteDoc(doc(db, "vendors", vendorId, "templates", id));
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
