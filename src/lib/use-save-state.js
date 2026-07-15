import { useState } from "react";

// Shared save-state for the count forms. It wraps the async save so a *failure*
// becomes a persistent inline error with a Retry — instead of a ~2.2s toast that
// vanishes before a clerk on flaky wifi ever notices it. "Did my count save?" is
// existential for a trust product, so the error stays on screen until the save
// actually succeeds (which clears it) or the user retries.
//
// `run(fn)` runs the save, returns true on success / false on failure, and never
// throws. A thrown error may carry a `.userMessage` for a friendlier line;
// otherwise `error` is the SAVE_FAILED sentinel, which the form maps through the
// i18n catalog (t("err.save_failed")) so the failure reads in the clerk's language.
export const SAVE_FAILED = "save_failed";

export function useSaveState() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (e) {
      console.error(e);
      setError((e && e.userMessage) || SAVE_FAILED);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run, clearError: () => setError("") };
}
