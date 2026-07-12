"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithCustomToken, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { fetchJson } from "@/lib/api";

const Ctx = createContext(null);
export const useSession = () => useContext(Ctx);

export default function SessionProvider({ children }) {
  const [profile, setProfile] = useState(null); // {id, name, role, locationId}
  const [vendor, setVendor] = useState(null);   // {id, name, slug, logoUrl, sharingMode}
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setProfile(null); setVendor(null); setReady(true); return; }
      try {
        const { claims } = await u.getIdTokenResult();
        const { vendorId, userId } = claims;
        const [vSnap, pSnap] = await Promise.all([
          getDoc(doc(db, "vendors", vendorId)),
          getDoc(doc(db, "vendors", vendorId, "users", userId)),
        ]);
        if (!vSnap.exists() || !pSnap.exists() || pSnap.data().active === false) {
          await signOut(auth); setProfile(null); setVendor(null);
        } else {
          setVendor({ id: vSnap.id, ...vSnap.data() });
          // Rules key off token claims, so role/location changes take effect
          // after the next sign-in; show the fresh profile data regardless.
          setProfile({ id: pSnap.id, ...pSnap.data(), claims });
        }
      } catch (e) {
        console.error("session restore failed", e);
        setProfile(null); setVendor(null);
      }
      setReady(true);
    });
    return () => unsub();
  }, []);

  // While signed in, watch our own user doc live. Role and active-state are
  // frozen in the token at sign-in, so a mid-session deactivation or demotion
  // wouldn't otherwise take effect until the next sign-in. If we're deactivated
  // or our role changed, force a sign-out — the next sign-in mints fresh claims
  // (or bounces a disabled account). This is the client half of the H2 guard;
  // the Firestore rules (liveActive) already ban a deactivated user's writes
  // server-side, so a stale token can't act even before this fires.
  const cVendorId = profile?.claims?.vendorId;
  const cUserId = profile?.claims?.userId;
  const cRole = profile?.claims?.role;
  useEffect(() => {
    if (!cVendorId || !cUserId) return;
    const ref = doc(db, "vendors", cVendorId, "users", cUserId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return; // user deletion isn't a supported flow
        const d = snap.data();
        if (d.active === false || d.role !== cRole) signOut(auth);
      },
      () => {}, // transient listen errors: the next auth cycle re-checks
    );
    return () => unsub();
  }, [cVendorId, cUserId, cRole]);

  async function login(storeCode, pin) {
    const j = await fetchJson("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeCode, pin }),
    });
    if (!j.token) throw new Error("Sign-in failed — the server didn't return a session token. Please try again.");
    await signInWithCustomToken(auth, j.token);
    setVendor(j.vendor); setProfile(j.profile);
  }

  async function signup(payload) {
    const j = await fetchJson("/api/auth/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!j.token) throw new Error("Sign-up failed — the server didn't return a session token. Please try again.");
    await signInWithCustomToken(auth, j.token);
    setVendor(j.vendor); setProfile(j.profile);
    return j.vendor;
  }

  const logout = () => signOut(auth);

  const isManager = profile && ["manager", "owner"].includes(profile.role);
  const isOwner = profile?.role === "owner";

  return (
    <Ctx.Provider value={{ profile, vendor, ready, login, signup, logout, isManager, isOwner, setVendor }}>
      {children}
    </Ctx.Provider>
  );
}
