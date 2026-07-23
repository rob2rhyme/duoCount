"use client";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line as RLine, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { money, csvCell, entriesToCSV, downloadCSV } from "@/lib/utils";
import { useSession } from "./SessionProvider";
import { useTheme } from "./ThemeProvider";
import { useLang } from "./LangProvider";
import { useModalA11y } from "@/lib/use-modal-a11y";
import Field from "./Field";
import { PRESETS, periodRange, stepPeriod } from "@/lib/report-period";
import { buildPeriodReport, buildLocationComparison } from "@/lib/report-build";
import { buildJournalCSV, buildJournalEntries, buildFranchiseCSV, FRANCHISE_PROFILES } from "@/lib/report-accounting";
import { buildGamingSummary } from "@/lib/gaming";
import { fetchEntriesInRange, fetchPunchesInRange } from "@/lib/data";
import { featureEnabled } from "@/lib/features";
import { paletteAccent, chartBar } from "@/lib/branding";

// Recharts paints literal color strings; neutral chrome + a per-store bar color.
const CHART = {
  light: { grid: "#e6e7e4", axis: "#82857f", tipBg: "#ffffff", tipBorder: "#dbdcd9", tipText: "#1a241c" },
  dark: { grid: "#2c2e2c", axis: "#777a76", tipBg: "#1c1d1c", tipBorder: "#353736", tipText: "#e8eee9" },
};

