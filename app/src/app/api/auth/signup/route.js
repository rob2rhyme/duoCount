import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { hashPin } from "@/lib/hash";

export const runtime = "nodejs";

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "store";
}

export async function POST(req) {
  try {
    const { businessName, logoUrl, ownerName, pin } = await req.json();
    if (!businessName || businessName.trim().length < 2)
      return NextResponse.json({ error: "Enter a business name." }, { status: 400 });
    if (!ownerName || ownerName.trim().length < 2)
      return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    if (!/^\d{4,6}$/.test(String(pin || "")))
      return NextResponse.json({ error: "PIN must be 4–6 digits." }, { status: 400 });

    const { adminDb, adminAuth } = getAdmin();

    // unique store code
    const base = slugify(businessName);
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const clash = await adminDb.collection("vendors").where("slug", "==", slug).limit(1).get();
      if (clash.empty) break;
      slug = `${base}-${i}`;
    }

    const now = new Date();
    const vendorRef = adminDb.collection("vendors").doc();
    const locRef = vendorRef.collection("locations").doc();
    const ownerRef = vendorRef.collection("users").doc();

    const batch = adminDb.batch();
    batch.set(vendorRef, {
      name: businessName.trim(),
      slug,
      logoUrl: (logoUrl || "").trim() || null,
      sharingMode: "all-locations", // vendor-chosen data sharing scope
      createdAt: now,
    });
    batch.set(locRef, { name: "Main Location", active: true, createdAt: now });
    // Seed the two drawers the owner asked about; more can be added in Admin.
    const d1 = vendorRef.collection("drawers").doc();
    const d2 = vendorRef.collection("drawers").doc();
    batch.set(d1, { name: "POS Cash Drawer", locationId: locRef.id, active: true, createdAt: now });
    batch.set(d2, { name: "Lottery Cash Drawer", locationId: locRef.id, active: true, createdAt: now });
    batch.set(ownerRef, {
      name: ownerName.trim(), role: "owner", locationId: null, active: true, createdAt: now,
    });
    batch.set(ownerRef.collection("private").doc("creds"), { pinHash: hashPin(pin) });
    await batch.commit();

    const claims = {
      vendorId: vendorRef.id, userId: ownerRef.id,
      role: "owner", locationId: null, name: ownerName.trim(),
    };
    const token = await adminAuth.createCustomToken(`${vendorRef.id}_${ownerRef.id}`, claims);

    return NextResponse.json({
      token,
      vendor: { id: vendorRef.id, name: businessName.trim(), slug, logoUrl: (logoUrl || "").trim() || null, sharingMode: "all-locations" },
      profile: { id: ownerRef.id, name: ownerName.trim(), role: "owner", locationId: null },
    });
  } catch (e) {
    console.error("signup error", e);
    return NextResponse.json({ error: e.message || "Signup failed." }, { status: 500 });
  }
}
