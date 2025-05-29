// pages/login.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/utils/firebase";

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<"PHONE" | "OTP">("PHONE");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null
  );
  const [error, setError] = useState("");

  // on mount: set up invisible reCAPTCHA
  useEffect(() => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        "recaptcha-container",
        { size: "invisible" },
        auth
      );
    }
  }, []);

  // step 1: send OTP
  const sendOtp = async () => {
    setError("");
    try {
      const appVerifier = window.recaptchaVerifier;
      const result = await signInWithPhoneNumber(auth, phone, appVerifier);
      setConfirmation(result);
      setStep("OTP");
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to send OTP");
    }
  };

  // step 2: verify OTP
  const verifyOtp = async () => {
    if (!confirmation) return;
    setError("");
    try {
      await confirmation.confirm(otp);
      // on success, Firebase auth state changes → you can redirect
      const next = (router.query.next as string) || "/";
      router.push(next);
    } catch (e: any) {
      console.error(e);
      setError("Invalid code, please try again");
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
          {step === "PHONE" ? (
            <>
              <h2>Enter your phone number</h2>
              <input
                type="tel"
                inputMode="tel"
                placeholder="+1 555 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button onClick={sendOtp}>Send OTP</button>
            </>
          ) : (
            <>
              <h2>Enter the 6-digit code</h2>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <button onClick={verifyOtp}>Verify & Sign In</button>
            </>
          )}

          {error && <p className="error">{error}</p>}

          {/* Invisible reCAPTCHA container */}
          <div id="recaptcha-container"></div>
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
          background: white;
          border-radius: 16px;
          padding: 2rem;
          width: 90%;
          max-width: 400px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          text-align: center;
        }
        h2 {
          margin-bottom: 1rem;
        }
        input {
          width: 100%;
          padding: 0.75rem;
          font-size: 1.25rem;
          text-align: center;
          border-radius: 8px;
          border: 1px solid #ccc;
          margin-bottom: 1rem;
        }
        button {
          background: #3182ce;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-size: 1rem;
          cursor: pointer;
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
          height: auto;
          margin-bottom: 1rem;
          border-radius: 8px;
        }
      `}</style>
    </>
  );
}
