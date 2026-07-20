// Firestore security-rules tests (tier-one spec §7 step 4).
// Run with: npm run test:rules   (starts the emulator via firebase-tools)
import { readFileSync } from "node:fs";
import { test, before, beforeEach, after } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp,
} from "firebase/firestore";

const V = "v1";   // vendor under test
const V2 = "v2";  // a different tenant

const CLAIMS = {
  owner:    { vendorId: V,  role: "owner",    name: "Olive", userId: "u-owner", locationId: null },
  mgr:      { vendorId: V,  role: "manager",  name: "Mia",   userId: "u-mgr",   locationId: null },
  empA:     { vendorId: V,  role: "employee", name: "Eve",   userId: "u-empA",  locationId: "locA" },
  empB:     { vendorId: V,  role: "employee", name: "Bob",   userId: "u-empB",  locationId: "locB" },
  outsider: { vendorId: V2, role: "owner",    name: "Oz",    userId: "u-oz",    locationId: null },
};

let env;
const db = (who) => env.authenticatedContext(CLAIMS[who].userId, CLAIMS[who]).firestore();

const entry = (over = {}) => ({
  kind: "cash", date: "2026-07-10", shift: "close",
  locationId: "locA", locationName: "A",
  drawerId: "d1", drawerName: "POS",
  start: 100, sales: 50, paidout: 0, counted: 149, expected: 150, diff: -1,
  blind: false, flagged: false, varianceStatus: "none", disputeStatus: "none",
  causeCode: null, causeNote: null, commentCount: 0, lastCommentAt: null,
  by: "Eve", byId: "u-empA", byRole: "employee",
  verifiedBy: null, verifiedAt: null, ts: new Date(),
  ...over,
});

const incident = (over = {}) => ({
  title: "Till left open", text: "Drawer 2 was open and unattended during break.",
  category: "till-procedure", severity: "warning",
  subjectId: "u-empA", subjectName: "Eve", entryId: null, links: [],
  locationId: "locA", locationName: "A",
  by: "Mia", byId: "u-mgr", byRole: "manager",
  status: "open", ackAt: null, ackNote: null, closedBy: null, closedAt: null,
  ts: new Date(),
  ...over,
});

// a time-clock punch (owned by empA at their location). The punch time must be
// the server clock — the rules pin ts to request.time — so it's a
// serverTimestamp() sentinel, not a client-chosen Date.
const punch = (over = {}) => ({
  userId: "u-empA", userName: "Eve", locationId: "locA", locationName: "A",
  type: "in", ts: serverTimestamp(), day: "2026-07-10", ...over,
});
// a manager punch correction (branch (b)): supersedes a punch, signed by the
// manager, ts pinned to the server clock, but `at` (effective time) is chosen.
const correction = (over = {}) => ({
  kind: "correction", action: "edit", targetId: "tcA", type: "out",
  at: new Date("2026-07-10T17:00:00Z"),
  userId: "u-empA", userName: "Eve", locationId: "locA", locationName: "A",
  byId: "u-mgr", byName: "Mia", reason: "left at 5, mis-punched",
  ts: serverTimestamp(), day: "2026-07-10", ...over,
});
// a rostered shift (owned by empA, created by the manager)
const sched = (over = {}) => ({
  userId: "u-empA", userName: "Eve", locationId: "locA", locationName: "A",
  date: "2026-07-12", start: "09:00", end: "17:00",
  by: "Mia", byId: "u-mgr", ts: new Date(), ...over,
});

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: "duocount-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const f = c.firestore();
    await setDoc(doc(f, `vendors/${V}`), { name: "Store", slug: "store", sharingMode: "per-location", varianceThreshold: 5 });
    await setDoc(doc(f, `vendors/${V2}`), { name: "Other", slug: "other", sharingMode: "all-locations" });
    // Live user docs — write rules consult these (liveActive) so a deactivated
    // user can't write on a still-valid token. All active by default.
    await setDoc(doc(f, `vendors/${V}/users/u-owner`), { name: "Olive", role: "owner", active: true });
    await setDoc(doc(f, `vendors/${V}/users/u-mgr`), { name: "Mia", role: "manager", active: true });
    await setDoc(doc(f, `vendors/${V}/users/u-empA`), { name: "Eve", role: "employee", locationId: "locA", active: true });
    await setDoc(doc(f, `vendors/${V}/users/u-empB`), { name: "Bob", role: "employee", locationId: "locB", active: true });
    await setDoc(doc(f, `vendors/${V2}/users/u-oz`), { name: "Oz", role: "owner", active: true });
    await setDoc(doc(f, `vendors/${V}/entries/eA`), entry({ commentCount: 1 }));
    await setDoc(doc(f, `vendors/${V}/entries/eB`), entry({ locationId: "locB", locationName: "B", by: "Bob", byId: "u-empB" }));
    await setDoc(doc(f, `vendors/${V}/entries/eMgr`), entry({ by: "Mia", byId: "u-mgr", byRole: "manager" }));
    await setDoc(doc(f, `vendors/${V}/entries/flagged`), entry({ flagged: true, varianceStatus: "open", counted: 140, diff: -10 }));
    await setDoc(doc(f, `vendors/${V}/entries/flaggedMgr`), entry({ by: "Mia", byId: "u-mgr", byRole: "manager", flagged: true, varianceStatus: "open", counted: 140, diff: -10 }));
    await setDoc(doc(f, `vendors/${V}/entries/eA/comments/c1`), { text: "first", kind: "comment", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/entries/eB/comments/c1`), { text: "other loc", kind: "comment", by: "Bob", byId: "u-empB", byRole: "employee", ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/notes/nA`), { text: "note A", by: "Eve", byId: "u-empA", byRole: "employee", locationId: "locA", locationName: "A", shift: null, pinned: false, active: true, ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/notes/nB`), { text: "note B", by: "Bob", byId: "u-empB", byRole: "employee", locationId: "locB", locationName: "B", shift: null, pinned: false, active: true, ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/items/i1`), { name: "Marlboro Red carton", category: "Cigarettes", unit: "carton", barcode: "0123", locationId: "locA", active: true, createdAt: new Date() });
    await setDoc(doc(f, `vendors/${V}/incidents/incA`), incident());
    await setDoc(doc(f, `vendors/${V}/incidents/incGeneral`), incident({ subjectId: null, subjectName: null, title: "Back door found unlocked" }));
    // time clock, schedule (incl. swap states), availability
    await setDoc(doc(f, `vendors/${V}/timeclock/tcA`), punch());
    // a punch on a payroll-locked day + the lock doc itself (pay-period approval)
    await setDoc(doc(f, `vendors/${V}/timeclock/tcLocked`), punch({ day: "2026-07-11" }));
    await setDoc(doc(f, `vendors/${V}/payrollLocks/2026-07-11`),
      { day: "2026-07-11", weekStart: "2026-07-06", byId: "u-mgr", byName: "Mia", ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/schedule/sA`), sched());
    await setDoc(doc(f, `vendors/${V}/schedule/sOffered`), sched({ date: "2026-07-13", swapStatus: "offered" }));
    await setDoc(doc(f, `vendors/${V}/schedule/sClaimed`), sched({ date: "2026-07-14", swapStatus: "claimed", claimedById: "u-empB", claimedByName: "Bob" }));
    await setDoc(doc(f, `vendors/${V}/schedule/sOpen`), sched({ date: "2026-07-15", userId: null, userName: null, open: true }));
    await setDoc(doc(f, `vendors/${V}/availability/avA`), { userId: "u-empA", userName: "Eve", date: "2026-07-20", ts: new Date() });
    // Staff time-off: a pending request + a planned event by empA, and one by empB.
    await setDoc(doc(f, `vendors/${V}/timeOff/toReq`), { userId: "u-empA", userName: "Eve", kind: "request", type: "vacation", startDate: "2026-08-01", endDate: "2026-08-03", allDay: true, startTime: null, endTime: null, reason: "trip", status: "pending", createdAt: new Date(), ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/timeOff/toEvt`), { userId: "u-empA", userName: "Eve", kind: "event", type: "other", startDate: "2026-12-24", endDate: "2026-12-26", allDay: true, startTime: null, endTime: null, reason: "holidays", status: "planned", createdAt: new Date(), ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/timeOff/toB`), { userId: "u-empB", userName: "Bob", kind: "request", type: "sick", startDate: "2026-08-05", endDate: "2026-08-05", allDay: true, startTime: null, endTime: null, reason: "", status: "pending", createdAt: new Date(), ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/schedulePublished/2026-07-06`), { weekStart: "2026-07-06", publishedAt: new Date(), publishedBy: "Mia", notified: 2, recipients: 2 });
  });
});

