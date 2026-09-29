// Inventory of Tailwind utilities that are dead because a component class in the
// same className already sets that property and wins the cascade.
//
//   npm run check:css            summary by property and file
//   npm run check:css -- --list  every occurrence, file:line
//
// Background and the real fix are in src/lib/css-conflicts.js. Exits non-zero
// when anything is found, so it can gate a future cleanup; the committed
// baseline in tests/css-conflicts.test.mjs is what CI actually enforces today.
import fs from "node:fs";
import path from "node:path";
import { findDeadUtilities, countByFile } from "../src/lib/css-conflicts.js";

const CSS = "src/app/globals.css";
const ROOT = "src";

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push({ path: p, source: fs.readFileSync(p, "utf8") });
  }
})(ROOT);

const hits = findDeadUtilities({ css: fs.readFileSync(CSS, "utf8"), files });
const byFile = countByFile(hits);
const byFamily = {};
for (const h of hits) byFamily[h.family] = (byFamily[h.family] || 0) + 1;

if (!hits.length) {
  console.log("No dead utilities. Every utility beside a component class takes effect.");
  process.exit(0);
}

console.log(`\n${hits.length} dead utilities across ${Object.keys(byFile).length} files\n`);
console.log("  by property");
for (const [f, n] of Object.entries(byFamily).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${f}`);
}
console.log("\n  by file");
for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${f}`);
}
if (process.argv.includes("--list")) {
  console.log("\n  every occurrence");
  for (const h of hits) console.log(`    ${h.path}:${h.line}  .${h.component} + ${h.utility}  (${h.family})`);
}
console.log("\nThese utilities are written but never applied. See src/lib/css-conflicts.js.\n");
process.exit(1);
