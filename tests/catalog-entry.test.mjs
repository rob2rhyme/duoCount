// Manual scratch-game entry normalizer — pure. Run: node --test tests/catalog-entry.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGameEntry } from "../src/lib/catalog-entry.js";

test("a well-formed game normalizes to the stored { name, price, perPack } shape", () => {
  const r = normalizeGameEntry({ game: "1801", name: "Glinda", price: "1", perPack: "100" });
  assert.equal(r.ok, true);
  assert.equal(r.game, "1801");
  assert.deepEqual(r.value, { name: "Glinda", price: 1, perPack: 100 });
});

test("game number tolerates a leading # and normalizes leading zeros", () => {
  assert.equal(normalizeGameEntry({ game: "#01801", name: "X", price: "2" }).game, "1801");
  assert.equal(normalizeGameEntry({ game: "0042", name: "X", price: "2" }).game, "42");
});

test("perPack is optional — omitted leaves it off the stored object", () => {
  const r = normalizeGameEntry({ game: "5", name: "Buck", price: "1" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { name: "Buck", price: 1 });
  assert.equal("perPack" in r.value, false);
});

test("price strips a leading $ and must be a positive number", () => {
  assert.equal(normalizeGameEntry({ game: "5", name: "X", price: "$5" }).value.price, 5);
  assert.equal(normalizeGameEntry({ game: "5", name: "X", price: "0" }).code, "price_invalid");
  assert.equal(normalizeGameEntry({ game: "5", name: "X", price: "-2" }).code, "price_invalid");
  assert.equal(normalizeGameEntry({ game: "5", name: "X", price: "abc" }).code, "price_invalid");
});

test("each required field, when missing, reports its own stable code", () => {
  assert.equal(normalizeGameEntry({ game: "", name: "X", price: "1" }).code, "game_missing");
  assert.equal(normalizeGameEntry({ game: "abc", name: "X", price: "1" }).code, "game_invalid");
  assert.equal(normalizeGameEntry({ game: "5", name: "  ", price: "1" }).code, "name_missing");
  assert.equal(normalizeGameEntry({ game: "5", name: "X", price: "" }).code, "price_missing");
});

test("perPack, when given, must be a whole number >= 1", () => {
  assert.equal(normalizeGameEntry({ game: "5", name: "X", price: "1", perPack: "0" }).code, "perpack_invalid");
  assert.equal(normalizeGameEntry({ game: "5", name: "X", price: "1", perPack: "1.5" }).code, "perpack_invalid");
  assert.equal(normalizeGameEntry({ game: "5", name: "X", price: "1", perPack: "60" }).value.perPack, 60);
});

test("a long name is capped at 120 characters (matches the bulk importer)", () => {
  const r = normalizeGameEntry({ game: "5", name: "z".repeat(200), price: "1" });
  assert.equal(r.value.name.length, 120);
});
