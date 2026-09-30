// Finds Tailwind utilities that are DEAD because a component class in the same
// className already sets that property and wins the cascade. Pure — callers do
// the file reading (scripts/css-conflicts.mjs, tests/css-conflicts.test.mjs).
//
// THE BUG THIS EXISTS FOR
//
// globals.css defines .input/.btn/.card outside any @layer, so they are emitted
// AFTER `@tailwind utilities`. A component class and a utility are both a single
// class — equal specificity — so source order decides, and the component wins.
// `className="btn-ghost px-3 py-1.5"` renders at .btn's px-4/py-2.5; the two
// utilities do nothing. That reads as a deliberate compact button in every
// editor and is not one in any browser.
//
// This finds every such utility so the scale of the problem is a number rather
// than a guess, and so no new one is added silently. The real fix is to wrap the
// component classes in `@layer components`, which puts them BEFORE utilities and
// makes all of these live at once — a change that alters how ~30 files render
// and therefore wants this inventory first.
//
// SCOPE, deliberately narrow to stay free of false positives:
//   • Unprefixed utilities only. `hover:`/`focus:`/`dark:` variants compile to a
//     compound or pseudo-class selector, which OUT-specifies the component rule
//     and therefore wins — they are not dead. Responsive `sm:` variants do lose,
//     but they are rare here and excluded rather than half-modelled.
//   • Only properties a component class actually sets, expanded through @apply
//     (including component-to-component, e.g. `.btn-ghost { @apply btn border }`).
//   • Escape hatches are honoured: a `.comp.util { … }` rule re-asserts the
//     property at (0,2,0) and rescues that utility. `.btn-ghost.text-neg` is the
//     live example — it is why Delete store is red.

const DISPLAY = new Set(["block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "hidden", "contents"]);
const WEIGHTS = new Set(["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"]);
const SIZES = new Set(["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"]);
// Colour tokens from tailwind.config.js plus the built-ins actually used here.
// A `text-<token>` sets colour; anything else after `text-` is a size, an
// alignment, or a wrap/overflow keyword — all of which are checked first, so
// only genuine colour tokens reach the fallback.
const COLORS = new Set(["surface", "panel", "subtle", "field", "line", "highlight", "fg", "muted",
  "faint", "gold", "pos", "neg", "brass", "alert", "ink", "paper", "white", "black", "transparent", "current"]);

/** The CSS property family a utility sets, or null when we don't model it. */
export function utilityFamily(cls) {
  if (!cls || cls.includes(":")) return null; // variants out-specify; see SCOPE
  if (DISPLAY.has(cls)) return "display";
  if (/^(uppercase|lowercase|capitalize|normal-case)$/.test(cls)) return "text-transform";
  if (cls === "border") return "border-width";
  if (cls === "rounded") return "border-radius";
  if (/^transition/.test(cls)) return "transition";
  if (/^shadow/.test(cls)) return "box-shadow";
  if (/^outline-/.test(cls)) return "outline";
  const i = cls.indexOf("-");
  if (i < 0) return null;
  const head = cls.slice(0, i);
  const tail = cls.slice(i + 1);
  if (head === "max" && tail.startsWith("w-")) return "max-width";
  if (head === "w") return "width";
  if (head === "h") return "height";
  if (head === "p") return "padding";
  if (head === "px" || head === "py" || /^p[trbl]$/.test(head)) return `padding-${head.slice(1)}`;
  if (head === "m" || head === "mx" || head === "my" || /^m[trbl]$/.test(head)) return `margin-${head.slice(1) || "all"}`;
  if (head === "rounded") return "border-radius";
  if (head === "gap") return "gap";
  if (head === "items") return "align-items";
  if (head === "justify") return "justify-content";
  if (head === "tracking") return "letter-spacing";
  if (head === "leading") return "line-height";
  if (head === "opacity") return "opacity";
  if (head === "bg") return "background";
  if (head === "border") return COLORS.has(tail.split("/")[0]) ? "border-color" : "border-width";
  if (head === "font") return WEIGHTS.has(tail) ? "font-weight" : "font-family";
  if (head === "text") {
    if (/^(left|center|right|justify|start|end)$/.test(tail)) return "text-align";
    if (/^(wrap|nowrap|balance|pretty)$/.test(tail)) return "text-wrap";
    if (/^(ellipsis|clip)$/.test(tail)) return "text-overflow";
    if (SIZES.has(tail) || tail.startsWith("[")) return "font-size";
    return "color"; // text-<token>, including ones not in COLORS
  }
  return null;
}

// A plain declaration in a component rule -> the families it occupies. Shorthands
// cover more than their name: `border` sets width AND colour, `padding` all axes.
const DECL_FAMILIES = {
  background: ["background"], "background-color": ["background"], color: ["color"],
  "border-color": ["border-color"], border: ["border-width", "border-color"],
  "max-width": ["max-width"], width: ["width"],
  padding: ["padding", "padding-x", "padding-y"],
  "padding-left": ["padding-x"], "padding-right": ["padding-x"],
  "padding-top": ["padding-y"], "padding-bottom": ["padding-y"],
};

/** Single-line `.name { @apply …; decls }` rules, keyed by class name. */
export function parseComponentRules(css) {
  const out = {};
  for (const m of String(css).matchAll(/^\.([a-z][\w-]*)\s*\{([^}]*)\}/gm)) {
    const body = m[2];
    const apply = /@apply ([^;]+);/.exec(body)?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
    const decls = [...body.replace(/@apply [^;]+;/, "").matchAll(/([a-z-]+)\s*:/g)].map((d) => d[1]);
    out[m[1]] = { apply, decls };
  }
  return out;
}

/** `comp|util|family` keys for every `.comp.util { … }` escape hatch. */
export function parseEscapeHatches(css) {
  const out = new Set();
  for (const m of String(css).matchAll(/\.([a-z][\w-]*)\.((?:[\w-]|\\.|\[|\])+)\s*\{([^}]*)\}/g)) {
    const util = m[2].replace(/\\/g, "");
    for (const d of m[3].matchAll(/([a-z-]+)\s*:/g)) {
      for (const f of DECL_FAMILIES[d[1]] || [d[1]]) out.add(`${m[1]}|${util}|${f}`);
    }
  }
  return out;
}