after(async () => { await env.cleanup(); });

/* ---------- tenant isolation & entry visibility ---------- */

test("another tenant cannot read this vendor's entries", async () => {
  await assertFails(getDoc(doc(db("outsider"), `vendors/${V}/entries/eA`)));
});

test("per-location: employee reads own location, not the other", async () => {
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/entries/eA`)));
  await assertFails(getDoc(doc(db("empA"), `vendors/${V}/entries/eB`)));
});

test("managers read every location", async () => {
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/entries/eB`)));
});

test("all-locations sharing lets employees read across locations", async () => {
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), `vendors/${V}`), { sharingMode: "all-locations" }));
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/entries/eB`)));
});

/* ---------- entry create ---------- */

test("employee creates a signed entry at their own location", async () => {
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/new1`), entry()));
});

test("employee cannot log for another location; managers can", async () => {
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/new2`),
    entry({ locationId: "locB", locationName: "B" })));
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/entries/new3`),
    entry({ locationId: "locB", locationName: "B", by: "Mia", byId: "u-mgr", byRole: "manager" })));
});

test("author identity must match the token", async () => {
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/new4`),
    entry({ by: "Somebody Else" })));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/new5`),
    entry({ byId: "u-empB" })));
});

test("inventory is an accepted entry kind", async () => {
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/new6`),
    entry({ kind: "inventory", itemId: "i1", itemName: "Marlboro Red carton", unit: "carton", startQty: 10, received: 0, removed: 0, soldQty: 3, counted: 7, expected: 7, diff: 0 })));
});

test("a forged diff that hides a real short is rejected; the truthful diff passes", async () => {
  // counted 100 against expected 150 is a $50 short — signing it as a clean
  // count (diff 0, unflagged) must be refused; the honest diff must go through.
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/forge1`),
    entry({ counted: 100, expected: 150, diff: 0, flagged: false, varianceStatus: "none" })));
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/forge2`),
    entry({ counted: 100, expected: 150, diff: -50, flagged: true, varianceStatus: "open" })));
  // Inventory shrink can't be papered over as diff 0 either.
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/forge3`),
    entry({ kind: "inventory", itemId: "i1", itemName: "X", unit: "carton", startQty: 10, received: 0, removed: 0, soldQty: 3, counted: 5, expected: 7, diff: 0 })));
});

test("cent-level float diffs are accepted within tolerance", async () => {
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/cents`),
    entry({ counted: 149.99, expected: 150, diff: -0.01 })));
});

test("an honest over-threshold cash short must be signed open, not hidden as 'none'", async () => {
  // The diff is truthful (-50 = 100 - 150, so varianceConsistent passes), but
  // recording it as varianceStatus 'none' hides a real $50 short from the review
  // queue, the owner digest, and the theft-pattern detectors — refused. The same
  // short, opened, goes through.
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/hide1`),
    entry({ counted: 100, expected: 150, diff: -50, flagged: false, varianceStatus: "none" })));
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/hide2`),
    entry({ counted: 100, expected: 150, diff: -50, flagged: true, varianceStatus: "open" })));
  // An over-count (drawer runs long) is just as much a variance to surface.
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/hide3`),
    entry({ counted: 200, expected: 150, diff: 50, flagged: false, varianceStatus: "none" })));
  // A diff below the threshold is the common clean count and stays 'none'.
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/small`),
    entry({ counted: 147, expected: 150, diff: -3, flagged: false, varianceStatus: "none" })));
  // Scratch entries carry no diff and are exempt from the cash flag rule.
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/scr`),
    entry({ kind: "scratch", counted: 0, expected: 0, diff: 0 })));
});

const invEntry = (over = {}) => entry({
  kind: "inventory", itemId: "i1", itemName: "Marlboro Red carton", unit: "carton",
  startQty: 10, received: 0, removed: 0, soldQty: 0, counted: 10, expected: 10, diff: 0, ...over,
});

test("inventory flagging is opt-in: off by default, enforced once a unit threshold is set", async () => {
  // No invVarianceThreshold on the vendor → a 10-unit short recorded as 'none'
  // is accepted (flagging is opt-in, and unset fails open).
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/invOff`),
    invEntry({ counted: 0, diff: -10, varianceStatus: "none" })));
  // Owner opts in with a positive unit threshold.
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), `vendors/${V}`), { invVarianceThreshold: 3 }));
  // Now a 10-unit short as 'none' is refused; opened it passes; a 1-unit short
  // (below the threshold) stays 'none'.
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/invHide`),
    invEntry({ counted: 0, diff: -10, varianceStatus: "none" })));
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/invOpen`),
    invEntry({ counted: 0, diff: -10, flagged: true, varianceStatus: "open" })));
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/invSmall`),
    invEntry({ soldQty: 8, counted: 1, expected: 2, diff: -1, varianceStatus: "none" })));
});

