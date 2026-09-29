// Dead Tailwind utilities: ones written beside a component class that already
// sets the property and wins on source order. Run: npm run test:css-conflicts
// Inspect the inventory with: npm run check:css -- --list
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  utilityFamily, parseComponentRules, parseEscapeHatches, ownedFamilies,
  findDeadUtilities, countByFile,
} from "../src/lib/css-conflicts.js";

/* ------------------------------ the analyser ------------------------------ */

test("utilityFamily maps the utilities that can actually collide", () => {
  const cases = {
    "px-3": "padding-x", "py-1.5": "padding-y", "p-4": "padding", "pt-1": "padding-t",
    "w-auto": "width", "max-w-sm": "max-width", "rounded-xl": "border-radius", rounded: "border-radius",
    "gap-2": "gap", "bg-subtle": "background", "mb-1.5": "margin-b",
    "inline-flex": "display", block: "display", uppercase: "text-transform",
    border: "border-width", "border-2": "border-width", "border-line": "border-color",
    "font-bold": "font-weight", "font-mono": "font-family",
    "text-neg": "color", "text-xs": "font-size", "text-[13px]": "font-size", "text-center": "text-align",
  };
  for (const [cls, want] of Object.entries(cases)) {
    assert.equal(utilityFamily(cls), want, cls);
  }
});

test("a variant is never dead — it out-specifies the component rule", () => {
  // .hover\:text-fg:hover is (0,2,0) and beats .btn-ghost at (0,1,0), so these
  // work today and must not be reported.
  for (const v of ["hover:text-fg", "focus-visible:ring-2", "dark:bg-subtle", "disabled:opacity-50"]) {
    assert.equal(utilityFamily(v), null, v);
  }
});

test("unknown utilities are ignored rather than guessed at", () => {
  for (const c of ["truncate", "sr-only", "", null, undefined, "z-10", "select-all"]) {
    const f = utilityFamily(c);
    assert.ok(f === null || typeof f === "string");
  }
  assert.equal(utilityFamily("truncate"), null);
});

test("@apply is followed from one component into another", () => {
  const rules = parseComponentRules(`
.btn { @apply inline-flex gap-2 px-4 py-2.5 rounded-lg font-semibold; }
.btn-ghost { @apply btn border; background: var(--subtle); color: var(--fg); border-color: var(--line); }
.card { @apply rounded-2xl; border: 1px solid var(--line); }
`);
  const own = ownedFamilies("btn-ghost", rules);
  // Inherited from .btn ...
  for (const f of ["padding-x", "padding-y", "gap", "border-radius", "font-weight", "display"]) {
    assert.ok(own.has(f), `should own ${f}`);
  }
  // ... plus its own plain declarations. Note the `border` UTILITY contributes
  // width only — colour comes from the explicit border-color declaration, which
  // is why .btn-ghost carries one.
  for (const f of ["background", "color", "border-width", "border-color"]) {
    assert.ok(own.has(f), `should own ${f}`);
  }

  // The `border:` SHORTHAND declaration is the other case: it occupies both.
  const cardOwn = ownedFamilies("card", rules);
  assert.ok(cardOwn.has("border-width") && cardOwn.has("border-color"),
    "a border shorthand declaration occupies width and colour");
});

test("an escape hatch rescues the utility it names, and only that one", () => {
  const css = `
.btn-ghost { @apply inline-flex px-4; color: var(--fg); }
.btn-ghost.text-neg { color: var(--neg); }
`;
  const rescued = parseEscapeHatches(css);
  assert.ok(rescued.has("btn-ghost|text-neg|color"));
  assert.ok(!rescued.has("btn-ghost|text-muted|color"));

  const files = [{ path: "x.js", source: `<b className="btn-ghost text-neg" /><i className="btn-ghost text-muted" />` }];
  const hits = findDeadUtilities({ css, files });
  assert.deepEqual(hits.map((h) => h.utility), ["text-muted"], "only the unrescued one is dead");
});

