import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { devCredentialsOk } from "@/lib/dev-auth";
import { throttleDecision, attemptKey, IP_LIMIT, clientIp } from "@/lib/login-throttle";

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
    const { email, password } = await req.json();
    const { adminDb, adminAuth } = await getAdmin();
    const now = Date.now();

    const ipRef = adminDb.collection("loginAttempts").doc(`dev_${attemptKey(ipOf(req))}`);
    const ipSnap = await ipRef.get();
    const ipDec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now, IP_LIMIT);
    if (ipDec.blocked)
      return NextResponse.json({ error: "Too many attempts — wait a few minutes.", code: "throttled" }, { status: 429 });

    // Login is OFF unless BOTH secrets are configured; treat that as a failed
    // attempt so it also throttles and can't be probed for free.
    if (!process.env.DEV_ADMIN_EMAIL || !process.env.DEV_ADMIN_PASSWORD) {
      await ipRef.set(ipDec.nextOnFail);
      return NextResponse.json({ error: "Developer login isn't set up on the server yet.", code: "dev_unconfigured" }, { status: 403 });
    }
    if (!devCredentialsOk({ email, password })) {
      await ipRef.set(ipDec.nextOnFail);
      return NextResponse.json({ error: "Wrong developer email or password.", code: "bad_dev_login" }, { status: 401 });
    }

    if (ipSnap.exists) await ipRef.delete(); // clear the counter on success
    const token = await adminAuth.createCustomToken("platform-admin", {
      platformAdmin: true, name: "DuoCount support",
    });
    return NextResponse.json({ token });
  } catch (e) {
    console.error("dev-login error", e);
    return NextResponse.json(
      e.message ? { error: e.message } : { error: "Login failed.", code: "login_failed" },
      { status: 500 });
  }
}
