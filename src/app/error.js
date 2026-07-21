"use client";
import { useEffect } from "react";
import { useLang } from "@/components/LangProvider";

// Route-segment error boundary. Any uncaught render/runtime error in a page
// subtree lands here instead of blanking the whole app. It mounts inside the
// root layout (AppChrome → LangProvider), so it can localize. `reset()` retries
// the failed segment; a full reload is the fallback. We log the error but never
// surface a raw stack to the clerk.
export default function Error({ error, reset }) {
  const { t } = useLang();
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="card p-6 w-full max-w-sm text-center">
        <div className="text-4xl mb-3" aria-hidden="true">⚠️</div>
        <h1 className="text-lg font-semibold text-fg">{t("err.crash_title")}</h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">{t("err.crash_body")}</p>
        <div className="mt-5 space-y-2">
          <button className="btn-primary" onClick={() => reset()}>{t("err.try_again")}</button>
          <button className="btn-ghost" onClick={() => window.location.assign("/")}>{t("err.go_home")}</button>
        </div>
      </div>
    </div>
  );
}
