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
// A misconfigured server is the single most common reason a fresh deployment
// can't sign anyone in, and it used to surface as a bare "Signup failed." —
// the routes only forward a message when the error carries `.status`, and
// these threw plain Errors. Typing them turns an opaque 500 into a sentence
// that names the fix. Deliberately says nothing about the project itself (no
// project id, no key contents): "this deployment isn't configured" is safe to
// show, the configuration is not.
function configError(code, message) {
  const e = new Error(message);
  e.status = 500;
  e.code = code;
  return e;
}

function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw configError("config_missing",
      "This deployment has no Firebase service-account key set. See the README setup steps.");
  }
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw configError("config_unparseable",
      "The Firebase service-account key on this deployment isn't valid JSON. Paste the whole file on one line, or base64-encode it.");
  }
  // cert() would otherwise fail deeper with a less obvious message. These are
  // the three fields it actually requires.
  for (const field of ["project_id", "client_email", "private_key"]) {
    if (!parsed?.[field]) {
      throw configError("config_incomplete",
        `The Firebase service-account key on this deployment is missing "${field}". Re-download it from Project settings → Service accounts.`);
    }
  }
  return parsed;
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
