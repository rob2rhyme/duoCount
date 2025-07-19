// scripts/listUniqueCategories.ts

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore }        from "firebase-admin/firestore";

// point at prod Firestore
initializeApp({
  credential: cert(require("./prodServiceAccountKey.json")),
  projectId: "smokers-haven-inventory",
});

const db = getFirestore();

async function listCats() {
  const snap = await db.collection("products").get();
  const cats = new Set<string>();
  snap.docs.forEach(d => {
    const c = d.data().category as string | undefined;
    if (c) cats.add(c);
  });
  console.log("🔍 Unique categories in products:\n", [...cats].sort().join("\n"));
}

listCats().catch(console.error);
