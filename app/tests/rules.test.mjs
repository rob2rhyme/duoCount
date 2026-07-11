// Firestore security-rules tests (tier-one spec §7 step 4).
// Run with: npm run test:rules   (starts the emulator via firebase-tools)
import { readFileSync } from "node:fs";
import { test, before, beforeEach, after } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc, writeBatch,
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
    await setDoc(doc(f, `vendors/${V}/entries/eA`), entry({ commentCount: 1 }));
    await setDoc(doc(f, `vendors/${V}/entries/eB`), entry({ locationId: "locB", locationName: "B", by: "Bob", byId: "u-empB" }));
    await setDoc(doc(f, `vendors/${V}/entries/eMgr`), entry({ by: "Mia", byId: "u-mgr", byRole: "manager" }));
    await setDoc(doc(f, `vendors/${V}/entries/flagged`), entry({ flagged: true, varianceStatus: "open", counted: 140, diff: -10 }));
    await setDoc(doc(f, `vendors/${V}/entries/eA/comments/c1`), { text: "first", kind: "comment", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/entries/eB/comments/c1`), { text: "other loc", kind: "comment", by: "Bob", byId: "u-empB", byRole: "employee", ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/notes/nA`), { text: "note A", by: "Eve", byId: "u-empA", byRole: "employee", locationId: "locA", locationName: "A", shift: null, pinned: false, active: true, ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/notes/nB`), { text: "note B", by: "Bob", byId: "u-empB", byRole: "employee", locationId: "locB", locationName: "B", shift: null, pinned: false, active: true, ts: new Date() });
    await setDoc(doc(f, `vendors/${V}/items/i1`), { name: "Marlboro Red carton", category: "Cigarettes", unit: "carton", barcode: "0123", locationId: "locA", active: true, createdAt: new Date() });
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

test("entries must start clean: no pre-resolved, pre-disputed, or pre-caused state", async () => {
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/d1`), entry({ disputeStatus: "open" })));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/d2`), entry({ varianceStatus: "resolved" })));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/entries/d3`), entry({ causeCode: "human-error" })));
  await assertSucceeds(setDoc(doc(db("empA"), `vendors/${V}/entries/d4`), entry({ flagged: true, varianceStatus: "open" })));
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

/* ---------- comments & the counter bump ---------- */

test("comment + counter bump succeed in one batch; wrong bump fails", async () => {
  const f = db("empA");
  const good = writeBatch(f);
  good.set(doc(f, `vendors/${V}/entries/eA/comments/new`), { text: "hello", kind: "comment", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() });
  good.update(doc(f, `vendors/${V}/entries/eA`), { commentCount: 2, lastCommentAt: new Date() });
  await assertSucceeds(good.commit());

  const bad = writeBatch(f);
  bad.set(doc(f, `vendors/${V}/entries/eA/comments/new2`), { text: "again", kind: "comment", by: "Eve", byId: "u-empA", byRole: "employee", ts: new Date() });
  bad.update(doc(f, `vendors/${V}/entries/eA`), { commentCount: 9, lastCommentAt: new Date() });
  await assertFails(bad.commit());
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
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}`), { blindCounts: true }));
  await assertFails(updateDoc(doc(db("owner"), `vendors/${V}`), { slug: "stolen-code" }));
});

/* ---------- scratch-off packs (forward-only lifecycle) ---------- */

const pack = (over = {}) => ({
  game: "Lucky 7s", packNumber: "111", price: 5, ticketCount: 60, barcode: null,
  locationId: "locA", locationName: "A", bin: null,
  status: "received", receivedBy: "Mia",
  activatedAt: null, activatedBy: null, settledAt: null, settledBy: null,
  returnedAt: null, returnedBy: null, returnNote: null,
  soldAtSettle: null, shortAtSettle: null, createdAt: new Date(),
  ...over,
});

test("packs: manager lifecycle is forward-only; employees read-only; no deletes", async () => {
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/packs/p1`), pack()));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/packs/p2`), pack()));
  await assertFails(setDoc(doc(db("mgr"), `vendors/${V}/packs/p3`), pack({ status: "settled" })));
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/packs/p1`)));

  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/packs/p1`),
    { status: "active", activatedAt: new Date(), activatedBy: "Mia", bin: "4" }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/packs/p1`), { status: "received" }));
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/packs/p1`),
    { status: "settled", settledAt: new Date(), settledBy: "Mia", soldAtSettle: 58, shortAtSettle: 2 }));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/packs/p1`), { status: "active" }));
  await assertFails(deleteDoc(doc(db("mgr"), `vendors/${V}/packs/p1`)));
});

test("packs: no skipping received -> settled; metadata edits keep the status", async () => {
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/packs/p4`), pack({ packNumber: "222" })));
  await assertFails(updateDoc(doc(db("mgr"), `vendors/${V}/packs/p4`),
    { status: "settled", settledAt: new Date(), settledBy: "Mia" }));
  await assertSucceeds(updateDoc(doc(db("mgr"), `vendors/${V}/packs/p4`), { bin: "7" }));
  await assertFails(updateDoc(doc(db("empA"), `vendors/${V}/packs/p4`), { bin: "9" }));
});

test("items: managers manage, employees read, nobody deletes", async () => {
  await assertSucceeds(setDoc(doc(db("mgr"), `vendors/${V}/items/i2`),
    { name: "Elf Bar", category: "Vapes", unit: "unit", barcode: null, locationId: "locA", active: true, createdAt: new Date() }));
  await assertFails(setDoc(doc(db("empA"), `vendors/${V}/items/i3`),
    { name: "Nope", unit: "unit", locationId: "locA", active: true, createdAt: new Date() }));
  await assertSucceeds(getDoc(doc(db("empA"), `vendors/${V}/items/i1`)));
  await assertFails(deleteDoc(doc(db("mgr"), `vendors/${V}/items/i1`)));
});
