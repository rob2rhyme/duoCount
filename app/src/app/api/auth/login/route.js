import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { verifyPin } from "@/lib/hash";

export const runtime = "nodejs";

// PINs are 4-6 digits, so failed attempts are throttled per client IP:
// MAX_FAILS in WINDOW_MS => 429 before any credential work runs. Counters
// live in a top-level collection only the Admin SDK can touch (the rules
// match nothing outside /vendors, so Firestore default-denies clients).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

function limiterRef(adminDb, req) {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : "") || "unknown";
  return adminDb.collection("loginAttempts").doc(ip.replace(/[^a-zA-Z0-9:._-]/g, "_"));
}

export async function POST(req) {
  try {
    const { storeCode, pin } = await req.json();
    if (!storeCode || !pin)
      return NextResponse.json({ error: "Enter your store code and PIN." }, { status: 400 });

    const { adminDb, adminAuth } = getAdmin();

    const limRef = limiterRef(adminDb, req);
    const lim = await limRef.get();
    const inWindow = lim.exists && Date.now() - lim.data().windowStart < WINDOW_MS;
    if (inWindow && lim.data().count >= MAX_FAILS)
      return NextResponse.json(
        { error: "Too many attempts — wait a few minutes and try again." }, { status: 429 });
    const recordFail = () => limRef.set(inWindow
      ? { count: lim.data().count + 1, windowStart: lim.data().windowStart }
      : { count: 1, windowStart: Date.now() });

    const vSnap = await adminDb.collection("vendors")
      .where("slug", "==", String(storeCode).trim().toLowerCase()).limit(1).get();
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

    // A store's staff share the shop Wi-Fi IP — one person's typos
    // shouldn't lock out the shift once somebody signs in fine.
    if (lim.exists) await limRef.delete();

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
