// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { auth } from "@/utils/firebase";
import { appConfig } from "@/config/app.config";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
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
  const [loading, setLoading] = useState(true);

  const signOut = async () => {
    localStorage.removeItem(TIMESTAMP_KEY);
    await firebaseSignOut(auth);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
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
