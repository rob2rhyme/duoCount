// Per-store appearance (theme palette / font / size) — pure. Run: node --test tests/branding.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PALETTES, PALETTE_IDS, FONTS, FONT_IDS, FONT_SCALES,
  resolveBranding, fontById, googleFontHref, DEFAULT_BRANDING, CUSTOM_FONT_FAMILY,
} from "../src/lib/branding.js";

test("there are exactly 6 palettes, green first, each with light + dark swatches", () => {
  assert.equal(PALETTES.length, 6);
  assert.equal(PALETTES[0].id, "green");
  assert.deepEqual(PALETTE_IDS, ["green", "ocean", "indigo", "sunset", "rose", "slate"]);
  for (const p of PALETTES) {
    assert.match(p.swatch, /^#[0-9a-f]{6}$/i);
    assert.match(p.swatchDark, /^#[0-9a-f]{6}$/i);
    assert.ok(p.label.length > 0);
  }
});

test("the font list has the system default first, a custom entry, and 25 named families", () => {
  assert.equal(FONTS[0].id, "");            // system default
  assert.equal(FONTS[0].google, null);
  assert.ok(FONTS.some((f) => f.id === "custom" && f.google === null));
  const named = FONTS.filter((f) => f.google); // the pickable Google families
  assert.equal(named.length, 25);
  for (const f of named) assert.ok(f.stack.includes(`'${f.id}'`), `${f.id} stack names itself`);
});

test("resolveBranding falls back on unknown values and clamps scale", () => {
  assert.deepEqual(resolveBranding(undefined), DEFAULT_BRANDING);
  assert.deepEqual(resolveBranding({}), DEFAULT_BRANDING);
  assert.equal(resolveBranding({ themePalette: "neon" }).themePalette, "green");   // unknown → default
  assert.equal(resolveBranding({ fontFamily: "ComicSans" }).fontFamily, "");        // unknown → default
  assert.equal(resolveBranding({ fontScale: 5 }).fontScale, 1.25);                  // clamp high
  assert.equal(resolveBranding({ fontScale: 0.1 }).fontScale, 0.9);                 // clamp low
  assert.equal(resolveBranding({ fontScale: "junk" }).fontScale, 1);                // NaN → 1
});

test("only what the owner set overrides a default", () => {
  const r = resolveBranding({ themePalette: "ocean", fontFamily: "Inter", fontScale: 1.12 });
  assert.deepEqual(r, { themePalette: "ocean", fontFamily: "Inter", fontScale: 1.12 });
});

test("googleFontHref builds a sheet URL only for a named Google family", () => {
  assert.equal(googleFontHref(""), null);           // system default
  assert.equal(googleFontHref("custom"), null);     // uploaded — no external sheet
  assert.equal(googleFontHref("neon"), null);       // unknown
  const href = googleFontHref("Open Sans");
  assert.ok(href.startsWith("https://fonts.googleapis.com/css2?family=Open+Sans:"));
  assert.ok(href.includes("display=swap"));
});

test("fontById resolves, and the custom family uses the fixed internal name", () => {
  assert.equal(fontById("Inter").label, "Inter");
  assert.equal(fontById("nope").id, "");            // unknown → system default entry
  assert.ok(fontById("custom").stack.includes(`'${CUSTOM_FONT_FAMILY}'`));
});

test("font scales are discrete, span small→larger, and include a 1.0 default", () => {
  assert.deepEqual(FONT_SCALES.map((s) => s.scale), [0.9, 1, 1.12, 1.25]);
  assert.ok(FONT_SCALES.some((s) => s.scale === 1));
});
