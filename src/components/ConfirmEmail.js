"use client";
import { useState } from "react";
import RecoveryShell from "./RecoveryShell";
import Field from "./Field";
import { useLang } from "./LangProvider";
import { useSession } from "./SessionProvider";
import { CATALOG } from "@/lib/i18n";
import { CODE_DIGITS, isCodeShaped, normalizeCode } from "@/lib/verify-code";
import { apiAccount } from "@/lib/data";

// Shown instead of the app when the OWNER's email is missing or unconfirmed.
//
// It is a gate rather than a banner because an unreachable store is the
// problem this exists to solve: a billing notice, a policy change or a PIN
// reset all dead-end at an address nobody has proved they can read. A banner
// can be ignored for months, which is how stores ended up unreachable in the
// first place.
//
// Two ways out, both deliberate. Resend covers "it never arrived". Changing
// the address covers a typo — and it costs the current PIN, exactly as
// /api/account setEmail requires, because an address that can reset the
// account later outlives every PIN change after it. Signing out is the third
// way, and it leaves the gate exactly where it was.
//
// Staff never see this: they did not choose the address and cannot change it,
// so gating them would strand a shift behind someone else's inbox. See
// needsEmailConfirm.
export default function ConfirmEmail() {
  const { t, lang } = useLang();
  const { profile, logout } = useSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [left, setLeft] = useState(null);

  // Changing the address — hidden until asked for, so the common case (type
  // the code) is the only thing on screen.
  const [editing, setEditing] = useState(!profile?.email);
  const [email, setEmail] = useState(profile?.email || "");
  const [pin, setPin] = useState("");

  const errText = (e) => (e?.code && CATALOG.en[`autherr.${e.code}`]
    ? t(`autherr.${e.code}`) : e?.message || String(e || ""));

  async function submitCode() {
    setBusy(true); setErr(""); setNote("");
    try {
      await apiAccount({ action: "verifyCode", code: normalizeCode(code) });
      // Nothing to do on success: SessionProvider keeps this user's document on
      // a live snapshot precisely so a confirmation landing from outside the
      // tab reaches it, so writing emailVerifiedAt lifts the gate by itself.
      // An optimistic local flag would be a second source of truth.
    } catch (e) {
      setErr(errText(e));
      setLeft(typeof e?.data?.left === "number" ? e.data.left : null);
      setCode("");
    }
    setBusy(false);
  }

  async function resend() {
    setBusy(true); setErr(""); setNote(""); setLeft(null);
    try {
      const r = await apiAccount({ action: "resendVerify", lang });
      setNote(r?.sent ? t("cfm.sent", { email: profile?.email || "" }) : t("cfm.send_failed"));
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }

  async function saveEmail() {
    setBusy(true); setErr(""); setNote("");
    try {
      await apiAccount({ action: "setEmail", email: email.trim(), pin, lang });
      setEditing(false); setPin(""); setCode("");
      setNote(t("cfm.sent", { email: email.trim() }));
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }

  return (
    <RecoveryShell>
      <p className="font-semibold text-[15px]">{t("cfm.title")}</p>
      <p className="text-[13px] text-muted mt-1.5 leading-relaxed">
        {profile?.email ? t("cfm.body", { email: profile.email }) : t("cfm.body_no_email")}
      </p>

      {!editing && (
        <>
          <Field className="mt-4" label={t("cfm.code_label", { n: CODE_DIGITS })}>
            <input className="input text-center text-xl tracking-[0.3em] font-mono"
              type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code"
              maxLength={CODE_DIGITS + 2} value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s-]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && isCodeShaped(code) && !busy && submitCode()} />
          </Field>
          {left !== null && left > 0 && (
            <p className="text-[12px] text-gold mt-1.5">{t("cfm.tries_left", { n: left })}</p>
          )}
          <button className="btn-primary mt-4" disabled={busy || !isCodeShaped(code)} onClick={submitCode}>
            {busy ? t("cfm.checking") : t("cfm.confirm")}
          </button>
          <div className="flex gap-2 mt-3">
            <button className="btn-ghost flex-1 text-[13px]" disabled={busy} onClick={resend}>
              {t("cfm.resend")}
            </button>
            <button className="btn-ghost flex-1 text-[13px]" disabled={busy} onClick={() => { setEditing(true); setErr(""); setNote(""); }}>
              {t("cfm.wrong_address")}
            </button>
          </div>
        </>
      )}

      {editing && (
        <>
          <Field className="mt-4" label={t("cfm.new_email")}>
            <input className="input" type="email" inputMode="email" autoCapitalize="none"
              autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" />
          </Field>
          {/* An address that can reset this account later outlives every PIN
              change after it, so changing it costs the PIN — the same bar
              /api/account setEmail enforces server-side. */}
          <Field className="mt-3" label={t("cfm.current_pin")} hint={t("cfm.pin_why")}>
            <input className="input text-center tracking-[0.3em] font-mono"
              type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="current-password"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <button className="btn-primary mt-4" disabled={busy || !email.trim() || !pin} onClick={saveEmail}>
            {busy ? t("cfm.saving") : t("cfm.save_email")}
          </button>
          {profile?.email && (
            <button className="btn-ghost w-full text-[13px] mt-3" disabled={busy} onClick={() => { setEditing(false); setErr(""); }}>
              {t("cfm.cancel")}
            </button>
          )}
        </>
      )}

      {err && <p role="alert" className="text-[13px] text-neg mt-3">{err}</p>}
      {note && <p className="text-[13px] text-pos mt-3">{note}</p>}

      <button className="block w-full text-center text-[12px] text-muted underline underline-offset-2 mt-5 hover:text-fg"
        onClick={logout}>{t("cfm.sign_out")}</button>
    </RecoveryShell>
  );
}
