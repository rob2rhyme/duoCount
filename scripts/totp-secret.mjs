// Generate, or check, the developer login's second-factor secret.
//
//   node scripts/totp-secret.mjs            → mint a new DEV_ADMIN_TOTP_SECRET
//   node scripts/totp-secret.mjs <SECRET>   → what code should my app be showing?
//
// The check mode is the point. DEV_ADMIN_TOTP_SECRET is a static string you
// type into an authenticator once and then trust forever — the same shape of
// credential as DEV_ADMIN_PASSWORD, and it fails the same silent way: a
// mistyped setup key or a phone whose clock has drifted both surface only as
// "wrong or expired authenticator code", after a redeploy, on the one login
// that recovers everything else. Comparing the app's code against this BEFORE
// the secret reaches the deploy dashboard turns that into a ten-second check.
//
// It runs the app's own lib/totp.js, so agreement here is agreement with the
// server, not with a second implementation that might differ.
//
// Terminal only: the secret is printed, never written anywhere. Put it in the
// password manager — it is the copy that gets you back in if the phone is lost.
import { randomBytes } from "node:crypto";
import { base32Encode, base32Decode, totpCode, STEP_SECONDS, DEFAULT_WINDOW } from "../src/lib/totp.js";

// A code with two seconds left has already rolled by the time anyone reads it,
// which is worse than useless in a step whose whole job is comparing two codes.
// Say so, and show what replaces it.
const expiry = (secret, left) => (left <= 5
  ? `(rolling now — next is ${totpCode(secret, Date.now() + (left + 1) * 1000)})`
  : `(${left}s left)`);

const arg = process.argv[2];
const now = Date.now();
const secondsLeft = STEP_SECONDS - Math.floor(now / 1000) % STEP_SECONDS;

if (arg === "--help" || arg === "-h") {
  console.log("usage: node scripts/totp-secret.mjs [SECRET]\n" +
    "  no argument   mint a new secret\n" +
    "  SECRET        print the code that secret should be showing right now");
  process.exit(0);
}

if (arg) {
  if (!base32Decode(arg)) {
    console.error(`Not a base32 secret: ${JSON.stringify(arg)}\n` +
      "Authenticator setup keys use A-Z and 2-7 only. Spaces and = padding are fine.");
    process.exit(1);
  }
  // ±DEFAULT_WINDOW is what the server accepts, so showing the neighbours tells
  // you whether a disagreement is a wrong secret (nothing matches) or a drifted
  // clock (your app shows the step before or after — fixable in phone settings).
  console.log(`\nNow        ${totpCode(arg, now)}   ${expiry(arg, secondsLeft)}`);
  for (let i = 1; i <= DEFAULT_WINDOW; i++) {
    console.log(`-${i} step    ${totpCode(arg, now - i * STEP_SECONDS * 1000)}   still accepted`);
    console.log(`+${i} step    ${totpCode(arg, now + i * STEP_SECONDS * 1000)}   still accepted`);
  }
  console.log("\nYour authenticator should be showing one of these. If it shows none,\n" +
    "the secret it holds isn't this one — re-enter it. If it shows a neighbour,\n" +
    "the phone's clock has drifted; turn on automatic time.\n");
  process.exit(0);
}

// 20 bytes = 160 bits = the RFC 4226 recommended key size, and exactly 32
// base32 characters with nothing left over.
const secret = base32Encode(randomBytes(20));
const grouped = secret.match(/.{1,4}/g).join(" ");

console.log(`
  Secret     ${secret}
  To type    ${grouped}
  Code now   ${totpCode(secret, now)}   ${expiry(secret, secondsLeft)}

  1. Authenticator app → add account → "enter a setup key" (not a QR).
     Account: DuoCount dev    Key: the grouped form above    Type: time-based
  2. Check the app now shows the code above. If it doesn't, stop — re-enter it.
  3. Save the secret in your password manager. Losing it with the phone means
     blanking DEV_ADMIN_TOTP_SECRET and redeploying to get back in.
  4. Only then: set DEV_ADMIN_TOTP_SECRET in Vercel and redeploy.

  Re-check any time with:  node scripts/totp-secret.mjs ${secret}

  Don't paste this into an online QR generator — that hands the secret to a
  stranger's server, and manual entry is what step 1 already does.
`);
