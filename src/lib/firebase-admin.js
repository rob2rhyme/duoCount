// Server-only Firebase Admin SDK (used by API routes).
//
// The SDK is imported *dynamically inside* getAdmin() rather than at the
// module top level on purpose: if firebase-admin (or one of its native/gRPC
// dependencies) fails to load in the deployed serverless function, a top-level
// import would crash the function at cold start — before the route handler's
// try/catch runs — and Vercel would serve an opaque HTML 500. Importing it
// here, inside a function every route calls from within its try/catch, turns
// that same failure into a catchable error the route can return as a readable
// JSON message. getAdmin() is therefore async; every caller awaits it.
function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set. See README.");
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json);
}

export async function getAdmin() {
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");
  if (!getApps().length) {
    initializeApp({ credential: cert(credentials()) });
  }
  return { adminDb: getFirestore(), adminAuth: getAuth() };
}
