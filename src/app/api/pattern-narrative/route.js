import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireManager } from "@/lib/require-manager";
import { resolvePatternRules } from "@/lib/patterns";
import { aiInsightsEnabled, buildInsightSummary, redactForModel, runNarrative } from "@/lib/digest-narrative";

export const runtime = "nodejs";

// On-demand AI readout over the Dashboard's pattern alerts
// (ai-pattern-narrative-spec.md). Server-side so ANTHROPIC_API_KEY never reaches
// the browser; manager-gated (patterns are manager-only). The client posts the
// on-screen patterns + headline counts; this route builds the summary, redacts
// names, and runs the shared narrative core. Additive: returns
// { narrative: null } whenever the feature is off or the model can't produce one.
export async function POST(req) {
  try {
    const claims = await requireManager(req);
    const { adminDb } = await getAdmin();

    const vendorSnap = await adminDb.collection("vendors").doc(claims.vendorId).get();
    const vendor = vendorSnap.exists ? vendorSnap.data() : null;
    if (!aiInsightsEnabled(vendor)) return NextResponse.json({ narrative: null });

    const body = await req.json().catch(() => ({}));
    const patterns = Array.isArray(body.patterns) ? body.patterns : [];
    if (!patterns.length) return NextResponse.json({ narrative: null });

    const windowDays = resolvePatternRules(vendor?.patternRules).windowDays;
    const summary = buildInsightSummary(patterns, {
      openVariances: body.openVariances,
      openDisputes: body.openDisputes,
      unverified: body.unverified,
      windowDays,
    });
    const { redacted } = redactForModel(summary);
    const narrative = await runNarrative(redacted, { signal: AbortSignal.timeout(8000), surface: "dashboard" });
    return NextResponse.json({ narrative: narrative ?? null });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("pattern-narrative route error", e);
    return NextResponse.json({ narrative: null });
  }
}
