// scripts/debugProd.ts
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore }        from "firebase-admin/firestore";
import path                    from "path";

// load your freshly downloaded prod key
const keyPath = path.resolve(__dirname, "../secrets/prod-service-account.json");
const sa      = require(keyPath);
console.log("🔑 Loaded service account for project:", sa.project_id);

const app = initializeApp(
  { credential: cert(sa), projectId: sa.project_id },
  "debugProd"
);

const db = getFirestore(app);

(async () => {
  // 1) Which project are we actually talking to?
  console.log("🔥 Firestore app.options:", app.options);

  // 2) List top-level collections
  const colls = await db.listCollections();
  console.log("📂 Top-level collections:", colls.map(c => c.id));

  // 3) Inspect inventory
  const invSnap = await db.collection("inventory").get();
  console.log(`📦 Found ${invSnap.size} docs in 'inventory':`);
  invSnap.docs.forEach(d => console.log("   •", d.id));

  process.exit(0);
})();