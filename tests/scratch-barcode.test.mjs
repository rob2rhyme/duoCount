// parseScratchBarcode is pure — no emulator. Run: npm run test:scratch-barcode
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScratchBarcode, packGameKey, packIdFromParts, packDisplayParts, reduceToGameNumber, MIN_TICKET_BARCODE_LEN, GAME_DIGITS } from "../src/lib/scratch-barcode.js";

test("reduceToGameNumber: a whole pack/ticket collapses to its game section; a bare game # is unchanged", () => {
  // full ticket (14 digits, delimited or not) → leading game #
  assert.equal(reduceToGameNumber("17920011361016"), "1792");
  assert.equal(reduceToGameNumber("1792-0011361-016"), "1792");
  assert.equal(reduceToGameNumber("1792 0011361 016"), "1792");
  // game + book (11 digits) → game #
  assert.equal(reduceToGameNumber("17920011361"), "1792");
  // short values (a bare game #) come back untouched — never truncated
  assert.equal(reduceToGameNumber("1792"), "1792");
  assert.equal(reduceToGameNumber("1801"), "1801");
  assert.equal(reduceToGameNumber("18010"), "18010");
  assert.equal(reduceToGameNumber("#1792"), "#1792"); // normalization is the validator's job
  assert.equal(reduceToGameNumber(""), "");
});

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
  // 14 digits = game(4)+book(7)+ticket(3) → ticket is the run after game+book
  const r = parseScratchBarcode("12345678901234");
  assert.equal(r.pack, "12345678901");
  assert.equal(r.ticket, 234);
  assert.equal(r.game, "1234");
});

test("scanned barcode with trailing validation digits: the extras are ignored", () => {
  // The reported case: "1792-0011361-016" prints 14 digits but the barcode scans
  // with 2 more on the end. The ticket must read 16 (016), NOT the last 3 digits.
  const printed = parseScratchBarcode("17920011361016");   // 14, no extras
  const scanned = parseScratchBarcode("1792001136101699"); // 16, +2 trailing
  assert.equal(scanned.pack, "17920011361", "pack = game+book, extras dropped");
  assert.equal(scanned.ticket, 16, "ticket read from its fixed position, not the tail");
  assert.equal(scanned.game, "1792");
  // the extra digits must not change the pack id or the ticket vs. the printed form
  assert.equal(scanned.pack, printed.pack);
  assert.equal(scanned.ticket, printed.ticket);
  // any amount of trailing padding is ignored, not just two
  assert.equal(parseScratchBarcode("179200113610169999").ticket, 16);
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

test("packIdFromParts: game # + book # concatenate to the SAME id a scan produces", () => {
  // The user's PA ticket: Game 1792, Pack 0011361 → scan pack id "17920011361".
  assert.equal(packIdFromParts("1792", "0011361"), "17920011361");
  assert.equal(packIdFromParts("1792", "0011361"), parseScratchBarcode("17920011361016").pack,
    "hand-typed parts must equal the scanned pack id, or the audit splits the pack");
});

test("packIdFromParts: blank game # → the book # exactly as typed (unchanged behavior)", () => {
  assert.equal(packIdFromParts("", "0011361"), "0011361");
  assert.equal(packIdFromParts(null, "0011361"), "0011361");
  assert.equal(packIdFromParts(undefined, "0011361"), "0011361");
});

test("packIdFromParts: a book field that already leads with the game # is not double-prefixed", () => {
  // e.g. the clerk pasted a scan into the book field, or scanned then typed the game.
  assert.equal(packIdFromParts("1792", "17920011361"), "17920011361");
});

test("packIdFromParts: tolerates leading zeros / stray non-digits in the game #", () => {
  assert.equal(packIdFromParts("01792", "0011361"), "017920011361"); // game kept verbatim after \\D strip
  assert.equal(packIdFromParts("1792 ", " 0011361 "), "17920011361");
});

test("packIdFromParts: empty book with a game # → empty (nothing to identify yet)", () => {
  assert.equal(packIdFromParts("1792", ""), "");
  assert.equal(packIdFromParts("1792", "   "), "");
});

test("packIdFromParts: a non-numeric book id is left untouched even with a game #", () => {
  assert.equal(packIdFromParts("1792", "PACK-ABC"), "PACK-ABC");
});

test("packDisplayParts: a canonical id splits back into the ticket's game # and book #", () => {
  // Round-trips packIdFromParts: what the form saves splits back for display.
  assert.deepEqual(packDisplayParts("17920011361"), { gameNo: "1792", bookNo: "0011361" });
  assert.deepEqual(packDisplayParts(packIdFromParts("1792", "0011361")), { gameNo: "1792", bookNo: "0011361" });
});

test("packDisplayParts: a delimited id splits on its delimiter", () => {
  assert.deepEqual(packDisplayParts("1792-0011361"), { gameNo: "1792", bookNo: "0011361" });
});

test("packDisplayParts: a bare book # (no game prefix) is shown whole, never mis-cut", () => {
  assert.deepEqual(packDisplayParts("0011361"), { gameNo: "", bookNo: "0011361" });   // 7 digits < 4+7
  assert.deepEqual(packDisplayParts("361"), { gameNo: "", bookNo: "361" });
});

test("packDisplayParts: blank / non-numeric ids come back with a blank game #", () => {
  assert.deepEqual(packDisplayParts(""), { gameNo: "", bookNo: "" });
  assert.deepEqual(packDisplayParts(null), { gameNo: "", bookNo: "" });
  assert.deepEqual(packDisplayParts("PACKABC"), { gameNo: "", bookNo: "PACKABC" });
});
