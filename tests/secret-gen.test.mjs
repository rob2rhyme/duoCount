// Operator-secret generation. Run: npm run test:secret-gen
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomSecret, SAFE_ALPHABET } from "../src/lib/secret-gen.js";

test("the alphabet drops every look-alike glyph and all punctuation", () => {
  // I/l, O/0 and 1/l are the pairs that make a pasted secret unverifiable by eye.
  for (const ch of ["I", "O", "0", "1"]) assert.ok(!SAFE_ALPHABET.includes(ch), `${ch} must not appear`);
  assert.match(SAFE_ALPHABET, /^[A-Z2-9]+$/);
  assert.equal(new Set(SAFE_ALPHABET).size, SAFE_ALPHABET.length, "no duplicate symbols");
});

test("the alphabet length divides 256, so `% length` is unbiased", () => {
  // The invariant the guard enforces. If this ever fails, every secret the
  // generator has produced since is quietly skewed.
  assert.equal(SAFE_ALPHABET.length, 32);
  assert.equal(256 % SAFE_ALPHABET.length, 0);
});

test("every byte value maps to a symbol exactly 8 times — uniform, not merely random-looking", () => {
  // Feed all 256 byte values once; a uniform reduction gives each of the 32
  // symbols exactly 256/32 = 8 hits. A biased alphabet shows up here as a
  // lopsided tally rather than as something a human would spot in the output.
  const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const out = randomSecret(256, { bytes: () => all });
  const tally = new Map();
  for (const ch of out) tally.set(ch, (tally.get(ch) || 0) + 1);
  assert.equal(tally.size, 32);
  for (const [ch, n] of tally) assert.equal(n, 8, `symbol ${ch} appeared ${n} times`);
});

test("randomSecret returns the requested length, drawn only from the alphabet", () => {
  for (const n of [1, 8, 24, 64]) {
    const s = randomSecret(n);
    assert.equal(s.length, n);
    for (const ch of s) assert.ok(SAFE_ALPHABET.includes(ch), `stray character ${JSON.stringify(ch)}`);
  }
});

test("a biased alphabet is refused rather than silently skewing the secret", () => {
  // The regression guard: someone adds a character, 256 % 33 = 25, and the
  // first 25 symbols become likelier. Throw instead of shipping that.
  assert.throws(() => randomSecret(24, { alphabet: SAFE_ALPHABET + "!" }), /does not divide 256/);
  assert.throws(() => randomSecret(24, { alphabet: "ABC" }), /does not divide 256/);
  // ...and the legitimate sizes still work.
  for (const n of [2, 4, 8, 16, 32, 64, 128]) {
    assert.equal(randomSecret(4, { alphabet: "x".repeat(n) }), "xxxx");
  }
});

test("a nonsense length is refused", () => {
  for (const bad of [0, -1, 1.5, "24", null]) assert.throws(() => randomSecret(bad), /bad length/);
});

test("two secrets are not the same", () => {
  assert.notEqual(randomSecret(24), randomSecret(24));
});
