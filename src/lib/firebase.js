import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app);
export const auth = getAuth(app);
