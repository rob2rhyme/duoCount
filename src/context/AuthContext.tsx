// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/utils/firebase";
import { appConfig } from "@/config/app.config";
import {
  Permission,
  Role,
  hasPermission,
  isRole,
} from "@/utils/permissions";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  /** Current user's role, or null when signed out. */
  role: Role | null;
  /** True if the current role is allowed to perform `permission`. */
  can: (permission: Permission) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Session lifetime in milliseconds, driven by app.config.ts. */
const SESSION_MS = appConfig.sessionTimeoutMinutes * 60 * 1000;
const TIMESTAMP_KEY = "loginTimestamp";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = async () => {
    localStorage.removeItem(TIMESTAMP_KEY);
    await firebaseSignOut(auth);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
        // Look up the user's role. Fall back to the configured default role
        // when no `users/{uid}` document exists yet.
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          const stored = snap.exists() ? snap.data().role : null;
          setRole(isRole(stored) ? stored : appConfig.auth.defaultRole);
        } catch {
          setRole(appConfig.auth.defaultRole);
        }
      } else {
        setRole(null);
      }

      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Enforce the configured session timeout: sign the user out once the
  // login timestamp is older than SESSION_MS. Checked on mount, on an
  // interval, and whenever the tab regains focus.
  useEffect(() => {
    const checkExpiry = () => {
      const ts = Number(localStorage.getItem(TIMESTAMP_KEY) || 0);
      if (ts && Date.now() - ts > SESSION_MS) {
        signOut();
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 30 * 1000);
    window.addEventListener("focus", checkExpiry);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkExpiry);
    };
  }, []);

  const can = (permission: Permission) => hasPermission(role, permission);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        role,
        can,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
