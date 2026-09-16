"use client";
import { useState } from "react";
import RecoveryShell from "./RecoveryShell";
import Field from "./Field";
import { useLang } from "./LangProvider";
import { useSession } from "./SessionProvider";
import { CATALOG } from "@/lib/i18n";
import { PIN_LENGTH, PIN_PLACEHOLDER, isValidNewPin } from "@/lib/pin";
import { apiAccount } from "@/lib/data";

// Shown instead of the app when `mustChangePin` is set — i.e. the PIN that just
// worked was chosen by SOMEONE ELSE (today, only DuoCount support's temporary
// PIN sets this). It is a one-trip credential: until it's replaced, whoever
// handed it over could sign in as this person, so the app doesn't open.
// Signing out is the only other way past, and that leaves the flag set.
export default function MustChangePin() {
  const { t, lang } = useLang();
  const { logout } = useSession();
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const errText = (e) => (e?.code && CATALOG.en[`autherr.${e.code}`]
    ? t(`autherr.${e.code}`, { n: PIN_LENGTH }) : e?.message || String(e || ""));

  async function save() {
    if (pin !== pin2) return setErr(t("acct.mismatch"));
    setBusy(true); setErr("");
    try {
      // No currentPin: the server skips that check precisely when the PIN was
      // issued by someone else, and asking for it back would be theatre.
      await apiAccount({ action: "changePin", pin, lang });
      // Setting a PIN revokes every session — sign in again with the new one.
      logout();
    } catch (e) { setErr(errText(e)); setBusy(false); }
    return undefined;
  }

  return (
    <RecoveryShell title={t("acct.must_title")} sub={t("acct.must_body", { n: PIN_LENGTH })}>
      <div className="space-y-3.5">
        <Field label={t("acct.new_pin")}>
          <input className="input text-center text-2xl tracking-[0.4em] font-mono" type="tel" inputMode="numeric"
            pattern="[0-9]*" autoComplete="off" maxLength={PIN_LENGTH} value={pin} placeholder={PIN_PLACEHOLDER}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus />
        </Field>
        <Field label={t("acct.confirm_pin")}>
          <input className="input text-center text-2xl tracking-[0.4em] font-mono" type="tel" inputMode="numeric"
            pattern="[0-9]*" autoComplete="off" maxLength={PIN_LENGTH} value={pin2} placeholder={PIN_PLACEHOLDER}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && isValidNewPin(pin) && save()} />
        </Field>
        {err && <p role="alert" className="text-[13px] text-neg">{err}</p>}
        <button className="btn-primary" disabled={busy || !isValidNewPin(pin) || !isValidNewPin(pin2)} onClick={save}>
          {busy ? t("acct.saving") : t("acct.must_save")}
        </button>
        <button className="w-full text-[13px] text-muted underline underline-offset-2" onClick={logout}>
          {t("acct.must_signout")}
        </button>
      </div>
    </RecoveryShell>
  );
}
