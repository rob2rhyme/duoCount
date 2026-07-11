"use client";
import { useState } from "react";
import { useSession } from "./SessionProvider";
import { PRODUCT } from "@/lib/store";
import { PIN_LENGTH, isValidNewPin } from "@/lib/pin";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function PinLogin() {
  const { login, signup } = useSession();
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [createdSlug, setCreatedSlug] = useState("");

  // login fields
  const [storeCode, setStoreCode] = useState("");
  const [pin, setPin] = useState("");
  // signup fields — prefilled for the first store, Smokers Haven
  const [bizName, setBizName] = useState("Smokers Haven");
  const [logoUrl, setLogoUrl] = useState("https://sh.rob2rhyme.app/smoke-shop-logo.svg");
  const [ownerName, setOwnerName] = useState("");
  const [newPin, setNewPin] = useState("");

  async function doLogin() {
    setErr(""); setBusy(true);
    try { await login(storeCode, pin); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function doSignup() {
    setErr(""); setBusy(true);
    try {
      const vendor = await signup({ businessName: bizName, logoUrl, ownerName, pin: newPin });
      setCreatedSlug(vendor.slug);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className="card w-full max-w-sm p-7">
        <div className="flex items-center gap-3 mb-6">
          <Logo size={40} />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">{PRODUCT.name}</h1>
            <p className="text-xs text-muted">{PRODUCT.tagline}</p>
          </div>
          <ThemeToggle className="ml-auto flex-shrink-0" />
        </div>

        {mode === "login" ? (
          <>
            <label className="label">Store code</label>
            <input className="input mb-4 font-mono lowercase" value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)} placeholder="smokers-haven" autoFocus />
            <label className="label">Your PIN</label>
            <input className="input text-center text-2xl tracking-[0.4em] font-mono"
              inputMode="numeric" maxLength={6} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="••••" />
            {err && <p className="text-sm text-neg mt-3">{err}</p>}
            <button className="btn-primary mt-5" disabled={busy || pin.length < 4 || !storeCode.trim()} onClick={doLogin}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button className="w-full text-sm text-muted underline underline-offset-2 mt-4"
              onClick={() => { setMode("signup"); setErr(""); }}>
              New business? Register your store
            </button>
            <p className="text-xs text-muted mt-4 leading-relaxed">
              Your store code comes from whoever set up your business. Ask a manager if you don't have it.
            </p>
          </>
        ) : (
          <>
            <label className="label">Business name</label>
            <input className="input mb-4" value={bizName} onChange={(e) => setBizName(e.target.value)} />
            <label className="label">Logo URL (optional)</label>
            <input className="input mb-4" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.svg" />
            <label className="label">Your name (owner)</label>
            <input className="input mb-4" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Jordan P." />
            <label className="label">Choose your PIN ({PIN_LENGTH} digits)</label>
            <input className="input text-center text-xl tracking-[0.3em] font-mono"
              inputMode="numeric" maxLength={PIN_LENGTH} value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            {err && <p className="text-sm text-neg mt-3">{err}</p>}
            <button className="btn-primary mt-5" disabled={busy || !isValidNewPin(newPin)} onClick={doSignup}>
              {busy ? "Creating…" : "Create business & sign in"}
            </button>
            <button className="w-full text-sm text-muted underline underline-offset-2 mt-4"
              onClick={() => { setMode("login"); setErr(""); }}>
              Already registered? Sign in
            </button>
            <p className="text-xs text-muted mt-4 leading-relaxed">
              You'll get a store code to share with staff. You'll be the owner and can add locations, drawers, and staff in Admin.
            </p>
          </>
        )}

        {createdSlug && (
          <div className="mt-4 text-sm bg-highlight border border-brass/40 rounded-lg p-3">
            Store created. Your store code is <b className="font-mono">{createdSlug}</b> — share it with staff so they can sign in.
          </div>
        )}
      </div>
    </div>
  );
}
