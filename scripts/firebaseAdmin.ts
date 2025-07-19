// scripts/firebaseAdmin.ts
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore }                 from "firebase-admin/firestore";
import path                            from "path";

// Choose which key to load:
const isDev = process.env.FIREBASE_ENV === "dev";
const saPath = path.resolve(
  __dirname,
  "../secrets/",
  isDev ? "dev-service-account.json" : "prod-service-account.json"
);

if (!getApps().length) {
  initializeApp({
    credential: cert(require(saPath)),
    // read your project ID from an env var (or hard‐code)
    projectId: process.env.FIREBASE_PROJECT_ID!,
  });
}

export const db = getFirestore();