/** Every family a component class occupies, following @apply into other components. */
export function ownedFamilies(name, rules, seen = new Set()) {
  const out = new Set();
  if (seen.has(name) || !rules[name]) return out;
  seen.add(name);
  for (const u of rules[name].apply) {
    if (rules[u]) { for (const f of ownedFamilies(u, rules, seen)) out.add(f); continue; }
    const f = utilityFamily(u);
    if (!f) continue;
    out.add(f);
    if (f === "padding") { out.add("padding-x"); out.add("padding-y"); }
  }
  for (const d of rules[name].decls) for (const f of DECL_FAMILIES[d] || []) out.add(f);
  return out;
}

/**
 * Dead utilities across the given sources.
 * `files` is [{ path, source }]; returns [{ path, line, component, utility, family }].
 */
export function findDeadUtilities({ css, files, components }) {
  const rules = parseComponentRules(css);
  const rescued = parseEscapeHatches(css);
  const targets = components ?? Object.keys(rules).filter((n) => rules[n].apply.length);
  const owned = Object.fromEntries(targets.map((t) => [t, ownedFamilies(t, rules)]));
  const hits = [];
  for (const { path, source } of files) {
    String(source).split("\n").forEach((line, idx) => {
      // Any quoted run holding a component class — className, a ternary branch,
      // a template-literal segment. Over-reaching is harmless: a string has to
      // contain a component class AND a colliding utility to be reported.
      for (const q of line.matchAll(/["'`]([^"'`]*)["'`]/g)) {
        const tokens = q[1].split(/[\s${}]+/).filter(Boolean);
        const present = tokens.filter((t) => targets.includes(t));
        if (!present.length) continue;
        const own = new Set(present.flatMap((c) => [...owned[c]]));
        for (const t of tokens) {
          if (targets.includes(t)) continue;
          const family = utilityFamily(t);
          if (!family || !own.has(family)) continue;
          if (present.some((c) => rescued.has(`${c}|${t}|${family}`))) continue;
          hits.push({ path, line: idx + 1, component: present.join("+"), utility: t, family });
        }
      }
    });
  }
  return hits;
}

/** Dead-utility count per file, for a baseline that survives line edits. */
export function countByFile(hits) {
  const out = {};
  for (const h of hits) out[h.path] = (out[h.path] || 0) + 1;
  return out;
}
