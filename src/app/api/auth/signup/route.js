import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { hashPin } from "@/lib/hash";
import { isValidNewPin, PIN_ERROR } from "@/lib/pin";
import { throttleDecision, attemptKey } from "@/lib/login-throttle";

export const runtime = "nodejs";

// Store creation is rare and expensive (a whole vendor tree), so cap it per IP
// to stop someone mass-creating junk stores. Unlike login this counts every
// attempt, not just failures. Same top-level, Admin-only counter collection
// pattern as loginAttempts (default-denied to clients).
const SIGNUP_LIMIT = { windowMs: 60 * 60 * 1000, maxFails: 5 };

function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : "") || "unknown";
}

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
    if (!isValidNewPin(pin))
      return NextResponse.json({ error: PIN_ERROR }, { status: 400 });

    const { adminDb, adminAuth } = await getAdmin();
    const now = new Date();

    // Per-IP rate limit before any writes.
    const ipRef = adminDb.collection("signupAttempts").doc(`ip_${attemptKey(clientIp(req))}`);
    const ipSnap = await ipRef.get();
    const dec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now.getTime(), SIGNUP_LIMIT);
    if (dec.blocked)
      return NextResponse.json({ error: "Too many stores created from here — try again later." }, { status: 429 });
    await ipRef.set(dec.nextOnFail); // every creation counts toward the window

    const base = slugify(businessName);
    const vendorRef = adminDb.collection("vendors").doc();
    const locRef = vendorRef.collection("locations").doc();
    const ownerRef = vendorRef.collection("users").doc();
    const d1 = vendorRef.collection("drawers").doc();
    const d2 = vendorRef.collection("drawers").doc();

    // Allocate a unique store code and write the whole tree in one transaction,
    // so two people signing up at once can't grab the same slug (the query is
    // part of the txn read-set — a concurrent write to it forces a retry).
    let slug = base;
    await adminDb.runTransaction(async (tx) => {
      slug = base;
      for (let i = 2; i < 50; i++) {
        const clash = await tx.get(adminDb.collection("vendors").where("slug", "==", slug).limit(1));
        if (clash.empty) break;
        slug = `${base}-${i}`;
      }
      tx.set(vendorRef, {
        name: businessName.trim(),
        slug,
        logoUrl: (logoUrl || "").trim() || null,
        sharingMode: "all-locations", // vendor-chosen data sharing scope
        createdAt: now,
      });
      tx.set(locRef, { name: "Main Location", active: true, createdAt: now });
      // Seed the two drawers the owner asked about; more can be added in Admin.
      tx.set(d1, { name: "POS Cash Drawer", locationId: locRef.id, active: true, createdAt: now });
      tx.set(d2, { name: "Lottery Cash Drawer", locationId: locRef.id, active: true, createdAt: now });
      tx.set(ownerRef, {
        name: ownerName.trim(), role: "owner", locationId: null, active: true, createdAt: now,
      });
      tx.set(ownerRef.collection("private").doc("creds"), { pinHash: hashPin(pin) });
    });

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
