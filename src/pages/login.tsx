// pages/login.tsx

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

import { db, auth } from "@/utils/firebase";
import { appConfig } from "@/config/app.config";
import { doc, getDoc } from "firebase/firestore";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from "firebase/auth";

declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier;
  }
}

export default function Login() {
  const [phones, setPhones] = useState<{ id: string; phone: string }[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const router = useRouter();

  // 1) Load single phoneAuth/store document
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "phoneAuth", "store"));
        const data = snap.data() as { phone: string | number };

        if (data?.phone) {
          const phoneStr =
            typeof data.phone === "number" ? data.phone.toString() : data.phone;
          const list = [{ id: "store", phone: phoneStr }];
          setPhones(list);
          sendCode(phoneStr);
        } else {
          throw new Error("Phone number not found.");
        }
      } catch (e) {
        console.error(e);
        setError("Failed to load phone options.");
      }
    })();
  }, []);

  // 2) Initialize reCAPTCHA
  useEffect(() => {
    if (!confirmation) {
      try {
        window.recaptchaVerifier = new RecaptchaVerifier(
          auth,
          "recaptcha-container",
          { size: "invisible" }
        );
        window.recaptchaVerifier.render().catch(console.error);
      } catch (e) {
        console.error("reCAPTCHA init error", e);
      }
    }
  }, [confirmation]);

  // 3) Send OTP
  const sendCode = async (rawPhone?: string) => {
    setError("");
    setSending(true);

    const phoneRaw = rawPhone || phones[0]?.phone;
    if (!phoneRaw) {
      setError("No phone configured.");
      setSending(false);
      return;
    }

    let phoneNumber = phoneRaw.trim();
    if (!phoneNumber.startsWith("+")) {
      phoneNumber = "+" + phoneNumber;
    }

    try {
      const result = await signInWithPhoneNumber(
        auth,
        phoneNumber,
        window.recaptchaVerifier
      );
      setConfirmation(result);
    } catch (e: any) {
      console.error(e);
      setError("Error sending OTP: " + e.message);
    } finally {
      setSending(false);
    }
  };

  // 4) Confirm OTP and redirect
  const verifyCode = async () => {
    if (!confirmation) return;
    try {
      await confirmation.confirm(code);
      localStorage.setItem("loginTimestamp", Date.now().toString());
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
        <title>Sign in – {appConfig.appName}</title>
      </Head>
      <div className="overlay">
        <div className="modal">
          <img
            src={appConfig.logoSrc}
            alt={`${appConfig.appName} logo`}
            className="logo"
          />
          <h2 className="brand">{appConfig.appName}</h2>
          <p className="tagline">{appConfig.tagline}</p>
          {!confirmation ? (
            <>
              <p>
                {sending
                  ? "Sending code…"
                  : "We’ve sent you a 6-digit code. Didn’t get it?"}
              </p>
              <button onClick={() => sendCode()} disabled={sending}>
                {sending ? "…" : "Resend Code"}
              </button>
            </>
          ) : (
            <>
              <p>Enter the 6-digit code:</p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                maxLength={6}
                placeholder="••••••"
              />
              <button onClick={verifyCode}>Verify Code</button>
            </>
          )}

          {error && <p className="error">{error}</p>}
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
        button[disabled] {
          opacity: 0.6;
          cursor: default;
        }
        button:hover:not([disabled]) {
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
        .brand {
          margin: 0 0 0.25rem;
          font-size: 1.4rem;
          color: #1a202c;
        }
        .tagline {
          margin: 0 0 1.25rem;
          color: #718096;
          font-size: 0.95rem;
        }
      `}</style>
    </>
  );
}
