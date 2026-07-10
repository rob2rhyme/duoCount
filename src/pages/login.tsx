// pages/login.tsx

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

import { db, auth } from "@/utils/firebase";
import { appConfig } from "@/config/app.config";
import { useTheme } from "@/context/ThemeContext";
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
  const { theme, cycle } = useTheme();
  const themeIcon =
    theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥️";

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
        <button className="themeBtn" onClick={cycle} title="Change theme">
          {themeIcon}
        </button>
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
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem;
          background: radial-gradient(
              1100px 520px at 50% -10%,
              var(--primary-soft),
              transparent 70%
            ),
            linear-gradient(160deg, var(--header-bg), var(--bg) 55%);
          z-index: 1000;
        }
        .themeBtn {
          position: absolute;
          top: 1rem;
          right: 1rem;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 1.05rem;
          cursor: pointer;
          box-shadow: var(--shadow-sm);
        }
        .modal {
          background: var(--surface);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 2.25rem 2rem;
          width: 100%;
          max-width: 400px;
          text-align: center;
          box-shadow: var(--shadow-lg);
        }
        input[type="text"] {
          width: 100%;
          padding: 0.8rem;
          font-size: 1.4rem;
          letter-spacing: 0.35em;
          text-align: center;
          margin-bottom: 1rem;
        }
        button {
          background: var(--primary);
          color: var(--primary-contrast);
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: var(--radius);
          cursor: pointer;
          font-size: 1rem;
          font-weight: 600;
          margin-top: 0.5rem;
          transition: filter var(--transition);
        }
        button[disabled] {
          opacity: 0.6;
          cursor: default;
        }
        button:hover:not([disabled]) {
          filter: brightness(1.06);
        }
        .error {
          color: var(--danger);
          margin-top: 1rem;
          font-size: 0.9rem;
        }
        .logo {
          max-width: 96px;
          margin-bottom: 1rem;
          border-radius: 12px;
        }
        .brand {
          margin: 0 0 0.25rem;
          font-size: 1.5rem;
          font-family: var(--font-display, var(--font-sans));
          color: var(--text);
        }
        .tagline {
          margin: 0 0 1.5rem;
          color: var(--text-muted);
          font-size: 0.95rem;
        }
        p {
          color: var(--text-secondary);
        }
      `}</style>
    </>
  );
}
