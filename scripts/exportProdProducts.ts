// scripts/exportProdProducts.ts
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore }        from "firebase-admin/firestore";
import { writeFileSync }       from "fs";
import { resolve }             from "path";

// 1️⃣ Init against prod Firestore
initializeApp({
  credential: cert(require("./prodServiceAccountKey.json")),
  projectId: "smokers-haven-inventory",
});

const db = getFirestore();

async function exportProducts() {
  const snap = await db.collection("products").get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  writeFileSync("prodProducts.json", JSON.stringify(all, null, 2));
  console.log(`✅ Wrote ${all.length} products to prodProducts.json`);
}

exportProducts().catch(err => {
  console.error("❌ Export failed:", err);
  process.exit(1);
});