test("the stored expected must match its own components (no forged baseline)", async () => {
  // The exploit expectedConsistent() closes: a real $50 short made to look
  // balanced by forging `expected` down to the counted amount. varianceConsistent
  // (diff == counted−expected) and the flag rule BOTH pass here — only the
  // baseline check catches it (start+sales−paidout = 150, not the forged 100).
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/forge1`),
    entry({ start: 100, sales: 50, paidout: 0, expected: 100, counted: 100, diff: 0 })));
  // the honest baseline (expected == start + sales − paidout) goes through
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/base1`),
    entry({ start: 100, sales: 50, paidout: 0, expected: 150, counted: 150, diff: 0 })));
  // an opening count stores sales/paidout as 0, so one formula covers it (expected == start)
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/base2`),
    entry({ shift: "open", start: 200, sales: 0, paidout: 0, expected: 200, counted: 200, diff: 0 })));
  // a paid-out is subtracted from the baseline
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/base3`),
    entry({ start: 100, sales: 50, paidout: 20, expected: 130, counted: 130, diff: 0 })));
  // inventory baseline: expected == startQty + received − soldQty − removed
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/forgeInv`),
    invEntry({ startQty: 10, received: 5, soldQty: 3, removed: 0, expected: 10, counted: 10, diff: 0 })));
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/baseInv`),
    invEntry({ startQty: 10, received: 5, soldQty: 3, removed: 0, expected: 12, counted: 12, diff: 0 })));
});

test("byRole must match the token's role (no CSV role self-labeling)", async () => {
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/role1`),
    entry({ byRole: "manager" })));
});

test("entries must start clean: no pre-resolved, pre-disputed, or pre-caused state", async () => {
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/d1`), entry({ disputeStatus: "open" })));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/d2`), entry({ varianceStatus: "resolved" })));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/d3`), entry({ causeCode: "human-error" })));
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/d4`), entry({ flagged: true, varianceStatus: "open" })));
});

/* ---------- deactivation kill-switch (H2) ---------- */

test("a deactivated user cannot write, even holding a valid token", async () => {
  // empA still has a valid signed-in token, but their live user doc flips to
  // active:false — every write must be refused without waiting for the token to
  // expire. Reads are intentionally left to the token (client force-signs-out).
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), `vendors/${V}/users/u-empA`), { active: false }));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/dead1`), entry()));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeclock/dead2`), punch()));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/notes/dead3`),
    { text: "still here", by: "Eve", byId: "u-empA", byRole: "employee", locationId: "locA", locationName: "A", shift: null, pinned: false, active: true, ts: new Date() }));
  // Reactivating restores write access — it's the flag, nothing else.
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), `vendors/${V}/users/u-empA`), { active: true }));
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/live1`), entry()));
});

test("a deactivated manager cannot manage; a deactivated author cannot resolve", async () => {
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), `vendors/${V}/users/u-mgr`), { active: false }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/flagged`),
    { varianceStatus: "under-review" }));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/incidents/deadInc`), incident()));
});

/* ---------- verification ---------- */

test("manager verifies someone else's entry, exact fields only", async () => {
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/entries/eA`),
    { verifiedBy: "Mia", verifiedAt: new Date() }));
});

test("self-verification and employee verification are blocked", async () => {
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/eMgr`),
    { verifiedBy: "Mia", verifiedAt: new Date() }));
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/entries/eB`),
    { verifiedBy: "Eve", verifiedAt: new Date() }));
});

test("verification cannot smuggle other field changes", async () => {
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/eA`),
    { verifiedBy: "Mia", verifiedAt: new Date(), counted: 999 }));
});

/* ---------- variance investigation ---------- */

test("manager moves a flag to under-review", async () => {
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/entries/flagged`),
    { varianceStatus: "under-review" }));
});

test("resolving requires a cause code and the resolver's own name", async () => {
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/flagged`),
    { varianceStatus: "resolved", resolvedBy: "Mia", resolvedAt: new Date() }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/flagged`),
    { varianceStatus: "resolved", causeCode: "training-gap", resolvedBy: "Not Mia", resolvedAt: new Date() }));
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/entries/flagged`),
    { varianceStatus: "resolved", causeCode: "training-gap", resolvedBy: "Mia", resolvedAt: new Date() }));
});

test("employees cannot work the variance queue", async () => {
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/entries/flagged`),
    { varianceStatus: "under-review" }));
});

test("a manager can't investigate or resolve their OWN flagged count (separation of duties)", async () => {
  // flaggedMgr is the manager's own flagged entry — self-clearing is blocked...
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/flaggedMgr`),
    { varianceStatus: "under-review" }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/flaggedMgr`),
    { varianceStatus: "resolved", causeCode: "training-gap", resolvedBy: "Mia", resolvedAt: new Date() }));
  // ...but an independent reviewer (the owner) can resolve it.
  await assertSucceeds(updateDoc(doc(db("owner"), `vendors/${V}/entries/flaggedMgr`),
    { varianceStatus: "resolved", causeCode: "training-gap", resolvedBy: "Olive", resolvedAt: new Date() }));
});

test("a manager can't fabricate a resolution on a never-flagged entry (L9)", async () => {
  // eA is a clean count (varianceStatus 'none'); a manager can't jump it to
  // under-review or resolved — only entries already in the queue are workable.
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/eA`),
    { varianceStatus: "under-review" }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/eA`),
    { varianceStatus: "resolved", causeCode: "training-gap", resolvedBy: "Mia", resolvedAt: new Date() }));
  // And a resolved flag is terminal — it can't be reopened.
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/entries/flagged`),
    { varianceStatus: "resolved", causeCode: "training-gap", resolvedBy: "Mia", resolvedAt: new Date() }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/flagged`),
    { varianceStatus: "open" }));
});

/* ---------- disputes ---------- */

test("only the author opens a dispute, exactly once, flag alone", async () => {
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/entries/eB`),
    { disputeStatus: "open", counted: 1 })); // extra key
  await assertSucceeds(updateDoc(doc(db("empB"), `vendors/${V}/entries/eB`),
    { disputeStatus: "open" }));
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/entries/eB`),
    { disputeStatus: "open" })); // no longer 'none'
});

test("non-authors cannot open; employees cannot advance; managers can", async () => {
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/entries/eB`),
    { disputeStatus: "open" }));
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), `vendors/${V}/entries/eB`), { disputeStatus: "open" }));
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/entries/eB`),
    { disputeStatus: "resolved" }));
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/entries/eB`),
    { disputeStatus: "under-review" }));
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/entries/eB`),
    { disputeStatus: "resolved" }));
});

test("a manager can't resolve a dispute nobody opened (L9)", async () => {
  // eA has disputeStatus 'none' — a manager can't move it straight to
  // under-review or resolved without an author first opening it.
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/eA`),
    { disputeStatus: "under-review" }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/entries/eA`),
    { disputeStatus: "resolved" }));
});

