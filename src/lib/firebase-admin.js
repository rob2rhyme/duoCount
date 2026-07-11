// Server-only Firebase Admin SDK (used by API routes).
// Lazily initialized so `next build` succeeds without credentials.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set. See README.");
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json);
}

export function getAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert(credentials()) });
  }
  return { adminDb: getFirestore(), adminAuth: getAuth() };
}
