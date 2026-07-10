import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { verifyPin } from "@/lib/hash";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { storeCode, pin } = await req.json();
    if (!storeCode || !pin)
      return NextResponse.json({ error: "Enter your store code and PIN." }, { status: 400 });

    const { adminDb, adminAuth } = getAdmin();

    const vSnap = await adminDb.collection("vendors")
      .where("slug", "==", String(storeCode).trim().toLowerCase()).limit(1).get();
    if (vSnap.empty)
      return NextResponse.json({ error: "No store found for that code." }, { status: 404 });
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
    if (!match)
      return NextResponse.json({ error: "PIN not recognized for this store." }, { status: 401 });

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
