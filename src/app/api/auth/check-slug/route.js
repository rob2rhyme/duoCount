import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { slugify, nextAvailableSlug } from "@/lib/slug";
import { throttleDecision, attemptKey, clientIp, SLUG_CHECK_LIMIT } from "@/lib/login-throttle";

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

// Minimum base length before we will run a prefix range. At 1-2 characters the
// range returns most of the platform: 36 requests over a-z/0-9 would enumerate
// every store code. Three characters turns that into 46,656 prefixes to guess,
// which the throttle below makes impractical. Real business names clear it
// easily, and slugify() maps an empty or punctuation-only name to "store".
const MIN_BASE = 3;

const ipOf = (req) => clientIp((n) => req.headers.get(n));

export async function POST(req) {
  try {
    const { businessName } = await req.json();
    const base = slugify(businessName);
    const { adminDb } = await getAdmin();

    // Unauthenticated, so this is a tenant-enumeration surface. Count EVERY
    // request, not just failures — there is no "failure" here, and a signup
    // tries a handful of names while a scraper walks prefixes.
    const now = Date.now();
    const ipRef = adminDb.collection("loginAttempts").doc(`slug_${attemptKey(ipOf(req))}`);
    const ipSnap = await ipRef.get();
    const dec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now, SLUG_CHECK_LIMIT);
    if (dec.blocked)
      return NextResponse.json(
        { error: "Too many checks — try again later.", code: "throttled" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(dec.retryAfterMs / 1000)) } });
    await ipRef.set(dec.nextOnFail);

    // Too short to range on. Answer the shape the form expects without touching
    // the vendor collection, so a 1-2 character probe reads nothing at all.
    if (base.length < MIN_BASE)
      return NextResponse.json({ base, slug: base, available: null, code: "too_short" });
    // One prefix-range read pulls the base and every base-N variant at once
    // (single-field slug index). It over-catches unrelated prefixes, which is
    // fine — nextAvailableSlug only consults the exact base + numbered codes.
    // Bounded: nextAvailableSlug only ever consults the exact base and its
    // numbered variants, so a couple of dozen rows is always enough. The limit
    // caps both the Firestore read (this endpoint is unauthenticated, so an
    // unbounded range is also a cost-amplification vector) and how much of the
    // tenant list a single request can observe.
    const snap = await adminDb.collection("vendors")
      .where("slug", ">=", base)
      .where("slug", "<=", base + SENTINEL)
      .limit(25)
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
