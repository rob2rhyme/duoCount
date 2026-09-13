// Import a scratch-export.json (from export-scratch.mjs) into a vendor in
// ANOTHER deployment — e.g. moving DuoCount's scratch history into ScratchCount.
// Both run the same codebase, so the document shapes are identical.
//
//   GOOGLE_APPLICATION_CREDENTIALS=./target-service-account.json \
//     node scripts/import-scratch.mjs <targetVendorId> [scratch-export.json] [--commit]
//
// DRY RUN BY DEFAULT. Nothing is written until you pass --commit, because the
// entries collection is append-only and there is no undo.
//
// What it does:
//   • Re-creates the source locations and staff in the target (new ids), and
//     rewrites every entry's locationId / byId to the new ids, so the audit
//     trail still resolves. Staff arrive with no PIN — set one in Admin.
//   • Preserves each count's original `ts`, `by`, `byId`, `byRole` and every
//     ticket number, because that signed history IS the thing being moved.
//   • Stamps each imported doc with `source: "migrated"`, `sourceVendorId` and
//     `migratedAt`. The trust model's whole premise is that a record says where
//     it came from; a relocated count must not silently read as one typed on
//     this deployment.
//   • Skips docs whose id already exists in the target, so re-running is safe.
//
// It writes with the Admin SDK, which bypasses security rules — that is the
// only way to preserve an original timestamp, and it is why this is an
// operator script run from your machine, not an in-app import.

import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const [targetVendorId, path = "scratch-export.json"] = args.filter((a) => a !== "--commit");
if (!targetVendorId) {
  console.error("Usage: GOOGLE_APPLICATION_CREDENTIALS=./target-key.json node scripts/import-scratch.mjs <targetVendorId> [scratch-export.json] [--commit]");
  process.exit(1);
}

const revive = (v) => {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === "object") {
    if (typeof v.__ts__ === "string") return new Date(v.__ts__);
    const o = {};
    for (const k in v) o[k] = revive(v[k]);
    return o;
  }
  return v;
};

const payload = JSON.parse(readFileSync(path, "utf8"));
// Against the Firestore emulator no credentials are needed, which is how you
// rehearse a migration before pointing it at a real project:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo node scripts/...
const emulated = !!process.env.FIRESTORE_EMULATOR_HOST;
initializeApp(emulated
  ? { projectId: process.env.GCLOUD_PROJECT || "demo" }
  : { credential: applicationDefault() });
const db = getFirestore();

const vendorRef = db.collection("vendors").doc(targetVendorId);
if (!(await vendorRef.get()).exists) {
  console.error(`No vendor ${targetVendorId} in the TARGET project. Create the store in the app first, then copy its id from Admin.`);
  process.exit(1);
}

const migratedAt = new Date();
const stamp = { source: "migrated", sourceVendorId: payload.sourceVendorId, migratedAt };

// Locations and staff get fresh ids in the target; entries are rewritten to
// point at them. Matching on name means a second run reuses what it made.
async function remap(coll, rows, label) {
  const existing = new Map((await vendorRef.collection(coll).get()).docs.map((d) => [d.data().name, d.id]));
  const map = new Map();
  let made = 0;
  for (const r of rows) {
    const name = r.data.name;
    if (existing.has(name)) { map.set(r.id, existing.get(name)); continue; }
    const ref = vendorRef.collection(coll).doc();
    map.set(r.id, ref.id);
    made++;
    if (commit) await ref.set({ ...revive(r.data), ...stamp });
  }
  console.log(`  ${label}: ${rows.length} in export, ${made} to create, ${rows.length - made} matched by name`);
  return map;
}

console.log(commit ? "COMMITTING" : "DRY RUN — nothing will be written (add --commit)");
console.log(`from ${payload.sourceVendorName} (${payload.sourceVendorId}) -> vendor ${targetVendorId}`);

const locMap = await remap("locations", payload.locations, "locations");
// Owners aren't recreated: the target already has the owner who signed up.
const staff = payload.users.filter((u) => u.data.role !== "owner");
const userMap = await remap("users", staff, "staff");
for (const u of payload.users.filter((u) => u.data.role === "owner")) userMap.set(u.id, null);

const have = new Set((await vendorRef.collection("entries").get()).docs.map((d) => d.id));
let wrote = 0, skipped = 0;
let batch = db.batch(), n = 0;
for (const e of payload.entries) {
  if (have.has(e.id)) { skipped++; continue; }
  const d = revive(e.data);
  const doc = {
    ...d,
    locationId: locMap.get(d.locationId) ?? d.locationId,
    // A migrated count keeps the NAME that signed it (that is the record), but
    // its byId must point at this deployment's user — or at "" when that person
    // wasn't migrated, rather than at a dangling id from another project.
    byId: userMap.get(d.byId) ?? "",
    ...stamp,
  };
  if (commit) { batch.set(vendorRef.collection("entries").doc(e.id), doc); n++; }
  wrote++;
  if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
}
if (commit && n) await batch.commit();
console.log(`  entries: ${wrote} to write, ${skipped} already present`);

if (payload.scratchCatalog && commit) {
  await vendorRef.collection("catalog").doc("scratch").set(revive(payload.scratchCatalog));
}
console.log(`  catalog: ${payload.scratchCatalog ? (commit ? "written" : "would write") : "none"}`);
console.log(commit ? "Done." : "Dry run complete — re-run with --commit to write.");
