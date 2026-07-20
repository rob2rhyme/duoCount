"use client";
import { useEffect, useState } from "react";
import { setupProgress } from "@/lib/setup-progress";
import { useLang } from "./LangProvider";

// First-run onboarding banner. It reads the same locations / drawers / items
// the shell already watches, derives what's still missing (setupProgress), and
// nudges a manager to finish setup in Admin — so a brand-new owner never lands
// on an empty Cash form with no idea what comes first.
//
//  • Employees never see it — setting the store up isn't their job.
//  • While the essentials (a location + a drawer) are missing the app can't be
//    used, so the banner stays put and can't be dismissed.
//  • Once the essentials exist, only the optional "add inventory items" step may
//    remain; a cash-only store can dismiss it for good (persisted per vendor).
export default function SetupChecklist({ locations, drawers, items, isManager, vendorId, onGoAdmin }) {
  const { t } = useLang();
  const p = setupProgress(locations, drawers, items);
  const storageKey = `duocount:setup-dismissed:${vendorId}`;
  const [dismissed, setDismissed] = useState(false);

  // localStorage is client-only, so read any prior dismissal after mount.
  useEffect(() => {
    try { setDismissed(localStorage.getItem(storageKey) === "1"); } catch { /* ignore */ }
  }, [storageKey]);

  if (!isManager) return null;          // only managers can act on this
  if (p.allDone) return null;           // nothing left to set up
  if (p.essentialsDone && dismissed) return null; // only the optional step is left

  const dismissible = p.essentialsDone;
  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
  }

  return (
    <div className="card overflow-hidden mb-4" style={{ borderColor: "rgb(var(--brass))" }}>
      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3 bg-panel">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true">🧭</span>
          <h2 className="font-semibold text-[15px] truncate">
            {p.essentialsDone ? t("setup.finish") : t("setup.welcome")}
          </h2>
        </div>
        <span className="text-[11px] font-mono text-muted flex-shrink-0" aria-label={t("setup.progress_aria", { done: p.doneRequired, total: p.totalRequired })}>
          {p.doneRequired}/{p.totalRequired}
        </span>
      </div>
      <div className="p-4 space-y-3.5">
        <ul className="space-y-2.5">
          {p.steps.map((s) => (
            <li key={s.key} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold border ${s.done ? "border-pos text-pos" : "border-line text-muted"}`}
                aria-hidden="true">
                {s.done ? "✓" : ""}
              </span>
              <div className="min-w-0">
                <div className={`text-sm font-medium ${s.done ? "text-muted line-through" : "text-fg"}`}>
                  {t(`setup.step_${s.key}`)}{s.optional && !s.done ? ` ${t("setup.optional")}` : ""}
                </div>
                {!s.done && <div className="text-[12px] text-muted leading-snug">{t(`setup.hint_${s.key}`)}</div>}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 pt-0.5">
          <button className="btn-primary" onClick={onGoAdmin}>{t("setup.go_admin")}</button>
          {dismissible && (
            <button className="btn-ghost w-auto px-4" onClick={dismiss}>{t("setup.dismiss")}</button>
          )}
        </div>
      </div>
    </div>
  );
}
