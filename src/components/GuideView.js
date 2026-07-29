"use client";
import Link from "next/link";
import Logo from "./Logo";
import DocLayout from "./DocLayout";
import DocSearch from "./DocSearch";
import { useLang } from "./LangProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";

// Language-aware /guide. The server page renders BOTH versions of the guide at
// build time (en + the getting-started-es doc); this client wrapper shows the
// one matching the reader's per-device language — the same duocount-lang the
// app itself follows — plus an explicit toggle for someone who was handed the
// /guide URL directly. English during SSR/first paint, per LangProvider.
export default function GuideView({ docs, index, tagline }) {
  const { lang, setLang, t } = useLang();
  const doc = docs[lang] || docs.en;

  const header = (
    <div className="mb-10">
      <div className="text-center">
        <div className="flex justify-center">
          <Logo src="/logo.png" alt="DuoCount" size={80} rounded="rounded-2xl" />
        </div>
        <div className="text-3xl font-extrabold tracking-tight mt-3">
          <span style={{ color: "var(--fg)" }}>Duo</span><span className="text-gold">Count</span>
        </div>
        <div className="text-[11px] uppercase tracking-[2px] text-muted mt-1.5">{tagline}</div>
        <div className="inline-grid grid-cols-2 gap-1 p-1 rounded-lg bg-subtle mt-4" role="group" aria-label={t("guide.lang_aria")}>
          {LOCALES.map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
              className={`px-3 py-1 rounded-md text-[13px] font-semibold transition ${lang === l ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
              {LOCALE_LABELS[l] || l}
            </button>
          ))}
        </div>
      </div>
      <div className="max-w-xl mx-auto mt-6">
        <DocSearch index={index} placeholder={t("guide.search_ph")} />
      </div>
    </div>
  );

  const footer = (
    <p className="text-[12px] text-muted mt-12 pt-5 border-t border-line">
      <Link href="/docs" className="underline underline-offset-2 hover:text-fg">{t("guide.all_docs")}</Link>
      {" · "}
      <Link href="/" className="underline underline-offset-2 hover:text-fg">{t("guide.back_app")}</Link>
    </p>
  );

  return <DocLayout header={header} title={t("guide.title")} html={doc.html} toc={doc.toc} footer={footer} tocLabel={t("guide.toc")} topLabel={t("guide.top")} />;
}
