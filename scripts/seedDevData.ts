// scripts/seedDevData.ts
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore }         from "firebase-admin/firestore";
import path                     from "path";

async function seedDevData() {
  // — prod app
  const prodApp = initializeApp(
    {
      credential: cert(
        require(path.resolve(__dirname, "../secrets/prod-service-account.json"))
      ),
      projectId: "smokers-haven-inventory",
    },
    "prod"
  );
  const prodDb = getFirestore(prodApp);

  // — dev app
  const devApp = initializeApp(
    {
      credential: cert(
        require(path.resolve(__dirname, "../secrets/dev-service-account.json"))
      ),
      projectId: "smokers-haven-inventory-dev",
    },
    "dev"
  );
  const devDb = getFirestore(devApp);

  // 1️⃣ Copy products
  console.log("🔍 Fetching all docs from PROD `products`...");
  const prodProducts = await prodDb.collection("products").get();
  console.log(`   → Found ${prodProducts.size} product(s).`);
  if (!prodProducts.empty) {
    const b1 = devDb.batch();
    prodProducts.docs.forEach(doc =>
      b1.set(devDb.collection("products").doc(doc.id), doc.data(), { merge: true })
    );
    await b1.commit();
    console.log(`✅ Seeded ${prodProducts.size} product(s) into DEV.`);
  }

  // 2️⃣ Copy categories (optional, but keeps dev in sync)
  console.log("🔍 Fetching all docs from PROD `categories`...");
  const prodCats = await prodDb.collection("categories").get();
  console.log(`   → Found ${prodCats.size} category(ies).`);
  if (!prodCats.empty) {
    const b2 = devDb.batch();
    prodCats.docs.forEach(doc =>
      b2.set(devDb.collection("categories").doc(doc.id), doc.data(), { merge: true })
    );
    await b2.commit();
    console.log(`✅ Seeded ${prodCats.size} category(ies) into DEV.`);
  }
}

seedDevData().catch(err => {
  console.error("❌ Failed to seed dev data:", err);
  process.exit(1);
});
