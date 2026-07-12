"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { useSession } from "./SessionProvider";
import { PRODUCT } from "@/lib/store";
import { PIN_LENGTH, PIN_PLACEHOLDER, isValidNewPin } from "@/lib/pin";
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
  // signup fields — the owner fills these in for their own store
  const [bizName, setBizName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [newPin, setNewPin] = useState("");
  const ids = { storeCode: useId(), pin: useId(), bizName: useId(), logoUrl: useId(), ownerName: useId(), newPin: useId() };

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
          <Logo src="/logo.png" alt="DuoCount" size={40} />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">{PRODUCT.name}</h1>
            <p className="text-xs text-muted">{PRODUCT.tagline}</p>
          </div>
          <ThemeToggle className="ml-auto flex-shrink-0" />
        </div>

        {mode === "login" ? (
          <>
            <label htmlFor={ids.storeCode} className="label">Store code</label>
            <input id={ids.storeCode} className="input mb-4 font-mono lowercase" value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)} placeholder="acme-market" autoFocus />
            <label htmlFor={ids.pin} className="label">Your PIN ({PIN_LENGTH} digits)</label>
            <input id={ids.pin} className="input text-center text-2xl tracking-[0.4em] font-mono"
              inputMode="numeric" maxLength={PIN_LENGTH} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder={PIN_PLACEHOLDER} />
            {err && <p className="text-sm text-neg mt-3">{err}</p>}
            <button className="btn-primary mt-5" disabled={busy || pin.length < PIN_LENGTH || !storeCode.trim()} onClick={doLogin}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button className="w-full text-sm text-muted underline underline-offset-2 mt-4"
              onClick={() => { setMode("signup"); setErr(""); }}>
              New business? Register your store
            </button>
            <p className="text-xs text-muted mt-4 leading-relaxed">
              Your store code comes from whoever set up your business. Ask a manager if you don&apos;t have it.
            </p>
          </>
        ) : (
          <>
            <label htmlFor={ids.bizName} className="label">Business name</label>
            <input id={ids.bizName} className="input mb-4" value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Acme Market" />
            <label htmlFor={ids.logoUrl} className="label">Logo URL (optional)</label>
            <input id={ids.logoUrl} className="input mb-4" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.svg" />
            <label htmlFor={ids.ownerName} className="label">Your name (owner)</label>
            <input id={ids.ownerName} className="input mb-4" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Jordan P." />
            <label htmlFor={ids.newPin} className="label">Choose your PIN ({PIN_LENGTH} digits)</label>
            <input id={ids.newPin} className="input text-center text-xl tracking-[0.3em] font-mono"
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
              You&apos;ll get a store code to share with staff. You&apos;ll be the owner and can add locations, drawers, and staff in Admin.
            </p>
          </>
        )}

        {createdSlug && (
          <div className="mt-4 text-sm bg-highlight border border-brass/40 rounded-lg p-3">
            Store created. Your store code is <b className="font-mono">{createdSlug}</b> — share it with staff so they can sign in.
          </div>
        )}
        <p className="text-center text-[11px] text-muted mt-5 pt-4 border-t border-line">
          <Link href="/guide" className="underline underline-offset-2 hover:text-fg">User guide</Link>
          {" · "}
          <Link href="/docs" className="underline underline-offset-2 hover:text-fg">Documentation</Link>
        </p>
      </div>
    </div>
  );
}
