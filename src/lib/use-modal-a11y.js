"use client";
import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Accessible modal behavior for a dialog panel: Escape closes it, focus moves
// into the panel on open and returns to the trigger element on close, and Tab
// is trapped inside the panel. Returns a ref to attach to the panel element
// (which should also carry role="dialog" aria-modal="true" and a tabIndex={-1}).
//
// `active` defaults to true — pass it for modals that stay mounted and toggle
// an `open` prop (so the behavior engages/disengages with visibility); leave it
// for modals that are conditionally rendered (mounted only while shown).
export function useModalA11y(onClose, active = true) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const panel = ref.current;
    if (!panel) return;
    const prevFocus = document.activeElement;
    const focusables = () => Array.from(panel.querySelectorAll(FOCUSABLE));

    (focusables()[0] || panel).focus?.();

    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key === "Tab") {
        const items = focusables();
        if (!items.length) { e.preventDefault(); panel.focus?.(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      prevFocus?.focus?.();
    };
  }, [active]); // closeRef keeps the latest handler without re-running

  return ref;
}
