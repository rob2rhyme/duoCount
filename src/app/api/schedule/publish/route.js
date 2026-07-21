import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireManager } from "@/lib/require-manager";
import { sendEmail } from "@/lib/digest";
import { buildScheduleEmails } from "@/lib/schedule-notify";
import { addDays } from "@/lib/schedule";

export const runtime = "nodejs";

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmtLabel = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

// POST { weekStart } — a manager publishes a week: emails each employee (with an
// address on file) their shifts, and records the publish. Manager/owner only.
export async function POST(req) {
  try {
    const claims = await requireManager(req);
    const { weekStart } = await req.json();
    if (!WEEK_RE.test(String(weekStart || "")))
      return NextResponse.json({ error: "Bad week." }, { status: 400 });
    const weekEnd = addDays(weekStart, 6);

    const { adminDb } = await getAdmin();
    const vendorRef = adminDb.collection("vendors").doc(claims.vendorId);
    const [vendorSnap, schedSnap, usersSnap] = await Promise.all([
      vendorRef.get(),
      vendorRef.collection("schedule").where("date", ">=", weekStart).where("date", "<=", weekEnd).get(),
      vendorRef.collection("users").get(),
    ]);
    const vendor = vendorSnap.data() || {};
    const shifts = schedSnap.docs.map((d) => d.data());
    const staffById = {};
    usersSnap.forEach((d) => { staffById[d.id] = { id: d.id, ...d.data() }; });

    const weekLabel = `${fmtLabel(weekStart)} – ${fmtLabel(weekEnd)}`;
    const emails = buildScheduleEmails(shifts, staffById, {
      weekLabel, vendorName: vendor.name || "DuoCount", appUrl: process.env.APP_URL || "",
    });

    let sent = 0;
    const failed = [];
    for (const e of emails) {
      try { await sendEmail({ to: e.to, subject: e.subject, text: e.text, html: e.html }); sent += 1; }
      catch (err) { console.error("schedule email failed", e.to, err?.message); failed.push(e.name || e.to); }
    }

    await vendorRef.collection("schedulePublished").doc(weekStart).set({
      weekStart, weekEnd, publishedAt: new Date(), publishedBy: claims.name || null,
      notified: sent, recipients: emails.length,
    });

    // employees who have assigned shifts this week but no email on file
    const emailedIds = new Set(emails.map((e) => e.userId));
    const noEmail = new Set(shifts.filter((s) => s.userId && !emailedIds.has(s.userId)).map((s) => s.userId)).size;

    return NextResponse.json({ ok: true, notified: sent, recipients: emails.length, noEmail, failed });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("schedule publish error", e);
    return NextResponse.json({ error: "Publish failed." }, { status: 500 });
  }
}
