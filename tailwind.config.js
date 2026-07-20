/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand accent, now driven by the owner-selected palette (globals.css
        // `[data-palette]` blocks). `ink` is the deep header/logo stop; `brass`
        // is the workhorse accent — kept as RGB channels so Tailwind's opacity
        // modifiers (bg-brass/10, ring-brass/20, …) still resolve. `paper` (the
        // cream text on the header) stays fixed — it reads on every palette's ink.
        ink: "var(--ink)",
        paper: "#f6f4ee",
        brass: { DEFAULT: "rgb(var(--brass) / <alpha-value>)", dk: "rgb(var(--brass) / <alpha-value>)" },
        // Notification count badges — pure red, theme-independent.
        alert: "#ff0000",
        // Semantic, theme-aware tokens. Each maps to a CSS variable defined in
        // globals.css for both light (:root) and dark (.dark) themes, so a
        // single class works in both modes.
        surface: "var(--surface)",   // cards, modals, raised chrome
        panel: "var(--panel)",       // muted inset panels / readouts
        subtle: "var(--subtle)",     // neutral chips, ghost surfaces
        field: "var(--field)",       // form input backgrounds
        line: { DEFAULT: "var(--line)", soft: "var(--line-soft)" }, // borders
        highlight: "var(--highlight)", // gold-tinted accent surfaces
        fg: "var(--fg)",             // primary text
        muted: "var(--muted)",       // secondary text
        faint: "var(--faint)",       // tertiary text / hints (placeholders)
        gold: "var(--gold)",         // gold accent text (adapts per theme)
        pos: "var(--pos)",           // positive/over inline status text (AA in both themes)
        neg: "var(--neg)",           // negative/short/error inline status text (AA in both themes)
      },
      fontFamily: {
        // The owner-selected display font drives --app-font (BrandingApplier);
        // unset = the system stack below. `font-sans` and inherited body text
        // both follow it. `mono` stays independent so amount/receipt columns
        // keep tabular figures regardless of the branding font.
        sans: ["var(--app-font)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
