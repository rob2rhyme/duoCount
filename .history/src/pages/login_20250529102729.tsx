// pages/login.tsx
import { useState } from "react";
import { useRouter } from "next/router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { useAuth } from "@/context/AuthContext";
import Head from "next/head";

export default function Login() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const { authenticate } = useAuth();

  const handleLogin = async () => {
    const snap = await getDoc(doc(db, "pinAuth", "userPin"));
    if (snap.exists()) {
      const data = snap.data();
      if (data.pin === pin && data.isValid) {
        if (confirm("Confirm sign in?")) {
          authenticate();
          const next = router.query.next || "/";
          router.push(next as string);
        }
      } else {
        setError("Invalid PIN");
      }
    }
  };

  return (
    <>
      <Head>
        <title>Login - Smokers Haven</title>
      </Head>
      <div className="overlay">
        <div className="modal">
          <img src="/logo.png" alt="Logo" className="logo" />
          <h2>Enter 6-digit PIN</h2>
          <input
            inputMode="numeric" // ✅ triggers number keypad
            pattern="[0-9]*"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={6}
            placeholder="••••••"
          />
          <button onClick={handleLogin}>Login</button>
          {error && <p className="error">{error}</p>}
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
