"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithCustomToken, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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
