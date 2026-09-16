import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { devCredentialsOk } from "@/lib/dev-auth";
import { verifyTotp, totpConfigured } from "@/lib/totp";
import { throttleDecision, attemptKey, IP_LIMIT, DEV_GLOBAL_LIMIT, clientIp } from "@/lib/login-throttle";

export const runtime = "nodejs";

// Dedicated developer (platform-admin) login. The developer is NOT a store owner,
// so they don't sign in through a store PIN — they present a dedicated email +
// password (DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD env secrets). On a match we mint
// a Firebase custom token with a `platformAdmin: true` claim and NO vendorId: it
// unlocks the /dev console through the Admin SDK, but every tenant Firestore rule
// requires request.auth.token.vendorId, so this token can touch nothing else.
// Brute force is throttled per client IP, same posture as the store login.
const ipOf = (req) => clientIp((n) => req.headers.get(n));

export async function POST(req) {
  try {
    const body = await req.json();
    const { email, password } = body;
    const { adminDb, adminAuth } = await getAdmin();
    const now = Date.now();

    // Per-IP AND a global backstop (single dev credential, no store) — block if
    // either trips; on a failure, advance both windows.
    const ipRef = adminDb.collection("loginAttempts").doc(`dev_${attemptKey(ipOf(req))}`);
    const globalRef = adminDb.collection("loginAttempts").doc("dev_global");
    const [ipSnap, globalSnap] = await Promise.all([ipRef.get(), globalRef.get()]);
    const ipDec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now, IP_LIMIT);
    const globalDec = throttleDecision(globalSnap.exists ? globalSnap.data() : null, now, DEV_GLOBAL_LIMIT);
    if (ipDec.blocked || globalDec.blocked)
      return NextResponse.json({ error: "Too many attempts — wait a few minutes.", code: "throttled" }, { status: 429 });
    const onFail = () => Promise.all([ipRef.set(ipDec.nextOnFail), globalRef.set(globalDec.nextOnFail)]);

    // Login is OFF unless BOTH secrets are configured; treat that as a failed
    // attempt so it also throttles and can't be probed for free.
    if (!process.env.DEV_ADMIN_EMAIL || !process.env.DEV_ADMIN_PASSWORD) {
      await onFail();
      return NextResponse.json({ error: "Developer login isn't set up on the server yet.", code: "dev_unconfigured" }, { status: 403 });
    }
    if (!devCredentialsOk({ email, password })) {
      await onFail();
      return NextResponse.json({ error: "Wrong developer email or password.", code: "bad_dev_login" }, { status: 401 });
    }

    // Optional second factor. This password is static, lives in a deploy
    // dashboard, and unlocks every tenant through the Admin SDK — so when
    // DEV_ADMIN_TOTP_SECRET is set, a correct password alone is not enough.
    // Unset, nothing changes: deploying this can't lock the developer out of
    // their own console. The code is checked only AFTER the password, so it
    // never reveals whether a password was right on its own, and a wrong code
    // counts as a failed attempt like any other.
    if (totpConfigured()) {
      if (!verifyTotp(process.env.DEV_ADMIN_TOTP_SECRET, body.code)) {
        await onFail();
        return NextResponse.json({ error: "Wrong or expired authenticator code.", code: "bad_dev_code" }, { status: 401 });
      }
    }

    // Success clears both counters.
    await Promise.all([
      ipSnap.exists ? ipRef.delete() : Promise.resolve(),
      globalSnap.exists ? globalRef.delete() : Promise.resolve(),
    ]);
    const token = await adminAuth.createCustomToken("platform-admin", {
      platformAdmin: true, name: "DuoCount support",
    });
    return NextResponse.json({ token });
  } catch (e) {
    console.error("dev-login error", e);
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    return NextResponse.json({ error: "Login failed.", code: "login_failed" }, { status: 500 });
  }
}

// Does this deployment demand an authenticator code? The /dev sign-in card asks
// before showing the field, so the developer isn't left guessing. It reveals
// only whether a second factor is configured — never a credential — and says
// nothing about whether the login itself is set up.
export async function GET() {
  return NextResponse.json({ ok: true, totp: totpConfigured() });
}