/* ---------- comments & the counter bump ---------- */

test("comment + counter bump succeed in one batch; wrong bump fails", async () => {
  const f = db("empA");
  const good = writeBatch(f);
  good.set(doc(f, `vendors/${V}/entries/eA/comments/newc`), { text: "hello", kind: "comment", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() });
  good.update(doc(f, `vendors/${V}/entries/eA`), { commentCount: 2, lastCommentAt: new Date(), lastCommentId: "newc" });
  await assertSucceeds(good.commit());

  // right comment, wrong (non +1) count.
  const bad = writeBatch(f);
  bad.set(doc(f, `vendors/${V}/entries/eA/comments/newc2`), { text: "again", kind: "comment", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() });
  bad.update(doc(f, `vendors/${V}/entries/eA`), { commentCount: 9, lastCommentAt: new Date(), lastCommentId: "newc2" });
  await assertFails(bad.commit());
});

test("the counter can't be bumped without a real new comment (M4)", async () => {
  const f = db("empA");
  // A bare +1 with no comment created in the batch — refused (lastCommentId
  // names a doc that doesn't exist after the commit).
  await assertFails(updateDoc(doc(f, `vendors/${V}/entries/eA`),
    { commentCount: 2, lastCommentAt: new Date(), lastCommentId: "ghost" }));
  // Pointing at a PRE-EXISTING comment (c1 was seeded) is also refused — the
  // comment must be created in THIS commit, so an old one can't be reused to
  // inflate the count past the real thread length.
  await assertFails(updateDoc(doc(f, `vendors/${V}/entries/eA`),
    { commentCount: 2, lastCommentAt: new Date(), lastCommentId: "c1" }));
});

test("comments validate identity, kind, and length; and are immutable", async () => {
  const f = db("empA");
  await assertFails(setDoc(doc(f, `vendors/${V}/entries/eA/comments/x1`),
    { text: "spoof", kind: "comment", by: "Eve", byId: "u-empB", byRole: "employee", ts: new Date() }));
  await assertFails(setDoc(doc(f, `vendors/${V}/entries/eA/comments/x2`),
    { text: "weird", kind: "shout", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() }));
  await assertFails(setDoc(doc(f, `vendors/${V}/entries/eA/comments/x3`),
    { text: "", kind: "comment", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() }));
  await assertFails(setDoc(doc(f, `vendors/${V}/entries/eA/comments/x4`),
    { text: "y".repeat(2001), kind: "comment", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() }));
  await assertFails(updateDoc(doc(f, `vendors/${V}/entries/eA/comments/c1`), { text: "edited" }));
  await assertFails(deleteDoc(doc(db("mgr"), `vendors/${V}/entries/eA/comments/c1`)));
});

test("thread visibility inherits the entry's per-location scope", async () => {
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/entries/eA/comments/c1`)));
  await assertFails(getDoc(doc(db("empA"), `vendors/${V}/entries/eB/comments/c1`)));
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/entries/eB/comments/c1`)));
});

test("only a manager may post an authoritative 'status' comment", async () => {
  // A non-manager forging a 'status' line (a fake 'Resolved by a manager') is refused.
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/eA/comments/s1`),
    { text: "Resolved — register error", kind: "status", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() }));
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/entries/eA/comments/s2`),
    { text: "Resolved — register error", kind: "status", by: "Mia", byId: "u-mgr", byRole: "manager", ts: new Date() }));
});

test("an employee cannot comment into a thread outside their location", async () => {
  // empA is at locA; eB lives at locB (empA can't even read it), so writing
  // into its thread must be refused — write scope matches read scope.
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/eB/comments/reach`),
    { text: "reaching across", kind: "comment", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() }));
});

/* ---------- shift notes ---------- */

test("notes are location-scoped for employees", async () => {
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/notes/nA`)));
  await assertFails(getDoc(doc(db("empA"), `vendors/${V}/notes/nB`)));
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/notes/nB`)));
});

test("employees post to their own location only, never pre-pinned", async () => {
  const base = { text: "hi", by: "Eve", byId: "u-empA", byRole: "employee", locationName: "A", shift: null, pinned: false, active: true, ts: new Date() };
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/notes/ok`), { ...base, locationId: "locA" }));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/notes/wrongLoc`), { ...base, locationId: "locB" }));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/notes/pinned`), { ...base, locationId: "locA", pinned: true }));
});

test("note text is immutable; managers may only pin/archive; no deletes", async () => {
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/notes/nA`), { text: "edited" }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/notes/nA`), { text: "edited" }));
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/notes/nA`), { pinned: true }));
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/notes/nA`), { active: false }));
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/notes/nA`), { pinned: true }));
  await assertFails(deleteDoc(doc(db("mgr"), `vendors/${V}/notes/nA`)));
});

/* ---------- vendor settings & items ---------- */

test("only the owner edits settings, and only whitelisted keys", async () => {
  await assertSucceeds(updateDoc(doc(db("owner"), `vendors/${V}`),
    { blindCounts: true, varianceThreshold: 10, digest: { enabled: true, recipients: ["o@x.com"], tz: "America/New_York", lastSentDate: null } }));
  // opt-in AI feature flags are owner-writable (ai-*-spec.md)
  await assertSucceeds(updateDoc(doc(db("owner"), `vendors/${V}`), { aiSearch: true, aiInsights: true }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}`), { blindCounts: true }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}`), { aiInsights: true }));
  await assertFails(updateDoc(doc(db("owner"), `vendors/${V}`), { slug: "stolen-code" }));
});

/* ---------- support tickets (top-level, trusted-route only) ---------- */

test("supportTickets: an owner reads only their store's tickets; nobody writes from a client", async () => {
  // Seed two tickets (different vendors) with the Admin SDK (rules disabled).
  await env.withSecurityRulesDisabled(async (c) => {
    const f = c.firestore();
    await setDoc(doc(f, "supportTickets/tA"), { vendorId: V, subject: "A", status: "open", lastActivityAt: new Date() });
    await setDoc(doc(f, "supportTickets/tOther"), { vendorId: V2, subject: "B", status: "open", lastActivityAt: new Date() });
  });
  await assertSucceeds(getDoc(doc(db("owner"), "supportTickets/tA")));       // owner reads own
  await assertFails(getDoc(doc(db("mgr"), "supportTickets/tA")));            // manager: no
  await assertFails(getDoc(doc(db("empA"), "supportTickets/tA")));          // employee: no
  await assertFails(getDoc(doc(db("owner"), "supportTickets/tOther")));     // not this owner's store
  await assertFails(setDoc(doc(db("owner"), "supportTickets/tNew"), { vendorId: V, subject: "X", status: "open", lastActivityAt: new Date() })); // no client writes
  await assertFails(updateDoc(doc(db("owner"), "supportTickets/tA"), { status: "resolved" }));
});

/* ---------- subscriber billing (dev-only, closed to every client) ---------- */

test("billing: no client — not even an owner — can read or write a billing record", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), `billing/${V}`), { plan: "pro", status: "active", cycle: "monthly", price: 49 });
  });
  // Top-level, no rules match → default deny for every store account. Only the
  // Admin SDK (the /dev console) ever touches it, so the price stays dev-only.
  await assertFails(getDoc(doc(db("owner"), `billing/${V}`)));
  await assertFails(getDoc(doc(db("mgr"), `billing/${V}`)));
  await assertFails(getDoc(doc(db("empA"), `billing/${V}`)));
  await assertFails(setDoc(doc(db("owner"), `billing/${V}`), { plan: "enterprise", status: "active", cycle: "annual", price: 0 }));
  await assertFails(updateDoc(doc(db("owner"), `billing/${V}`), { price: 0 }));
});

/* ---------- backroom stock movements (trusted-route only) ---------- */

test("stockMoves: members read the movement log; nobody writes it from a client", async () => {
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/stockMoves/m1`)));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/stockMoves/m2`),
    { itemId: "i1", delta: -1, by: "Mia", ts: new Date() }));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/stockMoves/m3`),
    { itemId: "i1", delta: -1, by: "Eve", ts: new Date() }));
  await assertFails(getDoc(doc(db("outsider"), `vendors/${V}/stockMoves/m1`)));
});

