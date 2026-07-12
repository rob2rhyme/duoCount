import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { hashPin } from "@/lib/hash";
import { isValidNewPin, PIN_ERROR } from "@/lib/pin";
import { requireManager } from "@/lib/require-manager";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// "" clears the email; a non-empty value must look like an address.
function cleanEmail(raw) {
  const v = String(raw ?? "").trim();
  if (v === "") return { email: null };
  if (!EMAIL_RE.test(v) || v.length > 200) return { error: "Enter a valid email (or leave it blank)." };
  return { email: v.toLowerCase() };
}

// A client-supplied locationId is untrusted: verify it names a real, active
// location in this vendor before persisting it. Otherwise a stale or forged id
// silently strands an employee — their reads filter by locationId, so they'd
// open to a permanently empty log with no error anywhere. Returns an error
// string, or null when the id is valid.
async function locationError(adminDb, vendorId, locationId) {
  const loc = await adminDb
    .collection("vendors").doc(vendorId)
    .collection("locations").doc(String(locationId)).get();
  if (!loc.exists || loc.data().active === false) return "That location doesn't exist.";
  return null;
}

export async function POST(req) {
  try {
    const claims = await requireManager(req);
    const { name, pin, role, locationId, email } = await req.json();
    if (!name || name.trim().length < 2)
      return NextResponse.json({ error: "Enter a name." }, { status: 400 });
    if (!isValidNewPin(pin))
      return NextResponse.json({ error: PIN_ERROR }, { status: 400 });
    const em = cleanEmail(email);
    if (em.error) return NextResponse.json({ error: em.error }, { status: 400 });
    const newRole = ["employee", "manager", "owner"].includes(role) ? role : "employee";
    if (newRole === "owner" && claims.role !== "owner")
      return NextResponse.json({ error: "Only an owner can create another owner." }, { status: 403 });
    if (newRole === "employee" && !locationId)
      return NextResponse.json({ error: "Assign employees to a location." }, { status: 400 });

    const { adminDb } = await getAdmin();
    const vendorRef = adminDb.collection("vendors").doc(claims.vendorId);

    if (locationId) {
      const locErr = await locationError(adminDb, claims.vendorId, locationId);
      if (locErr) return NextResponse.json({ error: locErr }, { status: 400 });
    }

    // PIN must be unique within this store so login can identify the person.
    const users = await vendorRef.collection("users").get();
    for (const u of users.docs) {
      const creds = await u.ref.collection("private").doc("creds").get();
      if (creds.exists) {
        const { verifyPin } = await import("@/lib/hash");
        if (verifyPin(pin, creds.data().pinHash))
          return NextResponse.json({ error: "That PIN is already in use at this store." }, { status: 409 });
      }
    }

    const ref = vendorRef.collection("users").doc();
    await ref.set({
      name: name.trim(), role: newRole,
      locationId: newRole === "employee" ? locationId : (locationId || null),
      email: em.email, active: true, createdAt: new Date(),
    });
    await ref.collection("private").doc("creds").set({ pinHash: hashPin(pin) });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Failed." }, { status: e.status || 500 });
  }
}

export async function PATCH(req) {
  try {
    const claims = await requireManager(req);
    const { userId, role, active, locationId, pin, email } = await req.json();
    if (!userId) return NextResponse.json({ error: "Missing userId." }, { status: 400 });
    if (userId === claims.userId)
      return NextResponse.json({ error: "You can't modify your own account here." }, { status: 400 });

    const { adminDb } = await getAdmin();
    const ref = adminDb.collection("vendors").doc(claims.vendorId).collection("users").doc(userId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
    const target = snap.data();

    const patch = {};
    if (role !== undefined) {
      if (!["employee", "manager", "owner"].includes(role))
        return NextResponse.json({ error: "Bad role." }, { status: 400 });
      if ((role === "owner" || target.role === "owner") && claims.role !== "owner")
        return NextResponse.json({ error: "Only an owner can change owner roles." }, { status: 403 });
      patch.role = role;
    }
    if (active !== undefined) {
      if (target.role === "owner" && claims.role !== "owner")
        return NextResponse.json({ error: "Only an owner can disable an owner." }, { status: 403 });
      patch.active = !!active;
    }
    if (locationId !== undefined) {
      if (locationId) {
        const locErr = await locationError(adminDb, claims.vendorId, locationId);
        if (locErr) return NextResponse.json({ error: locErr }, { status: 400 });
      }
      patch.locationId = locationId || null;
    }
    if (email !== undefined) {
      const em = cleanEmail(email);
      if (em.error) return NextResponse.json({ error: em.error }, { status: 400 });
      patch.email = em.email;
    }
    if (Object.keys(patch).length) await ref.update(patch);

    if (pin !== undefined) {
      if (!isValidNewPin(pin))
        return NextResponse.json({ error: PIN_ERROR }, { status: 400 });
      await ref.collection("private").doc("creds").set({ pinHash: hashPin(pin) });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Failed." }, { status: e.status || 500 });
  }
}
