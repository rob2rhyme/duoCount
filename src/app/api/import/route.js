import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAdmin } from "@/lib/firebase-admin";
import { requireOwner } from "@/lib/require-manager";
import { hashPin, verifyPin } from "@/lib/hash";
import { isValidNewPin } from "@/lib/pin";
import { validateItems, validateStaff } from "@/lib/import-parse";

export const runtime = "nodejs";

// Owner-only CSV bulk import (Phase 1: items, Phase 2: staff). Same trusted
// posture as /api/seed: requireOwner verifies the Bearer token with checkRevoked
// and scopes every read and write to the caller's own vendor. The browser sends
// already-parsed rows + the confirmed column mapping; the route re-runs the SAME
// pure validators against live Firestore state, so a commit is never gated on the
// client's word.
//
//   body: { type: "items" | "staff", mode: "preview" | "commit", mapping, rows }
//   • preview → validate only, write nothing
//   • commit  → validate, then write the create/update rows

// A batch that auto-flushes every 400 ops so a large import never trips
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

async function readStore(vendorRef, extra = []) {
  const [locSnap, ...rest] = await Promise.all([
    vendorRef.collection("locations").get(),
    ...extra.map((name) => vendorRef.collection(name).get()),
  ]);
  const locations = locSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const active = locations.filter((l) => l.active !== false);
  return { locations, defaultLocationId: active.length === 1 ? active[0].id : null, snaps: rest };
}

async function commitItems(adminDb, vendorRef, report, mapping) {
  const itemsCol = vendorRef.collection("items");
  const importBatchId = randomUUID();
  const writer = chunkedWriter(adminDb);
  let created = 0;
  let updated = 0;
  for (const r of report.rows) {
    const f = r.fields;
    if (r.status === "create") {
      writer.set(itemsCol.doc(), {
        name: f.name, category: f.category ?? null, unit: f.unit || "unit",
        barcode: f.barcode ?? null, locationId: f.locationId, active: true,
        createdAt: new Date(), source: "import", importBatchId,
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
  return { create: created, update: updated, skip: report.summary.skip, error: report.summary.error };
}

async function commitStaff(adminDb, adminAuth, vendorRef, claims, report, mapping, rows, userSnap, existingById) {
  // Preload existing PIN hashes for against-store uniqueness — the same
  // O(rows × users) check POST /api/staff runs (fine at store scale).
  const existingHashes = (await Promise.all(userSnap.docs.map(async (u) => {
    const c = await u.ref.collection("private").doc("creds").get();
    return c.exists ? c.data().pinHash : null;
  }))).filter(Boolean);

  const byLine = new Map(rows.map((r) => [r.line, r.values || {}]));
  const usersCol = vendorRef.collection("users");
  const importBatchId = randomUUID();
  const writer = chunkedWriter(adminDb);
  const revokeIds = new Set();
  let created = 0;
  let updated = 0;
  let extraErrors = 0;

  for (const r of report.rows) {
    const f = r.fields;
    if (r.status === "create") {
      let pinHash = null;
      if (f.hasPin) {
        const rawPin = mapping.pin ? String(byLine.get(r.line)?.[mapping.pin] ?? "").trim() : "";
        // Defensive re-check + against-store uniqueness (a PIN a concurrent add took).
        if (!isValidNewPin(rawPin) || existingHashes.some((h) => verifyPin(rawPin, h))) { extraErrors += 1; continue; }
        pinHash = hashPin(rawPin);
        existingHashes.push(pinHash);
      }
      const ref = usersCol.doc();
      writer.set(ref, {
        name: f.name, role: f.role,
        locationId: f.role === "employee" ? f.locationId : (f.locationId || null),
        email: f.email ?? null, active: true, createdAt: new Date(),
        source: "import", importBatchId,
      });
      if (pinHash) writer.set(ref.collection("private").doc("creds"), { pinHash });
      created += 1;
    } else if (r.status === "update" && f.id) {
      const existing = existingById.get(f.id) || {};
      const patch = {};
      if (mapping.role) patch.role = f.role;
      if (mapping.location) patch.locationId = f.role === "employee" ? f.locationId : (f.locationId || null);
      if (mapping.email) patch.email = f.email ?? null;
      if (Object.keys(patch).length) {
        writer.set(usersCol.doc(f.id), patch, { merge: true });
        updated += 1;
        // A role change must take effect now, not on token expiry — revoke like the staff PATCH does.
        if (patch.role !== undefined && patch.role !== existing.role) revokeIds.add(f.id);
      }
    }
  }
  await writer.done();

  for (const id of revokeIds) {
    try { await adminAuth.revokeRefreshTokens(`${claims.vendorId}_${id}`); }
    catch (e) { if (e.code !== "auth/user-not-found") throw e; }
  }
  return { create: created, update: updated, skip: report.summary.skip, error: report.summary.error + extraErrors };
}

export async function POST(req) {
  try {
    const claims = await requireOwner(req);
    const { type, mode, mapping = {}, rows = [] } = await req.json();
    if (!["items", "staff"].includes(type))
      return NextResponse.json({ error: "Only item and staff import are available." }, { status: 400 });
    if (!Array.isArray(rows))
      return NextResponse.json({ error: "No rows to import." }, { status: 400 });

    const { adminDb, adminAuth } = await getAdmin();
    const vendorRef = adminDb.collection("vendors").doc(claims.vendorId);

    if (type === "items") {
      const store = await readStore(vendorRef, ["items"]);
      const existingItems = store.snaps[0].docs.map((d) => ({ id: d.id, ...d.data() }));
      const report = validateItems(rows, mapping, { locations: store.locations, existingItems, defaultLocationId: store.defaultLocationId });
      if (mode !== "commit")
        return NextResponse.json({ ok: true, type, mode: "preview", summary: report.summary, rows: report.rows });
      const counts = await commitItems(adminDb, vendorRef, report, mapping);
      return NextResponse.json({ ok: true, type, mode: "commit", counts });
    }

    // staff
    const store = await readStore(vendorRef, ["users"]);
    const userSnap = store.snaps[0];
    const existingStaff = userSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const existingById = new Map(existingStaff.map((u) => [u.id, u]));
    const report = validateStaff(rows, mapping, { locations: store.locations, existingStaff, defaultLocationId: store.defaultLocationId });
    if (mode !== "commit")
      return NextResponse.json({ ok: true, type, mode: "preview", summary: report.summary, rows: report.rows });
    const counts = await commitStaff(adminDb, adminAuth, vendorRef, claims, report, mapping, rows, userSnap, existingById);
    return NextResponse.json({ ok: true, type, mode: "commit", counts });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Import failed." }, { status: e.status || 500 });
  }
}
