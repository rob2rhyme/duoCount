// Generating an operator secret that gets typed or pasted into a deploy
// dashboard by hand — DEV_ADMIN_PASSWORD above all. TOOLING/SERVER ONLY
// (imports node:crypto).
//
// The alphabet is 32 characters and deliberately drops I, O, 0 and 1. That is
// not fussiness: the failure this credential actually has is a character that
// LOOKED right. A secret that reads identically on screen but differs by one
// byte is indistinguishable from not knowing it, and the /dev response is one
// combined "wrong email or password" by design — so a look-alike costs a
// redeploy per guess. Dropping the four confusable glyphs, and all punctuation,
// removes the whole class: nothing here can be mangled by a shell, a dashboard
// form, or an editor that helpfully substitutes a smart quote or an en-dash.
//
// 24 characters over 32 symbols is 120 bits, which is far past anything an
// online guess reaches through the login throttle.
import { randomBytes } from "node:crypto";

export const SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * A random secret of `length` characters drawn uniformly from `alphabet`.
 *
 * The guard is the point. Reducing a random byte with `% alphabet.length` is
 * uniform ONLY when the length divides 256 — at 32 it does (8 bytes per
 * symbol). Add one character to the alphabet and 256 = 7x33 + 25, so the first
 * 25 symbols become ~3% likelier than the rest and the secret quietly loses
 * entropy, with nothing about the output looking wrong. That is the same shape
 * of silent-entropy bug as the base32 generator this repo already had to
 * replace, so it fails closed instead of being left to a code review.
 */
export function randomSecret(length = 24, { alphabet = SAFE_ALPHABET, bytes = randomBytes } = {}) {
  if (!Number.isInteger(length) || length < 1) throw new Error(`randomSecret: bad length ${length}`);
  if (256 % alphabet.length !== 0) {
    throw new Error(
      `randomSecret: alphabet length ${alphabet.length} does not divide 256, so "% length" ` +
      `would bias the first ${256 % alphabet.length} symbols. Use a length of 2, 4, 8, 16, 32, 64 or 128.`
    );
  }
  const buf = bytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}
