"use strict";
const admin = require("firebase-admin");

async function main() {
  if (admin.apps.length === 0) {
    // Uses ADC from: gcloud auth application-default login
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  const db = admin.firestore();

  // change "products" to "inventory" to check that collection instead
  const snap = await db.collection("products").limit(5).get();

  if (snap.empty) {
    console.log("No docs in 'products'.");
    return;
  }

  const rows = [];
  snap.forEach((doc) => {
    const d = doc.data();
    rows.push({
      id: doc.id,
      flavor: d.flavor,
      category: d.category,
      front: d.front,
      back: d.back,
      // show old fields if still present (should be undefined after migration)
      store_old: d.store,
      home_old: d.home,
      expiryDate: d.expiryDate,
    });
  });

  console.table(rows);
}

main().catch((e) => {
  console.error("Verify failed:", e);
  process.exit(1);
});
