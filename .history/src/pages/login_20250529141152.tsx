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

  // 1) Fetch all pre-stored phone docs from Firestore
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

  // 2) Initialize invisible reCAPTCHA once
  useEffect(() => {
    if (!confirmation) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        "recaptcha-container",
        { size: "invisible" },
        auth
      );
      window.recaptchaVerifier.render().catch(console.error);
    }
  }, [confirmation]);

  // 3) Send the SMS OTP
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

  // 4) Verify the code the user entered
  const verifyCode = async () => {
    if (!confirmation) return;
    try {
      await confirmation.confirm(code);
      authenticate(); // hook into your existing AuthContext
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
          {/* reCAPTCHA widget (hidden) */}
          <div id="recaptcha-container" />
        </div>
      </div>

      <style jsx>{`
        .overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal {
          background: #fff;
          border-radius: 16px;
          padding: 2rem;
          width: 90%;
          max-width: 400px;
          text-align: center;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }
        h2 {
          margin-bottom: 1rem;
        }
        .phone-option {
          display: block;
          margin: 0.5rem 0;
          font-size: 1rem;
        }
        input[type="text"] {
          width: 100%;
          padding: 0.75rem;
          font-size: 1.25rem;
          text-align: center;
          border: 1px solid #ccc;
          border-radius: 8px;
          margin-bottom: 1rem;
        }
        button {
          background: #3182ce;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1rem;
          margin-top: 0.5rem;
        }
        button:hover {
          background: #2563eb;
        }
        .error {
          color: red;
          margin-top: 1rem;
        }
        .logo {
          max-width: 120px;
          margin-bottom: 1rem;
          border-radius: 8px;
        }
      `}</style>
    </>
  );
}
