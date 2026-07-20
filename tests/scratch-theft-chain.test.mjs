// End-to-end verification of the scratch-off theft-tracking chain, driven by a
// REAL Pennsylvania ticket's three printed numbers:
//
//     Game #  1792      (which game  → name + price, catalog)
//     Pack #  0011361   (which book  → the audited unit)
//     Ticket # 016      (position in the book → the start/end reading)
//
// The theft control is the shift boundary: the ticket a book closed at must be
// the ticket it opens at next. This test walks those three numbers from a scan
// (or hand entry) all the way to the pack audit that flags an unaccounted gap,
// and pins the one property the whole audit rests on: a book entered by hand
// must land on the SAME pack id a scan produces, or a book scanned one shift and
// typed the next silently splits in two and the gap across that seam is missed.
//
// Pure — no emulator. Run: npm run test:scratch-chain
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScratchBarcode, packGameKey, packIdFromParts } from "../src/lib/scratch-barcode.js";
import { resolveCatalogGame, lookupGameNumber } from "../src/lib/scratch-catalog.js";
import { buildPackAudit } from "../src/lib/scratch-audit.js";

// The three numbers exactly as printed on the ticket, and the scan that carries
// them (game + book + 3-digit ticket concatenated).
const GAME = "1792";
const BOOK = "0011361";
const TICKET = "016";
const SCAN = GAME + BOOK + TICKET; // "17920011361016"
const PACK_ID = GAME + BOOK;        // "17920011361" — the audited unit

test("a scan splits into game #, book #, ticket # exactly as printed on the ticket", () => {
  const r = parseScratchBarcode(SCAN);
  assert.equal(r.pack, PACK_ID, "pack id = game # + book #");
  assert.equal(r.ticket, 16, "trailing 3 digits are the ticket position (016 → 16)");
  assert.equal(r.game, GAME, "leading digits are the game #");
  assert.equal(packGameKey(r.pack), GAME);
});

test("the game # resolves the game's name + price from the catalog (both scan and bare number)", () => {
  const fromScan = resolveCatalogGame(SCAN);
  const fromNumber = lookupGameNumber(GAME);
  for (const hit of [fromScan, fromNumber]) {
    assert.equal(hit.game, GAME);
    assert.equal(hit.name, "Wild Side");
    assert.equal(hit.price, 5);
    assert.equal(hit.perPack, 60);
  }
});

test("hand-typed game # + book # produce the SAME pack id as the scan (no split)", () => {
  assert.equal(packIdFromParts(GAME, BOOK), PACK_ID);
  assert.equal(packIdFromParts(GAME, BOOK), parseScratchBarcode(SCAN).pack);
});

test("the audit flags an unaccounted shift-boundary gap on this book", () => {
  // Opened at 0, closed at 30, then re-opened next day at 50 — 20 tickets ($100)
  // gone between two consecutive signed counts of the same book.
  const entries = [
    { kind: "scratch", locationId: "L1", pack: PACK_ID, game: "Wild Side", price: 5,
      date: "2026-07-18", ts: new Date("2026-07-18T08:00:00Z"), startno: 0, endno: 30, by: "Ann" },
    { kind: "scratch", locationId: "L1", pack: PACK_ID, game: "Wild Side", price: 5,
      date: "2026-07-19", ts: new Date("2026-07-19T08:00:00Z"), startno: 50, endno: 55, by: "Bob" },
  ];
  const { gaps } = buildPackAudit(entries, { now: new Date("2026-07-19T18:00:00Z") });
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].pack, PACK_ID);
  assert.equal(gaps[0].totalMissing, 20);
  assert.equal(gaps[0].missingDollars, 100);
  assert.equal(gaps[0].events[0].prevEnd, 30);
  assert.equal(gaps[0].events[0].nextStart, 50);
  assert.equal(gaps[0].events[0].prevBy, "Ann");
  assert.equal(gaps[0].events[0].nextBy, "Bob");
});

test("canonicalization keeps a scanned-then-typed book as ONE pack so the gap is still caught", () => {
  // The regression this guards: the SAME physical book scanned on the opening
  // shift (pack id = game+book) and hand-typed on the next (book # only). With a
  // canonical id both counts share one pack; without it they split into two
  // single-count packs and the 20-ticket boundary gap reads as clean.
  const typedPackId = packIdFromParts(GAME, BOOK); // what the form now saves
  assert.equal(typedPackId, PACK_ID, "typed entry canonicalizes to the scan's id");

  const entries = [
    { kind: "scratch", locationId: "L1", pack: PACK_ID, game: "Wild Side", price: 5,
      date: "2026-07-18", ts: new Date("2026-07-18T08:00:00Z"), startno: 0, endno: 30, by: "Ann" },     // scanned
    { kind: "scratch", locationId: "L1", pack: typedPackId, game: "Wild Side", price: 5,
      date: "2026-07-19", ts: new Date("2026-07-19T08:00:00Z"), startno: 50, endno: 55, by: "Bob" },     // hand-typed
  ];
  const { gaps, missing, packsSeen } = buildPackAudit(entries, { now: new Date("2026-07-19T18:00:00Z") });
  assert.equal(packsSeen, 1, "one physical book, one pack");
  assert.equal(gaps.length, 1, "the boundary gap survives the scan→type switch");
  assert.equal(gaps[0].totalMissing, 20);
  assert.equal(missing.length, 0, "no false 'walked pack' alarm from a split id");
});
