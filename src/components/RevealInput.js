"use client";
import { useState } from "react";
import { useLang } from "./LangProvider";

// A secret field with an opt-in reveal toggle: the eye button inside the right
// edge flips the control between type="password" and type="text".
//
// Why it exists. A masked field gives no feedback at all, so a mistyped
// character, a truncated paste, or a stray leading space is indistinguishable
// from simply knowing the wrong secret — and on the developer sign-in that
// ambiguity costs a redeploy per guess. NIST SP 800-63B says the verifier
// SHOULD offer to display the secret for exactly this reason. Note the rest of
// the app already types PINs in the clear (PinLogin, ResetPin, MustChangePin
// all use type="tel"), so this narrows an inconsistency rather than widening
// what's visible.
//
// It is off by default and deliberately not persisted anywhere: every mount
// starts masked, so a shared or unattended screen never comes back revealed.
//
// Props spread onto the <input>, so it drops in wherever a plain
// `<input type="password" className="input">` stood — including inside <Field>,
// which clones its single child to set id/aria-describedby; both ride the
// spread onto the real control, so the caption still labels the input itself.
export default function RevealInput({ className = "input", disabled, ...rest }) {
  const { t } = useLang();
  const [shown, setShown] = useState(false);
  const label = t(shown ? "common.hide_secret" : "common.show_secret");
  return (
    <div className="relative">
      <input
        {...rest}
        disabled={disabled}
        type={shown ? "text" : "password"}
        className={`${className} input-reveal`}
      />
      {/* type="button" so Enter-to-submit in the field isn't hijacked, and the
          toggle is skipped when the field is disabled — there's nothing to
          read and a focusable control on an inert field is a trap. */}
      {!disabled && (
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={label}
          aria-pressed={shown}
          title={label}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted transition hover:text-fg focus-visible:ring-2 focus-visible:ring-brass/40 outline-none"
        >
          <EyeIcon off={shown} />
        </button>
      )}
    </div>
  );
}

// Feather-style line icons, stroke = currentColor so they inherit the field's
// theme colour. The slashed eye marks the revealed state — the icon shows the
// action's result, matching how the rest of the app draws toggles.
function EyeIcon({ off }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}
