import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireOwner } from "@/lib/require-manager";
import { normalizeGameEntry } from "@/lib/catalog-entry";
import { reduceToGameNumber } from "@/lib/scratch-barcode";

export const runtime = "nodejs";

// Owner-only manual editor for the per-store scratch-game catalog — the typed
// alternative to the CSV bulk upload (/api/import type "games"). Same trusted
// posture: requireOwner verifies the Bearer token (checkRevoked) and every
// read/write is scoped to the caller's own vendor. The catalog doc is read-only
// to clients under firestore.rules, so this route is the only way to write it.
//
//   body: { action: "upsert" | "remove", game, name?, price?, perPack? }
//   • upsert → validate the one game and set catalog.games[game] = {name, price, perPack?}
//   • remove → delete catalog.games[game]
//
// Stored per game (matching the bundle + importer): game# -> { name, price, perPack? }.
// Pure reference data — never a count, never an audited ticket number.

// Normalize a game number the same way the entry validator does (strip a leading
// '#', drop leading zeros) so remove targets the same key an upsert created.
function gameKey(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits ? String(Number(digits)) : null;
}

export async function POST(req) {
  try {
    const claims = await requireOwner(req);
    const { action, game, name, price, perPack } = await req.json();
    if (action !== "upsert" && action !== "remove")
      return NextResponse.json({ error: "Unknown catalog action.", code: "bad_action" }, { status: 400 });

    const { adminDb } = await getAdmin();
    const catRef = adminDb.collection("vendors").doc(claims.vendorId).collection("catalog").doc("scratch");
    const snap = await catRef.get();
    const games = snap.exists ? { ...(snap.data().games || {}) } : {};

    if (action === "remove") {
      const key = gameKey(game);
      if (!key) return NextResponse.json({ error: "A game number is required.", code: "game_invalid" }, { status: 400 });
      if (!(key in games))
        return NextResponse.json({ error: "That game isn't in the catalog.", code: "game_absent" }, { status: 404 });
      delete games[key];
    } else {
      // upsert — re-run the SAME pure validator the card used; never trust the
      // client. Reduce a whole ticket/pack to its game section first, so the
      // catalog is always keyed by GAME (never a 14-digit pseudo-game no scan
      // could match), whatever the client sent.
      const r = normalizeGameEntry({ game: reduceToGameNumber(game), name, price, perPack });
      if (!r.ok) return NextResponse.json({ error: `Invalid game (${r.code}).`, code: r.code }, { status: 400 });
      games[r.game] = r.value;
    }

    // Full replace (not merge): `games` already holds the complete map, and a plain
    // set avoids Firestore deep-merging a stale perPack back onto a re-saved game.
    await catRef.set({
      games,
      count: Object.keys(games).length,
      source: "manual",
      updatedAt: new Date(),
      by: claims.name || "Owner",
      byId: claims.userId,
    });
    return NextResponse.json({ ok: true, action, count: Object.keys(games).length });
  } catch (err) {
    const status = err?.status || 500;
    return NextResponse.json({ error: err?.message || "Catalog update failed.", code: err?.code || "server" }, { status });
  }
}
