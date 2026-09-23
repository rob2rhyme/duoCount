// Developer (platform-admin) login credential check — SERVER ONLY (imports
// node:crypto). The developer isn't a store owner, so they don't sign in through
// a store PIN; they sign in with a dedicated email + password held as env
// secrets (DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD), the same shared-secret-in-env
// posture as CRON_SECRET. On a match, /api/auth/dev mints a Firebase custom
// token carrying a `platformAdmin: true` claim and NO vendorId — so it unlocks
// the /dev console (via the Admin SDK) but the tenant Firestore rules, which all
// require request.auth.token.vendorId, deny it everywhere else.
import { createHash, timingSafeEqual } from "node:crypto";

// Constant-time string equality. Compares SHA-256 digests so the compare is over
// fixed 32-byte buffers — no length leak, and no early-out on the first differing
// character (the naive === would leak how far the guess matched via timing).
function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a ?? ""), "utf8").digest();
  const hb = createHash("sha256").update(String(b ?? ""), "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Is the submitted developer credential valid against the configured env secret?
 * Both DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD must be set (non-empty) — an unset
 * pair means the developer login is OFF and never matches, so a blank env can't
 * be bypassed with blank input. Email match is case-insensitive; the password
 * stays case-SENSITIVE and is otherwise compared exactly.
 *
 * Surrounding whitespace is trimmed off BOTH sides of BOTH values. This is
 * deliberate, and it is about the failure mode rather than the threat model:
 * this is a break-glass credential set by pasting into a deploy dashboard, and a
 * pasted value picks up a trailing newline constantly — from a terminal, a file,
 * a password manager. Untrimmed, that mismatch is invisible (the dashboard shows
 * the value looking perfectly correct) and indistinguishable from a wrong
 * password, so the one credential that recovers cross-tenant access fails shut
 * with no way to tell why. The cost is that "s3cret" and "s3cret " both work;
 * for an operator-chosen random passphrase that is no meaningful loss of entropy,
 * and far cheaper than a silent lockout during an incident. Interior whitespace
 * is untouched — only the edges.
 */
export function devCredentialsOk(input, env = process.env) {
  const d = devCredentialDiagnosis(input, env);
  return d.configured && d.emailMatch && d.passwordMatch;
}

/**
 * WHY the credential was rejected, for the operator's server log — never for
 * the client, which keeps getting one combined "wrong email or password".
 *
 * That combined message is right for the response: telling an attacker which
 * half they got is a free oracle. But it is wrong for the person who set the
 * variables and is now locked out, because "wrong email or password" is the
 * same string whether the password has a stray character or DEV_ADMIN_EMAIL
 * still holds the example address from the docs. Those need opposite fixes,
 * and guessing between them costs a deploy per guess.
 *
 * What it reports, and the line it draws:
 *   • which SIDE matched — the actual answer most of the time;
 *   • both EMAIL addresses in full. An admin identifier, not a credential, and
 *     seeing "configured dev@duocount.app / submitted you@gmail.com" ends the
 *     question instantly;
 *   • password LENGTHS only. Never the value, never a hash, never a prefix —
 *     "configured 24, submitted 12" is enough to recognise the wrong password
 *     or a truncated paste, and reveals nothing usable.
 *
 * This is safe because it goes to the deployment's own function logs, readable
 * only by whoever administers the project — an attacker with that access
 * already holds the env vars themselves. Callers must log it and never return
 * it in a response body.
 */
export function devCredentialDiagnosis({ email, password } = {}, env = process.env) {
  const wantEmail = String(env.DEV_ADMIN_EMAIL || "").trim().toLowerCase();
  const wantPass = String(env.DEV_ADMIN_PASSWORD || "").trim();
  const gotEmail = String(email ?? "").trim().toLowerCase();
  const gotPass = String(password ?? "").trim();
  if (!wantEmail || !wantPass) {
    return {
      configured: false,
      emailMatch: false,
      passwordMatch: false,
      missing: [!wantEmail && "DEV_ADMIN_EMAIL", !wantPass && "DEV_ADMIN_PASSWORD"].filter(Boolean),
    };
  }
  // Evaluate both sides regardless (no short-circuit) to keep timing flat.
  const emailMatch = safeEqual(gotEmail, wantEmail);
  const passwordMatch = safeEqual(gotPass, wantPass);
  return {
    configured: true,
    emailMatch,
    passwordMatch,
    configuredEmail: wantEmail,
    submittedEmail: gotEmail,
    configuredPasswordLength: wantPass.length,
    submittedPasswordLength: gotPass.length,
  };
}
