// Per-store appearance: an owner picks a color THEME (6 palettes), a display
// FONT (a curated set + a custom upload), and a text SIZE — applied app-wide for
// their store. Mirrors resolveFeatures/resolveRewards: defaults spread UNDER the
// stored vendor values, so an existing store with nothing set stays on the
// default green / system font / normal size, and only what the owner picked
// overrides. The actual palette color values live in globals.css as
// `[data-palette=...]` blocks (theme-aware, they compose with `.dark`); this
// module owns the pickable OPTIONS + validation + the small helpers the applier
// and the settings UI share. Login and /dev have no vendor, so they stay default.

// The 6 selectable palettes. `swatch`/`swatchDark` are just the representative
// accent shown in the picker chip; the full token sets are in globals.css keyed
// by these same ids. WCAG-AA verified (accent ≥4.5:1 on bg, button text ≥4.5:1).
export const PALETTES = [
  { id: "green", label: "Forest", swatch: "#1f6b3e", swatchDark: "#7fd39e" },
  { id: "ocean", label: "Ocean", swatch: "#186592", swatchDark: "#7cc4e8" },
  { id: "indigo", label: "Indigo", swatch: "#5a4fcf", swatchDark: "#b3a9f5" },
  { id: "sunset", label: "Sunset", swatch: "#945200", swatchDark: "#f0b24a" },
  { id: "rose", label: "Rose", swatch: "#b02556", swatchDark: "#f090ac" },
  { id: "slate", label: "Slate", swatch: "#3f4e5c", swatchDark: "#a9b8c4" },
];
export const PALETTE_IDS = PALETTES.map((p) => p.id);

// The custom-font internal family name (fixed — never the uploaded filename, so a
// crafted name can't break out of the injected @font-face rule).
export const CUSTOM_FONT_FAMILY = "DuoCountCustom";
const SANS_FB = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const SERIF_FB = "Georgia, 'Times New Roman', serif";
const MONO_FB = "ui-monospace, SFMono-Regular, Menlo, monospace";
const q = (name, fb) => `'${name}', ${fb}`;