/* ---------- scratch-off packs — RETIRED (PR #125) ---------- */

// The pack-lifecycle state machine is gone; scratch theft-protection lives in
// the signed shift counts. With no match block the old collection is default-
// deny: nobody can read or write it, so stale clients can't resurrect it.
test("packs: the retired collection is fully closed — no reads, no writes", async () => {
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/packs/p1`), { status: "received" }));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/packs/p2`), { status: "received" }));
  await assertFails(getDoc(doc(db("mgr"), `vendors/${V}/packs/p1`)));
});

/* ---------- incidents (tier-two write-ups) ---------- */

test("incidents: managers file them, employees cannot, and identity must match", async () => {
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/incidents/new1`), incident()));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/incidents/new2`),
    incident({ by: "Eve", byId: "u-empA", byRole: "employee" })));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/incidents/new3`), incident({ byId: "u-empA" })));
});

test("incidents: must start clean — open, unacknowledged, links capped", async () => {
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/incidents/d1`), incident({ status: "acknowledged" })));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/incidents/d2`), incident({ ackNote: "pre-agreed" })));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/incidents/d3`), incident({ severity: "career-ending" })));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/incidents/d4`),
    incident({ links: ["a", "b", "c", "d", "e", "f"] })));
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/incidents/d5`),
    incident({ links: ["https://cam.example/clip1"] })));
});

test("incidents: subject reads their own; coworkers and outsiders never do", async () => {
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/incidents/incA`)));
  await assertFails(getDoc(doc(db("empB"), `vendors/${V}/incidents/incA`)));
  await assertFails(getDoc(doc(db("empA"), `vendors/${V}/incidents/incGeneral`)));
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/incidents/incGeneral`)));
  await assertFails(getDoc(doc(db("outsider"), `vendors/${V}/incidents/incA`)));
});

test("incidents: only the subject acknowledges, once, ack fields alone", async () => {
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/incidents/incA`),
    { status: "acknowledged", ackAt: new Date() }));
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/incidents/incA`),
    { status: "acknowledged", ackAt: new Date(), text: "rewritten" })); // smuggled edit
  await assertSucceeds(updateDoc(doc(db("empA"), `vendors/${V}/incidents/incA`),
    { status: "acknowledged", ackAt: new Date(), ackNote: "The drawer lock was broken — I reported it that morning." }));
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/incidents/incA`),
    { status: "acknowledged", ackAt: new Date() })); // no longer open
});

test("incidents: managers close (acknowledged or not); text immutable; no deletes", async () => {
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/incidents/incA`),
    { status: "closed", closedBy: "Eve", closedAt: new Date() }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/incidents/incA`),
    { status: "closed", closedBy: "Not Mia", closedAt: new Date() }));
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/incidents/incA`),
    { status: "closed", closedBy: "Mia", closedAt: new Date() }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/incidents/incA`),
    { status: "open" })); // forward-only
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/incidents/incGeneral`), { text: "edited" }));
  await assertFails(deleteDoc(doc(db("mgr"), `vendors/${V}/incidents/incGeneral`)));
});

test("items: owner-only management (Admin is the owner's room), everyone reads, nobody deletes", async () => {
  await assertSucceeds(setDoc(doc(db("owner"), `vendors/${V}/items/i2`),
    { name: "Elf Bar", category: "Vapes", unit: "unit", barcode: null, locationId: "locA", active: true, createdAt: new Date() }));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/items/i3`),
    { name: "Nope", unit: "unit", locationId: "locA", active: true, createdAt: new Date() }));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/items/i4`),
    { name: "Nope", unit: "unit", locationId: "locA", active: true, createdAt: new Date() }));
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/items/i1`)));
  await assertFails(deleteDoc(doc(db("owner"), `vendors/${V}/items/i1`)));
});

test("locations & drawers: owner-only writes too — the manager path is closed", async () => {
  await assertSucceeds(setDoc(doc(db("owner"), `vendors/${V}/locations/locNew`), { name: "Annex", active: true }));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/locations/locNope`), { name: "Nope", active: true }));
  await assertSucceeds(setDoc(doc(db("owner"), `vendors/${V}/drawers/drNew`), { name: "Register 3", locationId: "locA", active: true }));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/drawers/drNope`), { name: "Nope", locationId: "locA", active: true }));
});

/* ---------- time clock ---------- */

test("timeclock: employee punches for themselves at their own location; signed, valid type", async () => {
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/timeclock/p1`), punch()));
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/timeclock/p2`), punch({ type: "out" })));
  // a manager may punch at any location
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/p3`), punch({ userId: "u-mgr", userName: "Mia", locationId: "locB" })));
});

test("timeclock: punches must be self-signed, a valid type, and at the employee's own location", async () => {
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeclock/b1`), punch({ userId: "u-empB", userName: "Bob" }))); // wrong signer
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeclock/b2`), punch({ userName: "Someone" })));               // name mismatch
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeclock/b3`), punch({ locationId: "locB" })));               // not their location
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeclock/b4`), punch({ type: "lunch" })));                    // bad type
});

test("timeclock: the punch time must be the server clock, not a client-chosen value", async () => {
  // ts is the hours-bearing field. A client Date instead of a serverTimestamp
  // sentinel — back-dated to stretch a shift, or forward-dated — won't equal
  // request.time, so the rule refuses it.
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeclock/back`),
    punch({ ts: new Date("2020-01-01T00:00:00Z") })));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeclock/fwd`),
    punch({ ts: new Date("2999-01-01T00:00:00Z") })));
});

