import { createElement as h } from "react";
import { paletteAccent } from "@/lib/branding";

// Blank paper backup logs — a cash-drawer count sheet and a scratch-off ticket
// sheet — generated ON DEMAND so each carries the signed-in owner's store name
// and code, instead of a pre-branded static PDF. Mirrors the @react-pdf export
// pattern in ReportModal.js (dynamic import + pdf().toBlob() → anchor download),
// so the whole library isn't pulled into the initial bundle.
//
// These are ruled, empty grids the register fills in by hand when a phone isn't
// handy — they carry no store DATA, only the store's identity in the header.

const slug = (s) => String(s || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "store";

// Column layouts, keyed by form kind. `w` percentages sum to 100. Labels are
// i18n keys resolved by the caller's `t`.
const COLUMNS = {
  cash: [
    { w: "12%", key: "forms.c_date" },
    { w: "10%", key: "forms.c_shift" },
    { w: "11%", key: "forms.c_opening" },
    { w: "11%", key: "forms.c_sales" },
    { w: "11%", key: "forms.c_paidout" },
    { w: "11%", key: "forms.c_counted" },
    { w: "12%", key: "forms.c_overshort" },
    { w: "12%", key: "forms.c_staff" },
    { w: "10%", key: "forms.c_verified" },
  ],
  scratch: [
    { w: "12%", key: "forms.c_date" },
    { w: "10%", key: "forms.c_shift" },
    { w: "20%", key: "forms.c_game" },
    { w: "20%", key: "forms.c_pack" },
    { w: "10%", key: "forms.c_open" },
    { w: "10%", key: "forms.c_close" },
    { w: "8%", key: "forms.c_sold" },
    { w: "10%", key: "forms.c_staff" },
  ],
};

const ROWS = 22; // blank rows per page — a full shift-day of hand entries

/**
 * Generate and download a blank, store-branded paper log.
 * @param {"cash"|"scratch"} kind
 * @param {{name?:string, slug?:string}} vendor  the signed-in store
 * @param {(key:string)=>string} t  i18n resolver
 */
export async function downloadPaperLog(kind, vendor, t) {
  const cols = COLUMNS[kind] || COLUMNS.cash;
  const title = kind === "scratch" ? t("forms.scratch_title") : t("forms.cash_title");
  const { pdf, Document, Page, Text, View, StyleSheet } = await import("@react-pdf/renderer");

  const s = StyleSheet.create({
    page: { padding: 26, fontSize: 9, fontFamily: "Helvetica", color: "#1a1c2e" },
    brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
    mark: { width: 22, height: 22, borderRadius: 4, backgroundColor: paletteAccent(vendor), alignItems: "center", justifyContent: "center", marginRight: 7 },
    markText: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 11 },
    h1: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 2 },
    meta: { color: "#666", marginBottom: 2, fontSize: 8 },
    head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1a1c2e", borderTopWidth: 1, borderTopColor: "#1a1c2e", marginTop: 12 },
    hcell: { fontFamily: "Helvetica-Bold", fontSize: 8, paddingVertical: 5, paddingHorizontal: 3, borderRightWidth: 0.5, borderRightColor: "#bbb" },
    row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc" },
    cell: { minHeight: 22, paddingHorizontal: 3, borderRightWidth: 0.5, borderRightColor: "#eee" },
    cap: { fontSize: 7, color: "#888", marginTop: 8 },
  });

  const headerRow = h(View, { style: s.head, fixed: true },
    ...cols.map((c) => h(Text, { key: c.key, style: [{ width: c.w }, s.hcell] }, t(c.key))));
  const blankRows = Array.from({ length: ROWS }, (_, i) =>
    h(View, { key: `r${i}`, style: s.row, wrap: false },
      ...cols.map((c) => h(View, { key: c.key, style: [{ width: c.w }, s.cell] }))));

  const doc = h(Document, { title: `${slug(vendor?.name)}-${kind}-log` },
    h(Page, { size: "A4", style: s.page },
      h(View, { style: s.brandRow },
        h(View, { style: s.mark }, h(Text, { style: s.markText }, "DC")),
        h(Text, { style: s.h1 }, `${vendor?.name || "DuoCount"} — ${title}`)),
      h(Text, { style: s.meta }, `${t("forms.store_code")}: ${vendor?.slug || "—"}`),
      h(Text, { style: s.meta }, t("forms.subtitle")),
      headerRow,
      ...blankRows,
      h(Text, { style: s.cap }, t("forms.footnote")),
    ));

  const blob = await pdf(doc).toBlob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(vendor?.name)}-${kind}-log.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}
