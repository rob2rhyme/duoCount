// pages/login.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

import { db, auth } from "@/utils/firebase";
import { collection, getDocs } from "firebase/firestore";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from "firebase/auth";
import { useAuth } from "@/context/AuthContext";

declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier;
  }
}

export default function Login() {
  const [phones, setPhones] = useState<{ id: string; phone: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const router = useRouter();
  const { authenticate } = useAuth();

  // 1) Load pre-stored phone numbers
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "phoneAuth"));
        const list: typeof phones = [];
        snap.forEach((doc) => {
          const data = doc.data() as { phone: string };
          list.push({ id: doc.id, phone: data.phone });
        });
        setPhones(list);
        if (list.length) setSelectedId(list[0].id);
      } catch (e) {
        console.error(e);
        setError("Failed to load phone options.");
      }
    })();
  }, []);

  // 2) Initialize invisible reCAPTCHA **with correct arg order**
  useEffect(() => {
    if (!confirmation) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        auth, // ✅ your Auth instance first
        "recaptcha-container", // ✅ container ID second
        { size: "invisible" } // ✅ params third
      );
      window.recaptchaVerifier.render().catch(console.error);
    }
  }, [confirmation]);

  // 3) Send OTP
  const sendCode = async () => {
    setError("");
    const sel = phones.find((p) => p.id === selectedId);
    if (!sel) {
      setError("Please pick a phone number.");
      return;
    }
    try {
      const result = await signInWithPhoneNumber(
        auth,
        sel.phone,
        window.recaptchaVerifier
      );
      setConfirmation(result);
    } catch (e: any) {
      console.error(e);
      setError("Error sending OTP: " + e.message);
    }
  };

  // 4) Verify OTP
  const verifyCode = async () => {
    if (!confirmation) return;
    try {
      await confirmation.confirm(code);
      authenticate(); // your existing session hook
      const next = (router.query.next as string) || "/";
      router.push(next);
    } catch (e: any) {
      console.error(e);
      setError("Invalid code. Please try again.");
    }
  };

  return (
    <>
      <Head>
        <title>Login – Smokers Haven</title>
      </Head>

      <div className="overlay">
        <div className="modal">
          <img src="/logo.png" alt="Logo" className="logo" />
          <h2>Sign in with Phone</h2>

          {!confirmation ? (
            <>
              <p>Select your number:</p>
              {phones.map((p) => (
                <label key={p.id} className="phone-option">
                  <input
                    type="radio"
                    name="phone"
                    value={p.id}
                    checked={selectedId === p.id}
                    onChange={() => setSelectedId(p.id)}
                  />
                  xxx-xxx-{p.phone.slice(-4)}
                </label>
              ))}
              <button onClick={sendCode}>Send Code</button>
            </>
          ) : (
            <>
              <p>Enter the 6-digit code:</p>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                placeholder="••••••"
              />
              <button onClick={verifyCode}>Verify Code</button>
            </>
          )}

          {error && <p className="error">{error}</p>}

          {/* Invisible reCAPTCHA container */}
          <div id="recaptcha-container" />
        </div>
      </div>

      <style jsx>{`
        /* … your existing styles (overlay, modal, buttons, etc.) … */
      `}</style>
    </>
  );
}
