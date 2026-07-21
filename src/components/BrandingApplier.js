"use client";
import { useEffect, useLayoutEffect } from "react";
import { useSession } from "./SessionProvider";
import { getBrandingFont } from "@/lib/data";
import { resolveBranding, fontById, googleFontHref, CUSTOM_FONT_FAMILY } from "@/lib/branding";

// Apply the palette/scale synchronously BEFORE the browser paints the first
// signed-in frame, so a non-default store never flashes the default green (and
// its root-font-size never jump-reflows). useLayoutEffect can't run on the
// server, so fall back to useEffect there to avoid React's SSR warning.
const useBrandingLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Applies the owner's chosen appearance (color palette + display font + text
// size) to <html>, layered ON TOP of the device light/dark theme. Mounted inside
// SessionProvider, so it only runs once a store is signed in — the login screen
// and /dev have no vendor and stay on the default (green / system font / 100%).
// Everything is cleared when the vendor goes away (sign-out), so a stale store's
// branding never lingers on the next login screen. Live-updates on save/undo for
// free, because AdminPanel's save does setVendor({...vendor, ...patch}).
//
// The palette values live in globals.css ([data-palette] blocks); a curated font
// loads its stylesheet from Google Fonts at runtime (only when picked); a custom
// uploaded font is injected as an @font-face from its stored data: URL.

const LINK_ID = "brand-font-link";
const FACE_ID = "brand-font-face";
// The base green ink (layout.js seeds the same value), restored on sign-out.
const DEFAULT_THEME_COLOR = "#14532d";

// Match the mobile browser chrome (status-bar tint) to the store's palette, so a
// pink store doesn't show a green status bar. Reads the computed --ink the
// palette CSS just set — no per-palette table to keep in sync.
function setThemeColor(hex) {
  if (typeof document === "undefined") return;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m && hex) m.setAttribute("content", hex);
}

function setFontLink(href) {
  if (typeof document === "undefined") return;
  let link = document.getElementById(LINK_ID);
  if (!href) { link?.remove(); return; }
  if (!link) {
    link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

function setCustomFace(dataUrl, format) {
  if (typeof document === "undefined") return;
  let style = document.getElementById(FACE_ID);
  if (!dataUrl) { style?.remove(); return; }
  if (!style) {
    style = document.createElement("style");
    style.id = FACE_ID;
    document.head.appendChild(style);
  }
  // Fixed internal family name — the uploaded filename is never placed in CSS, so
  // it can't break out of the rule. `format` is a validated token from the route.
  const fmt = /^(woff2|woff|truetype|opentype)$/.test(format || "") ? format : "woff2";
  style.textContent = `@font-face{font-family:'${CUSTOM_FONT_FAMILY}';src:url(${dataUrl}) format('${fmt}');font-display:swap;}`;
}

export default function BrandingApplier() {
  const { vendor } = useSession();
  const palette = vendor?.themePalette;
  const fontFamily = vendor?.fontFamily;
  const fontScale = vendor?.fontScale;
  const vendorId = vendor?.id;

  // Palette + text-size + the curated-font stylesheet — applied before paint.
  useBrandingLayout(() => {
    if (typeof document === "undefined") return undefined;
    const el = document.documentElement;
    if (!vendorId) { // signed out — restore every default
      delete el.dataset.palette;
      el.style.removeProperty("--app-font");
      el.style.removeProperty("--font-scale");
      setFontLink(null);
      setCustomFace(null);
      setThemeColor(DEFAULT_THEME_COLOR);
      return undefined;
    }
    const b = resolveBranding({ themePalette: palette, fontFamily, fontScale });
    el.dataset.palette = b.themePalette;
    el.style.setProperty("--font-scale", String(b.fontScale));
    // The palette CSS (data-palette) has now set --ink; mirror it to the chrome.
    setThemeColor(getComputedStyle(el).getPropertyValue("--ink").trim() || DEFAULT_THEME_COLOR);

    const font = fontById(b.fontFamily);
    if (!b.fontFamily) {
      el.style.removeProperty("--app-font"); // system default
      setFontLink(null);
    } else {
      el.style.setProperty("--app-font", font.stack);
      setFontLink(googleFontHref(b.fontFamily)); // null for "custom" → no external sheet
    }
    return undefined;
  }, [vendorId, palette, fontFamily, fontScale]);

  // Custom uploaded font — fetch the bytes subdoc and inject its @font-face, only
  // while the store's font is "custom". Cleared otherwise.
  useEffect(() => {
    if (!vendorId || fontFamily !== "custom") { setCustomFace(null); return undefined; }
    let cancelled = false;
    getBrandingFont(vendorId).then((f) => {
      if (!cancelled && f?.dataUrl) setCustomFace(f.dataUrl, f.format);
    });
    return () => { cancelled = true; };
  }, [vendorId, fontFamily]);

  return null;
}
