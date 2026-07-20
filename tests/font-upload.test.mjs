// Font magic-byte detection — pure. Run: node --test tests/font-upload.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffFontFormat, MAX_FONT_BYTES } from "../src/lib/font-upload.js";

const buf = (...bytes) => Uint8Array.from(bytes);
const ascii = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

test("recognizes each accepted font signature", () => {
  assert.equal(sniffFontFormat(ascii("wOF2....")), "woff2");
  assert.equal(sniffFontFormat(ascii("wOFF....")), "woff");
  assert.equal(sniffFontFormat(ascii("OTTO....")), "opentype");
  assert.equal(sniffFontFormat(ascii("true....")), "truetype");
  assert.equal(sniffFontFormat(ascii("ttcf....")), "truetype");
  assert.equal(sniffFontFormat(buf(0x00, 0x01, 0x00, 0x00, 0xff)), "truetype"); // TrueType outlines
});

test("rejects non-font bytes and too-short input", () => {
  assert.equal(sniffFontFormat(ascii("<htm")), null);        // an HTML file
  assert.equal(sniffFontFormat(ascii("\x89PNG")), null);     // a PNG
  assert.equal(sniffFontFormat(ascii("PK\x03\x04")), null);  // a zip
  assert.equal(sniffFontFormat(buf(0x77, 0x4f)), null);      // truncated
  assert.equal(sniffFontFormat(buf()), null);
  assert.equal(sniffFontFormat(null), null);
  assert.equal(sniffFontFormat(undefined), null);
});

test("only the leading bytes decide — trailing content is ignored", () => {
  assert.equal(sniffFontFormat(ascii("wOF2 followed by whatever junk")), "woff2");
});

test("the size cap is a sane sub-1MB value", () => {
  assert.equal(MAX_FONT_BYTES, 400 * 1024);
  assert.ok(MAX_FONT_BYTES * 1.34 < 1024 * 1024, "base64 of the cap still fits a Firestore doc");
});