// Curated display fonts. `id` is what's stored on the vendor; `google` is the
// Google Fonts family (self-served from Google at runtime only when picked — no
// build-time fetch, nothing loads for stores on the default). "" = the app's
// system stack; "custom" = the owner's uploaded @font-face.
export const FONTS = [
  { id: "", label: "System default", google: null, stack: SANS_FB, cat: "sans" },
  { id: "Inter", label: "Inter", google: "Inter", stack: q("Inter", SANS_FB), cat: "sans" },
  { id: "Roboto", label: "Roboto", google: "Roboto", stack: q("Roboto", SANS_FB), cat: "sans" },
  { id: "Open Sans", label: "Open Sans", google: "Open Sans", stack: q("Open Sans", SANS_FB), cat: "sans" },
  { id: "Lato", label: "Lato", google: "Lato", stack: q("Lato", SANS_FB), cat: "sans" },
  { id: "Work Sans", label: "Work Sans", google: "Work Sans", stack: q("Work Sans", SANS_FB), cat: "sans" },
  { id: "Source Sans 3", label: "Source Sans 3", google: "Source Sans 3", stack: q("Source Sans 3", SANS_FB), cat: "sans" },
  { id: "IBM Plex Sans", label: "IBM Plex Sans", google: "IBM Plex Sans", stack: q("IBM Plex Sans", SANS_FB), cat: "sans" },
  { id: "Nunito Sans", label: "Nunito Sans", google: "Nunito Sans", stack: q("Nunito Sans", SANS_FB), cat: "sans" },
  { id: "Manrope", label: "Manrope", google: "Manrope", stack: q("Manrope", SANS_FB), cat: "sans" },
  { id: "DM Sans", label: "DM Sans", google: "DM Sans", stack: q("DM Sans", SANS_FB), cat: "sans" },
  { id: "Plus Jakarta Sans", label: "Plus Jakarta Sans", google: "Plus Jakarta Sans", stack: q("Plus Jakarta Sans", SANS_FB), cat: "sans" },
  { id: "Poppins", label: "Poppins", google: "Poppins", stack: q("Poppins", SANS_FB), cat: "sans" },
  { id: "Rubik", label: "Rubik", google: "Rubik", stack: q("Rubik", SANS_FB), cat: "sans" },
  { id: "Lora", label: "Lora", google: "Lora", stack: q("Lora", SERIF_FB), cat: "serif" },
  { id: "Merriweather", label: "Merriweather", google: "Merriweather", stack: q("Merriweather", SERIF_FB), cat: "serif" },
  { id: "Source Serif 4", label: "Source Serif 4", google: "Source Serif 4", stack: q("Source Serif 4", SERIF_FB), cat: "serif" },
  { id: "Libre Baskerville", label: "Libre Baskerville", google: "Libre Baskerville", stack: q("Libre Baskerville", SERIF_FB), cat: "serif" },
  { id: "Playfair Display", label: "Playfair Display", google: "Playfair Display", stack: q("Playfair Display", SERIF_FB), cat: "serif" },
  { id: "JetBrains Mono", label: "JetBrains Mono", google: "JetBrains Mono", stack: q("JetBrains Mono", MONO_FB), cat: "mono" },
  { id: "IBM Plex Mono", label: "IBM Plex Mono", google: "IBM Plex Mono", stack: q("IBM Plex Mono", MONO_FB), cat: "mono" },
  { id: "Space Mono", label: "Space Mono", google: "Space Mono", stack: q("Space Mono", MONO_FB), cat: "mono" },
  { id: "Oswald", label: "Oswald", google: "Oswald", stack: q("Oswald", "'Arial Narrow', sans-serif"), cat: "display" },
  { id: "Bebas Neue", label: "Bebas Neue", google: "Bebas Neue", stack: q("Bebas Neue", "Impact, sans-serif"), cat: "display" },
  { id: "Caveat", label: "Caveat", google: "Caveat", stack: q("Caveat", "'Segoe Script', cursive"), cat: "display" },
  { id: "Dancing Script", label: "Dancing Script", google: "Dancing Script", stack: q("Dancing Script", "'Segoe Script', cursive"), cat: "display" },
  { id: "custom", label: "Custom (uploaded)", google: null, stack: q(CUSTOM_FONT_FAMILY, SANS_FB), cat: "custom" },
];
export const FONT_IDS = FONTS.map((f) => f.id);

// Discrete text sizes (a free slider blows up dense screens). The number is the
// root-rem multiplier applied as html{ font-size: calc(16px * scale) }.
export const FONT_SCALES = [
  { id: "s", scale: 0.9, label: "Small" },
  { id: "m", scale: 1, label: "Default" },
  { id: "l", scale: 1.12, label: "Large" },
  { id: "xl", scale: 1.25, label: "Larger" },
];
export const SCALE_MIN = 0.9;
export const SCALE_MAX = 1.25;

export const DEFAULT_BRANDING = { themePalette: "green", fontFamily: "", fontScale: 1 };

export function fontById(id) {
  return FONTS.find((f) => f.id === (id ?? "")) || FONTS[0];
}

// The runtime Google Fonts stylesheet URL for a picked font (null for the
// system default, the custom upload, or an unknown id — those load no external
// sheet). Weights cover the app's regular→bold range.
export function googleFontHref(id) {
  const f = fontById(id);
  if (!f.google) return null;
  const fam = f.google.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@400;500;600;700&display=swap`;
}

// Coerce a vendor's stored appearance to a valid, complete set — unknown palette
// or font falls back to the default; scale is clamped to the supported range.
export function resolveBranding(vendor) {
  const themePalette = PALETTE_IDS.includes(vendor?.themePalette) ? vendor.themePalette : "green";
  const fontFamily = FONT_IDS.includes(vendor?.fontFamily) ? vendor.fontFamily : "";
  const n = Number(vendor?.fontScale);
  const fontScale = Number.isFinite(n) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)) : 1;
  return { themePalette, fontFamily, fontScale };
}