test("timeclock: managers see all, employees only their own; punches are immutable", async () => {
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/timeclock/tcA`)));
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/timeclock/tcA`)));
  await assertFails(getDoc(doc(db("empB"), `vendors/${V}/timeclock/tcA`)));            // not theirs
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/timeclock/tcA`), { type: "out" })); // no edits
  await assertFails(deleteDoc(doc(db("mgr"), `vendors/${V}/timeclock/tcA`)));          // no deletes
});

test("timeclock: a manager files an append-only correction; employees cannot", async () => {
  // manager correction with a chosen `at`, server ts, signed, with a reason
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/c1`), correction()));
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/c2`), correction({ action: "add", targetId: null })));
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/c3`), correction({ action: "void" })));
  // an employee can't file a correction (not a manager)
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeclock/c4`), correction({ byId: "u-empA", byName: "Eve" })));
  // a correction must be manager-signed, carry a valid action, and a reason
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/c5`), correction({ byId: "u-empA", byName: "Eve" }))); // signer mismatch
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/c6`), correction({ action: "delete" })));             // bad action
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/c7`), correction({ reason: "" })));                   // empty reason
  // the audit ts is still pinned to the server clock, even for a manager
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/c8`), correction({ ts: new Date("2020-01-01T00:00:00Z") })));
  // and corrections stay immutable once written
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/timeclock/c1`), { at: new Date() }));
});

/* ---------- payroll locks (pay-period approval) ---------- */

test("payrollLocks: manager approves a day; signed, server-timed, id == day", async () => {
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/payrollLocks/2026-07-04`),
    { day: "2026-07-04", weekStart: "2026-06-29", byId: "u-mgr", byName: "Mia", ts: serverTimestamp() }));
  // employees can't approve payroll
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/payrollLocks/2026-07-05`),
    { day: "2026-07-05", weekStart: "2026-06-29", byId: "u-empA", byName: "Eve", ts: serverTimestamp() }));
  // the stored day must equal the doc id
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/payrollLocks/2026-07-05`),
    { day: "2026-07-06", weekStart: "2026-06-29", byId: "u-mgr", byName: "Mia", ts: serverTimestamp() }));
  // client-chosen approval time refused
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/payrollLocks/2026-07-05`),
    { day: "2026-07-05", weekStart: "2026-06-29", byId: "u-mgr", byName: "Mia", ts: new Date("2020-01-01T00:00:00Z") }));
  // signer mismatch refused
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/payrollLocks/2026-07-05`),
    { day: "2026-07-05", weekStart: "2026-06-29", byId: "u-owner", byName: "Olive", ts: serverTimestamp() }));
});

test("payrollLocks: a locked day rejects corrections; unlocked days still accept", async () => {
  // tcLocked sits on 2026-07-11 (locked in the seed). The edit's `day` label
  // says 2026-07-10 — the rules key off the TARGET punch's stored day, so a
  // forged label can't dodge the lock.
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/lc1`),
    correction({ targetId: "tcLocked", at: new Date("2026-07-11T17:00:00Z") })));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/lc2`),
    correction({ action: "void", targetId: "tcLocked" })));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/lc3`),
    correction({ action: "add", targetId: null, day: "2026-07-11", at: new Date("2026-07-11T09:00:00Z") })));
  // the unlocked 2026-07-10 keeps accepting corrections
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/lc4`),
    correction({ action: "add", targetId: null })));
});

test("payrollLocks: owner releases (audited), corrections reopen, manager re-approves", async () => {
  // a manager may NOT release
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/payrollLocks/2026-07-11`),
    { released: true, releasedById: "u-mgr", releasedBy: "Mia", releasedAt: serverTimestamp() }));
  // the owner releases with exactly the audited fields
  await assertSucceeds(updateDoc(doc(db("owner"), `vendors/${V}/payrollLocks/2026-07-11`),
    { released: true, releasedById: "u-owner", releasedBy: "Olive", releasedAt: serverTimestamp() }));
  // a released day accepts corrections again
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/lc5`),
    correction({ action: "void", targetId: "tcLocked" })));
  // a manager re-approves with a fresh signature (restricted keys only)
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/payrollLocks/2026-07-11`),
    { released: false, byId: "u-mgr", byName: "Mia", ts: serverTimestamp() }));
  // ...and the day is locked again
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/timeclock/lc6`),
    correction({ action: "void", targetId: "tcLocked" })));
});

test("payrollLocks: never deleted, and the approval record itself can't be edited", async () => {
  await assertFails(deleteDoc(doc(db("owner"), `vendors/${V}/payrollLocks/2026-07-11`)));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/payrollLocks/2026-07-11`), { byName: "Someone Else" }));
  await assertFails(getDoc(doc(db("empA"), `vendors/${V}/payrollLocks/2026-07-11`))); // manager-only reads
});

/* ---------- schedule (roster) ---------- */

test("schedule: managers create (manager-signed) and delete; employees cannot create", async () => {
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/schedule/new1`), sched()));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/schedule/bad`), sched({ by: "Eve", byId: "u-empA" }))); // must be manager-signed
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/schedule/new2`), sched()));  // employees don't roster
  await assertSucceeds(deleteDoc(doc(db("mgr"), `vendors/${V}/schedule/sA`)));        // managers delete
  await assertFails(deleteDoc(doc(db("empA"), `vendors/${V}/schedule/sOffered`)));    // employees don't delete
});

test("schedule: an employee reads their own shift; a non-swap edit by an employee is denied", async () => {
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/schedule/sA`)));
  await assertFails(getDoc(doc(db("empB"), `vendors/${V}/schedule/sA`)));             // not theirs, not up for swap
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/schedule/sA`), { start: "08:00" })); // employees can't rewrite the shift
});

/* ---------- shift swaps ---------- */

test("swap: the owner offers their own shift; a coworker cannot offer it", async () => {
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/schedule/sA`), { swapStatus: "offered" }));  // not the owner
  await assertSucceeds(updateDoc(doc(db("empA"), `vendors/${V}/schedule/sA`), { swapStatus: "offered" }));
});

test("swap: an offered shift is visible to coworkers so they can pick it up", async () => {
  await assertSucceeds(getDoc(doc(db("empB"), `vendors/${V}/schedule/sOffered`)));  // swapStatus != none
});

