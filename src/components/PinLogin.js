"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useSession } from "./SessionProvider";
import { apiCheckSlug } from "@/lib/data";
import { useLang } from "./LangProvider";
import { LOCALES, LOCALE_LABELS, CATALOG } from "@/lib/i18n";
import { PRODUCT } from "@/lib/store";
import { PIN_LENGTH, PIN_PLACEHOLDER, isValidNewPin } from "@/lib/pin";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function PinLogin() {
  const { login, signup } = useSession();
  const { lang, setLang, t } = useLang();
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null); // the caught Error (message + optional code)
  const [createdSlug, setCreatedSlug] = useState("");

  // Server/API errors carry a stable `code` (see /api/auth/* and fetchJson);
  // a known code renders in the device language, anything else — including
  // diagnostic prose like the non-JSON platform messages — shows verbatim.
  const errText = (e) =>
    e?.code && CATALOG.en[`autherr.${e.code}`]
      ? t(`autherr.${e.code}`, { n: PIN_LENGTH })
      : e?.message || String(e || "");

  // login fields
  const [storeCode, setStoreCode] = useState("");
  const [pin, setPin] = useState("");
  // signup fields — the owner fills these in for their own store
  const [bizName, setBizName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [newPin, setNewPin] = useState("");
  const ids = { storeCode: useId(), pin: useId(), bizName: useId(), logoUrl: useId(), ownerName: useId(), newPin: useId() };

  // Live store-code availability while the owner types the business name — shows
  // the code they'll get and whether that exact code is free, so a duplicate name
  // is surfaced before they create (the signup txn still allocates atomically).
  const [slug, setSlug] = useState(null); // { base, slug, available } | null
  const [slugBusy, setSlugBusy] = useState(false);
  useEffect(() => {
    if (mode !== "signup") { setSlug(null); return undefined; }
    const name = bizName.trim();
    if (name.length < 2) { setSlug(null); setSlugBusy(false); return undefined; }
    setSlugBusy(true);
    const h = setTimeout(() => {
      apiCheckSlug(name)
        .then((r) => setSlug(r))
        .catch(() => setSlug(null))
        .finally(() => setSlugBusy(false));
    }, 400);
    return () => clearTimeout(h);
  }, [bizName, mode]);

  async function doLogin() {
    setErr(null); setBusy(true);
    try { await login(storeCode, pin); }
    catch (e) { setErr(e); }
    setBusy(false);
  }

  async function doSignup() {
    setErr(null); setBusy(true);
    try {
      const vendor = await signup({ businessName: bizName, logoUrl, ownerName, pin: newPin });
      setCreatedSlug(vendor.slug);
    } catch (e) { setErr(e); }
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
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <select className="input w-auto py-1 px-2 text-xs" value={lang} aria-label={t("lang.language")}
              onChange={(e) => setLang(e.target.value)}>
              {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l] || l}</option>)}
            </select>
            <ThemeToggle className="flex-shrink-0" />
          </div>
        </div>

        {mode === "login" ? (
          <>
            <label htmlFor={ids.storeCode} className="label">{t("login.store_code")}</label>
            <input id={ids.storeCode} className="input mb-4 font-mono lowercase" value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)} placeholder="acme-market" autoFocus />
            <label htmlFor={ids.pin} className="label">{t("login.your_pin", { n: PIN_LENGTH })}</label>
            <input id={ids.pin} className="input text-center text-2xl tracking-[0.4em] font-mono"
              type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={PIN_LENGTH} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder={PIN_PLACEHOLDER} />
            {err && <p className="text-sm text-neg mt-3">{errText(err)}</p>}
            <button className="btn-primary mt-5" disabled={busy || pin.length < PIN_LENGTH || !storeCode.trim()} onClick={doLogin}>
              {busy ? t("login.checking") : t("login.sign_in")}
            </button>
            <button className="w-full text-sm text-muted underline underline-offset-2 mt-4"
              onClick={() => { setMode("signup"); setErr(null); }}>
              {t("login.register_link")}
            </button>
            <p className="text-xs text-muted mt-4 leading-relaxed">
              {t("login.code_help")}
            </p>
          </>
        ) : (
          <>
            <label htmlFor={ids.bizName} className="label">{t("login.biz_name")}</label>
            <input id={ids.bizName} className="input" value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Acme Market" />
            <p className="text-xs mt-1.5 mb-4 leading-relaxed min-h-[1.1rem]" aria-live="polite">
              {bizName.trim().length < 2 ? <span className="text-muted">{t("login.slug_prompt")}</span>
                : slugBusy ? <span className="text-muted">{t("login.slug_checking")}</span>
                : slug ? (slug.available
                    ? <span className="text-pos">{t("login.slug_ok", { slug: slug.slug })}</span>
                    : <span className="text-gold">{t("login.slug_taken", { base: slug.base, slug: slug.slug })}</span>)
                : <span className="text-muted"> </span>}
            </p>
            <label htmlFor={ids.logoUrl} className="label">{t("login.logo_url")}</label>
            <input id={ids.logoUrl} className="input mb-4" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.svg" />
            <label htmlFor={ids.ownerName} className="label">{t("login.owner_name")}</label>
            <input id={ids.ownerName} className="input mb-4" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Jordan P." />
            <label htmlFor={ids.newPin} className="label">{t("login.choose_pin", { n: PIN_LENGTH })}</label>
            <input id={ids.newPin} className="input text-center text-xl tracking-[0.3em] font-mono"
              type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={PIN_LENGTH} value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            {err && <p className="text-sm text-neg mt-3">{errText(err)}</p>}
            <button className="btn-primary mt-5" disabled={busy || !isValidNewPin(newPin)} onClick={doSignup}>
              {busy ? t("login.creating") : t("login.create")}
            </button>
            {/* Clickwrap: creating the store is the acceptance action; the
                server stamps termsAcceptedAt on the vendor record. */}
            <p className="text-xs text-muted mt-3 leading-relaxed text-center">
              {t("login.terms_pre")}
              <a href="/docs/terms-of-use" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-fg">{t("login.terms_link")}</a>
              {t("login.terms_and")}
              <a href="/docs/privacy-and-data" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-fg">{t("login.privacy_link")}</a>.
            </p>
            <button className="w-full text-sm text-muted underline underline-offset-2 mt-4"
              onClick={() => { setMode("login"); setErr(null); }}>
              {t("login.back_to_login")}
            </button>
            <p className="text-xs text-muted mt-4 leading-relaxed">
              {t("login.signup_help")}
            </p>
          </>
        )}

        {createdSlug && (
          <div className="mt-4 text-sm bg-highlight border border-brass/40 rounded-lg p-3">
            {t("login.created_pre")} <b className="font-mono">{createdSlug}</b> {t("login.created_post")}
          </div>
        )}
        <p className="text-center text-[11px] text-muted mt-5 pt-4 border-t border-line">
          <Link href="/guide" className="underline underline-offset-2 hover:text-fg">{t("login.user_guide")}</Link>
          {" · "}
          <Link href="/docs" className="underline underline-offset-2 hover:text-fg">{t("login.documentation")}</Link>
          {" · "}
          <Link href="/dev" className="underline underline-offset-2 hover:text-fg">{t("login.developer")}</Link>
        </p>
      </div>
    </div>
  );
}
