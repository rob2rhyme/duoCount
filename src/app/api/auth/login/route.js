import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { verifyPin } from "@/lib/hash";
import { throttleDecision, attemptKey, IP_LIMIT, STORE_LIMIT, clientIp } from "@/lib/login-throttle";

export const runtime = "nodejs";

// Failed sign-ins are throttled two ways before any credential work runs: per
// client IP (one machine hammering) and per store slug (a distributed attack
// rotating IPs). Either tripping => 429. Counters live in a top-level collection
// only the Admin SDK can touch (the rules match nothing outside /vendors, so
// Firestore default-denies clients). Decision + client-IP logic are pure +
// unit-tested in lib/login-throttle.js; both windows auto-expire and clear on success.
const ipOf = (req) => clientIp((n) => req.headers.get(n));

export async function POST(req) {
  try {
    const { storeCode, pin } = await req.json();
    // Errors carry a stable `code` alongside the English prose so the client
    // can render them in the device's language (i18n autherr.* keys); the
    // `error` string is the unchanged fallback for anything that predates it.
    if (!storeCode || !pin)
      return NextResponse.json({ error: "Enter your store code and PIN.", code: "missing_fields" }, { status: 400 });

    const { adminDb, adminAuth } = await getAdmin();
    const now = Date.now();
    const slug = String(storeCode).trim().toLowerCase();

    const attempts = adminDb.collection("loginAttempts");
    const ipRef = attempts.doc(`ip_${attemptKey(ipOf(req))}`);
    const storeRef = attempts.doc(`store_${attemptKey(slug)}`);
    const [ipSnap, storeSnap] = await Promise.all([ipRef.get(), storeRef.get()]);
    const ipDec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now, IP_LIMIT);
    const storeDec = throttleDecision(storeSnap.exists ? storeSnap.data() : null, now, STORE_LIMIT);
    if (ipDec.blocked || storeDec.blocked)
      return NextResponse.json(
        { error: "Too many attempts — wait a few minutes and try again.", code: "throttled" }, { status: 429 });
    const recordFail = () =>
      Promise.all([ipRef.set(ipDec.nextOnFail), storeRef.set(storeDec.nextOnFail)]);

    const vSnap = await adminDb.collection("vendors")
      .where("slug", "==", slug).limit(1).get();
    if (vSnap.empty) {
      await recordFail();
      return NextResponse.json({ error: "No store found for that code.", code: "no_store" }, { status: 404 });
    }
    const vendorDoc = vSnap.docs[0];
    const vendor = { id: vendorDoc.id, ...vendorDoc.data() };

    // A store the developer suspended (non-payment / abuse, via /api/dev) can't
    // sign anyone in until reactivated. Counted as a fail so it also throttles.
    if (vendor.status === "suspended") {
      await recordFail();
      return NextResponse.json({ error: "This store is suspended. Contact DuoCount support.", code: "store_suspended" }, { status: 403 });
    }
    // A soft-deleted store (via /api/dev) is likewise closed to sign-in until a
    // developer restores it. Distinct code so the message can differ from suspend.
    if (vendor.status === "deleted") {
      await recordFail();
      return NextResponse.json({ error: "This store has been removed. Contact DuoCount support.", code: "store_deleted" }, { status: 403 });
    }

    // Small staff lists per store, so verifying against each active user's
    // salted hash is fine (salted hashes can't be queried directly).
    const uSnap = await vendorDoc.ref.collection("users").where("active", "==", true).get();
    const matches = [];
    for (const u of uSnap.docs) {
      const creds = await u.ref.collection("private").doc("creds").get();
      if (creds.exists && verifyPin(pin, creds.data().pinHash)) matches.push({ id: u.id, ...u.data() });
    }
    // Exactly one identity must match. Zero → wrong PIN. More than one (a PIN
    // collision that slipped past the set-time uniqueness checks) → refuse
    // rather than sign in as an arbitrary one of them.
    if (matches.length !== 1) {
      await recordFail();
      return NextResponse.json({ error: "PIN not recognized for this store.", code: "bad_pin" }, { status: 401 });
    }
    const match = matches[0];

    // A store's staff share the shop Wi-Fi IP — one person's typos shouldn't
    // lock out the shift once somebody signs in fine. Clear both counters.
    await Promise.all([
      ipSnap.exists ? ipRef.delete() : Promise.resolve(),
      storeSnap.exists ? storeRef.delete() : Promise.resolve(),
    ]);

    const claims = {
      vendorId: vendor.id, userId: match.id,
      role: match.role, locationId: match.locationId ?? null, name: match.name,
    };
    const token = await adminAuth.createCustomToken(`${vendor.id}_${match.id}`, claims);

    return NextResponse.json({
      token,
      vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug, logoUrl: vendor.logoUrl || null, sharingMode: vendor.sharingMode || "all-locations" },
      // `mustChangePin` rides along so the shell can force a change screen the
      // moment someone signs in with a PIN that SOMEBODY ELSE chose (an owner
      // reset, or the /dev console's support reset). The live user-doc watch
      // carries the same flag; this is just so the very first render has it.
      profile: {
        id: match.id, name: match.name, role: match.role,
        locationId: match.locationId ?? null, mustChangePin: !!match.mustChangePin,
        // Admin → My account reads these; without them the card shows a blank
        // recovery address for one render on a store whose owner has one.
        email: match.email ?? null, emailVerifiedAt: match.emailVerifiedAt ?? null,
      },
    });
  } catch (e) {
    console.error("login error", e);
    // A typed error (e.status set) carries a client-safe message; anything else
    // is unexpected — logged above, returned generic so raw Firestore/config
    // detail (project id, index-creation URLs) never reaches the client.
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    return NextResponse.json({ error: "Login failed.", code: "login_failed" }, { status: 500 });
  }
}
