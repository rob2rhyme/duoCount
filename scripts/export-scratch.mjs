// Export one vendor's scratch-off data to JSON, for moving it into another
// DuoCount/ScratchCount deployment (they are the same codebase, so the shapes
// match exactly — no field mapping needed).
//
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/export-scratch.mjs <vendorId> [out.json]
//
// Exports, for that vendor:
//   • locations        — entries carry locationId, so the names must come too
//   • users            — entries carry byId; without these the audit trail
//                        would point at ids that don't exist in the target
//   • entries          — kind === "scratch" ONLY (cash and inventory stay put)
//   • scratchCensus    — the shelf-walk snapshots
//   • catalog/scratch  — the game catalog, if the owner uploaded one
//
// PIN hashes (users/<id>/private/creds) are deliberately NOT exported. Staff
// re-set a PIN in the target's Admin; copying credential material between
// deployments is not something a migration script should make easy.
//
// Timestamps are tagged { __ts__: ISO } the same way gen-demo-seed.mjs does, so
// import-scratch.mjs can restore them as real Dates and the signed audit trail
// keeps its original times.

import { writeFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const [vendorId, out = "scratch-export.json"] = process.argv.slice(2);
if (!vendorId) {
  console.error("Usage: GOOGLE_APPLICATION_CREDENTIALS=./key.json node scripts/export-scratch.mjs <vendorId> [out.json]");
  process.exit(1);
}

// Against the Firestore emulator no credentials are needed, which is how you
// rehearse a migration before pointing it at a real project:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo node scripts/...
const emulated = !!process.env.FIRESTORE_EMULATOR_HOST;
initializeApp(emulated
  ? { projectId: process.env.GCLOUD_PROJECT || "demo" }
  : { credential: applicationDefault() });
const db = getFirestore();

// Firestore Timestamps -> { __ts__: ISO }; everything else passes through.
function tag(v) {
  if (v instanceof Timestamp) return { __ts__: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(tag);
  if (v && typeof v === "object" && v.constructor === Object) {
    const o = {};
    for (const k in v) o[k] = tag(v[k]);
    return o;
  }
  return v;
}

const dump = async (ref) => (await ref.get()).docs.map((d) => ({ id: d.id, data: tag(d.data()) }));

const vendorRef = db.collection("vendors").doc(vendorId);
const vendorSnap = await vendorRef.get();
if (!vendorSnap.exists) {
  console.error(`No vendor ${vendorId}. Check the id in Admin, or in the /dev console.`);
  process.exit(1);
}

const [locations, users, allEntries, census] = await Promise.all([
  dump(vendorRef.collection("locations")),
  dump(vendorRef.collection("users")),
  dump(vendorRef.collection("entries").where("kind", "==", "scratch")),
  dump(vendorRef.collection("scratchCensus")),
]);

const catalogSnap = await vendorRef.collection("catalog").doc("scratch").get();

const payload = {
  exportedAt: new Date().toISOString(),
  sourceVendorId: vendorId,
  sourceVendorName: vendorSnap.data().name || "",
  locations,
  // Roles/names only — no private/creds subcollection.
  users,
  entries: allEntries,
  scratchCensus: census,
  scratchCatalog: catalogSnap.exists ? tag(catalogSnap.data()) : null,
};

writeFileSync(out, JSON.stringify(payload, null, 2));
const dates = allEntries.map((e) => e.data.date).filter(Boolean).sort();
console.log(`Wrote ${out}`);
console.log(`  vendor      ${payload.sourceVendorName} (${vendorId})`);
console.log(`  locations   ${locations.length}`);
console.log(`  staff       ${users.length}  (names + roles only, no PINs)`);
console.log(`  scratch     ${allEntries.length} counts${dates.length ? `  ${dates[0]} → ${dates[dates.length - 1]}` : ""}`);
console.log(`  census      ${census.length} shelf walks`);
console.log(`  catalog     ${payload.scratchCatalog ? "yes" : "none"}`);
