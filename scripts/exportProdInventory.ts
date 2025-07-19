// scripts/exportProdInventory.ts

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore }        from "firebase-admin/firestore";
import { writeFileSync }       from "fs";

// 1️⃣ Init Admin SDK against prod
initializeApp({
  credential: cert(require("./prodServiceAccountKey.json")),
  projectId: "smokers-haven-inventory",
});

const db = getFirestore();

async function exportInventory() {
  // 2️⃣ Read every doc in the inventory collection
  const snap = await db.collection("inventory").get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // 3️⃣ Write to a JSON file for inspection
  writeFileSync("prodInventory.json", JSON.stringify(all, null, 2));
  console.log(`✅ Wrote ${all.length} inventory items to prodInventory.json`);
}

exportInventory().catch(err => {
  console.error("❌ Export failed:", err);
  process.exit(1);
});
