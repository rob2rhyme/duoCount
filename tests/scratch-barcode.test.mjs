// parseScratchBarcode is pure — no emulator. Run: npm run test:scratch-barcode
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScratchBarcode, MIN_TICKET_BARCODE_LEN } from "../src/lib/scratch-barcode.js";

test("empty / whitespace → empty pack, no ticket", () => {
  assert.deepEqual(parseScratchBarcode(""), { pack: "", ticket: null });
  assert.deepEqual(parseScratchBarcode("   "), { pack: "", ticket: null });
  assert.deepEqual(parseScratchBarcode(null), { pack: "", ticket: null });
});

test("delimited barcode: last numeric group is the ticket, rest is the pack", () => {
  assert.deepEqual(parseScratchBarcode("1234-567890-012"), { pack: "1234-567890", ticket: 12 });
  assert.deepEqual(parseScratchBarcode("567890 012"), { pack: "567890", ticket: 12 });
});

test("one long digit run: the trailing 3 digits are the ticket, the rest the pack", () => {
  // 14 digits ≥ threshold → peel last 3
  const r = parseScratchBarcode("12345678901234");
  assert.equal(r.pack, "12345678901");
  assert.equal(r.ticket, 234);
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

test("a short book/pack barcode is treated as a pack id with no invented ticket", () => {
  const short = "0447233"; // 7 digits < threshold
  assert.deepEqual(parseScratchBarcode(short), { pack: "0447233", ticket: null });
  assert.ok(short.length < MIN_TICKET_BARCODE_LEN);
});

test("non-numeric content is kept as the pack id, never a ticket", () => {
  assert.deepEqual(parseScratchBarcode("PACK-ABC"), { pack: "PACK-ABC", ticket: null });
});
