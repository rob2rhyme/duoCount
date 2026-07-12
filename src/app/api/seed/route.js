import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { buildDemoData } from "@/lib/seed-data";

export const runtime = "nodejs";

// Demo data is powerful (it writes and deletes vendor records), so it's
// owner-only and always scoped to the caller's own vendor.
async function requireOwner(req) {
  const authz = req.headers.get("authorization") || "";
  const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!idToken) throw Object.assign(new Error("Not signed in."), { status: 401 });
  const { adminAuth } = await getAdmin();
  const claims = await adminAuth.verifyIdToken(idToken);
  if (!claims.vendorId || claims.role !== "owner")
    throw Object.assign(new Error("Only the owner can manage demo data."), { status: 403 });
  return claims;
}

// Collect every seed-tagged doc (and its known subcollections) into a batch of
// deletes. Reads happen up front; the batch commits atomically.
async function stageClear(vendorRef, batch) {
  const counts = {};
  const wipe = async (name, subcols = []) => {
    const snap = await vendorRef.collection(name).where("seed", "==", true).get();
    for (const doc of snap.docs) {
      for (const sub of subcols) {
        const subSnap = await doc.ref.collection(sub).get();
        subSnap.docs.forEach((s) => batch.delete(s.ref));
      }
      batch.delete(doc.ref);
    }
    counts[name] = snap.size;
  };
  await wipe("entries", ["comments"]);
  await wipe("users", ["private"]);
  for (const name of [
    "locations", "drawers", "items", "packs", "notes", "incidents",
    "timeclock", "schedule", "availability", "templates", "schedulePublished",
  ]) await wipe(name);
  return counts;
}

export async function POST(req) {
  try {
    const claims = await requireOwner(req);
    const { action } = await req.json();
    const { adminDb } = await getAdmin();
    const vendorRef = adminDb.collection("vendors").doc(claims.vendorId);

    if (action === "clear") {
      const batch = adminDb.batch();
      const counts = await stageClear(vendorRef, batch);
      await batch.commit();
      return NextResponse.json({ ok: true, action: "clear", counts });
    }

    if (action === "load") {
      // Idempotent: remove any prior seed data first so re-loading never stacks.
      const clearBatch = adminDb.batch();
      await stageClear(vendorRef, clearBatch);
      await clearBatch.commit();

      const data = buildDemoData({
        owner: { id: claims.userId, name: claims.name || "Owner", role: "owner" },
        now: new Date(),
      });

      const batch = adminDb.batch();
      const add = (name, docs) => {
        for (const { id, ...fields } of docs) batch.set(vendorRef.collection(name).doc(id), { ...fields, seed: true });
      };
      add("users", data.staff);
      add("locations", data.locations);
      add("drawers", data.drawers);
      add("items", data.items);
      add("packs", data.packs);
      add("entries", data.entries);
      add("notes", data.notes);
      add("incidents", data.incidents);
      add("timeclock", data.timeclock);
      add("schedule", data.schedule);
      add("availability", data.availability);
      add("templates", data.templates);
      add("schedulePublished", data.schedulePublished);
      for (const [entryId, list] of Object.entries(data.comments)) {
        for (const { id, ...c } of list) {
          batch.set(vendorRef.collection("entries").doc(entryId).collection("comments").doc(id), { ...c, seed: true });
        }
      }
      await batch.commit();

      const counts = {
        staff: data.staff.length, locations: data.locations.length, drawers: data.drawers.length,
        items: data.items.length, packs: data.packs.length, entries: data.entries.length,
        notes: data.notes.length, incidents: data.incidents.length,
        timeclock: data.timeclock.length, schedule: data.schedule.length,
        availability: data.availability.length, templates: data.templates.length,
        schedulePublished: data.schedulePublished.length,
      };
      return NextResponse.json({ ok: true, action: "load", counts });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Failed." }, { status: e.status || 500 });
  }
}
