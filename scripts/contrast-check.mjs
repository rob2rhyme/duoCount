// Theme-contrast guard — reproduces the WCAG 2.1 relative-luminance check from
// docs/theme-accessibility-audit.md, but automated: it parses the LIVE theme
// tokens out of src/app/globals.css (so any future token edit is re-checked
// against the thresholds instead of trusting the hand-maintained table) and
// verifies every meaningful text/background pairing in both themes.
//
// Run directly:  npm run check:contrast   (prints a table, exits 1 on any fail)
// Asserted in:   tests/contrast.test.mjs
//
// Pure Node, no dependencies.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const GLOBALS = new URL("../src/app/globals.css", import.meta.url);

// ---- WCAG contrast math -----------------------------------------------------
function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Bad hex: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
  const l1 = relLuminance(a), l2 = relLuminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// ---- token parsing ----------------------------------------------------------
// Pull `--name: #hex` pairs out of a `:root { … }` / `.dark { … }` CSS block.
function parseBlock(css, selector) {
  const m = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`No ${selector} block in globals.css`);
  const out = {};
  for (const line of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)) out[line[1]] = line[2];
  return out;
}
export function parseTokens(css) {
  return { light: parseBlock(css, ":root"), dark: parseBlock(css, "\\.dark") };
}

// Fixed brand + Tailwind status-palette colors (constant across themes). Kept in
// sync with tailwind.config.js and the status chips in LogList/IncidentsPanel.
const FIXED = {
  ink: "#1a1c2e", paper: "#f6f4ee", brass: "#b8863b",
  "red-100": "#fee2e2", "red-700": "#b91c1c",
  "green-100": "#dcfce7", "green-700": "#15803d",
  "amber-100": "#fef3c7", "amber-700": "#b45309",
  "purple-100": "#f3e8ff", "purple-700": "#7e22ce",
};

const NORMAL = 4.5;  // AA normal text
const NONTEXT = 3.0; // AA non-text / large text (focus ring, placeholders)
const BOTH = ["light", "dark"];

// Every meaningful pairing from the audit's "Verified — passing" table. `fg`/`bg`
// are token names (resolved per theme) or FIXED color keys.
const PAIRS = [
  ...["bg", "surface", "panel", "subtle", "field"].map((bg) => ({ label: `fg on ${bg}`, fg: "fg", bg, th: NORMAL, themes: BOTH })),
  ...["bg", "surface", "panel", "subtle"].map((bg) => ({ label: `muted on ${bg}`, fg: "muted", bg, th: NORMAL, themes: BOTH })),
  ...["bg", "surface", "panel"].map((bg) => ({ label: `pos on ${bg}`, fg: "pos", bg, th: NORMAL, themes: BOTH })),
  ...["bg", "surface", "panel"].map((bg) => ({ label: `neg on ${bg}`, fg: "neg", bg, th: NORMAL, themes: BOTH })),
  { label: "gold on surface", fg: "gold", bg: "surface", th: NORMAL, themes: BOTH },
  { label: "gold on highlight", fg: "gold", bg: "highlight", th: NORMAL, themes: BOTH },
  // faint is reserved for placeholders/decoration — held to the non-text ≥3:1 bar.
  { label: "faint on surface", fg: "faint", bg: "surface", th: NONTEXT, themes: BOTH },
  { label: "faint on field", fg: "faint", bg: "field", th: NONTEXT, themes: BOTH },
  // Focus indicator: brass field border must clear 3:1 against the field.
  { label: "brass focus ring on field", fg: "brass", bg: "field", th: NONTEXT, themes: BOTH },
  // Fixed brand + status chips (theme-independent — evaluated once, tagged "fixed").
  { label: "paper on ink (header)", fg: "paper", bg: "ink", th: NORMAL, themes: ["fixed"] },
  { label: "ink on brass (badge)", fg: "ink", bg: "brass", th: NORMAL, themes: ["fixed"] },
  { label: "red-700 chip", fg: "red-700", bg: "red-100", th: NORMAL, themes: ["fixed"] },
  { label: "green-700 chip", fg: "green-700", bg: "green-100", th: NORMAL, themes: ["fixed"] },
  { label: "amber-700 chip", fg: "amber-700", bg: "amber-100", th: NORMAL, themes: ["fixed"] },
  { label: "purple-700 chip", fg: "purple-700", bg: "purple-100", th: NORMAL, themes: ["fixed"] },
];

// Resolve a token/fixed name to a hex for the given theme.
function resolve(name, theme, tokens) {
  if (FIXED[name]) return FIXED[name];
  const t = theme === "fixed" ? tokens.light : tokens[theme];
  if (!t[name]) throw new Error(`Unknown color "${name}" for theme ${theme}`);
  return t[name];
}

// Evaluate every pairing; returns [{ label, theme, fg, bg, ratio, threshold, pass }].
export function evaluate(css = readFileSync(GLOBALS, "utf8")) {
  const tokens = parseTokens(css);
  const results = [];
  for (const p of PAIRS) {
    for (const theme of p.themes) {
      const fg = resolve(p.fg, theme, tokens);
      const bg = resolve(p.bg, theme, tokens);
      const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
      results.push({ label: p.label, theme, fg, bg, ratio, threshold: p.th, pass: ratio >= p.th });
    }
  }
  return results;
}

// ---- CLI --------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = evaluate();
  const fails = results.filter((r) => !r.pass);
  for (const r of results) {
    const tag = r.pass ? "ok  " : "FAIL";
    console.log(`${tag} ${r.ratio.toFixed(2).padStart(6)} : ${r.threshold.toFixed(1)}  ${r.theme.padEnd(5)}  ${r.label}  (${r.fg} on ${r.bg})`);
  }
  console.log(`\n${results.length} pairings checked, ${fails.length} failing.`);
  process.exit(fails.length ? 1 : 0);
}
