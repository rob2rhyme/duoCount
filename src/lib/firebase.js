import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore, initializeFirestore, connectFirestoreEmulator,
  persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { emulatorConfig } from "./emulator.js";

// Read as literal process.env.NEXT_PUBLIC_* expressions so Next inlines them
// into the client bundle — a dynamic lookup would not be substituted, and the
// browser would see undefined.
//
// The redundant-looking `=== "1"` in front of the call is what actually gets
// this removed from a production bundle. Next substitutes the flag, but
// emulatorConfig() is an opaque call the minifier cannot fold, so on its own
// it would leave the connect branch in the shipped JS — inert, but present.
// Comparing the inlined value first gives the minifier `false ? … : null`,
// which it folds to null and then drops the whole `if (EMU)` block. Verified
// by grepping .next/static for the log line below; see README.
const EMU = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1"
  ? emulatorConfig({
      flag: process.env.NEXT_PUBLIC_FIREBASE_EMULATOR,
      firestore: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
      auth: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    })
  : null;

// NEXT_PUBLIC_ values are inlined at build time, and prerendering "/"
// imports this module — so a build without them (CI, or Vercel before the
// env vars are configured) must not throw here. The placeholders keep the
// build green; the running app still needs the real values to sign in.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "firebase-env-not-set",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "env-not-set.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "env-not-set",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "env-not-set.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "0",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:0:web:0",
};

const app = getApps().length ? getApp() : initializeApp(
  EMU ? { ...firebaseConfig, projectId: EMU.projectId } : firebaseConfig,
);

// Offline-first reads: cache snapshots in IndexedDB so a RETURNING user sees
// their last data instantly on load (then it syncs live in the background),
// instead of staring at a spinner while the first snapshot round-trips the
// network. Browser-only — IndexedDB doesn't exist during SSR/prerender — and
// multi-tab so several open tabs stay consistent. Falls back to the default
// (memory) cache if persistence can't start (private mode, quota, or a
// Fast-Refresh re-init where Firestore was already started).
function makeDb() {
  if (typeof window === "undefined") return getFirestore(app);
  if (EMU) return getFirestore(app); // see connect() — no IndexedDB while emulating
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
}

export const db = makeDb();
export const auth = getAuth(app);

// Both connect() calls must land before the first read/write, which is why
// this runs at module scope rather than behind a helper someone might forget
// to call. Persistence is deliberately off above: the emulator starts empty on
// every boot, so a surviving IndexedDB cache would serve documents the backend
// no longer has and make a clean run look dirty.
if (EMU) {
  connectFirestoreEmulator(db, EMU.firestore.host, EMU.firestore.port);
  connectAuthEmulator(auth, `http://${EMU.auth.host}:${EMU.auth.port}`, { disableWarnings: true });
  if (typeof console !== "undefined") {
    console.info(
      `[firebase] emulator mode: firestore ${EMU.firestore.host}:${EMU.firestore.port}, ` +
      `auth ${EMU.auth.host}:${EMU.auth.port}, project ${EMU.projectId}`,
    );
  }
}
