import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAdmin } from "@/lib/firebase-admin";
import { requireOwner } from "@/lib/require-manager";
import { hashPin, verifyPin } from "@/lib/hash";
import { isValidNewPin } from "@/lib/pin";
import { validateItems, validateStaff, validateBaselines, validateStock } from "@/lib/import-parse";

export const runtime = "nodejs";

// Owner-only CSV bulk import (Phase 1: items, Phase 2: staff, Phase 3: opening
// inventory baselines). Same trusted posture as /api/seed: requireOwner verifies
// the Bearer token with checkRevoked and scopes every read and write to the
// caller's own vendor. The browser sends already-parsed rows + the confirmed
// column mapping; the route re-runs the SAME pure validators against live
// Firestore state, so a commit is never gated on the client's word.
//
//   body: { type: "items" | "staff" | "baselines", mode: "preview" | "commit",
//           mapping, rows, allowPartial? }
//   • preview → validate only, write nothing
//   • commit  → validate, then write the surviving rows
//
// Baselines append to the append-only entries log and can't be un-written, so
// their commit default is all-or-nothing: any error blocks the whole commit
// unless the owner explicitly opts into a partial import (allowPartial).

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

// Stock sync (pos-inventory-sync-spec.md Phase 1): refresh existing items'
// synced stock fields — quantity (+ optionally price / expiry) — from a POS
// export. Update-only: never creates an item, never touches the count log.
// quantitySyncedAt records freshness; syncSource marks how the number arrived.
async function commitStock(adminDb, vendorRef, report, mapping) {
  const itemsCol = vendorRef.collection("items");
  const writer = chunkedWriter(adminDb);
  const syncedAt = new Date();
  let updated = 0;
  for (const r of report.rows) {
    if (r.status !== "update" || !r.fields.itemId) continue;
    const f = r.fields;
    const patch = { quantity: f.quantity, quantitySyncedAt: syncedAt, syncSource: "csv" };
    if (mapping.price && f.price !== null) patch.price = f.price;
    if (mapping.expiry && f.expiresAt !== null) patch.expiresAt = f.expiresAt;
    writer.set(itemsCol.doc(f.itemId), patch, { merge: true });
    updated += 1;
  }
  await writer.done();
  return { create: 0, update: updated, skip: report.summary.skip, error: report.summary.error };
}

// Opening baselines: one clean, signed, unverified inventory entry per item —
// the exact shape addEntry + the inventory form would produce for a count with
// nothing sold/received yet, so an imported baseline is indistinguishable from
// an honestly-entered one. diff is 0 by construction; nothing flags. This is the
// ONLY entry type the importer ever writes (never cash/scratch, never an update
// or delete of any existing entry).
async function commitBaselines(adminDb, vendorRef, report) {
  const entriesCol = vendorRef.collection("entries");
  const importBatchId = randomUUID();
  const writer = chunkedWriter(adminDb);
  let created = 0;
  for (const r of report.rows) {
    if (r.status !== "create") continue;
    const f = r.fields;
    writer.set(entriesCol.doc(), {
      kind: "inventory", date: f.date, shift: "open",
      locationId: f.locationId, locationName: f.locationName,
      itemId: f.itemId, itemName: f.itemName, unit: f.unit,
      startQty: f.quantity, received: 0, soldQty: 0, removed: 0,
      expected: f.quantity, counted: f.quantity, diff: 0,
      flagged: false, varianceStatus: "none", disputeStatus: "none",
      causeCode: null, causeNote: null, blind: false,
      commentCount: 0, lastCommentAt: null,
      by: f.by, byId: f.byId, byRole: f.byRole,
      verifiedBy: null, verifiedAt: null, ts: new Date(),
      source: "import", importBatchId,
    });
    created += 1;
  }
  await writer.done();
  return { create: created, update: 0, skip: report.summary.skip, error: report.summary.error };
}

export async function POST(req) {
  try {
    const claims = await requireOwner(req);
    const { type, mode, mapping = {}, rows = [], allowPartial = false } = await req.json();
    if (!["items", "staff", "baselines", "stock"].includes(type))
      return NextResponse.json({ error: "Unknown import type." }, { status: 400 });
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

    if (type === "staff") {
      const store = await readStore(vendorRef, ["users"]);
      const userSnap = store.snaps[0];
      const existingStaff = userSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const existingById = new Map(existingStaff.map((u) => [u.id, u]));
      const report = validateStaff(rows, mapping, { locations: store.locations, existingStaff, defaultLocationId: store.defaultLocationId });
      if (mode !== "commit")
        return NextResponse.json({ ok: true, type, mode: "preview", summary: report.summary, rows: report.rows });
      const counts = await commitStaff(adminDb, adminAuth, vendorRef, claims, report, mapping, rows, userSnap, existingById);
      return NextResponse.json({ ok: true, type, mode: "commit", counts });
    }

    if (type === "stock") {
      const store = await readStore(vendorRef, ["items"]);
      const items = store.snaps[0].docs.map((d) => ({ id: d.id, ...d.data() }));
      const report = validateStock(rows, mapping, { locations: store.locations, items, defaultLocationId: store.defaultLocationId });
      if (mode !== "commit")
        return NextResponse.json({ ok: true, type, mode: "preview", summary: report.summary, rows: report.rows });
      const counts = await commitStock(adminDb, vendorRef, report, mapping);
      return NextResponse.json({ ok: true, type, mode: "commit", counts });
    }

    // baselines — needs the catalog, the roster (countedBy), and the write-once
    // guard: every item that already has ANY inventory entry.
    const store = await readStore(vendorRef, ["items", "users"]);
    const items = store.snaps[0].docs.map((d) => ({ id: d.id, ...d.data() }));
    const existingStaff = store.snaps[1].docs.map((d) => ({ id: d.id, ...d.data() }));
    const invSnap = await vendorRef.collection("entries")
      .where("kind", "==", "inventory").select("itemId").get();
    const baselinedItemIds = [...new Set(invSnap.docs.map((d) => d.data().itemId).filter(Boolean))];
    const report = validateBaselines(rows, mapping, {
      locations: store.locations, items, existingStaff, baselinedItemIds,
      defaultBy: { id: claims.userId, name: claims.name || "Owner", role: "owner" },
    });
    if (mode !== "commit")
      return NextResponse.json({ ok: true, type, mode: "preview", summary: report.summary, rows: report.rows });
    // All-or-nothing by default: an opening count can't be un-written, so any
    // error blocks the whole commit unless the owner explicitly opted out.
    if (report.summary.error > 0 && !allowPartial)
      return NextResponse.json({
        error: `${report.summary.error} row(s) have errors — fix the CSV and re-preview, or confirm a partial import.`,
        summary: report.summary,
      }, { status: 409 });
    const counts = await commitBaselines(adminDb, vendorRef, report);
    return NextResponse.json({ ok: true, type, mode: "commit", counts });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Import failed." }, { status: e.status || 500 });
  }
}