function Kpi({ label, value, tone }) {
  const color = tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-fg";
  return (
    <div className="bg-surface border border-line rounded-lg px-2.5 py-2 text-center">
      <div className={`text-[15px] font-bold font-mono leading-tight ${color}`}>{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wide font-semibold mt-0.5 truncate">{label}</div>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const slug = (s) => String(s || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "x";
const FISCAL_PRESETS = new Set(["year", "quarter", "half"]); // periods the fiscal start reshapes

// The Reports center: pick any period (day … year, or custom dates) and a
// location scope, preview what it contains, and export it for the record.
// Reports only READ the append-only log (one-shot, via fetchEntriesInRange) and
// render client-side — they never mutate the signed history.
// initialLocId / initialPreset / initialRefDate pre-scope the report (the
// Portfolio drill-down opens a store's report for the period being viewed);
// they're just initial state — the user can still change every control.
export default function ReportModal({ locations = [], locName = () => "—", incidents = [], collections = [], onClose, onToast,
  initialLocId, initialPreset, initialRefDate, initialCustomStart, initialCustomEnd }) {
  const { profile, vendor } = useSession();
  const { theme } = useTheme();
  const { t } = useLang();
  const panelRef = useModalA11y(onClose);
  // Which modules to report on — a disabled module shows no section, chart, KPI,
  // or download; turning it back on in Admin → Modules brings it back.
  const cashOn = featureEnabled(vendor, "cash");
  const inventoryOn = featureEnabled(vendor, "inventory");
  const gamingOn = featureEnabled(vendor, "gaming");
  const ch = { ...(CHART[theme] || CHART.light), bar: chartBar(vendor, theme) };
  const tip = { borderRadius: 10, border: `1px solid ${ch.tipBorder}`, background: ch.tipBg, color: ch.tipText, fontSize: 12 };

  const [preset, setPreset] = useState(initialPreset || "day");
  const [refDate, setRefDate] = useState(initialRefDate || today());
  const [customStart, setCustomStart] = useState(initialCustomStart || today());
  const [customEnd, setCustomEnd] = useState(initialCustomEnd || today());
  const [locId, setLocId] = useState(initialLocId || "all");
  const [rawRows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  // Franchise format is an export-time choice, never a persisted setting — so
  // the feature needs no vendor write and no rules change. "" = none.
  const [franchiseProfile, setFranchiseProfile] = useState("");

  // The store's fiscal-year start (1–12; 1 = calendar year) shapes the Year /
  // Quarter / Half-year periods so reports match the books an accountant keeps.
  const fiscalStartMonth = vendor.fiscalStartMonth ?? 1;
  const fiscalOpts = useMemo(() => ({ fiscalStartMonth }), [fiscalStartMonth]);

  // Resolve the selected period; an invalid custom range (end before start)
  // yields null so the UI can flag it and disable the exports.
  const range = useMemo(() => {
    try {
      return preset === "custom"
        ? periodRange("custom", null, { start: customStart, end: customEnd })
        : periodRange(preset, refDate, fiscalOpts);
    } catch {
      return null;
    }
  }, [preset, refDate, customStart, customEnd, fiscalOpts]);

  const startISO = range ? range.startISO : null;
  const endISO = range ? range.endISO : null;
  const scopeLocId = locId === "all" ? null : locId;

  // One-shot fetch of the period's entries whenever the window or scope changes.
  // The error is stored as a flag and localized at render time, so switching
  // language never re-triggers the fetch.
  useEffect(() => {
    if (!startISO || !endISO) { setRows([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setLoadError(false);
    fetchEntriesInRange(vendor.id, startISO, endISO, scopeLocId)
      .then((es) => { if (alive) { setRows(es); setLoading(false); } })
      .catch((err) => { if (alive) { console.error(err); setLoadError(true); setLoading(false); } });
    return () => { alive = false; };
  }, [vendor.id, startISO, endISO, scopeLocId]);

  // A disabled module never appears in a report — drop its rows before anything
  // downstream (preview, comparison, CSV/journal/franchise, PDFs) reads them.
  const rows = useMemo(() => rawRows.filter((e) => featureEnabled(vendor, e.kind)), [rawRows, vendor]);

  // Preview report (entries + incidents, both already in memory). Labor needs a
  // punch fetch, so it's computed only for the PDF, on demand.
  const report = useMemo(() => (range ? buildPeriodReport(rows, range, locId, { incidents }) : null), [rows, range, locId, incidents]);

  // Side-by-side location comparison — only meaningful across the whole business
  // (scope = All) with two or more locations. Reuses the same fetched rows.
  const comparison = useMemo(
    () => (range && locId === "all" && locations.length >= 2 ? buildLocationComparison(rows, range, locations) : null),
    [rows, range, locId, locations],
  );

  // Gaming lives outside the entries spine (owner-only collections), so it is
  // summarized separately over the same window when the module is on.
  const gaming = useMemo(
    () => (range && gamingOn ? buildGamingSummary(collections, { from: startISO, to: endISO }) : null),
    [collections, startISO, endISO, gamingOn, range],
  );
  // Chart rows: the biggest inventory shrink.
  const shrinkRows = useMemo(
    () => (report ? report.inventory.byItem.map((r) => ({ name: r.itemName, missing: -r.netShrink }))
      .filter((r) => r.missing > 0).sort((a, b) => b.missing - a.missing).slice(0, 6) : []),
    [report]);
  // Revenue mix (donut): where the period's money came from, across enabled
  // modules — cash sales, scratch sales, gaming store take. Fixed distinct fills
  // (identity also carried by the text legend, never color alone). Labels are
  // localized so the legend + tooltip match the section headings.
  const revenueMix = useMemo(() => (report ? [
    cashOn ? { label: t("report.cash"), value: report.cash.sales, fill: "#2f7d5b" } : null,
    gamingOn && gaming ? { label: t("report.gaming"), value: gaming.totals.storeShare, fill: "#4c6ef5" } : null,
  ].filter((r) => r && r.value > 0) : []), [report, gaming, cashOn, gamingOn, t]);
  const revenueTotal = revenueMix.reduce((s, r) => s + r.value, 0);

  const locLabel = locId === "all" ? t("report.all_locations") : locName(locId);
  const fileBase = `duocount-report-${locId === "all" ? "all" : slug(locName(locId))}-${range ? range.key : "period"}`;
  const ready = !!range && !loading && !loadError;

  // An empty period is a valid record too — it exports a header-only CSV.
  function downloadCsv() {
    downloadCSV(entriesToCSV(rows.filter((e) => e.kind !== "scratch")), `${fileBase}.csv`);
  }

  // Gaming collections aren't part of the entries CSV (separate ledger), so the
  // report offers them as their own file when the module is on. Same columns as
  // the Gaming tab export.
  function downloadGamingCsv() {
    const inRange = collections
      .filter((c) => c.collectionDate >= startISO && c.collectionDate <= endISO)
      .sort((a, b) => (a.collectionDate < b.collectionDate ? -1 : 1));
    const header = ["Date", "Machine", "Company", "Type", "Collection", "Payout", "Net", "Store %", "Store share", "Company share", "Entered by"];
    const lines = [header.map(csvCell).join(",")];
    for (const c of inRange) {
      lines.push([c.collectionDate, c.machineName, c.company, c.machineType, c.collection, c.payout, c.net, c.storePct, c.storeShare, c.companyShare, c.by]
        .map(csvCell).join(","));
    }
    downloadCSV(lines.join("\n"), `${fileBase}-gaming.csv`);
  }

  // Bookkeeper export: a balanced general journal over the same in-memory rows
  // (buildJournalCSV is pure and unit-tested) — one entry per day×location.
  function downloadJournalCsv() {
    downloadCSV(buildJournalCSV(rows, range), `${fileBase}-journal.csv`);
  }

  // Franchise daily report — the selected profile's fixed columns, one row per
  // business date, over the same scoped in-memory rows. A scaffold, not a
  // certified submission (see accountant-export-spec.md).
  function downloadFranchiseCsv() {
    if (!franchiseProfile) return;
    downloadCSV(
      buildFranchiseCSV(rows, range, franchiseProfile, { storeNo: vendor.slug }),
      `duocount-franchise-${franchiseProfile}-${locId === "all" ? "all" : slug(locName(locId))}-${range.key}.csv`,
    );
  }

  // One-tap close-of-day sheet for whoever does the books: a single-day cash
  // reconciliation plus a journal-entry preview built by the SAME tested
  // buildJournalEntries the CSV uses — so the paper the bookkeeper signs and
  // the file they import show identical numbers. Pins to a single day: the
  // picker's day when the preset is Day, otherwise today. Always fetches that
  // one day on demand (a bounded single-day read, like the PDF's punch fetch),
  // so it never depends on which period happens to be on screen.
  async function downloadBookkeeperPdf() {
    setBusy(true);
    try {
      const day = preset === "day" && range ? range.startISO : today();
      const dayRange = { startISO: day, endISO: day };
      const dayRows = (await fetchEntriesInRange(vendor.id, day, day, scopeLocId))
        .filter((e) => featureEnabled(vendor, e.kind));
      const r = buildPeriodReport(dayRows, dayRange, locId);
      const journal = buildJournalEntries(dayRows, dayRange);
      const expected = Math.round((r.cash.counted - r.cash.netDiff) * 100) / 100;

      const { pdf, Document, Page, Text, View, StyleSheet } = await import("@react-pdf/renderer");
      const s = StyleSheet.create({
        page: { padding: 28, fontSize: 10, fontFamily: "Helvetica", color: "#1a1c2e" },
        brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
        mark: { width: 22, height: 22, borderRadius: 4, backgroundColor: paletteAccent(vendor), alignItems: "center", justifyContent: "center", marginRight: 7 },
        markText: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 11 },
        h1: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 2 },
        meta: { color: "#666", marginBottom: 2, fontSize: 8 },
        section: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 5, borderBottomWidth: 1, borderBottomColor: "#1a1c2e", paddingBottom: 2 },
        line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#e2e0d8" },
        lineLabel: { color: "#333" },
        lineValue: { fontFamily: "Helvetica" },
        result: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, fontFamily: "Helvetica-Bold", borderTopWidth: 1, borderTopColor: "#1a1c2e" },
        neg: { color: "#b03a3a" }, pos: { color: "#2f7d5b" },
        jHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1a1c2e", paddingVertical: 3, fontFamily: "Helvetica-Bold", fontSize: 9 },
        jRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 3, fontSize: 9 },
        jTotals: { flexDirection: "row", paddingVertical: 4, fontFamily: "Helvetica-Bold", borderTopWidth: 1, borderTopColor: "#1a1c2e", fontSize: 9 },
        jLoc: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 2, color: "#555" },
        sig: { flexDirection: "row", justifyContent: "space-between", marginTop: 34 },
        sigLine: { width: "44%", borderTopWidth: 1, borderTopColor: "#1a1c2e", paddingTop: 3, fontSize: 8, color: "#666" },
        empty: { marginTop: 8, color: "#666", fontStyle: "italic" },
        cap: { fontSize: 7, color: "#888", marginTop: 4 },
      });
      const C = ({ w, children, style }) => (
        <Text style={[{ width: w }, ...(Array.isArray(style) ? style : style ? [style] : [])]}>{children}</Text>
      );
      const Line = ({ label, value, tone, bold }) => (
        <View style={bold ? s.result : s.line}>
          <Text style={s.lineLabel}>{label}</Text>
          <Text style={tone}>{value}</Text>
        </View>
      );
      const osTone = r.cash.netDiff < -0.005 ? s.neg : r.cash.netDiff > 0.005 ? s.pos : null;
      const osLabel = r.cash.netDiff < -0.005 ? t("report.short") : r.cash.netDiff > 0.005 ? t("report.over") : t("report.balanced");

      const doc = (
        <Document title={`duocount-closeofday-${locId === "all" ? "all" : slug(locName(locId))}-${day}`}>
          <Page size="A4" style={s.page}>
            <View style={s.brandRow}>
              <View style={s.mark}><Text style={s.markText}>DC</Text></View>
              <Text style={s.h1}>{vendor.name} — {t("report.pdf_cod_title")}</Text>
            </View>
            <Text style={s.meta}>{t("report.store_code")}: {vendor.slug} · {locLabel} · {day}</Text>
            <Text style={s.meta}>{t("report.pdf_prepared_by", { name: profile.name, time: new Date().toLocaleString() })}</Text>

            {r.empty && <Text style={s.empty}>{t("report.pdf_no_activity_day", { day })}</Text>}

            <Text style={s.section}>{t("report.pdf_cash_recon")}</Text>
            <Line label={t("report.pdf_cash_sales_count", { n: r.counts.cash })} value={money(r.cash.sales)} />
            <Line label={t("report.pdf_paidouts")} value={`− ${money(r.cash.paidout)}`} />
            <Line label={t("report.pdf_expected")} value={money(expected)} />
            <Line label={t("report.th_counted")} value={money(r.cash.counted)} />
            <Line bold label={t("report.pdf_os_result", { label: osLabel })} tone={osTone}
              value={`${r.cash.netDiff >= 0 ? "+" : ""}${money(r.cash.netDiff)}`} />

            <Text style={s.section}>{t("report.pdf_other_sales")}</Text>
            <Line label={t("report.pdf_lottery_sales_count", { n: r.counts.scratch })} value={money(r.scratch.dollars)} />

            <Text style={s.section}>{t("report.pdf_journal_preview")}</Text>
            {journal.length === 0 && <Text style={s.empty}>{t("report.pdf_nothing_journal")}</Text>}
            {journal.map((entry) => {
              const debits = entry.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
              const credits = entry.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
              return (
                <View key={entry.journalNo}>
                  <Text style={s.jLoc}>{entry.journalNo} · {entry.locationName}</Text>
                  <View style={s.jHead}><C w="46%">{t("report.th_account")}</C><C w="18%">{t("report.th_description")}</C><C w="18%" style={{ textAlign: "right" }}>{t("report.th_debit")}</C><C w="18%" style={{ textAlign: "right" }}>{t("report.th_credit")}</C></View>
                  {entry.lines.map((l, i) => (
                    <View key={i} style={s.jRow}>
                      <C w="46%">{l.account}</C>
                      <C w="18%">{l.description}</C>
                      <C w="18%" style={{ textAlign: "right" }}>{l.debit != null ? l.debit.toFixed(2) : ""}</C>
                      <C w="18%" style={{ textAlign: "right" }}>{l.credit != null ? l.credit.toFixed(2) : ""}</C>
                    </View>
                  ))}
                  <View style={s.jTotals}>
                    <C w="46%">{t("report.totals")}</C><C w="18%">{t("report.balanced_lc")}</C>
                    <C w="18%" style={{ textAlign: "right" }}>{debits.toFixed(2)}</C>
                    <C w="18%" style={{ textAlign: "right" }}>{credits.toFixed(2)}</C>
                  </View>
                </View>
              );
            })}
            <Text style={s.cap}>{t("report.pdf_cod_caption")}</Text>

            <View style={s.sig}>
              <View style={s.sigLine}><Text>{t("report.sig_prepared")}</Text></View>
              <View style={s.sigLine}><Text>{t("report.sig_reviewed")}</Text></View>
            </View>
          </Page>
        </Document>
      );
      const blob = await pdf(doc).toBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `duocount-closeofday-${locId === "all" ? "all" : slug(locName(locId))}-${day}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error(err);
      onToast?.(t("report.toast_pdf_fail_journal"));
    }
    setBusy(false);
  }

  // Period-native PDF for records: bounded SUMMARY tables (by location / drawer /
  // game / item), an over/short sparkline, the labor roll-up (punches fetched on
  // demand), and the incident tally — so a year prints as cleanly as a day.
  async function downloadPdf() {
    if (!range || !report) return;
    setBusy(true);
    try {
      const punches = await fetchPunchesInRange(vendor.id, range.startISO, range.endISO);
      const r = buildPeriodReport(rows, range, locId, { punches, incidents });
      const { pdf, Document, Page, Text, View, StyleSheet, Svg, Rect, Line } = await import("@react-pdf/renderer");
      const s = StyleSheet.create({
        page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#1a1c2e" },
        brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
        // The DuoCount "DC" mark, drawn with primitives (no external image, which
        // can fail to load and blank the whole render). Brass on ink, matching the
        // app's Logo fallback.
        mark: { width: 22, height: 22, borderRadius: 4, backgroundColor: paletteAccent(vendor), alignItems: "center", justifyContent: "center", marginRight: 7 },
        markText: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 11 },
        h1: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 2 },
        meta: { color: "#666", marginBottom: 2, fontSize: 8 },
        section: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 5 },
        row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 3 },
        head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1a1c2e", paddingVertical: 3, fontFamily: "Helvetica-Bold" },
        totals: { flexDirection: "row", paddingVertical: 4, fontFamily: "Helvetica-Bold", borderTopWidth: 1, borderTopColor: "#1a1c2e" },
        neg: { color: "#b03a3a" }, pos: { color: "#2f7d5b" },
        sig: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
        sigLine: { width: "44%", borderTopWidth: 1, borderTopColor: "#1a1c2e", paddingTop: 3, fontSize: 8, color: "#666" },
        empty: { marginTop: 8, color: "#666", fontStyle: "italic" },
        kpis: { flexDirection: "row", marginTop: 12 },
        kpi: { flex: 1, borderWidth: 1, borderColor: "#e2e0d8", borderRadius: 4, padding: 6, marginRight: 5 },
        kpiV: { fontSize: 11, fontFamily: "Helvetica-Bold" },
        kpiL: { fontSize: 7, color: "#666", marginTop: 2 },
        cap: { fontSize: 7, color: "#888", marginTop: 2 },
      });
      const C = ({ w, children, style }) => (
        <Text style={[{ width: w }, ...(Array.isArray(style) ? style : style ? [style] : [])]}>{children}</Text>
      );
      const tone = (n) => (n < -0.005 ? s.neg : n > 0.005 ? s.pos : null);
      const sgn = (n, fmt = (x) => x) => `${n >= 0 ? "+" : ""}${fmt(n)}`;

      const spark = r.trend;
      const maxAbs = Math.max(1, ...spark.map((b) => Math.abs(b.netDiff)));
      const SW = 539, SH = 46, mid = SH / 2, bw = spark.length ? SW / spark.length : SW;

      const doc = (
        <Document title={fileBase}>
          <Page size="A4" style={s.page}>
            <View style={s.brandRow}>
              <View style={s.mark}><Text style={s.markText}>DC</Text></View>
              <Text style={s.h1}>{vendor.name} — {t("report.pdf_records_title")}</Text>
            </View>
            <Text style={s.meta}>{t("report.store_code")}: {vendor.slug} · {locLabel} · {r.range.startISO} → {r.range.endISO}</Text>
            <Text style={s.meta}>{range.label} · {t("report.generated_by", { name: profile.name, time: new Date().toLocaleString() })}</Text>

            {r.empty && <Text style={s.empty}>{t("report.pdf_no_activity_period")}</Text>}

            <View style={s.kpis}>
              <View style={s.kpi}><Text style={s.kpiV}>{sgn(r.cash.netDiff, money)}</Text><Text style={s.kpiL}>{t("report.net_over_short")}</Text></View>
              <View style={s.kpi}><Text style={s.kpiV}>{money(r.cash.sales)}</Text><Text style={s.kpiL}>{t("report.cash_sales")}</Text></View>
              <View style={[s.kpi, { marginRight: 0 }]}><Text style={s.kpiV}>{Math.round(r.integrity.verificationRate * 100)}%</Text><Text style={s.kpiL}>{t("report.th_verified")}</Text></View>
            </View>

            {spark.length > 0 && (<>
              <Text style={s.section}>{t("report.over_short_by", { unit: t(`report.by_${r.trendBy}`) })}</Text>
              <Svg width={SW} height={SH}>
                <Line x1={0} y1={mid} x2={SW} y2={mid} strokeWidth={0.5} stroke="#bbb" />
                {spark.map((b, i) => {
                  const h = (Math.abs(b.netDiff) / maxAbs) * (mid - 3);
                  return <Rect key={i} x={i * bw + 0.5} y={b.netDiff >= 0 ? mid - h : mid} width={Math.max(1, bw - 1)} height={Math.max(0.4, h)} fill={b.netDiff < 0 ? "#b03a3a" : "#2f7d5b"} />;
                })}
              </Svg>
              <Text style={s.cap}>{spark[0].label} → {spark[spark.length - 1].label}</Text>
            </>)}

            {comparison && (<>
              <Text style={s.section}>{t("report.by_location")}</Text>
              <View style={s.head}><C w="30%">{t("report.th_location")}</C><C w="14%">{t("report.counts")}</C><C w="20%">{t("report.th_over_short")}</C><C w="16%">{t("report.th_shrink")}</C><C w="20%">{t("report.th_verified")}</C></View>
              {comparison.locations.map((l, i) => (
                <View key={i} style={s.row}><C w="30%">{l.locName}</C><C w="14%">{l.total}</C><C w="20%" style={tone(l.cashNet)}>{sgn(l.cashNet, money)}</C><C w="16%" style={l.invShrink < 0 ? s.neg : null}>{l.invShrink}</C><C w="20%">{l.total ? `${Math.round(l.verificationRate * 100)}%` : "—"}</C></View>
              ))}
              <View style={s.totals}><C w="30%">{t("report.all")}</C><C w="14%">{comparison.total.total}</C><C w="20%" style={tone(comparison.total.cashNet)}>{sgn(comparison.total.cashNet, money)}</C><C w="16%" style={comparison.total.invShrink < 0 ? s.neg : null}>{comparison.total.invShrink}</C><C w="20%">{comparison.total.total ? `${Math.round(comparison.total.verificationRate * 100)}%` : "—"}</C></View>
            </>)}

            {r.cash.byLocation.length > 0 && (<>
              <Text style={s.section}>{t("report.pdf_cash_by_location")}</Text>
              <View style={s.head}><C w="28%">{t("report.th_location")}</C><C w="12%">{t("report.counts")}</C><C w="15%">{t("report.th_sales")}</C><C w="15%">{t("report.th_paid_out")}</C><C w="15%">{t("report.th_counted")}</C><C w="15%">{t("report.th_over_short")}</C></View>
              {r.cash.byLocation.map((l, i) => (
                <View key={i} style={s.row}><C w="28%">{l.locationName || "—"}</C><C w="12%">{l.count}</C><C w="15%">{money(l.sales)}</C><C w="15%">{money(l.paidout)}</C><C w="15%">{money(l.counted)}</C><C w="15%" style={tone(l.netDiff)}>{sgn(l.netDiff, money)}</C></View>
              ))}
              <View style={s.totals}><C w="28%">{t("report.total")}</C><C w="12%">{r.cash.count}</C><C w="15%">{money(r.cash.sales)}</C><C w="15%">{money(r.cash.paidout)}</C><C w="15%">{money(r.cash.counted)}</C><C w="15%" style={tone(r.cash.netDiff)}>{sgn(r.cash.netDiff, money)}</C></View>
            </>)}

            {r.cash.byDrawer.length > 0 && (<>
              <Text style={s.section}>{t("report.pdf_cash_by_drawer")}</Text>
              <View style={s.head}><C w="34%">{t("report.th_drawer")}</C><C w="30%">{t("report.th_location")}</C><C w="12%">{t("report.counts")}</C><C w="24%">{t("report.th_over_short")}</C></View>
              {r.cash.byDrawer.map((d, i) => (
                <View key={i} style={s.row}><C w="34%">{d.drawerName || "—"}</C><C w="30%">{d.locationName || "—"}</C><C w="12%">{d.count}</C><C w="24%" style={tone(d.netDiff)}>{sgn(d.netDiff, money)}</C></View>
              ))}
            </>)}

            {r.inventory.byItem.length > 0 && (<>
              <Text style={s.section}>{t("report.pdf_inventory_by_item")}</Text>
              <View style={s.head}><C w="50%">{t("report.th_item")}</C><C w="16%">{t("report.counts")}</C><C w="16%">{t("report.th_counted")}</C><C w="18%">{t("report.net_shrink")}</C></View>
              {r.inventory.byItem.map((it, i) => (
                <View key={i} style={s.row}><C w="50%">{it.itemName}</C><C w="16%">{it.count}</C><C w="16%">{it.counted}</C><C w="18%" style={it.netShrink < 0 ? s.neg : null}>{it.netShrink}</C></View>
              ))}
              <View style={s.totals}><C w="82%">{t("report.total_net_shrink")}</C><C w="18%" style={r.inventory.netShrink < 0 ? s.neg : null}>{r.inventory.netShrink}</C></View>
            </>)}

            <Text style={s.section}>{t("report.integrity")}</Text>
            <Text>{t("report.pdf_integrity_line", { flagged: r.integrity.flagged, disputed: r.integrity.disputed, resolved: r.integrity.resolvedWithCause, verified: r.integrity.verified, total: r.integrity.total, pct: Math.round(r.integrity.verificationRate * 100) })}</Text>

            {r.labor && r.labor.length > 0 && (<>
              <Text style={s.section}>{t("report.pdf_labor")}</Text>
              <View style={s.head}><C w="60%">{t("report.th_employee")}</C><C w="18%">{t("report.th_shifts")}</C><C w="22%">{t("report.th_hours")}</C></View>
              {r.labor.map((u, i) => (
                <View key={i} style={s.row}><C w="60%">{u.userName || "—"}</C><C w="18%">{u.shifts}</C><C w="22%">{u.hours}</C></View>
              ))}
              <View style={s.totals}><C w="60%">{t("report.total")}</C><C w="18%">{r.labor.reduce((a, u) => a + u.shifts, 0)}</C><C w="22%">{Math.round(r.labor.reduce((a, u) => a + u.hours, 0) * 100) / 100}</C></View>
            </>)}

            {r.incidents && (r.incidents.opened + r.incidents.acknowledged + r.incidents.closed) > 0 && (<>
              <Text style={s.section}>{t("report.incidents_heading")}</Text>
              <Text>{t("report.pdf_incidents_line", { opened: r.incidents.opened, ack: r.incidents.acknowledged, closed: r.incidents.closed })}</Text>
            </>)}

            <View style={s.sig}>
              <View style={s.sigLine}><Text>{t("report.sig_prepared")}</Text></View>
              <View style={s.sigLine}><Text>{t("report.sig_reviewed")}</Text></View>
            </View>
          </Page>
        </Document>
      );
      const blob = await pdf(doc).toBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${fileBase}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error(err);
      onToast?.(t("report.toast_pdf_fail_print"));
    }
    setBusy(false);
  }

  // Print-friendly HTML (browser print -> paper or save-as-PDF), listing the
  // period's rows — a complement to the summary PDF for a line-by-line record.
  function printReport() {
    if (!range || !report) return; // an empty period still prints, with a "no activity" line
    const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    const cash = rows.filter((e) => e.kind === "cash");
    const inv = rows.filter((e) => e.kind === "inventory");
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return onToast?.(t("report.toast_popups"));
    const cashRows = cash.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.drawerName)}</td><td>${esc(e.by)}</td><td>${money(e.sales)}</td><td>${money(e.paidout)}</td><td>${money(e.expected)}</td><td>${money(e.counted)}</td><td>${e.diff >= 0 ? "+" : ""}${money(e.diff)}</td><td>${esc(e.verifiedBy || "")}</td></tr>`).join("");
    const invRows = inv.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.itemName)}</td><td>${esc(e.startQty ?? "")}</td><td>${esc(e.counted)}</td><td>${e.diff >= 0 ? "+" : ""}${esc(e.diff)}</td></tr>`).join("");
    const pct = (l) => (l.total ? `${Math.round(l.verificationRate * 100)}%` : "—");
    const cmpRow = (name, l, cell = "td") => `<tr><${cell}>${esc(name)}</${cell}><${cell}>${l.total}</${cell}><${cell}>${l.cashNet >= 0 ? "+" : ""}${money(l.cashNet)}</${cell}><${cell}>${l.invShrink}</${cell}><${cell}>${pct(l)}</${cell}></tr>`;
    const cmpTable = comparison
      ? `<h2>${esc(t("report.by_location"))}</h2><table><tr><th>${esc(t("report.th_location"))}</th><th>${esc(t("report.counts"))}</th><th>${esc(t("report.th_over_short"))}</th><th>${esc(t("report.th_shrink"))}</th><th>${esc(t("report.th_verified"))}</th></tr>${comparison.locations.map((l) => cmpRow(l.locName, l)).join("")}${cmpRow(t("report.all"), comparison.total, "th")}</table>`
      : "";
    const accent = paletteAccent(vendor);
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(fileBase)}</title>
      <style>body{font:12px Helvetica,Arial;margin:32px;color:#1a1c2e}h1{font-size:18px;margin:0}p{color:#666;margin:2px 0}
      h2{font-size:13px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #ccc}th{border-bottom:2px solid #1a1c2e}
      .brand{display:flex;align-items:center;gap:8px}.mark{width:26px;height:26px;border-radius:5px;background:${accent};color:#fff;font-weight:bold;display:flex;align-items:center;justify-content:center;font-size:13px}
      .sig{display:flex;justify-content:space-between;margin-top:48px}.sig div{width:44%;border-top:1px solid #1a1c2e;padding-top:4px;font-size:10px;color:#666}</style>
      <div class="brand"><span class="mark">DC</span><h1>${esc(vendor.name)} — ${esc(t("report.pdf_records_title"))}</h1></div>
      <p>${esc(t("report.store_code"))}: ${esc(vendor.slug)} · ${esc(locLabel)} · ${esc(range.label)} (${range.startISO} → ${range.endISO})</p>
      <p>${esc(t("report.print_generated_by", { name: profile.name, time: new Date().toLocaleString() }))}</p>
      ${rows.length === 0 ? `<p><i>${esc(t("report.print_no_activity"))}</i></p>` : ""}
      ${cmpTable}
      ${cash.length ? `<h2>${esc(t("report.h_cash_drawers"))}</h2><table><tr><th>${esc(t("report.th_date"))}</th><th>${esc(t("report.th_drawer"))}</th><th>${esc(t("report.th_by"))}</th><th>${esc(t("report.th_sales"))}</th><th>${esc(t("report.th_paid_out"))}</th><th>${esc(t("report.th_expected"))}</th><th>${esc(t("report.th_counted"))}</th><th>${esc(t("report.th_over_short"))}</th><th>${esc(t("report.th_verified"))}</th></tr>${cashRows}<tr><th colspan="3">${esc(t("report.totals"))}</th><th>${money(report.cash.sales)}</th><th>${money(report.cash.paidout)}</th><th></th><th>${money(report.cash.counted)}</th><th>${report.cash.netDiff >= 0 ? "+" : ""}${money(report.cash.netDiff)}</th><th></th></tr></table>` : ""}
      ${inv.length ? `<h2>${esc(t("report.h_inventory"))}</h2><table><tr><th>${esc(t("report.th_date"))}</th><th>${esc(t("report.th_item"))}</th><th>${esc(t("report.th_start"))}</th><th>${esc(t("report.th_counted"))}</th><th>${esc(t("report.th_diff"))}</th></tr>${invRows}<tr><th colspan="4">${esc(t("report.net_shrink_units"))}</th><th>${report.inventory.netShrink}</th></tr></table>` : ""}
      <h2>${esc(t("report.h_verification"))}</h2><p>${esc(t("report.print_verification_line", { v: report.integrity.verified, total: report.integrity.total, pct: Math.round(report.integrity.verificationRate * 100) }))}</p>
      <div class="sig"><div>${esc(t("report.sig_prepared"))}</div><div>${esc(t("report.sig_reviewed"))}</div></div>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="report-modal-title"
        className="bg-surface rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3.5 border-b border-line flex items-center justify-between">
          <h2 id="report-modal-title" className="font-semibold text-[15px]">{t("report.title")}</h2>
          <button className="btn-ghost text-[13px] px-2.5 py-1" onClick={onClose} aria-label={t("report.close")}><span aria-hidden="true">✕</span></button>
        </div>
        <div className="p-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("report.period")}>
              <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
                {PRESETS.map((p) => <option key={p.value} value={p.value}>{t(`report.preset_${p.value}`)}</option>)}
              </select>
            </Field>
            <Field label={t("report.location")}>
              <select className="input" value={locId} onChange={(e) => setLocId(e.target.value)}>
                <option value="all">{t("report.all_locations")}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
          </div>

          {preset === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("report.start")}><input type="date" className="input" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} /></Field>
              <Field label={t("report.end")}><input type="date" className="input" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} /></Field>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button className="btn-ghost px-3 py-2" onClick={() => setRefDate(stepPeriod(preset, refDate, -1, fiscalOpts))} aria-label={t("report.prev_period")}><span aria-hidden="true">◀</span></button>
              <div className="flex-1 text-center">
                <div className="font-semibold text-sm">{range ? range.label : "—"}</div>
                {range && <div className="text-[11px] text-muted font-mono">{range.startISO} → {range.endISO}</div>}
              </div>
              <button className="btn-ghost px-3 py-2" onClick={() => setRefDate(stepPeriod(preset, refDate, 1, fiscalOpts))} aria-label={t("report.next_period")}><span aria-hidden="true">▶</span></button>
            </div>
          )}

          {fiscalStartMonth !== 1 && preset !== "custom" && FISCAL_PRESETS.has(preset) && (
            <p className="text-[11px] text-muted -mt-1">{t("report.fy_note", { month: t(`report.month_${fiscalStartMonth}`) })}</p>
          )}

          <div className="space-y-3" aria-live="polite">
            {!range ? (
              <div className="bg-panel border border-line rounded-xl p-3.5 text-sm text-neg">{t("report.invalid_range")}</div>
            ) : loading ? (
              <div className="bg-panel border border-line rounded-xl p-3.5 text-sm text-muted">{t("report.loading", { label: range.label })}</div>
            ) : loadError ? (
              <div className="bg-panel border border-line rounded-xl p-3.5 text-sm text-neg">{t("report.load_error")}</div>
            ) : report ? (
              <>
                {/* ---- Revenue mix (donut overview) ---- */}
                {revenueMix.length >= 2 && (
                  <section className="bg-panel border border-line rounded-xl p-3.5">
                    <h3 className="font-semibold text-[14px] mb-2">{t("report.revenue_mix")}</h3>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="w-40 h-40 flex-shrink-0 mx-auto">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={revenueMix} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="95%"
                              stroke={ch.tipBg} strokeWidth={2} isAnimationActive={false}>
                              {revenueMix.map((p, i) => <Cell key={i} fill={p.fill} />)}
                            </Pie>
                            <Tooltip formatter={(v, n) => [money(v), n]} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="flex-1 min-w-[11rem] space-y-1.5">
                        {revenueMix.map((p, i) => (
                          <li key={i} className="flex items-center gap-2 text-[12px]">
                            <span aria-hidden="true" className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
                            <span className="min-w-0 flex-1 truncate">{p.label}</span>
                            <span className="font-mono font-semibold flex-shrink-0">
                              {money(p.value)} <span className="text-muted font-normal">({revenueTotal ? Math.round((p.value / revenueTotal) * 100) : 0}%)</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                )}

                {/* ---- Cash ---- */}
                {cashOn && (
                  <section className="bg-panel border border-line rounded-xl p-3.5">
                    <h3 className="font-semibold text-[14px] mb-2">{t("report.cash")}</h3>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <Kpi label={t("report.cash_sales")} value={money(report.cash.sales)} />
                      <Kpi label={t("report.net_over_short")} value={`${report.cash.netDiff >= 0 ? "+" : ""}${money(report.cash.netDiff)}`}
                        tone={report.cash.netDiff < -0.005 ? "neg" : report.cash.netDiff > 0.005 ? "pos" : null} />
                      <Kpi label={t("report.counts")} value={report.counts.cash} />
                    </div>
                    {report.trend.length > 1 && (
                      <>
                        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{t("report.over_short_by", { unit: t(`report.by_${report.trendBy}`) })}</div>
                        <ResponsiveContainer width="100%" height={150}>
                          <BarChart data={report.trend}>
                            <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
                            <XAxis dataKey="label" tickFormatter={(v) => String(v).slice(5)} tick={{ fontSize: 10, fill: ch.axis }} stroke={ch.axis} />
                            <YAxis tick={{ fontSize: 10, fill: ch.axis }} stroke={ch.axis} width={40} />
                            <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
                            <Bar dataKey="netDiff" radius={[3, 3, 0, 0]}>
                              {report.trend.map((b, i) => <Cell key={i} fill={b.netDiff < 0 ? "#b03a3a" : "#2f7d5b"} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mt-3 mb-1">{t("report.cash_trend")}</div>
                        <ResponsiveContainer width="100%" height={140}>
                          <LineChart data={report.trend}>
                            <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
                            <XAxis dataKey="label" tickFormatter={(v) => String(v).slice(5)} tick={{ fontSize: 10, fill: ch.axis }} stroke={ch.axis} />
                            <YAxis tick={{ fontSize: 10, fill: ch.axis }} stroke={ch.axis} width={40} />
                            <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
                            <RLine type="monotone" dataKey="sales" stroke={ch.bar} strokeWidth={2.5} dot={{ r: 2 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </>
                    )}
                  </section>
                )}

                {/* ---- Inventory ---- */}
                {inventoryOn && (
                  <section className="bg-panel border border-line rounded-xl p-3.5">
                    <h3 className="font-semibold text-[14px] mb-2">{t("report.inventory")}</h3>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <Kpi label={t("report.counts")} value={report.counts.inventory} />
                      <Kpi label={t("report.net_shrink")} value={`${report.inventory.netShrink} u`} tone={report.inventory.netShrink < 0 ? "neg" : null} />
                      <Kpi label={t("report.items")} value={report.inventory.byItem.length} />
                    </div>
                    {shrinkRows.length > 0 && (
                      <>
                        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{t("report.biggest_shrink")}</div>
                        <ResponsiveContainer width="100%" height={Math.max(120, shrinkRows.length * 34)}>
                          <BarChart layout="vertical" data={shrinkRows} margin={{ left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: ch.axis }} stroke={ch.axis} />
                            <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
                            <Tooltip contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
                            <Bar dataKey="missing" fill="#b03a3a" radius={[0, 3, 3, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </>
                    )}
                  </section>
                )}

                {/* ---- Gaming (owner-only, separate from the entries spine) ---- */}
                {gamingOn && gaming && gaming.count > 0 && (
                  <section className="bg-panel border border-line rounded-xl p-3.5">
                    <h3 className="font-semibold text-[14px] mb-2">{t("report.gaming")}</h3>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <Kpi label={t("report.collection")} value={money(gaming.totals.collection)} />
                      <Kpi label={t("report.payout")} value={money(gaming.totals.payout)} />
                      <Kpi label={t("report.net")} value={money(gaming.totals.net)} tone={gaming.totals.net < 0 ? "neg" : null} />
                      <Kpi label={t("report.store_take")} value={money(gaming.totals.storeShare)} tone="pos" />
                    </div>
                    {gaming.series.length > 1 && (
                      <>
                        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{t("report.store_take_by_date")}</div>
                        <ResponsiveContainer width="100%" height={150}>
                          <LineChart data={gaming.series}>
                            <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
                            <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} tick={{ fontSize: 10, fill: ch.axis }} stroke={ch.axis} />
                            <YAxis tick={{ fontSize: 10, fill: ch.axis }} stroke={ch.axis} width={40} />
                            <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
                            <RLine type="monotone" dataKey="storeShare" stroke={ch.bar} strokeWidth={2.5} dot={{ r: 2 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </>
                    )}
                  </section>
                )}

                {/* ---- Integrity + incidents (always) ---- */}
                <div className="bg-panel border border-line rounded-xl p-3.5 text-sm space-y-1">
                  <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{t("report.integrity")}</div>
                  <div>{t("report.flagged_disputed", { flagged: report.integrity.flagged, disputed: report.integrity.disputed })}</div>
                  <div>{t("report.verified_line", { v: report.integrity.verified, total: report.integrity.total, pct: Math.round(report.integrity.verificationRate * 100) })}</div>
                  {report.incidents && (report.incidents.opened + report.incidents.acknowledged + report.incidents.closed) > 0 && (
                    <div>{t("report.incidents_line", { opened: report.incidents.opened, ack: report.incidents.acknowledged, closed: report.incidents.closed })}</div>
                  )}
                  {report.empty && (!gaming || gaming.count === 0) && <div className="text-muted italic mt-1">{t("report.no_activity")}</div>}
                </div>
              </>
            ) : null}
          </div>

          {ready && comparison && !report?.empty && (
            <div className="bg-panel border border-line rounded-xl p-3.5">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">{t("report.by_location")}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="text-muted text-left border-b border-line">
                      <th className="py-1 pr-2 font-medium">{t("report.th_location")}</th>
                      <th className="py-1 px-1 font-medium text-right">{t("report.th_over_short")}</th>
                      <th className="py-1 px-1 font-medium text-right">{t("report.th_shrink")}</th>
                      <th className="py-1 pl-1 font-medium text-right">{t("report.th_verified")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.locations.map((l) => (
                      <tr key={l.locId} className="border-b border-line">
                        <td className="py-1 pr-2 truncate max-w-[120px]">{l.locName}</td>
                        <td className={`py-1 px-1 text-right tabular-nums ${l.cashNet < 0 ? "text-neg" : l.cashNet > 0 ? "text-pos" : ""}`}>{l.cashNet >= 0 ? "+" : ""}{money(l.cashNet)}</td>
                        <td className={`py-1 px-1 text-right tabular-nums ${l.invShrink < 0 ? "text-neg" : ""}`}>{l.invShrink}</td>
                        <td className="py-1 pl-1 text-right tabular-nums">{l.total ? Math.round(l.verificationRate * 100) : "—"}{l.total ? "%" : ""}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1 pr-2">{t("report.all")}</td>
                      <td className={`py-1 px-1 text-right tabular-nums ${comparison.total.cashNet < 0 ? "text-neg" : comparison.total.cashNet > 0 ? "text-pos" : ""}`}>{comparison.total.cashNet >= 0 ? "+" : ""}{money(comparison.total.cashNet)}</td>
                      <td className={`py-1 px-1 text-right tabular-nums ${comparison.total.invShrink < 0 ? "text-neg" : ""}`}>{comparison.total.invShrink}</td>
                      <td className="py-1 pl-1 text-right tabular-nums">{comparison.total.total ? Math.round(comparison.total.verificationRate * 100) + "%" : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!ready || busy} onClick={downloadPdf}>{busy ? t("report.generating") : t("report.download_pdf")}</button>
            <button className="btn-ghost flex-1" disabled={!ready || busy} onClick={downloadCsv}>{t("report.download_csv")}</button>
          </div>
          <button className="btn-ghost w-full text-[13px]" disabled={!ready || busy} onClick={printReport}>{t("report.print")}</button>
          {gamingOn && gaming && gaming.count > 0 && (
            <button className="btn-ghost w-full text-[13px]" disabled={!ready || busy} onClick={downloadGamingCsv}>{t("report.download_gaming_csv")}</button>
          )}

          <div className="border-t border-line-soft pt-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("report.for_bookkeeper")}</div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1 text-[13px]" disabled={busy} onClick={downloadBookkeeperPdf}>
                {busy ? t("report.working") : t("report.close_of_day_pdf") + (preset === "day" && range ? "" : t("report.today_suffix"))}
              </button>
              <button className="btn-ghost flex-1 text-[13px]" disabled={!ready || busy} onClick={downloadJournalCsv}>
                {t("report.qb_journal_csv")}
              </button>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              {t("report.bookkeeper_help_a", { day: preset === "day" && range ? range.startISO : t("report.today_paren") })}
              <b>{t("report.drafts")}</b>{t("report.bookkeeper_help_b")}
            </p>

            <div className="flex items-center gap-2">
              <select className="input flex-1" value={franchiseProfile} aria-label={t("report.franchise_aria")}
                onChange={(e) => setFranchiseProfile(e.target.value)}>
                <option value="">{t("report.franchise_none")}</option>
                {Object.values(FRANCHISE_PROFILES).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              {franchiseProfile && (
                <button className="btn-ghost w-auto px-4 text-[13px]" disabled={!ready || busy} onClick={downloadFranchiseCsv}>
                  {t("report.download")}
                </button>
              )}
            </div>
            {franchiseProfile && (
              <p className="text-[11px] text-muted leading-relaxed">
                {t("report.franchise_help_a")}<b>{t("report.generic_scaffold")}</b>{t("report.franchise_help_b")}
              </p>
            )}
          </div>

          <p className="text-[11px] text-muted">{t("report.snapshot_note")}</p>
        </div>
      </div>
    </div>
  );
}
