// Theme-contrast guard — asserts every text/background pairing in globals.css
// meets its WCAG 2.1 AA threshold, in both themes. Run: npm run test:contrast
import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, parseTokens, evaluate } from "../scripts/contrast-check.mjs";

test("contrastRatio matches known WCAG anchors", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21); // max
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);              // identical
  assert.equal(contrastRatio("#000", "#fff"), contrastRatio("#fff", "#000")); // symmetric
});

test("globals.css exposes both theme token sets", () => {
  const { light, dark } = parseTokens(
    ":root{--fg:#111;--bg:#fff}\n.dark{--fg:#eee;--bg:#000}");
  assert.equal(light.fg, "#111");
  assert.equal(dark.bg, "#000");
});

test("every theme pairing clears its AA threshold in both light and dark", () => {
  const results = evaluate();
  const fails = results.filter((r) => !r.pass);
  const detail = fails.map((r) => `${r.label} [${r.theme}] ${r.ratio} < ${r.threshold}`).join("; ");
  assert.equal(fails.length, 0, `contrast failures: ${detail}`);
  // sanity: the suite actually exercised a broad set of pairings, not an empty list
  assert.ok(results.length >= 30, `expected ≥30 pairings, got ${results.length}`);
});

test("a deliberately bad token is caught (guard actually guards)", () => {
  // muted lightened to near-white on a white surface must fail.
  const css = ":root{--bg:#f6f4ee;--surface:#ffffff;--panel:#faf8f2;--subtle:#edeae1;--field:#fdfcf9;"
    + "--highlight:#fbf6ec;--fg:#1a1c2e;--muted:#eeeeee;--faint:#7a766c;--gold:#8a6428;--pos:#0f7a37;--neg:#cf2020}\n"
    + ".dark{--bg:#13141b;--surface:#1d1f28;--panel:#23252f;--subtle:#2c2f3a;--field:#191b22;"
    + "--highlight:#2c2618;--fg:#e9e8ee;--muted:#9a9ba7;--faint:#83858f;--gold:#dcbb79;--pos:#45c877;--neg:#f87171}";
  const fails = evaluate(css).filter((r) => !r.pass);
  assert.ok(fails.some((r) => r.label.startsWith("muted") && r.theme === "light"),
    "expected the sabotaged light muted token to fail");
});
