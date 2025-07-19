// scripts/countDocs.ts

import { initializeApp, cert, getApp } from "firebase-admin/app";
import { getFirestore }        from "firebase-admin/firestore";

// 1️⃣ Initialize with both credential and projectId
initializeApp({
  credential: cert(require("./prodServiceAccountKey.json")),
  projectId: "smokers-haven-inventory",    // ← explicitly set this
});

// 2️⃣ Now app.options.projectId will be populated
const app = getApp();
console.log("🔑 Using project:", app.options.projectId);

// 3️⃣ Firestore client
const db = getFirestore();

async function countCollections() {
  const invSnap  = await db.collection("inventory").get();
  console.log(`Inventory: ${invSnap.size} docs`);

  const prodSnap = await db.collection("products").get();
  console.log(`Products : ${prodSnap.size} docs`);
}

countCollections().catch(err => {
  console.error("❌ Error counting docs:", err);
  process.exit(1);
});
