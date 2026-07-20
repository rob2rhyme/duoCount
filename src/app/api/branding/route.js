import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { requireOwner } from "@/lib/require-manager";
import { sniffFontFormat, MAX_FONT_BYTES } from "@/lib/font-upload";

export const runtime = "nodejs";

// Owner-only custom-font upload. Stores the font BYTES (as a data: URL) in a
// dedicated subdoc — vendors/{id}/branding/font — kept off the main vendor doc so
// it never bloats the read every member does on load. The client rules make that
// doc read-only, so this route (Admin SDK) is the only writer.
//
//   body: { dataUrl }   a base64 data: URL, or null/"" to clear the custom font
//
// The font is validated by MAGIC BYTES (never the client's MIME/format string):
// only a real woff2/woff/ttf/otf under the size cap is stored, and it's re-encoded
// with the canonical MIME so what's stored is exactly what was validated. It's a
// font, not script — it can't execute — and it's a data: URL, so no external fetch.

const err = (status, code, message) => NextResponse.json({ error: message, code }, { status });

export async function POST(req) {
  try {
    const claims = await requireOwner(req);
    const { dataUrl } = await req.json();
    const { adminDb } = await getAdmin();
    const ref = adminDb.collection("vendors").doc(claims.vendorId).collection("branding").doc("font");

    if (!dataUrl) { // clear the custom font
      await ref.delete().catch(() => {});
      return NextResponse.json({ ok: true, cleared: true });
    }
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:"))
      return err(400, "bad_font", "That isn't a valid font upload.");
    const m = /^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return err(400, "bad_font", "The font must be a base64 data URL.");

    let buf;
    try { buf = Buffer.from(m[1], "base64"); } catch { return err(400, "bad_font", "Could not read the font."); }
    if (buf.length === 0) return err(400, "bad_font", "That font file is empty.");
    if (buf.length > MAX_FONT_BYTES)
      return err(413, "font_too_big", "That font is too large — upload a subset woff2 (max 400 KB).");

    const format = sniffFontFormat(buf);
    if (!format) return err(400, "bad_font_type", "Only woff2, woff, ttf, or otf fonts are accepted.");

    // Re-encode with the canonical MIME so the stored value is exactly what we
    // validated — the client's MIME string is never trusted or persisted.
    const mime = format === "woff2" ? "font/woff2" : format === "woff" ? "font/woff"
      : format === "opentype" ? "font/otf" : "font/ttf";
    const cleanUrl = `data:${mime};base64,${buf.toString("base64")}`;

    await ref.set({
      dataUrl: cleanUrl, format, bytes: buf.length,
      updatedAt: new Date(), by: claims.name || "Owner", byId: claims.userId,
    });
    return NextResponse.json({ ok: true, format, bytes: buf.length });
  } catch (e) {
    if (e?.status) return NextResponse.json({ error: e.message, code: e.code || null }, { status: e.status });
    console.error("branding error", e);
    return NextResponse.json({ error: "Font upload failed." }, { status: 500 });
  }
}
