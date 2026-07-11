import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { hashPin } from "@/lib/hash";

export const runtime = "nodejs";

async function requireManager(req) {
  const authz = req.headers.get("authorization") || "";
  const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!idToken) throw Object.assign(new Error("Not signed in."), { status: 401 });
  const { adminAuth } = await getAdmin();
  const claims = await adminAuth.verifyIdToken(idToken);
  if (!claims.vendorId || !["owner", "manager"].includes(claims.role))
    throw Object.assign(new Error("Managers only."), { status: 403 });
  return claims;
}

export async function POST(req) {
  try {
    const claims = await requireManager(req);
    const { name, pin, role, locationId } = await req.json();
    if (!name || name.trim().length < 2)
      return NextResponse.json({ error: "Enter a name." }, { status: 400 });
    if (!/^\d{4,6}$/.test(String(pin || "")))
      return NextResponse.json({ error: "PIN must be 4–6 digits." }, { status: 400 });
    const newRole = ["employee", "manager", "owner"].includes(role) ? role : "employee";
    if (newRole === "owner" && claims.role !== "owner")
      return NextResponse.json({ error: "Only an owner can create another owner." }, { status: 403 });
    if (newRole === "employee" && !locationId)
      return NextResponse.json({ error: "Assign employees to a location." }, { status: 400 });

    const { adminDb } = await getAdmin();
    const vendorRef = adminDb.collection("vendors").doc(claims.vendorId);

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
      active: true, createdAt: new Date(),
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
    const { userId, role, active, locationId, pin } = await req.json();
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
    if (locationId !== undefined) patch.locationId = locationId || null;
    if (Object.keys(patch).length) await ref.update(patch);

    if (pin !== undefined) {
      if (!/^\d{4,6}$/.test(String(pin)))
        return NextResponse.json({ error: "PIN must be 4–6 digits." }, { status: 400 });
      await ref.collection("private").doc("creds").set({ pinHash: hashPin(pin) });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Failed." }, { status: e.status || 500 });
  }
}
