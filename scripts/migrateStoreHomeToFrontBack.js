/**
 * scripts/migrateStoreHomeToFrontBack.js
 * store -> front, home -> back (BulkWriter, retries, numeric coercion)
 * DRY RUN: DRY_RUN=1 node scripts/migrateStoreHomeToFrontBack.js
 */
"use strict";

const admin = require("firebase-admin");

const DRY_RUN = process.env.DRY_RUN === "1";
const COLLECTIONS = ["products", "inventory"];

function toNumber(v, fallback = 0) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

async function main() {
  // Prefer ADC from `gcloud auth application-default login`
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  const db = admin.firestore();
  const writer = DRY_RUN ? null : db.bulkWriter();
  if (writer) {
    writer.onWriteError((err) => {
      if (err.failedAttempts < 5) {
        console.warn(`Retrying write (attempt ${err.failedAttempts + 1}): ${err.message}`);
        return true;
      }
      console.error("Write failed permanently:", err.message);
      return false;
    });
  }

  let totalScanned = 0, totalChanged = 0, totalQueued = 0;

  for (const col of COLLECTIONS) {
    console.log(`🔎 Scanning "${col}"…`);
    const snap = await db.collection(col).get();
    totalScanned += snap.size;

    let changed = 0, queued = 0;
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};

      const hasStore = typeof data.store !== "undefined";
      const hasHome  = typeof data.home  !== "undefined";
      const hasFront = typeof data.front !== "undefined";
      const hasBack  = typeof data.back  !== "undefined";

      const desiredFront = toNumber(hasFront ? data.front : data.store, 0);
      const desiredBack  = toNumber(hasBack  ? data.back  : data.home,  0);

      const frontNeeds = !hasFront || toNumber(data.front, 0) !== desiredFront;
      const backNeeds  = !hasBack  || toNumber(data.back,  0) !== desiredBack;

      const needsAny = frontNeeds || backNeeds || hasStore || hasHome;
      if (!needsAny) return;

      const update = {};
      if (frontNeeds) update.front = desiredFront;
      if (backNeeds)  update.back  = desiredBack;
      if (hasStore)   update.store = admin.firestore.FieldValue.delete();
      if (hasHome)    update.home  = admin.firestore.FieldValue.delete();

      changed++;
      if (DRY_RUN) {
        console.log(`DRY_RUN ${col}/${doc.id} ->`, update);
      } else {
        writer.set(doc.ref, update, { merge: true });
        queued++;
      }
    });

    totalChanged += changed;
    totalQueued  += queued;
    console.log(`🧮 ${col}: scanned=${snap.size}, changed=${changed}${DRY_RUN ? "" : `, queued=${queued}`}`);
  }

  if (!DRY_RUN && writer) await writer.close();
  console.log(`✅ Done. scanned=${totalScanned}, changed=${totalChanged}${DRY_RUN ? " (dry-run)" : `, queued=${totalQueued}`}`);
}

main().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});