test("end to end: the utility that loses is found, the one that doesn't is not", () => {
  const css = `.input { @apply w-full px-3; color: var(--fg); }`;
  const files = [{ path: "a.js", source: [
    `<input className="input px-6" />`,        // dead: .input owns padding-x
    `<input className="input w-auto" />`,      // dead: .input owns width
    `<input className="input text-center" />`, // fine: text-align is untouched
    `<input className="px-6" />`,              // fine: no component class
  ].join("\n") }];
  const hits = findDeadUtilities({ css, files });
  assert.deepEqual(
    hits.map((h) => `${h.line}:${h.utility}`),
    ["1:px-6", "2:w-auto"],
  );
});

/* ---------------------------- the repo inventory --------------------------- */
// A ratchet, not a target. globals.css defines its component classes outside any
// @layer, so they are emitted after `@tailwind utilities` and beat every utility
// of equal specificity — these 292 utilities are written and never applied. The
// fix is to move those classes into `@layer components`, which makes all of them
// live at once and changes how ~30 files render; that wants doing deliberately,
// with screenshots. Until then this stops the count growing.
//
// Counts are per FILE so ordinary edits don't churn the baseline. A count may
// fall freely; it may never rise, and a file not listed here may have none.
// When the @layer fix lands, empty this object.
const BASELINE =
{
  "src/app/dev/page.js": 31,
  "src/app/not-found.js": 1,
  "src/components/AccountCard.js": 3,
  "src/components/AdminPanel.js": 54,
  "src/components/BackroomStock.js": 5,
  "src/components/BalanceCheck.js": 1,
  "src/components/BarcodeScanner.js": 2,
  "src/components/CashForm.js": 6,
  "src/components/Dashboard.js": 14,
  "src/components/EmptyState.js": 2,
  "src/components/GamingTab.js": 4,
  "src/components/HelpDesk.js": 5,
  "src/components/ImportCard.js": 1,
  "src/components/IncidentsPanel.js": 2,
  "src/components/InventoryForm.js": 1,
  "src/components/LogList.js": 35,
  "src/components/MachineRegistryCard.js": 4,
  "src/components/NotesPanel.js": 5,
  "src/components/PinLogin.js": 3,
  "src/components/PortfolioView.js": 7,
  "src/components/PreferencesMenu.js": 6,
  "src/components/RecoveryShell.js": 3,
  "src/components/ReportModal.js": 7,
  "src/components/ResetPin.js": 6,
  "src/components/RewardsPanel.js": 8,
  "src/components/SaveError.js": 2,
  "src/components/Schedule.js": 11,
  "src/components/ScratchCensus.js": 2,
  "src/components/ScratchForm.js": 15,
  "src/components/ScratchGamesCard.js": 3,
  "src/components/ScratchHistory.js": 4,
  "src/components/ScratchReport.js": 7,
  "src/components/SetupChecklist.js": 1,
  "src/components/SupportCard.js": 4,
  "src/components/TimeClock.js": 11,
  "src/components/TimeOffPanel.js": 10,
  "src/components/VerifyEmail.js": 6
}
;

function repoInventory() {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.jsx?$/.test(e.name)) files.push({ path: p, source: fs.readFileSync(p, "utf8") });
    }
  })("src");
  return countByFile(findDeadUtilities({ css: fs.readFileSync("src/app/globals.css", "utf8"), files }));
}

test("no file gains a dead utility", () => {
  const now = repoInventory();
  const grew = Object.entries(now)
    .filter(([f, n]) => n > (BASELINE[f] ?? 0))
    .map(([f, n]) => `${f}: ${BASELINE[f] ?? 0} -> ${n}`);
  assert.deepEqual(grew, [],
    "A utility beside a component class that already sets that property never applies.\n" +
    "  Run `npm run check:css -- --list` to see which one.\n" +
    "  Either drop it, or add a `.component.utility { … }` escape hatch to globals.css.");
});

test("the baseline has no stale entries, so it shrinks as files are cleaned", () => {
  const now = repoInventory();
  const gone = Object.keys(BASELINE).filter((f) => !(f in now));
  assert.deepEqual(gone, [],
    "These files are clean now — remove them from BASELINE to lock the win in.");
});

test("the total never rises", () => {
  const total = Object.values(repoInventory()).reduce((a, b) => a + b, 0);
  const ceiling = Object.values(BASELINE).reduce((a, b) => a + b, 0);
  assert.ok(total <= ceiling, `dead utilities rose from ${ceiling} to ${total}`);
});
