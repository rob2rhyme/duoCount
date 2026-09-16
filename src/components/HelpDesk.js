"use client";
import { useState } from "react";
import Link from "next/link";
import RecoveryShell from "./RecoveryShell";
import Field from "./Field";
import { useLang } from "./LangProvider";
import { CATALOG } from "@/lib/i18n";
import { PUBLIC_MSG_MIN } from "@/lib/support";
import { apiPublicHelp } from "@/lib/data";

// The signed-out way through a lockout. Order matters: the in-store fixes come
// FIRST, because they're instant and need nobody outside the store; the support
// form is last, for the sole owner with no confirmed email — the one case the
// app genuinely can't solve on its own.
function Section({ title, children }) {
  return (
    <section className="border border-line rounded-xl p-3.5 bg-panel">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <div className="text-[13px] text-muted mt-1.5 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function HelpDesk() {
  const { lang, t } = useLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(false);

  const errText = (e) => (e?.code && CATALOG.en[`autherr.${e.code}`]
    ? t(`autherr.${e.code}`) : e?.message || String(e || ""));

  async function send() {
    setErr(null); setBusy(true);
    try {
      await apiPublicHelp({ name, email, storeCode, message, lang });
      setSent(true);
    } catch (e) { setErr(e); }
    setBusy(false);
  }

  if (sent) {
    return (
      <RecoveryShell title={t("help.sent_title")} sub={t("help.sent_body", { email })}>
        <Link href="/" className="btn-primary inline-flex justify-center w-full">{t("help.back")}</Link>
      </RecoveryShell>
    );
  }

  return (
    <RecoveryShell title={t("help.title")} sub={t("help.intro")} width="max-w-md">
      <div className="space-y-3">
        <Section title={t("help.staff_title")}><p>{t("help.staff_body")}</p></Section>
        <Section title={t("help.owner_title")}>
          <p>{t("help.owner_body")}</p>
          <Link href="/reset" className="btn-ghost inline-flex w-auto px-4">{t("help.owner_cta")}</Link>
        </Section>
        <Section title={t("help.sole_title")}><p>{t("help.sole_body")}</p></Section>
        <Section title={t("help.prevent_title")}><p>{t("help.prevent_body")}</p></Section>

        <div className="border border-line rounded-xl p-3.5">
          <h3 className="text-[13px] font-semibold">{t("help.form_title")}</h3>
          <p className="text-[12px] text-muted mt-1 mb-3 leading-relaxed">{t("help.form_body")}</p>
          <div className="space-y-3">
            <Field label={t("help.f_name")}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t("help.f_email")}>
              <input className="input" type="email" inputMode="email" autoCapitalize="none" autoComplete="email"
                value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("help.f_store")}>
              <input className="input font-mono lowercase" autoCapitalize="none" value={storeCode}
                placeholder="acme-market" onChange={(e) => setStoreCode(e.target.value)} />
            </Field>
            <Field label={t("help.f_message")}>
              <textarea className="input min-h-[96px]" value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            {err && <p role="alert" className="text-[13px] text-neg">{errText(err)}</p>}
            <button className="btn-primary" disabled={busy || !email.trim() || message.trim().length < PUBLIC_MSG_MIN} onClick={send}>
              {busy ? t("help.sending") : t("help.send")}
            </button>
          </div>
        </div>
      </div>
    </RecoveryShell>
  );
}
