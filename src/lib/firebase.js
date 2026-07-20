import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore, initializeFirestore,
  persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Offline-first reads: cache snapshots in IndexedDB so a RETURNING user sees
// their last data instantly on load (then it syncs live in the background),
// instead of staring at a spinner while the first snapshot round-trips the
// network. Browser-only — IndexedDB doesn't exist during SSR/prerender — and
// multi-tab so several open tabs stay consistent. Falls back to the default
// (memory) cache if persistence can't start (private mode, quota, or a
// Fast-Refresh re-init where Firestore was already started).
function makeDb() {
  if (typeof window === "undefined") return getFirestore(app);
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
