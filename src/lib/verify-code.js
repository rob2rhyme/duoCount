// The 6-digit code that confirms an owner's email address.
//
// Why a code and not only a link. The link already exists and still works —
// this adds a second front door onto the SAME token, because a link makes the
// owner leave the app, switch to a mail client, and come back, and on a phone
// that is where confirmations get abandoned. A code is read and typed without
// leaving the screen that is asking for it.
//
// Both doors open the same lock. The code is stored as a second hashed secret
// on the token document, so it inherits that token's TTL, its single-use burn
// and its "asking again burns the last one" behaviour. There is no second
// expiry to reason about and no way for the link and the code to disagree
// about whether an address is confirmed.
//
// Everything here is pure: generation takes its randomness as an argument and
// the policy functions take the clock as an argument, so both are testable
// without a database or a wall clock.

/** Digits in a confirmation code. Six is what people expect to be asked for. */
export const CODE_DIGITS = 6;

/**
 * Wrong guesses allowed before the code is dead and must be re-sent.
 *
 * Six digits is a million codes, so this is not really about exhausting the
 * space — it is about making an online guesser re-trigger a rate-limited email
 * for every five tries instead of grinding one code forever.
 */
export const MAX_ATTEMPTS = 5;

/**
 * A uniformly random numeric code.
 *
 * Rejection sampling rather than `% 10`, and the reason is the same one
 * `randomSecret` refuses a 10-symbol alphabet for: 256 is not a multiple of
 * 10, so reducing a byte modulo 10 makes digits 0-5 about 20% likelier than
 * 6-9. That is invisible in the output — every code still looks like a code —
 * which is exactly why it has to be handled here rather than left to a reader
 * to notice. Bytes at or above 250 are discarded instead.
 *
 * @param {number} digits how many digits to produce
 * @param {(n: number) => Uint8Array} bytes randomness source, injectable for tests
 */
export function randomCode(digits = CODE_DIGITS, bytes) {
  if (!Number.isInteger(digits) || digits < 1) throw new Error(`randomCode: bad digits ${digits}`);
  if (typeof bytes !== "function") throw new Error("randomCode: needs a byte source");
  let out = "";
  // Ask for a few extra bytes per round so a run of rejects rarely needs a
  // second call; the loop is still correct if every byte is rejected.
  while (out.length < digits) {
    const buf = bytes(digits - out.length + 4);
    for (const b of buf) {
      if (b >= 250) continue;          // would bias 0-5; draw again
      out += String(b % 10);
      if (out.length === digits) break;
    }
  }
  return out;
}

/** Strip spaces and dashes people add when copying a code out of an email. */
export function normalizeCode(raw) {
  return String(raw ?? "").replace(/[\s-]/g, "");
}

/** Is this the shape of a code at all? Checked before any hashing work. */
export function isCodeShaped(raw, digits = CODE_DIGITS) {
  const s = normalizeCode(raw);
  return s.length === digits && /^\d+$/.test(s);
}

/**
 * What a token's code can do right now.
 *
 * Returns one of:
 *   "ok"        — may be checked
 *   "missing"   — no token, or no code on it (a link-only token)
 *   "used"      — already confirmed
 *   "expired"   — past the token's TTL
 *   "locked"    — too many wrong guesses; needs a fresh send
 *
 * `used` and `expired` are reported separately from `locked` so the screen can
 * say "ask for a new code" in every case without claiming a wrong reason.
 */
export function codeState(doc, now = Date.now()) {
  if (!doc || !doc.codeHash) return "missing";
  if (doc.usedAt) return "used";
  if (typeof doc.expiresAt === "number" && now > doc.expiresAt) return "expired";
  if ((Number(doc.codeAttempts) || 0) >= MAX_ATTEMPTS) return "locked";
  return "ok";
}

/** Guesses left before this code locks — drives the "N tries left" hint. */
export function attemptsLeft(doc) {
  return Math.max(0, MAX_ATTEMPTS - (Number(doc?.codeAttempts) || 0));
}

/**
 * Does an owner in this state have to confirm before using the app?
 *
 * Owners only. Staff did not choose the address and cannot change it, so
 * gating them would strand a whole shift behind someone else's inbox. An owner
 * with NO address is gated too — "no address on file" is the same problem as
 * "unconfirmed address" from the one angle that matters here, which is that
 * nobody can reach the store.
 */
export function needsEmailConfirm(user) {
  if (!user || user.role !== "owner") return false;
  if (user.active === false) return false;
  return !user.emailVerifiedAt;
}
