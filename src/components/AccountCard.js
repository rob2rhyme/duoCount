"use client";
import { useState } from "react";
import Field from "./Field";
import { useLang } from "./LangProvider";
import { useSession } from "./SessionProvider";
import { CATALOG } from "@/lib/i18n";
import { PIN_LENGTH, PIN_PLACEHOLDER, isValidNewPin } from "@/lib/pin";
import { apiAccount } from "@/lib/data";

// "My account" — the two things only YOU can do to your own credential:
// rotate your PIN, and put a confirmed address on file so a lockout is
// self-serve. Everything else about staff lives in Admin → Staff, which
// deliberately refuses to touch your own row (/api/staff rejects self-edits) —
// this card is the other half of that rule, not a duplicate of it.
export default function AccountCard({ onToast }) {
  const { t, lang } = useLang();
  const { profile, logout } = useSession();
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [email, setEmail] = useState(profile?.email || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const verified = !!profile?.emailVerifiedAt;
  const onFile = (profile?.email || "").trim();
  const errText = (e) => (e?.code && CATALOG.en[`autherr.${e.code}`]
    ? t(`autherr.${e.code}`, { n: PIN_LENGTH }) : e?.message || String(e || ""));

  async function run(payload, after) {
    setBusy(true); setErr("");
    try { const r = await apiAccount({ ...payload, lang }); after?.(r); }
    catch (e) { setErr(errText(e)); }
    setBusy(false);
  }

  const changePin = () => {
    if (pin !== pin2) return setErr(t("acct.mismatch"));
    // The PIN change revokes every session including this one, so the honest
    // next step is a sign-out with the reason shown on the way back in.
    return run({ action: "changePin", currentPin: current, pin }, () => {
      onToast?.(t("acct.changed"));
      logout();
    });
  };

  const saveEmail = () => run({ action: "setEmail", email }, (r) => {
    if (!r.email) return onToast?.(t("acct.email_cleared"));
    return onToast?.(r.sent ? t("acct.email_saved") : t("acct.email_unsent"));
  });

  const resend = () => run({ action: "resendVerify" }, (r) =>
    onToast?.(r.sent ? t("acct.resent") : t("acct.email_unsent")));

  return (
    <div className="card p-4">
      <h2 className="text-[15px] font-semibold">{t("acct.title")}</h2>
      <p className="text-[12px] text-muted mt-1 leading-relaxed">{t("acct.sub")}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold">{t("acct.change_pin")}</h3>
          <Field label={t("acct.current_pin")}>
            <input className="input text-center tracking-[0.3em] font-mono" type="password" inputMode="numeric"
              autoComplete="current-password" maxLength={PIN_LENGTH} value={current} placeholder={PIN_PLACEHOLDER}
              onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={t("acct.new_pin")}>
            <input className="input text-center tracking-[0.3em] font-mono" type="password" inputMode="numeric"
              autoComplete="new-password" maxLength={PIN_LENGTH} value={pin} placeholder={PIN_PLACEHOLDER}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={t("acct.confirm_pin")}>
            <input className="input text-center tracking-[0.3em] font-mono" type="password" inputMode="numeric"
              autoComplete="new-password" maxLength={PIN_LENGTH} value={pin2} placeholder={PIN_PLACEHOLDER}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <button className="btn-primary" disabled={busy || !isValidNewPin(pin) || !isValidNewPin(pin2) || current.length < PIN_LENGTH}
            onClick={changePin}>
            {busy ? t("acct.saving") : t("acct.save_pin")}
          </button>
        </div>

        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold">
            {t("acct.email")}
            {onFile && (
              <span className={`ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full ${verified ? "bg-highlight text-pos" : "bg-subtle text-gold"}`}>
                {verified ? t("acct.verified") : t("acct.unverified")}
              </span>
            )}
          </h3>
          <Field label={t("acct.email")} hint={t("acct.email_hint")}>
            <input className="input" type="email" inputMode="email" autoCapitalize="none" autoComplete="email"
              value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <button className="btn-primary w-auto px-4" disabled={busy || email.trim() === onFile} onClick={saveEmail}>
              {t("acct.email_save")}
            </button>
            {onFile && !verified && (
              <button className="btn-ghost w-auto px-4" disabled={busy} onClick={resend}>{t("acct.resend")}</button>
            )}
          </div>
          {!onFile && <p className="text-[12px] text-gold leading-relaxed">{t("acct.no_email_yet")}</p>}
        </div>
      </div>
      {err && <p role="alert" className="text-[13px] text-neg mt-3">{err}</p>}
    </div>
  );
}
