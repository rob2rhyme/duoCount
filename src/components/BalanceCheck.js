"use client";
import { useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import Field from "./Field";
import { useLang } from "./LangProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import { normalizePhone } from "@/lib/rewards";
import { money } from "@/lib/utils";

// The customer's side of rewards: store code + phone → points. Talks to the
// public, rate-limited /api/rewards/balance endpoint; shows only the balance
// and the program shape (never a name). Follows the device language with the
// same EN/ES toggle as the guide.
export default function BalanceCheck() {
  const { lang, setLang, t } = useLang();
  const [store, setStore] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function check() {
    if (!store.trim() || !normalizePhone(phone)) return setError(t("rwberr.bad_input"));
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/rewards/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store, phone }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.code ? t(`rwberr.${body.code}`) : t("rwberr.generic"));
      else setResult(body);
    } catch { setError(t("autherr.network")); }
    setBusy(false);
  }

  const pct = result ? Math.min(100, Math.round((result.points / result.goal) * 100)) : 0;

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="flex justify-center">
            <Logo src="/logo.png" alt="DuoCount" size={64} rounded="rounded-2xl" />
          </div>
          <h1 className="text-xl font-bold mt-3">{t("rwb.title")}</h1>
          <p className="text-[13px] text-muted mt-1">{t("rwb.sub")}</p>
          <div className="inline-grid grid-cols-2 gap-1 p-1 rounded-lg bg-subtle mt-3" role="group" aria-label={t("lang.language")}>
            {LOCALES.map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
                className={`px-3 py-1 rounded-md text-[13px] font-semibold transition ${lang === l ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
                {LOCALE_LABELS[l] || l}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-4 space-y-3.5">
          <Field label={t("rwb.store_label")}>
            <input className="input font-mono" autoCapitalize="none" value={store} placeholder={t("rwb.store_ph")}
              onChange={(e) => { setStore(e.target.value); setResult(null); }} />
          </Field>
          <Field label={t("rw.phone_label")}>
            <input className="input font-mono" inputMode="tel" value={phone} placeholder={t("rw.phone_ph")}
              onChange={(e) => { setPhone(e.target.value); setResult(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") check(); }} />
          </Field>
          {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
          <button className="btn-primary w-full" disabled={busy} onClick={check}>
            {busy ? t("rwb.checking") : t("rwb.check")}
          </button>

          {result && (
            <div className="border border-line rounded-xl p-3.5 bg-panel text-center">
              <div className="text-3xl font-bold font-mono">{result.points}</div>
              <div className="text-[11px] text-muted uppercase tracking-wide font-semibold">{t("rw.points")}</div>
              <div className="h-2 rounded-full bg-line overflow-hidden mt-3">
                <div className="h-full bg-brass transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[12px] text-muted mt-2">
                {result.ready
                  ? t("rw.ready", { value: money(result.value) })
                  : t("rw.progress", { n: result.points, goal: result.goal, value: money(result.value), left: result.goal - result.points })}
              </p>
              {result.ready && <p className="text-[13px] font-semibold mt-1.5">{t("rwb.ready_hint")}</p>}
            </div>
          )}
        </div>

        <p className="text-center text-[12px] text-muted mt-5">{t("rwb.foot")}</p>
        <p className="text-center text-[12px] text-faint mt-1.5">
          <Link href="/" className="underline underline-offset-2 hover:text-fg">{t("guide.back_app")}</Link>
        </p>
      </div>
    </div>
  );
}
