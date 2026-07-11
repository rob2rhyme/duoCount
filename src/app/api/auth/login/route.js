import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { verifyPin } from "@/lib/hash";
import { throttleDecision, attemptKey, IP_LIMIT, STORE_LIMIT } from "@/lib/login-throttle";

export const runtime = "nodejs";

// Failed sign-ins are throttled two ways before any credential work runs: per
// client IP (one machine hammering) and per store slug (a distributed attack
// rotating IPs). Either tripping => 429. Counters live in a top-level collection
// only the Admin SDK can touch (the rules match nothing outside /vendors, so
// Firestore default-denies clients). Decision logic is pure + unit-tested in
// lib/login-throttle.js; both windows auto-expire and clear on success.
function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : "") || "unknown";
}

export async function POST(req) {
  try {
    const { storeCode, pin } = await req.json();
    if (!storeCode || !pin)
      return NextResponse.json({ error: "Enter your store code and PIN." }, { status: 400 });

    const { adminDb, adminAuth } = await getAdmin();
    const now = Date.now();
    const slug = String(storeCode).trim().toLowerCase();

    const attempts = adminDb.collection("loginAttempts");
    const ipRef = attempts.doc(`ip_${attemptKey(clientIp(req))}`);
    const storeRef = attempts.doc(`store_${attemptKey(slug)}`);
    const [ipSnap, storeSnap] = await Promise.all([ipRef.get(), storeRef.get()]);
    const ipDec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now, IP_LIMIT);
    const storeDec = throttleDecision(storeSnap.exists ? storeSnap.data() : null, now, STORE_LIMIT);
    if (ipDec.blocked || storeDec.blocked)
      return NextResponse.json(
        { error: "Too many attempts — wait a few minutes and try again." }, { status: 429 });
    const recordFail = () =>
      Promise.all([ipRef.set(ipDec.nextOnFail), storeRef.set(storeDec.nextOnFail)]);

    const vSnap = await adminDb.collection("vendors")
      .where("slug", "==", slug).limit(1).get();
    if (vSnap.empty) {
      await recordFail();
      return NextResponse.json({ error: "No store found for that code." }, { status: 404 });
    }
    const vendorDoc = vSnap.docs[0];
    const vendor = { id: vendorDoc.id, ...vendorDoc.data() };

    // Small staff lists per store, so verifying against each active user's
    // salted hash is fine (salted hashes can't be queried directly).
    const uSnap = await vendorDoc.ref.collection("users").where("active", "==", true).get();
    let match = null;
    for (const u of uSnap.docs) {
      const creds = await u.ref.collection("private").doc("creds").get();
      if (creds.exists && verifyPin(pin, creds.data().pinHash)) { match = { id: u.id, ...u.data() }; break; }
    }
    if (!match) {
      await recordFail();
      return NextResponse.json({ error: "PIN not recognized for this store." }, { status: 401 });
    }

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
      profile: { id: match.id, name: match.name, role: match.role, locationId: match.locationId ?? null },
    });
  } catch (e) {
    console.error("login error", e);
    return NextResponse.json({ error: e.message || "Login failed." }, { status: 500 });
  }
}
