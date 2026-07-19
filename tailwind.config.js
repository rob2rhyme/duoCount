/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Fixed brand constants (used where the color must not shift by theme:
        // the deep-green app header, the logo mark, PDF/print output).
        ink: "#14532d",
        paper: "#f6f4ee",
        brass: { DEFAULT: "#298050", dk: "#1f6b3e" },
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
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
