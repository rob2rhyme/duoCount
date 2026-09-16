"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RecoveryShell from "./RecoveryShell";
import Field from "./Field";
import { useLang } from "./LangProvider";
import { CATALOG } from "@/lib/i18n";
import { PIN_LENGTH, PIN_PLACEHOLDER, isValidNewPin } from "@/lib/pin";
import { RESET_TTL_MIN } from "@/lib/recovery";
import { apiRequestReset, apiCheckResetLink, apiConfirmReset } from "@/lib/data";

// "I forgot my PIN", both halves in one screen:
//   • no ?t= in the URL  → ask for a link (store code + confirmed email);
//   • ?t=<token>         → check the link, then choose a new PIN.
//
// The request half deliberately shows the SAME confirmation whatever the server
// found — the endpoint answers identically by design, and a screen that said
// "no such store" would undo that.
export default function ResetPin() {
  const { lang, t } = useLang();
  const token = useSearchParams().get("t") || "";

  // Known API error codes render in the device language; anything else (a
  // platform error page, a network drop) shows its own prose, as on the login card.
  const errText = useCallback((e) => (e?.code && CATALOG.en[`autherr.${e.code}`]
    ? t(`autherr.${e.code}`, { n: PIN_LENGTH }) : e?.message || String(e || "")), [t]);

  /* ----------------------------- request a link ---------------------------- */
  const [storeCode, setStoreCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(false);

  async function requestLink() {
    setErr(null); setBusy(true);
    try {
      await apiRequestReset({ storeCode, email, lang });
      setSent(true);
    } catch (e) { setErr(e); }
    setBusy(false);
  }

  /* ------------------------------ spend a link ----------------------------- */
  const [state, setState] = useState("checking"); // checking | ok | dead
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [done, setDone] = useState(null); // { storeCode }

  useEffect(() => {
    if (!token) return;
    let live = true;
    apiCheckResetLink(token)
      .then((r) => { if (live) setState(r.state === "ok" ? "ok" : "dead"); })
      .catch(() => { if (live) setState("dead"); });
    return () => { live = false; };
  }, [token]);

  async function setNewPin() {
    if (pin !== pin2) return setErr({ message: t("reset.mismatch") });
    setErr(null); setBusy(true);
    try {
      const r = await apiConfirmReset({ token, pin, lang });
      setDone({ storeCode: r.storeCode || "" });
    } catch (e) { setErr(e); }
    setBusy(false);
  }

  if (token && done) {
    return (
      <RecoveryShell title={t("reset.done_title")} sub={t("reset.done_body", { slug: done.storeCode })}>
        <Link href="/" className="btn-primary inline-flex justify-center w-full">{t("reset.done_go")}</Link>
      </RecoveryShell>
    );
  }

  if (token && state !== "ok") {
    const dead = state === "dead";
    return (
      <RecoveryShell title={dead ? t("reset.dead_title") : t("reset.checking")}
        sub={dead ? t("reset.dead_hint", { minutes: RESET_TTL_MIN }) : null}>
        {dead && (
          <div className="space-y-3">
            <Link href="/reset" className="btn-primary inline-flex justify-center w-full">{t("reset.again")}</Link>
            <Link href="/help" className="block text-center text-[13px] text-muted underline underline-offset-2 hover:text-fg">
              {t("reset.help")}
            </Link>
          </div>
        )}
      </RecoveryShell>
    );
  }

  if (token) {
    return (
      <RecoveryShell title={t("reset.new_title")} sub={t("reset.new_body", { n: PIN_LENGTH })}>
        <div className="space-y-3.5">
          <Field label={t("reset.new_pin")}>
            <input className="input text-center text-2xl tracking-[0.4em] font-mono" type="tel" inputMode="numeric"
              pattern="[0-9]*" autoComplete="off" maxLength={PIN_LENGTH} value={pin} placeholder={PIN_PLACEHOLDER}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={t("reset.confirm_pin")}>
            <input className="input text-center text-2xl tracking-[0.4em] font-mono" type="tel" inputMode="numeric"
              pattern="[0-9]*" autoComplete="off" maxLength={PIN_LENGTH} value={pin2} placeholder={PIN_PLACEHOLDER}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && isValidNewPin(pin) && setNewPin()} />
          </Field>
          {err && <p role="alert" className="text-[13px] text-neg">{errText(err)}</p>}
          <button className="btn-primary" disabled={busy || !isValidNewPin(pin) || !isValidNewPin(pin2)} onClick={setNewPin}>
            {busy ? t("reset.saving") : t("reset.save")}
          </button>
        </div>
      </RecoveryShell>
    );
  }

  if (sent) {
    return (
      <RecoveryShell title={t("reset.sent_title")} sub={t("reset.sent_body", { minutes: RESET_TTL_MIN })}>
        <p className="text-[13px] text-muted leading-relaxed">{t("reset.sent_hint")}</p>
        <Link href="/help" className="block text-center text-[13px] text-muted underline underline-offset-2 mt-4 hover:text-fg">
          {t("reset.help")}
        </Link>
      </RecoveryShell>
    );
  }

  return (
    <RecoveryShell title={t("reset.title")} sub={t("reset.body")}>
      <div className="space-y-3.5">
        <Field label={t("reset.store_code")}>
          <input className="input font-mono lowercase" autoCapitalize="none" value={storeCode} placeholder="acme-market"
            onChange={(e) => setStoreCode(e.target.value)} autoFocus />
        </Field>
        <Field label={t("reset.email")}>
          <input className="input" type="email" inputMode="email" autoCapitalize="none" autoComplete="email"
            value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && storeCode.trim() && email.trim() && requestLink()} />
        </Field>
        {err && <p role="alert" className="text-[13px] text-neg">{errText(err)}</p>}
        <button className="btn-primary" disabled={busy || !storeCode.trim() || !email.trim()} onClick={requestLink}>
          {busy ? t("reset.sending") : t("reset.send")}
        </button>
        <Link href="/help" className="block text-center text-[13px] text-muted underline underline-offset-2 hover:text-fg">
          {t("reset.help")}
        </Link>
      </div>
    </RecoveryShell>
  );
}
