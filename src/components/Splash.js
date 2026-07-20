"use client";
import Logo from "./Logo";
import { PRODUCT } from "@/lib/store";

// Full-screen branded boot splash. Shown while auth resolves (the login gate)
// AND while the first data snapshot loads (the app shell), so a refresh lands
// on a clean DuoCount screen instead of a bare "Loading…" or — worse — a
// misleading "No activity yet" empty state that flashes before the store's data
// arrives. iOS only paints its native startup image on a cold home-screen
// launch, never on an in-app reload, so THIS is the splash users see on refresh.
// Theme-aware (matches the manifest background) and centered like the native art.
export default function Splash({ label }) {
  return (
    <div className="min-h-screen grid place-items-center px-6"
      style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <div className="flex flex-col items-center gap-4 -mt-16">
        <Logo src="/logo.png" alt="DuoCount" size={133} rounded="rounded-2xl" />
        <div className="text-center">
          <div className="text-lg font-semibold text-fg">DuoCount</div>
          <div className="text-[12px] text-muted italic mt-0.5">{PRODUCT.tagline}</div>
        </div>
        <div className="mt-1 h-6 w-6 rounded-full border-2 border-line border-t-brass animate-spin"
          role="status" aria-label={label || "Loading"} />
      </div>
    </div>
  );
}
