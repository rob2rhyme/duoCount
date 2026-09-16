import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { throttleDecision, attemptKey, clientIp, PUBLIC_SUPPORT_LIMIT } from "@/lib/login-throttle";
import { buildPublicTicket } from "@/lib/support";

export const runtime = "nodejs";

// The signed-out help desk — the answer to "a locked-out owner can't even ask
// for help", because /api/support requires an owner token and the only other
// recovery paths (a second owner, a confirmed recovery email) may not exist.
//
// This is the whole app's only anonymous write, so it is fenced accordingly:
// per-IP rate limit before any write, no attachments, a bounded message, and a
// reply that always says the same thing whether or not the store code is real.
// The ticket lands in the same /dev inbox the owner-side tickets do, flagged
// `public: true` with `vendorId: null` — no tenant owns it, so no client can
// read it, and an operator can see at a glance that nothing in it is verified.

const err = (status, code, message) => NextResponse.json({ error: message, code }, { status });
const ipOf = (req) => clientIp((n) => req.headers.get(n));

export async function POST(req) {
  try {
    const body = await req.json();
    const { adminDb } = await getAdmin();
    const now = new Date();

    const ipRef = adminDb.collection("signupAttempts").doc(`help_${attemptKey(ipOf(req))}`);
    const ipSnap = await ipRef.get();
    const dec = throttleDecision(ipSnap.exists ? ipSnap.data() : null, now.getTime(), PUBLIC_SUPPORT_LIMIT);
    if (dec.blocked)
      return err(429, "throttled", "Too many messages from here — try again later, or email support directly.");

    const built = buildPublicTicket(body);
    if (built.error)
      return err(400, built.error, built.error === "bad_email"
        ? "Enter an email we can reply to."
        : "Tell us a bit more about what's happening.");

    await ipRef.set(dec.nextOnFail); // every accepted message counts toward the window
    const ref = await adminDb.collection("supportTickets").add({
      ...built.fields,
      storeName: "", storeSlug: "",
      status: "open",
      createdByName: built.fields.contactName || "(signed out)",
      createdById: null,
      createdAt: now, lastActivityAt: now, lastActorRole: "owner",
      ownerSeenAt: null, devSeenAt: null, messages: [],
      lang: body.lang === "es" ? "es" : "en", // so a reply comes back in their language
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    console.error("public support error", e);
    return err(500, "support_failed", "Couldn't send that message. Try again in a moment.");
  }
}
