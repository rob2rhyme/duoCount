// src/pages/login.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { auth, makeRecaptcha } from "../lib/firebase";
import { signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);

  // set up reCAPTCHA only once
  useEffect(() => {
    makeRecaptcha();
  }, []);

  const sendOtp = async () => {
    setLoading(true);
    try {
      const appVerifier = auth!.recaptchaVerifier!;
      const confirmation = await signInWithPhoneNumber(
        auth,
        phone,
        appVerifier
      );
      setConfirm(confirmation);
      setStep("code");
    } catch (err) {
      console.error(err);
      alert("Failed to send OTP. Check your phone number.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!confirm) return;
    setLoading(true);
    try {
      await confirm.confirm(code);
      router.replace("/"); // redirect to home on success
    } catch (err) {
      console.error(err);
      alert("Invalid code, please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto p-4">
      {step === "phone" ? (
        <>
          <h2>Enter your phone</h2>
          <input
            type="tel"
            placeholder="+1···"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border p-2 w-full"
          />
          <button
            onClick={sendOtp}
            disabled={loading || !phone}
            className="mt-2 bg-blue-500 text-white px-4 py-2"
          >
            Send OTP
          </button>
          <div id="recaptcha-container" />
        </>
      ) : (
        <>
          <h2>Enter the code</h2>
          <input
            type="text"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="border p-2 w-full"
          />
          <button
            onClick={verifyCode}
            disabled={loading || !code}
            className="mt-2 bg-green-500 text-white px-4 py-2"
          >
            Verify & Sign In
          </button>
        </>
      )}
    </div>
  );
}
