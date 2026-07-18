// parseScratchBarcode is pure — no emulator. Run: npm run test:scratch-barcode
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScratchBarcode, packGameKey, MIN_TICKET_BARCODE_LEN, GAME_DIGITS } from "../src/lib/scratch-barcode.js";

test("empty / whitespace → empty pack, no ticket", () => {
  assert.deepEqual(parseScratchBarcode(""), { pack: "", ticket: null, game: "" });
  assert.deepEqual(parseScratchBarcode("   "), { pack: "", ticket: null, game: "" });
  assert.deepEqual(parseScratchBarcode(null), { pack: "", ticket: null, game: "" });
});

test("delimited barcode: last numeric group is the ticket, rest is the pack", () => {
  // ≥3 groups: the first group is the game#, the middle the book#.
  assert.deepEqual(parseScratchBarcode("1234-567890-012"), { pack: "1234-567890", ticket: 12, game: "1234" });
  // 2 groups: one book run + ticket → game key is the leading digits of the run.
  assert.deepEqual(parseScratchBarcode("567890 012"), { pack: "567890", ticket: 12, game: "5678" });
});

test("one long digit run: the trailing 3 digits are the ticket, the rest the pack", () => {
  // 14 digits ≥ threshold → peel last 3; game key is the leading GAME_DIGITS
  const r = parseScratchBarcode("12345678901234");
  assert.equal(r.pack, "12345678901");
  assert.equal(r.ticket, 234);
  assert.equal(r.game, "1234");
});

test("the same pack scanned at two ticket positions yields the SAME pack id", () => {
  // open at ticket 100, close at ticket 233 — the pack id must be identical so
  // the two counts chain together in the shift-boundary pack audit.
  const a = parseScratchBarcode("0044723000100"); // 13 digits → pack + ticket 100
  const b = parseScratchBarcode("0044723000233"); // same pack → ticket 233
  assert.equal(a.pack, b.pack, "pack id is stable across ticket positions");
  assert.equal(a.ticket, 100);
  assert.equal(b.ticket, 233);
});

test("packGameKey: two DIFFERENT books of one game share a game key", () => {
  // Same game (0044), different books — a new book inherits the game's name/price.
  const bookA = parseScratchBarcode("0044111000100").pack; // game 0044, book 111
  const bookB = parseScratchBarcode("0044222000005").pack; // game 0044, book 222
  assert.notEqual(bookA, bookB, "different books are different packs (no false chain)");
  assert.equal(packGameKey(bookA), "0044");
  assert.equal(packGameKey(bookB), "0044");
  assert.equal(packGameKey(bookA), packGameKey(bookB), "same game → same key");
});

test("packGameKey: different games do NOT share a key", () => {
  assert.notEqual(packGameKey("0044723000"), packGameKey("0099723000"));
});

test("packGameKey: delimited pack uses the first group as the game", () => {
  assert.equal(packGameKey("1234-567890"), "1234");
  assert.equal(packGameKey("123-567890"), "123"); // 3-digit game group respected
});

test("packGameKey: no stable key → empty string (no false match)", () => {
  assert.equal(packGameKey(""), "");
  assert.equal(packGameKey("   "), "");
  assert.equal(packGameKey(null), "");
  assert.equal(packGameKey("PACK-ABC"), "PACK"); // delimited: first segment
  assert.equal(packGameKey("ABCXYZ"), "", "non-numeric single run has no game key");
  assert.equal(packGameKey("0044"), "", "no book tail beyond the game digits → no key");
  assert.ok(GAME_DIGITS >= 1);
});

test("a short book/pack barcode is treated as a pack id with no invented ticket", () => {
  const short = "0447233"; // 7 digits < threshold
  assert.deepEqual(parseScratchBarcode(short), { pack: "0447233", ticket: null, game: "0447" });
  assert.ok(short.length < MIN_TICKET_BARCODE_LEN);
});

test("non-numeric content is kept as the pack id, never a ticket", () => {
  assert.deepEqual(parseScratchBarcode("PACK-ABC"), { pack: "PACK-ABC", ticket: null, game: "PACK" });
});
