import { emulatorConfig } from "./emulator.js";

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

// Server-side view of the same switch the client reads. `vercel` is passed so
// the flag is refused outright on a deployment: NEXT_PUBLIC_* is inlined at
// build time, so a Vercel build with the flag set would otherwise ship a
// bundle pointed at a port nobody serves. Only the server can see VERCEL,
// which is why this guard lives here and not in firebase.js.
function emulator() {
  return emulatorConfig({
    flag: process.env.NEXT_PUBLIC_FIREBASE_EMULATOR,
    firestore: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
    auth: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    vercel: process.env.VERCEL,
  });
}

export async function getAdmin() {
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");
  const emu = emulator();
  if (!getApps().length) {
    if (emu) {
      // The Admin SDK routes to an emulator via these two variables and no
      // other mechanism, so set them from the one switch rather than asking
      // the operator to keep three env vars in agreement. Assigned before
      // initializeApp because the SDK reads them as it builds its clients.
      process.env.FIRESTORE_EMULATOR_HOST = `${emu.firestore.host}:${emu.firestore.port}`;
      process.env.FIREBASE_AUTH_EMULATOR_HOST = `${emu.auth.host}:${emu.auth.port}`;
      // Deliberately no credential: against an emulator there is nothing to
      // authenticate to, and passing a real service account here would be the
      // one way emulator mode could reach a real project.
      initializeApp({ projectId: emu.projectId });
    } else {
      initializeApp({ credential: cert(credentials()) });
    }
  }
  return { adminDb: getFirestore(), adminAuth: getAuth() };
}
