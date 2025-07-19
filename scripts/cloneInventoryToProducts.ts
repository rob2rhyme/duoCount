// scripts/cloneInventoryToProducts.ts

import { db } from "./firebaseAdmin";

async function cloneInventoryToProducts() {
  console.log("🔍 Fetching all docs from 'inventory'...");
  const invSnap = await db.collection("inventory").get();

  if (invSnap.empty) {
    console.log("⚠️ No documents found in 'inventory'. Skipping clone.");
    return;
  }

  console.log(`🔄 Cloning ${invSnap.size} docs to 'products'...`);
  const batch = db.batch();

  invSnap.docs.forEach(doc => {
    const { store } = doc.data();
    batch.set(
      db.collection("products").doc(doc.id),
      {
        category: doc.id,  // ensures every product has a category
        store,             // your stock count
      },
      { merge: true }
    );
  });

  await batch.commit();
  console.log("✅ Clone complete: 'products' is now in sync with 'inventory'.");
}

cloneInventoryToProducts().catch(err => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
