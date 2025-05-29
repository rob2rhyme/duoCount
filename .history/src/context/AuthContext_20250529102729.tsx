// src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";

const SESSION_DURATION_MS = 15 * 60 * 1000;

type AuthContextType = {
  isAuthenticated: boolean;
  authenticate: () => void;
  signOut: () => void;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  authenticate: () => {},
  signOut: () => {},
  loading: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // on mount: check if we have a valid session
  useEffect(() => {
    const expiresAt = Number(localStorage.getItem("auth_expires") || "0");
    if (expiresAt > Date.now()) {
      setAuthenticated(true);
    } else {
      localStorage.removeItem("auth_expires");
      setAuthenticated(false);
    }
    // we’ve now done our initial check
    setLoading(false);
  }, []);
  // whenever auth state or expiration changes, set up auto-logout timer
  useEffect(() => {
    if (!authenticated) return;

    const expiresAt = Number(localStorage.getItem("auth_expires") || "0");
    const msLeft = expiresAt - Date.now();
    if (msLeft <= 0) {
      // already expired
      signOut();
      return;
    }

    const timer = setTimeout(() => {
      signOut();
      // optionally notify user:
      // toast("Session expired, please log in again");
    }, msLeft);

    return () => clearTimeout(timer);
  }, [authenticated]);

  const authenticate = () => {
    const expiresAt = new Date().getTime() + SESSION_DURATION_MS;
    localStorage.setItem("auth_expires", `${expiresAt}`);
    setAuthenticated(true);
  };

  const signOut = () => {
    localStorage.removeItem("auth_expires");
    setAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated: authenticated, authenticate, signOut, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
