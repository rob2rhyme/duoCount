// scripts/clearProducts.ts

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore }        from "firebase-admin/firestore";

// 1️⃣ Initialize Admin SDK with your prod key and projectId
initializeApp({
  credential: cert(require("./prodServiceAccountKey.json")),
  projectId: "smokers-haven-inventory",
});

const db = getFirestore();

async function clear() {
  // 2️⃣ Fetch all docs in 'products'
  const snap = await db.collection("products").get();
  if (snap.empty) {
    console.log("✅ No docs to delete in 'products'.");
    return;
  }

  // 3️⃣ Batch-delete them
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  console.log(`🗑️  Deleted ${snap.size} docs from 'products'.`);
}

clear().catch(err => {
  console.error("❌ Failed to clear products:", err);
  process.exit(1);
});
