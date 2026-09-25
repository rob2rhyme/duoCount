// Mint a new DEV_ADMIN_PASSWORD.
//
//   node scripts/dev-password.mjs        24 characters (120 bits)
//   node scripts/dev-password.mjs 32     longer, if you prefer
//
// There is no password reset flow on purpose (runbook §2): DEV_ADMIN_PASSWORD
// IS the secret, so "resetting" it means overwriting the environment variable
// and redeploying. This prints a value chosen so that the step in between —
// getting it from here into a deploy dashboard intact — cannot fail silently.
//
// Terminal only: nothing is written to disk. Put it in the password manager
// before you close the tab; there is nowhere else it is recoverable from.
import { randomSecret, SAFE_ALPHABET } from "../src/lib/secret-gen.js";

const arg = process.argv[2];
if (arg === "--help" || arg === "-h") {
  console.log("usage: node scripts/dev-password.mjs [LENGTH]   (default 24)");
  process.exit(0);
}

const length = arg === undefined ? 24 : Number(arg);
if (!Number.isInteger(length) || length < 16 || length > 128) {
  console.error(`Length must be a whole number from 16 to 128 (got ${JSON.stringify(arg)}).`);
  process.exit(1);
}

const password = randomSecret(length);
const bits = Math.floor(length * Math.log2(SAFE_ALPHABET.length));

console.log(`
  ${password}

  ${length} characters, ${bits} bits. The alphabet is A-Z and 2-9 with I, O, 0
  and 1 removed, so nothing here is a look-alike and nothing needs escaping in
  a shell or a dashboard form.

  1. Vercel → the project → Settings → Environment Variables.
  2. EDIT the existing DEV_ADMIN_PASSWORD row — don't add a second one — and
     check the row is scoped to Production. An edit that lands on Preview only
     leaves Production stale, which looks exactly like nothing changed.
  3. While you're there, reveal DEV_ADMIN_EMAIL and confirm it is the address
     you actually type. "Wrong developer email or password" is one message for
     both halves, and the email is the half people forget they set.
  4. Redeploy. Environment changes don't reach running functions until then.
  5. Sign in at /dev, PASTE the value (don't retype it), and use the eye in the
     field to confirm what landed. Then save it to your password manager.

  Still refused after all that? It isn't the characters. Read the log line:
  Vercel → Logs, leave it open, sign in from a second tab, filter dev-login.
`);
