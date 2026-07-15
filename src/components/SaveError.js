"use client";
import { useLang } from "./LangProvider";
import { SAVE_FAILED } from "@/lib/use-save-state";

// Persistent, retryable save-failure banner for the count forms. Unlike the
// transient success toast, this stays put until the entry actually saves — so a
// failed save on spotty wifi can't quietly disappear. `message` is empty when
// there's nothing wrong (renders nothing); the SAVE_FAILED sentinel renders as
// the localized default line.
export default function SaveError({ message, onRetry, busy }) {
  const { t } = useLang();
  if (!message) return null;
  const text = message === SAVE_FAILED ? t("err.save_failed") : message;
  return (
    <div role="alert" aria-live="assertive"
      className="rounded-xl border border-neg bg-subtle px-3.5 py-3 flex items-start gap-3">
      <span aria-hidden="true" className="text-neg text-base leading-none mt-0.5">⚠</span>
      <p className="text-sm text-fg font-medium leading-snug min-w-0 flex-1">{text}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} disabled={busy}
          className="btn-ghost w-auto flex-shrink-0 px-3 py-1.5 text-[13px]">
          {busy ? t("common.retrying") : t("common.retry")}
        </button>
      )}
    </div>
  );
}