test("swap: a coworker claims an offered shift, signed as themselves; the owner cannot", async () => {
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/schedule/sOffered`),  // owner can't claim their own
    { swapStatus: "claimed", claimedById: "u-empA", claimedByName: "Eve" }));
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/schedule/sOffered`),  // must sign the claim as themselves
    { swapStatus: "claimed", claimedById: "u-empA", claimedByName: "Eve" }));
  await assertSucceeds(updateDoc(doc(db("empB"), `vendors/${V}/schedule/sOffered`),
    { swapStatus: "claimed", claimedById: "u-empB", claimedByName: "Bob" }));
});

test("swap: only the claimer withdraws (clearing the claim); others cannot", async () => {
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/schedule/sClaimed`),  // owner isn't the claimer
    { swapStatus: "offered", claimedById: null, claimedByName: null }));
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/schedule/sClaimed`),  // must clear the claim fields
    { swapStatus: "offered" }));
  await assertSucceeds(updateDoc(doc(db("empB"), `vendors/${V}/schedule/sClaimed`),
    { swapStatus: "offered", claimedById: null, claimedByName: null }));
});

test("swap: a manager approves (reassigning the shift); a non-manager cannot", async () => {
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/schedule/sClaimed`),  // claimer can't self-approve a reassign
    { userId: "u-empB", userName: "Bob", swapStatus: "none", claimedById: null, claimedByName: null }));
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/schedule/sClaimed`),
    { userId: "u-empB", userName: "Bob", swapStatus: "none", claimedById: null, claimedByName: null }));
});

test("swap: a manager rejects an offered shift back to none", async () => {
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/schedule/sOffered`),
    { swapStatus: "none", claimedById: null, claimedByName: null }));
});

/* ---------- open shifts ---------- */

test("open shift: a manager posts an unassigned shift; a null user must be flagged open; employees can't post", async () => {
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/schedule/newOpen`), sched({ userId: null, userName: null, open: true })));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/schedule/badNull`), sched({ userId: null, userName: null }))); // null user, not open
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/schedule/empOpen`), sched({ userId: null, userName: null, open: true }))); // employees never create
});

test("open shift: any employee reads it and grabs it as themselves, not for someone else", async () => {
  await assertSucceeds(getDoc(doc(db("empB"), `vendors/${V}/schedule/sOpen`)));            // open => readable
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/schedule/sOpen`),              // can't assign it to someone else
    { userId: "u-empA", userName: "Eve", open: false }));
  await assertSucceeds(updateDoc(doc(db("empB"), `vendors/${V}/schedule/sOpen`),           // grabs it
    { userId: "u-empB", userName: "Bob", open: false }));
});

test("open shift: the grab path cannot hijack an assigned (non-open) shift", async () => {
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/schedule/sA`),
    { userId: "u-empB", userName: "Bob", open: false }));
});

/* ---------- availability ---------- */

test("availability: employees mark their own days; managers see all; not editable", async () => {
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/availability/n1`), { userId: "u-empA", userName: "Eve", date: "2026-07-25", ts: new Date() }));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/availability/n2`), { userId: "u-empB", userName: "Bob", date: "2026-07-25", ts: new Date() })); // not for someone else
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/availability/avA`)));
  await assertFails(getDoc(doc(db("empB"), `vendors/${V}/availability/avA`)));   // a coworker can't read another's
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/availability/avA`), { date: "2026-07-26" })); // immutable
});

test("availability: the owner or a manager removes an entry; a coworker cannot", async () => {
  await assertFails(deleteDoc(doc(db("empB"), `vendors/${V}/availability/avA`)));   // coworker
  await assertSucceeds(deleteDoc(doc(db("mgr"), `vendors/${V}/availability/avA`))); // manager
});

/* ---------- staff time-off ---------- */

const tOff = (over = {}) => ({
  userId: "u-empA", userName: "Eve", kind: "request", type: "vacation",
  startDate: "2026-08-01", endDate: "2026-08-03", allDay: true, startTime: null, endTime: null,
  reason: "trip", status: "pending", createdAt: new Date(), ts: new Date(), ...over,
});

test("timeOff: an employee files their own; not for someone else; must start pending/planned, undecided", async () => {
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/timeOff/n1`), tOff()));
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/timeOff/n1b`), tOff({ kind: "event", status: "planned" })));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeOff/n2`), tOff({ userId: "u-empB", userName: "Bob" }))); // someone else
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeOff/n3`), tOff({ status: "approved" })));                 // can't self-approve
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/timeOff/n4`), tOff({ decidedById: "u-empA" })));             // can't pre-decide
});

test("timeOff: manager sees all + decides (signed); requester sees own; coworker can't", async () => {
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/timeOff/toReq`)));
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/timeOff/toReq`)));   // own
  await assertFails(getDoc(doc(db("empB"), `vendors/${V}/timeOff/toReq`)));      // coworker
  // A manager approves — signed with their own identity, only the decision fields.
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/timeOff/toReq`),
    { status: "approved", decidedBy: "Mia", decidedById: "u-mgr", decidedAt: new Date(), decisionNote: "ok" }));
  // Can't sign someone else's name, and can't edit non-decision fields.
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/timeOff/toEvt`),
    { status: "approved", decidedBy: "Eve", decidedById: "u-empA", decidedAt: new Date(), decisionNote: "x" }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/timeOff/toEvt`), { startDate: "2026-09-01" }));
  // An employee cannot decide.
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/timeOff/toEvt`),
    { status: "approved", decidedBy: "Eve", decidedById: "u-empA", decidedAt: new Date(), decisionNote: "" }));
});

test("timeOff: requester cancels own open request; can't cancel a coworker's; both sides delete own", async () => {
  await assertSucceeds(updateDoc(doc(db("empB"), `vendors/${V}/timeOff/toB`), { status: "canceled" })); // own → canceled
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/timeOff/toEvt`), { status: "canceled", extra: 1 })); // must touch only status
  await assertFails(updateDoc(doc(db("empB"), `vendors/${V}/timeOff/toEvt`), { status: "canceled" }));   // not yours (toEvt is empA's)
  await assertSucceeds(deleteDoc(doc(db("empA"), `vendors/${V}/timeOff/toEvt`)));   // requester deletes own
  await assertSucceeds(deleteDoc(doc(db("mgr"), `vendors/${V}/timeOff/toB`)));      // manager deletes any
});

/* ---------- week templates ---------- */

test("schedulePublished: managers read the record; employees can't; the client never writes", async () => {
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/schedulePublished/2026-07-06`)));
  await assertFails(getDoc(doc(db("empA"), `vendors/${V}/schedulePublished/2026-07-06`)));   // manager-only read
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/schedulePublished/2026-07-13`),      // only the server (Admin SDK) writes
    { weekStart: "2026-07-13", notified: 0 }));
});

