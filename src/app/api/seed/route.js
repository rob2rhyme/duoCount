import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireOwner } from "@/lib/require-manager";
import { buildDemoData } from "@/lib/seed-data";

export const runtime = "nodejs";

// Demo data is powerful (it writes and deletes vendor records), so it's
// owner-only (requireOwner verifies the Bearer token with checkRevoked) and
// always scoped to the caller's own vendor.

// A batch that auto-flushes every 400 ops, so the seed — which runs to hundreds
// of docs on a long history window — never hits Firestore's 500-op batch limit.
function chunkedWriter(adminDb) {
  let batch = adminDb.batch();
  let n = 0;
  const commits = [];
  const flush = () => { commits.push(batch.commit()); batch = adminDb.batch(); n = 0; };
  return {
    set(ref, data) { batch.set(ref, data); if (++n >= 400) flush(); },
    delete(ref) { batch.delete(ref); if (++n >= 400) flush(); },
    async done() { if (n) flush(); await Promise.all(commits); },
  };
}

// Collect every seed-tagged doc (and its known subcollections) into delete ops.
async function stageClear(vendorRef, writer) {
  const counts = {};
  const wipe = async (name, subcols = []) => {
    const snap = await vendorRef.collection(name).where("seed", "==", true).get();
    for (const doc of snap.docs) {
      for (const sub of subcols) {
        const subSnap = await doc.ref.collection(sub).get();
        subSnap.docs.forEach((s) => writer.delete(s.ref));
      }
      writer.delete(doc.ref);
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
      const writer = chunkedWriter(adminDb);
      const counts = await stageClear(vendorRef, writer);
      await writer.done();
      return NextResponse.json({ ok: true, action: "clear", counts });
    }

    if (action === "load") {
      // Idempotent: remove any prior seed data first so re-loading never stacks.
      const clearWriter = chunkedWriter(adminDb);
      await stageClear(vendorRef, clearWriter);
      await clearWriter.done();

      const data = buildDemoData({
        owner: { id: claims.userId, name: claims.name || "Owner", role: "owner" },
        now: new Date(),
      });

      const writer = chunkedWriter(adminDb);
      const add = (name, docs) => {
        for (const { id, ...fields } of docs) writer.set(vendorRef.collection(name).doc(id), { ...fields, seed: true });
      };
      add("users", data.staff);
      add("locations", data.locations);
      add("drawers", data.drawers);
      add("items", data.items);
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
          writer.set(vendorRef.collection("entries").doc(entryId).collection("comments").doc(id), { ...c, seed: true });
        }
      }
      await writer.done();

      const counts = {
        staff: data.staff.length, locations: data.locations.length, drawers: data.drawers.length,
        items: data.items.length, entries: data.entries.length,
        notes: data.notes.length, incidents: data.incidents.length,
        timeclock: data.timeclock.length, schedule: data.schedule.length,
        availability: data.availability.length, templates: data.templates.length,
        schedulePublished: data.schedulePublished.length,
      };
      return NextResponse.json({ ok: true, action: "load", counts });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("seed error", e);
    return NextResponse.json({ error: "Seeding failed." }, { status: 500 });
  }
}
