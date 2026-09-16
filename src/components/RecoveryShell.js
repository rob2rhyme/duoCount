"use client";
import Link from "next/link";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { useLang } from "./LangProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import { PRODUCT } from "@/lib/store";

// Shared chrome for the signed-out recovery screens (/reset, /verify-email,
// /help). Same card, logo, language toggle and theme switch as the sign-in
// screen, so someone who has just failed to sign in doesn't feel handed off to
// a different product at the exact moment they're already unsure.
export default function RecoveryShell({ title, sub, children, width = "max-w-sm" }) {
  const { lang, setLang, t } = useLang();
  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className={`card w-full ${width} p-7`}>
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
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {sub && <p className="text-[13px] text-muted mt-1.5 leading-relaxed">{sub}</p>}
        <div className="mt-4">{children}</div>
        <p className="text-center text-[11px] text-muted mt-6 pt-4 border-t border-line">
          <Link href="/" className="underline underline-offset-2 hover:text-fg">{t("reset.back")}</Link>
        </p>
      </div>
    </div>
  );
}