test("templates: managers manage them; employees can neither read nor write", async () => {
  const tpl = { name: "Standard week", shifts: [{ dow: 0, userId: "u-empA", userName: "Eve", start: "09:00", end: "17:00" }], by: "Mia", byId: "u-mgr", ts: new Date() };
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/templates/t1`), tpl));
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/templates/t1`)));
  // employees are locked out entirely (templates are a manager planning tool)
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/templates/t2`), tpl));
  await assertFails(getDoc(doc(db("empA"), `vendors/${V}/templates/t1`)));
  await assertSucceeds(deleteDoc(doc(db("mgr"), `vendors/${V}/templates/t1`)));
});

/* ---------- stock alerts + rewards (owner-only vendor keys) ---------- */

test("stockAlerts and rewards settings: owner may set them; a manager may not", async () => {
  await assertSucceeds(updateDoc(doc(db("owner"), `vendors/${V}`),
    { stockAlerts: { expiryDays: 45, lowStockUnits: 3 } }));
  await assertSucceeds(updateDoc(doc(db("owner"), `vendors/${V}`),
    { rewards: { enabled: true, earnPerDollar: 1, redeemPoints: 100, redeemValue: 5 } }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}`), { stockAlerts: { expiryDays: 10 } }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}`), { rewards: { enabled: false } }));
});

/* ---------- feature toggles (owner-only vendor key) ---------- */

test("features settings: owner may toggle modules; a manager may not", async () => {
  await assertSucceeds(updateDoc(doc(db("owner"), `vendors/${V}`),
    { features: { scratch: false, inventory: true, gaming: false } }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}`),
    { features: { scratch: false } }));
});

/* ---------- gaming: machine registry (owner config) + owner-only ledger ---------- */

test("machines registry: members read, only the owner writes, never deleted", async () => {
  await assertSucceeds(setDoc(doc(db("owner"), `vendors/${V}/machines/m1`),
    { name: "Slot 1", company: "Acme", type: "slot", storePct: 60, cadence: "weekly", active: true }));
  // a member (staff) can read the registry — they need the machine names to file
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/machines/m1`)));
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/machines/m1`)));
  // but only the owner may create/edit a machine
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/machines/m2`),
    { name: "ATM", company: "CashCo", storePct: 50, active: true }));
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/machines/m1`), { storePct: 100 }));
  await assertSucceeds(updateDoc(doc(db("owner"), `vendors/${V}/machines/m1`), { active: false }));
  await assertFails(deleteDoc(doc(db("owner"), `vendors/${V}/machines/m1`)));
  await assertFails(getDoc(doc(db("outsider"), `vendors/${V}/machines/m1`)));
});

test("gamingCollections ledger: OWNER-only read, no client writes at all", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), `vendors/${V}/gamingCollections/g1`),
      { machineId: "m1", collectionDate: "2026-07-01", collection: 1000, payout: 400, storeShare: 360 });
  });
  // owner sees the money; staff and managers do NOT (staff enter, they don't see totals)
  await assertSucceeds(getDoc(doc(db("owner"), `vendors/${V}/gamingCollections/g1`)));
  await assertFails(getDoc(doc(db("mgr"), `vendors/${V}/gamingCollections/g1`)));
  await assertFails(getDoc(doc(db("empA"), `vendors/${V}/gamingCollections/g1`)));
  // append-only via the trusted route — even the owner can't write from the client
  await assertFails(setDoc(doc(db("owner"), `vendors/${V}/gamingCollections/g2`),
    { machineId: "m1", collectionDate: "2026-07-08", collection: 500, payout: 0, storeShare: 250 }));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/gamingCollections/g3`),
    { machineId: "m1", collectionDate: "2026-07-08", collection: 500, payout: 0, storeShare: 250 }));
  await assertFails(deleteDoc(doc(db("owner"), `vendors/${V}/gamingCollections/g1`)));
});

/* ---------- rewards ledger: readable by members, writable by NOBODY ---------- */

test("customers + rewardEvents: members read, outsiders don't, and no client may write", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const f = c.firestore();
    await setDoc(doc(f, `vendors/${V}/customers/c1`), { phone: "5551234567", pointsBalance: 10 });
    await setDoc(doc(f, `vendors/${V}/rewardEvents/ev1`), { kind: "earn", points: 10, customerId: "c1" });
  });
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/customers/c1`)));
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/rewardEvents/ev1`)));
  await assertFails(getDoc(doc(db("outsider"), `vendors/${V}/customers/c1`)));
  // append-only holds by construction: even the OWNER can't write from the
  // client — every ledger move goes through the trusted /api/rewards route.
  await assertFails(setDoc(doc(db("owner"), `vendors/${V}/customers/c2`), { phone: "5550000000", pointsBalance: 0 }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/customers/c1`), { pointsBalance: 9999 }));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/rewardEvents/ev2`), { kind: "earn", points: 500, customerId: "c1" }));
  await assertFails(deleteDoc(doc(db("owner"), `vendors/${V}/rewardEvents/ev1`)));
});

test("catalog: members read, outsiders don't, and no client may write", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const f = c.firestore();
    await setDoc(doc(f, `vendors/${V}/catalog/scratch`), { games: { 1801: { name: "Glinda", price: 1 } }, count: 1 });
  });
  // The whole team reads the game catalog (the scratch form uses it).
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/catalog/scratch`)));
  await assertSucceeds(getDoc(doc(db("mgr"), `vendors/${V}/catalog/scratch`)));
  await assertFails(getDoc(doc(db("outsider"), `vendors/${V}/catalog/scratch`)));
  // Written only through the trusted owner-only /api/import route — no client
  // write, not even the owner (mirrors customers/rewardEvents).
  await assertFails(setDoc(doc(db("owner"), `vendors/${V}/catalog/scratch`), { games: {}, count: 0 }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/catalog/scratch`), { count: 99 }));
  await assertFails(deleteDoc(doc(db("owner"), `vendors/${V}/catalog/scratch`)));
});

test("branding font: members read the uploaded font; no client may write it", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), `vendors/${V}/branding/font`),
      { dataUrl: "data:font/woff2;base64,AAAA", format: "woff2", bytes: 3 });
  });
  // Members read it so the app can inject the @font-face; outsiders can't.
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/branding/font`)));
  await assertFails(getDoc(doc(db("outsider"), `vendors/${V}/branding/font`)));
  // Written only through the trusted owner-only /api/branding route — no client write.
  await assertFails(setDoc(doc(db("owner"), `vendors/${V}/branding/font`), { dataUrl: "data:font/woff2;base64,BBBB", format: "woff2", bytes: 3 }));
  await assertFails(deleteDoc(doc(db("owner"), `vendors/${V}/branding/font`)));
});

test("appearance settings: an owner may set themePalette/fontFamily/fontScale; a manager may not", async () => {
  await assertSucceeds(updateDoc(doc(db("owner"), `vendors/${V}`),
    { themePalette: "ocean", fontFamily: "Inter", fontScale: 1.12 }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}`), { themePalette: "rose" }));
});
