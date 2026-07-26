"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./ThemeProvider";
import { usePrefs } from "./PrefsProvider";
import { useLang } from "./LangProvider";
import { useSession } from "./SessionProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import { useInstallPrompt } from "@/lib/install";
import { updateVendorSettings, apiBranding } from "@/lib/data";
import { PALETTES, FONTS, FONT_SCALES, resolveBranding } from "@/lib/branding";

function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? "bg-brass" : "bg-line"}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// Header gear → the Settings menu: per-device preferences (theme + the
// scroll-to-top FAB, kept personal via localStorage so one person's choice
// never changes what a coworker sees), the install prompt, and — when
// `onSignOut` is supplied — the account's Sign out action, so the header stays
// a single control.
export default function PreferencesMenu({ onSignOut }) {
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { fabEnabled, setFabEnabled } = usePrefs();
  const { available: canInstall, promptInstall } = useInstallPrompt();
  const { vendor, isOwner, setVendor } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Store appearance (color theme / font / text size) — owner-only, store-wide.
  // Saves immediately and live-applies: setVendor drives BrandingApplier, and
  // updateVendorSettings filters the patch to the branding keys the rules allow.
  // Reverts on a failed write.
  const brand = resolveBranding(vendor);
  const [uploadingFont, setUploadingFont] = useState(false);
  const [fontErr, setFontErr] = useState("");
  async function saveBranding(patch) {
    if (!vendor?.id) return;
    const prev = { themePalette: brand.themePalette, fontFamily: brand.fontFamily, fontScale: brand.fontScale };
    const next = { ...prev, ...patch };
    setVendor({ ...vendor, ...next });
    try { await updateVendorSettings(vendor.id, next); }
    catch { setVendor({ ...vendor, ...prev }); }
  }
  // Custom-font upload → the trusted /api/branding route (validates + stores the
  // bytes off the vendor doc), then select "custom" so it applies immediately.
  async function onFontUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingFont(true); setFontErr("");
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error(t("appr.upload_read_err")));
        r.readAsDataURL(file);
      });
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const format = ext === "woff2" ? "woff2" : ext === "woff" ? "woff"
        : ext === "ttf" ? "truetype" : ext === "otf" ? "opentype" : "woff2";
      await apiBranding({ dataUrl, format });
      await saveBranding({ fontFamily: "custom" });
    } catch (err) {
      setFontErr(err?.code ? t(`appr.err_${err.code}`) : (err?.message || t("appr.upload_read_err")));
    } finally { setUploadingFont(false); }
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        aria-label={t("prefs.settings")} aria-haspopup="true" aria-expanded={open}
        className="inline-grid place-items-center w-8 h-8 rounded-full text-paper/90 hover:text-paper hover:bg-white/10 border border-white/15 transition">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div role="group" aria-label={t("prefs.settings")}
          className="card absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] max-h-[85vh] overflow-y-auto z-50 p-3 space-y-3.5 text-fg shadow-xl">
          <div>
            <div className="label mb-1.5">{t("lang.language")}</div>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-subtle">
              {LOCALES.map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)} role="menuitemradio" aria-checked={lang === l}
                  className={`px-2 py-1.5 rounded-md text-sm font-semibold transition ${lang === l ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
                  {LOCALE_LABELS[l] || l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="label mb-1.5">{t("prefs.display")}</div>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-subtle">
              {["light", "dark"].map((th) => (
                <button key={th} type="button" onClick={() => setTheme(th)} role="menuitemradio" aria-checked={theme === th}
                  className={`px-2 py-1.5 rounded-md text-sm font-semibold transition ${theme === th ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
                  {t(`prefs.theme_${th}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Store appearance — the owner's color theme / font / text size,
              store-wide, applied instantly. Only owners see it; other users keep
              the personal Display + Language controls above. Custom-font UPLOAD
              stays in Admin (a file picker doesn't belong in a quick menu). */}
          {isOwner && vendor?.id && (
            <div className="pt-3 border-t border-line">
              <div className="label mb-1">{t("appr.title")}</div>
              <p className="text-[11px] text-muted mb-2 leading-snug">{t("appr.sub")}</p>
              <div className="text-[11px] text-muted font-semibold mb-1.5">{t("appr.theme")}</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {PALETTES.map((p) => {
                  const on = brand.themePalette === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => saveBranding({ themePalette: p.id })}
                      aria-pressed={on} title={t(`appr.pal_${p.id}`)}
                      className={`inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full border text-[12px] font-semibold transition ${on ? "border-fg text-fg" : "border-line text-muted hover:text-fg"}`}>
                      <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-line" style={{ background: p.swatch }} />
                      {t(`appr.pal_${p.id}`)}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block min-w-0">
                  <span className="text-[11px] text-muted font-semibold">{t("appr.font")}</span>
                  <select className="input mt-1 py-1.5 text-[13px]" value={brand.fontFamily}
                    onChange={(e) => saveBranding({ fontFamily: e.target.value })}>
                    {FONTS.filter((f) => f.id !== "custom" || vendor.fontFamily === "custom").map((f) => (
                      <option key={f.id} value={f.id}>{f.id === "" ? t("appr.font_system") : f.id === "custom" ? t("appr.font_custom") : f.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className="text-[11px] text-muted font-semibold">{t("appr.size")}</span>
                  <select className="input mt-1 py-1.5 text-[13px]" value={String(brand.fontScale)}
                    onChange={(e) => saveBranding({ fontScale: Number(e.target.value) })}>
                    {FONT_SCALES.map((sc) => <option key={sc.id} value={sc.scale}>{t(`appr.size_${sc.id}`)}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-2.5">
                <span className="text-[11px] text-muted font-semibold">{t("appr.upload")}</span>
                <input type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                  disabled={uploadingFont} onChange={onFontUpload}
                  className="block w-full text-[12px] text-muted mt-1 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border file:border-line file:bg-subtle file:text-fg file:font-semibold file:text-[12px]" />
                <p className="text-[11px] text-muted mt-1 leading-snug">{uploadingFont ? t("appr.uploading") : t("appr.upload_hint")}</p>
                {fontErr && <p className="text-[11px] text-neg mt-1">{fontErr}</p>}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t("prefs.fab_title")}</div>
              <div className="text-xs text-muted">{t("prefs.fab_sub")}</div>
            </div>
            <Switch on={fabEnabled} onChange={setFabEnabled} label={t("prefs.fab_aria")} />
          </div>

          {canInstall && (
            <button type="button" onClick={() => { promptInstall(); setOpen(false); }}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-subtle text-fg font-semibold text-sm py-2 hover:bg-line transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12M8 11l4 4 4-4M4 21h16" />
              </svg>
              {t("prefs.install")}
            </button>
          )}

          {/* Help at the moment of confusion: the guide was only linked on the
              sign-in screen, unreachable once installed + logged in. New tab so
              the clerk's in-progress count is never navigated away from. */}
          <a href="/guide" target="_blank" rel="noopener"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-semibold hover:bg-subtle transition">
            <span aria-hidden="true">📖</span> {t("login.user_guide")}
          </a>

          {onSignOut && (
            <div className="pt-2.5 border-t border-line">
              <button type="button" onClick={() => { setOpen(false); onSignOut(); }}
                className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-semibold text-neg hover:bg-subtle transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2v10" />
                  <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                </svg>
                {t("prefs.sign_out")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
