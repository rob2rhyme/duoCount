import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireManager } from "@/lib/require-manager";
import { aiSearchEnabled, interpretQuery } from "@/lib/log-search";

export const runtime = "nodejs";

// Turn a manager's plain-English Log query into a filter object
// (ai-log-search-spec.md). Server-side so ANTHROPIC_API_KEY never reaches the
// browser. Read-only, additive: returns { filter: null } whenever the feature
// is off or the model can't route the query, and the client falls back to plain
// keyword search — so this route can never break search, only refine it.
export async function POST(req) {
  try {
    const claims = await requireManager(req);
    const { adminDb } = await getAdmin();

    const vendorSnap = await adminDb.collection("vendors").doc(claims.vendorId).get();
    const vendor = vendorSnap.exists ? vendorSnap.data() : null;
    // The opt-in gate is enforced here, server-side — never trusted from the client.
    if (!aiSearchEnabled(vendor)) return NextResponse.json({ filter: null });

    const body = await req.json().catch(() => ({}));
    const query = typeof body.query === "string" ? body.query : "";
    const vocabulary = body.vocabulary && typeof body.vocabulary === "object" ? body.vocabulary : {};
    if (!query.trim()) return NextResponse.json({ filter: null });

    const filter = await interpretQuery(query, vocabulary, { signal: AbortSignal.timeout(5000) });
    return NextResponse.json({ filter: filter ?? null });
  } catch (e) {
    // Never surface an error the client would treat as fatal — degrade to null
    // so the box runs a keyword search. (Auth failures still return their status.)
    if (e?.status) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("log-search route error", e);
    return NextResponse.json({ filter: null });
  }
}
