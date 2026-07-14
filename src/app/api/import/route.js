import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAdmin } from "@/lib/firebase-admin";
import { requireOwner } from "@/lib/require-manager";
import { validateItems } from "@/lib/import-parse";

export const runtime = "nodejs";

// Owner-only CSV bulk import (Phase 1: items). Same trusted posture as /api/seed:
// requireOwner verifies the Bearer token with checkRevoked and scopes every read
// and write to the caller's own vendor. The browser sends already-parsed rows +
// the confirmed column mapping; the route re-runs the SAME pure validators
// against live Firestore state, so a commit is never gated on the client's word.
//
//   body: { type: "items", mode: "preview" | "commit", mapping, rows }
//   • preview → validate only, write nothing
//   • commit  → validate, then write the create/update rows

// A batch that auto-flushes every 400 ops so a large catalog never trips
// Firestore's 500-op limit (mirrors the seed route).
function chunkedWriter(adminDb) {
  let batch = adminDb.batch();
  let n = 0;
  const commits = [];
  const flush = () => { commits.push(batch.commit()); batch = adminDb.batch(); n = 0; };
  return {
    set(ref, data, opts) { opts ? batch.set(ref, data, opts) : batch.set(ref, data); if (++n >= 400) flush(); },
    async done() { if (n) flush(); await Promise.all(commits); },
  };
}

async function buildItemsCtx(vendorRef) {
  const [locSnap, itemSnap] = await Promise.all([
    vendorRef.collection("locations").get(),
    vendorRef.collection("items").get(),
  ]);
  const locations = locSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const existingItems = itemSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const active = locations.filter((l) => l.active !== false);
  return { locations, existingItems, defaultLocationId: active.length === 1 ? active[0].id : null };
}

export async function POST(req) {
  try {
    const claims = await requireOwner(req);
    const { type, mode, mapping = {}, rows = [] } = await req.json();

    if (type !== "items")
      return NextResponse.json({ error: "Only item import is available yet." }, { status: 400 });
    if (!Array.isArray(rows))
      return NextResponse.json({ error: "No rows to import." }, { status: 400 });

    const { adminDb } = await getAdmin();
    const vendorRef = adminDb.collection("vendors").doc(claims.vendorId);
    const ctx = await buildItemsCtx(vendorRef);
    const report = validateItems(rows, mapping, ctx);

    if (mode !== "commit")
      return NextResponse.json({ ok: true, type, mode: "preview", summary: report.summary, rows: report.rows });

    // Commit: write only the rows that survived server-side validation.
    const itemsCol = vendorRef.collection("items");
    const importBatchId = randomUUID();
    const writer = chunkedWriter(adminDb);
    let created = 0;
    let updated = 0;
    for (const r of report.rows) {
      const f = r.fields;
      if (r.status === "create") {
        writer.set(itemsCol.doc(), {
          name: f.name,
          category: f.category ?? null,
          unit: f.unit || "unit",
          barcode: f.barcode ?? null,
          locationId: f.locationId,
          active: true,
          createdAt: new Date(),
          source: "import",
          importBatchId,
        });
        created += 1;
      } else if (r.status === "update" && f.id) {
        const patch = {};
        if (mapping.category) patch.category = f.category ?? null;
        if (mapping.unit) patch.unit = f.unit || "unit";
        if (mapping.barcode) patch.barcode = f.barcode ?? null;
        if (Object.keys(patch).length) { writer.set(itemsCol.doc(f.id), patch, { merge: true }); updated += 1; }
      }
    }
    await writer.done();

    return NextResponse.json({
      ok: true,
      type,
      mode: "commit",
      counts: { create: created, update: updated, skip: report.summary.skip, error: report.summary.error },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Import failed." }, { status: e.status || 500 });
  }
}
