// Import a demo-seed.json (from gen-demo-seed.mjs) into a vendor's Firestore.
//
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/import-demo-seed.mjs <vendorId> [demo-seed.json]
//
// Writes every doc under vendors/<vendorId>/<collection>/<docId> with
// { seed: true }, and entry comments under .../entries/<id>/comments/<cid>.
// The seed flag means the app's owner-only "Clear demo data" removes exactly
// what this wrote. Re-importing overwrites by id (idempotent).
//
// Uses Application Default Credentials — point GOOGLE_APPLICATION_CREDENTIALS
// at a Firebase service-account key (service-account*.json is git-ignored).

import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const [vendorId, path = "demo-seed.json"] = process.argv.slice(2);
if (!vendorId) {
  console.error("Usage: node scripts/import-demo-seed.mjs <vendorId> [demo-seed.json]");
  process.exit(1);
}

// Restore Dates tagged by the generator ({ __ts__: ISO } -> Date).
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === "object") {
    if (typeof v.__ts__ === "string") return new Date(v.__ts__);
    const o = {};
    for (const k in v) o[k] = revive(v[k]);
    return o;
  }
  return v;
}

const { collections } = JSON.parse(readFileSync(path, "utf8"));

admin.initializeApp(); // Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS)
const db = admin.firestore();
const vRef = db.collection("vendors").doc(vendorId);

// The demo set is well under Firestore's 500-write batch limit, but chunk to be safe.
let batch = db.batch();
let pending = 0;
const counts = {};
async function put(ref, data) {
  batch.set(ref, { ...revive(data), seed: true });
  if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
}

for (const [coll, docs] of Object.entries(collections)) {
  counts[coll] = 0;
  for (const [docId, raw] of Object.entries(docs)) {
    const { comments, ...fields } = raw;
    await put(vRef.collection(coll).doc(docId), fields);
    counts[coll]++;
    if (comments) {
      for (const [cid, c] of Object.entries(comments)) {
        await put(vRef.collection("entries").doc(docId).collection("comments").doc(cid), c);
      }
    }
  }
}
if (pending) await batch.commit();

console.log(`Imported demo data into vendors/${vendorId}`);
console.table(counts);
console.log('To remove it later: sign in as the vendor owner and use Admin -> "Clear demo data".');
