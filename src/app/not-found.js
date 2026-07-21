"use client";
import Link from "next/link";
import { useLang } from "@/components/LangProvider";

// Custom 404 for unknown routes. Renders inside the root layout, so it inherits
// the theme + language and localizes like any other screen (Next's default
// not-found is bare, unstyled English).
export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="card p-6 w-full max-w-sm text-center">
        <div className="text-3xl font-bold font-mono text-muted">404</div>
        <h1 className="text-lg font-semibold text-fg mt-2">{t("err.notfound_title")}</h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">{t("err.notfound_body")}</p>
        <Link href="/" className="btn-primary mt-5 inline-block">{t("err.go_home")}</Link>
      </div>
    </div>
  );
}
