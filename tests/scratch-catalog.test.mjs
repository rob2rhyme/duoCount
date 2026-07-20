// The scratch catalog + game resolver are pure — no emulator.
// Run: npm run test:scratch-catalog
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCRATCH_CATALOG, CATALOG_META, resolveCatalogGame, lookupGameNumber } from "../src/lib/scratch-catalog.js";

test("catalog is a non-trivial keyed table of well-formed entries", () => {
  const keys = Object.keys(SCRATCH_CATALOG);
  assert.ok(keys.length >= 90, `expected the full PA listing, got ${keys.length}`);
  for (const k of keys) {
    assert.match(k, /^\d+$/, `game key ${k} should be numeric`);
    const g = SCRATCH_CATALOG[k];
    assert.equal(typeof g.name, "string");
    assert.ok(g.name.length > 0, `game ${k} has a name`);
    assert.ok(Number.isFinite(g.price) && g.price > 0, `game ${k} has a positive price`);
    assert.ok(Number.isInteger(g.perPack) && g.perPack > 0, `game ${k} has a pack size`);
  }
  assert.equal(CATALOG_META.state, "PA");
});

test("resolves the game from a per-ticket barcode that LEADS with the game number", () => {
  // game 1801 + 6-digit book + 3-digit ticket
  const hit = resolveCatalogGame("1801123456789");
  assert.equal(hit.game, "1801");
  assert.equal(hit.name, SCRATCH_CATALOG["1801"].name);
  assert.equal(hit.price, SCRATCH_CATALOG["1801"].price);
});

test("resolves the game from the 12-digit retail UPC (game # embedded at [7,11))", () => {
  // 6-44018-11801-4  ->  product 11801  ->  game 1801
  const hit = resolveCatalogGame("644018118014");
  assert.equal(hit.game, "1801");
  assert.equal(hit.price, SCRATCH_CATALOG["1801"].price);
  // and a different game's UPC resolves to that game
  const hit2 = resolveCatalogGame("644018118007"); // game 1800
  assert.equal(hit2.game, "1800");
});

test("tolerates delimiters and stray non-digits in the scanned string", () => {
  assert.equal(resolveCatalogGame("1801-123456-789").game, "1801");
  assert.equal(resolveCatalogGame("  6440181 1801 4 ".replace(/\s+/g, "")).game, "1801");
});

test("declines (returns null) rather than inventing a game it doesn't know", () => {
  assert.equal(resolveCatalogGame(""), null);
  assert.equal(resolveCatalogGame(null), null);
  assert.equal(resolveCatalogGame("   "), null);
  assert.equal(resolveCatalogGame("9999000111222"), null, "leading 9999 is not a known game");
  assert.equal(resolveCatalogGame("ABCDEF"), null, "non-numeric declines");
  // a short book/pack id with no recoverable game number declines
  assert.equal(resolveCatalogGame("044723"), null);
});

test("accepts an injected catalog (for a different state / uploaded listing)", () => {
  const custom = { "42": { name: "Test Game", price: 3, perPack: 50 } };
  const hit = resolveCatalogGame("0042123456789", custom);
  assert.equal(hit.game, "42");
  assert.equal(hit.name, "Test Game");
  // the real PA catalog is not consulted when a custom one is passed
  assert.equal(resolveCatalogGame("1801123456789", custom), null);
});

test("lookupGameNumber: fills name + price from a bare game number typed off the ticket", () => {
  // The user's example: Game # 1792 → Wild Side, $5, 60-ticket pack.
  const hit = lookupGameNumber("1792");
  assert.equal(hit.game, "1792");
  assert.equal(hit.name, "Wild Side");
  assert.equal(hit.price, 5);
  assert.equal(hit.perPack, 60);
});

test("lookupGameNumber: tolerates leading zeros; declines an unknown number", () => {
  assert.equal(lookupGameNumber("01792").game, "1792"); // normalized
  assert.equal(lookupGameNumber("9999"), null);
  assert.equal(lookupGameNumber(""), null);
  assert.equal(lookupGameNumber(null), null);
});
