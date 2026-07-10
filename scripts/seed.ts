// scripts/seed.ts
// ---------------------------------------------------------------------------
// Seeds a Firestore project with the demo catalogue in data/sample-inventory.json
// so you get a working app to explore immediately.
//
// Usage:
//   1. Create a service-account key (Firebase console → Project settings →
//      Service accounts → "Generate new private key"). Save it OUTSIDE the
//      repo, e.g. ./secrets/service-account.json  (the /secrets folder is
//      git-ignored). NEVER commit this file.
//   2. Point GOOGLE_APPLICATION_CREDENTIALS at it (see .env.example), then run:
//        npm run seed
//
// Optional: set LOGIN_PHONE to a phone number you own (E.164, e.g. +15551234567)
// to also seed the phoneAuth/store document used by the OTP login screen.
// ---------------------------------------------------------------------------
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import path from "path";

interface SeedCategory {
  name: string;
  filterType: string;
  imageUrl?: string;
}
interface SeedProduct {
  category: string;
  flavor: string;
  front: number;
  back: number;
  expiryDate: string;
}
interface SeedFile {
  categories: SeedCategory[];
  products: SeedProduct[];
}

function resolveCredential() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath) {
    // Support both absolute and repo-relative paths.
    const abs = path.isAbsolute(keyPath)
      ? keyPath
      : path.resolve(process.cwd(), keyPath);
    return cert(abs);
  }
  // Falls back to gcloud application-default credentials if configured.
  return applicationDefault();
}

async function seed() {
  initializeApp({ credential: resolveCredential() });
  const db = getFirestore();

  const dataPath = path.resolve(process.cwd(), "data/sample-inventory.json");
  const data: SeedFile = JSON.parse(readFileSync(dataPath, "utf8"));

  console.log(`Seeding ${data.categories.length} categories...`);
  const catBatch = db.batch();
  data.categories.forEach((c) => {
    // Doc id = name keeps categories unique and easy to reference.
    catBatch.set(db.collection("categories").doc(c.name), c, { merge: true });
  });
  await catBatch.commit();

  console.log(`Seeding ${data.products.length} products...`);
  const prodBatch = db.batch();
  data.products.forEach((p) => {
    prodBatch.set(db.collection("products").doc(), p);
  });
  await prodBatch.commit();

  const loginPhone = process.env.LOGIN_PHONE;
  if (loginPhone) {
    await db
      .collection("phoneAuth")
      .doc("store")
      .set({ phone: loginPhone }, { merge: true });
    console.log(`Seeded login phone: ${loginPhone}`);
  } else {
    console.log(
      "Skipped phoneAuth/store (set LOGIN_PHONE=+15551234567 to seed it)."
    );
  }

  console.log("Done. Your Firestore project now has demo data.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
