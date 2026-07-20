import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { slugify, nextAvailableSlug } from "@/lib/slug";

export const runtime = "nodejs";

// Pre-signup store-code availability. Given a business name, reports the store
// code it derives to, whether that exact code is free, and the code the owner
// would actually get (the base, or the next base-N). Read-only and pre-auth —
// the signup transaction remains the source of truth (it re-allocates the code
// atomically), so a race between the check and the create is harmless; this is
// purely so the owner sees "acme-market ✓" or "taken → acme-market-2" up front.

// A high private-use codepoint bounds a Firestore prefix range: every slug that
// starts with `base` sorts into [base, base+SENTINEL].
const SENTINEL = "";

export async function POST(req) {
  try {
    const { businessName } = await req.json();
    const base = slugify(businessName);
    const { adminDb } = await getAdmin();
    // One prefix-range read pulls the base and every base-N variant at once
    // (single-field slug index). It over-catches unrelated prefixes, which is
    // fine — nextAvailableSlug only consults the exact base + numbered codes.
    const snap = await adminDb.collection("vendors")
      .where("slug", ">=", base)
      .where("slug", "<=", base + SENTINEL)
      .get();
    const taken = new Set(snap.docs.map((d) => d.data().slug).filter(Boolean));
    const available = !taken.has(base);
    const slug = nextAvailableSlug(base, taken);
    return NextResponse.json({ base, slug, available });
  } catch (e) {
    console.error("check-slug error", e);
    return NextResponse.json({ error: "Availability check failed." }, { status: 500 });
  }
}
