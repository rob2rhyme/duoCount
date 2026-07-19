"use client";
import { useEffect, useMemo, useState } from "react";
import { money, entriesToCSV, downloadCSV } from "@/lib/utils";
import { useSession } from "./SessionProvider";
import { useModalA11y } from "@/lib/use-modal-a11y";
import Field from "./Field";
import { PRESETS, periodRange, stepPeriod } from "@/lib/report-period";
import { buildPeriodReport, buildLocationComparison } from "@/lib/report-build";
import { buildJournalCSV, buildJournalEntries, buildFranchiseCSV, FRANCHISE_PROFILES } from "@/lib/report-accounting";
import { fetchEntriesInRange, fetchPunchesInRange } from "@/lib/data";

const today = () => new Date().toISOString().slice(0, 10);
const slug = (s) => String(s || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "x";
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const FISCAL_PRESETS = new Set(["year", "quarter", "half"]); // periods the fiscal start reshapes

// The Reports center: pick any period (day … year, or custom dates) and a
// location scope, preview what it contains, and export it for the record.
// Reports only READ the append-only log (one-shot, via fetchEntriesInRange) and
// render client-side — they never mutate the signed history.
// initialLocId / initialPreset / initialRefDate pre-scope the report (the
// Portfolio drill-down opens a store's report for the period being viewed);
// they're just initial state — the user can still change every control.
export default function ReportModal({ locations = [], locName = () => "—", incidents = [], onClose, onToast,
  initialLocId, initialPreset, initialRefDate, initialCustomStart, initialCustomEnd }) {
  const { profile, vendor } = useSession();
  const panelRef = useModalA11y(onClose);

  const [preset, setPreset] = useState(initialPreset || "day");
  const [refDate, setRefDate] = useState(initialRefDate || today());
  const [customStart, setCustomStart] = useState(initialCustomStart || today());
  const [customEnd, setCustomEnd] = useState(initialCustomEnd || today());
  const [locId, setLocId] = useState(initialLocId || "all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
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
  useEffect(() => {
    if (!startISO || !endISO) { setRows([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setLoadError(null);
    fetchEntriesInRange(vendor.id, startISO, endISO, scopeLocId)
      .then((es) => { if (alive) { setRows(es); setLoading(false); } })
      .catch((err) => { if (alive) { console.error(err); setLoadError("Couldn't load this period — try again."); setLoading(false); } });
    return () => { alive = false; };
  }, [vendor.id, startISO, endISO, scopeLocId]);

  // Preview report (entries + incidents, both already in memory). Labor needs a
  // punch fetch, so it's computed only for the PDF, on demand.
  const report = useMemo(() => (range ? buildPeriodReport(rows, range, locId, { incidents }) : null), [rows, range, locId, incidents]);

  // Side-by-side location comparison — only meaningful across the whole business
  // (scope = All) with two or more locations. Reuses the same fetched rows.
  const comparison = useMemo(
    () => (range && locId === "all" && locations.length >= 2 ? buildLocationComparison(rows, range, locations) : null),
    [rows, range, locId, locations],
  );

  const locLabel = locId === "all" ? "All locations" : locName(locId);
  const fileBase = `duocount-report-${locId === "all" ? "all" : slug(locName(locId))}-${range ? range.key : "period"}`;
  const ready = !!range && !loading && !loadError;

  // An empty period is a valid record too — it exports a header-only CSV.
  function downloadCsv() {
    downloadCSV(entriesToCSV(rows), `${fileBase}.csv`);
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
      const dayRows = await fetchEntriesInRange(vendor.id, day, day, scopeLocId);
      const r = buildPeriodReport(dayRows, dayRange, locId);
      const journal = buildJournalEntries(dayRows, dayRange);
      const expected = Math.round((r.cash.counted - r.cash.netDiff) * 100) / 100;

      const { pdf, Document, Page, Text, View, StyleSheet } = await import("@react-pdf/renderer");
      const s = StyleSheet.create({
        page: { padding: 28, fontSize: 10, fontFamily: "Helvetica", color: "#1a1c2e" },
        brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
        mark: { width: 22, height: 22, borderRadius: 4, backgroundColor: "#298050", alignItems: "center", justifyContent: "center", marginRight: 7 },
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
      const osLabel = r.cash.netDiff < -0.005 ? "SHORT" : r.cash.netDiff > 0.005 ? "OVER" : "BALANCED";

      const doc = (
        <Document title={`duocount-closeofday-${locId === "all" ? "all" : slug(locName(locId))}-${day}`}>
          <Page size="A4" style={s.page}>
            <View style={s.brandRow}>
              <View style={s.mark}><Text style={s.markText}>DC</Text></View>
              <Text style={s.h1}>{vendor.name} — Close-of-Day Summary</Text>
            </View>
            <Text style={s.meta}>Store code: {vendor.slug} · {locLabel} · {day}</Text>
            <Text style={s.meta}>Prepared by {profile.name} at {new Date().toLocaleString()}</Text>

            {r.empty && <Text style={s.empty}>No activity recorded on {day}.</Text>}

            <Text style={s.section}>Cash reconciliation</Text>
            <Line label={`Cash sales (${r.counts.cash} count${r.counts.cash === 1 ? "" : "s"})`} value={money(r.cash.sales)} />
            <Line label="Paid-outs / drops" value={`− ${money(r.cash.paidout)}`} />
            <Line label="Expected in drawer(s)" value={money(expected)} />
            <Line label="Counted" value={money(r.cash.counted)} />
            <Line bold label={`${osLabel} (counted − expected)`} tone={osTone}
              value={`${r.cash.netDiff >= 0 ? "+" : ""}${money(r.cash.netDiff)}`} />

            <Text style={s.section}>Other sales</Text>
            <Line label={`Lottery / scratch sales (${r.counts.scratch} count${r.counts.scratch === 1 ? "" : "s"})`} value={money(r.scratch.dollars)} />

            <Text style={s.section}>Journal entry preview — matches the QuickBooks CSV</Text>
            {journal.length === 0 && <Text style={s.empty}>Nothing to journal for this day.</Text>}
            {journal.map((entry) => {
              const debits = entry.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
              const credits = entry.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
              return (
                <View key={entry.journalNo}>
                  <Text style={s.jLoc}>{entry.journalNo} · {entry.locationName}</Text>
                  <View style={s.jHead}><C w="46%">Account</C><C w="18%">Description</C><C w="18%" style={{ textAlign: "right" }}>Debit</C><C w="18%" style={{ textAlign: "right" }}>Credit</C></View>
                  {entry.lines.map((l, i) => (
                    <View key={i} style={s.jRow}>
                      <C w="46%">{l.account}</C>
                      <C w="18%">{l.description}</C>
                      <C w="18%" style={{ textAlign: "right" }}>{l.debit != null ? l.debit.toFixed(2) : ""}</C>
                      <C w="18%" style={{ textAlign: "right" }}>{l.credit != null ? l.credit.toFixed(2) : ""}</C>
                    </View>
                  ))}
                  <View style={s.jTotals}>
                    <C w="46%">Totals</C><C w="18%">balanced</C>
                    <C w="18%" style={{ textAlign: "right" }}>{debits.toFixed(2)}</C>
                    <C w="18%" style={{ textAlign: "right" }}>{credits.toFixed(2)}</C>
                  </View>
                </View>
              );
            })}
            <Text style={s.cap}>A draft for review — import the matching journal CSV instead of re-keying. DuoCount is the count-of-record; your accounting software remains the ledger.</Text>

            <View style={s.sig}>
              <View style={s.sigLine}><Text>Prepared by · date</Text></View>
              <View style={s.sigLine}><Text>Reviewed by (manager) · date</Text></View>
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
      onToast?.("PDF failed — try the journal CSV");
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
        mark: { width: 22, height: 22, borderRadius: 4, backgroundColor: "#298050", alignItems: "center", justifyContent: "center", marginRight: 7 },
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
              <Text style={s.h1}>{vendor.name} — Records Report</Text>
            </View>
            <Text style={s.meta}>Store code: {vendor.slug} · {locLabel} · {r.range.startISO} → {r.range.endISO}</Text>
            <Text style={s.meta}>{range.label} · generated by {profile.name} at {new Date().toLocaleString()}</Text>

            {r.empty && <Text style={s.empty}>No activity recorded in this period.</Text>}

            <View style={s.kpis}>
              <View style={s.kpi}><Text style={s.kpiV}>{sgn(r.cash.netDiff, money)}</Text><Text style={s.kpiL}>Net over/short</Text></View>
              <View style={s.kpi}><Text style={s.kpiV}>{money(r.cash.sales)}</Text><Text style={s.kpiL}>Cash sales</Text></View>
              <View style={s.kpi}><Text style={s.kpiV}>{money(r.scratch.dollars)}</Text><Text style={s.kpiL}>Scratch $</Text></View>
              <View style={[s.kpi, { marginRight: 0 }]}><Text style={s.kpiV}>{Math.round(r.integrity.verificationRate * 100)}%</Text><Text style={s.kpiL}>Verified</Text></View>
            </View>

            {spark.length > 0 && (<>
              <Text style={s.section}>Over / short by {r.trendBy}</Text>
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
              <Text style={s.section}>By location</Text>
              <View style={s.head}><C w="28%">Location</C><C w="12%">Counts</C><C w="16%">Over/short</C><C w="16%">Scratch $</C><C w="12%">Shrink</C><C w="16%">Verified</C></View>
              {comparison.locations.map((l, i) => (
                <View key={i} style={s.row}><C w="28%">{l.locName}</C><C w="12%">{l.total}</C><C w="16%" style={tone(l.cashNet)}>{sgn(l.cashNet, money)}</C><C w="16%">{money(l.scratchDollars)}</C><C w="12%" style={l.invShrink < 0 ? s.neg : null}>{l.invShrink}</C><C w="16%">{l.total ? `${Math.round(l.verificationRate * 100)}%` : "—"}</C></View>
              ))}
              <View style={s.totals}><C w="28%">All</C><C w="12%">{comparison.total.total}</C><C w="16%" style={tone(comparison.total.cashNet)}>{sgn(comparison.total.cashNet, money)}</C><C w="16%">{money(comparison.total.scratchDollars)}</C><C w="12%" style={comparison.total.invShrink < 0 ? s.neg : null}>{comparison.total.invShrink}</C><C w="16%">{comparison.total.total ? `${Math.round(comparison.total.verificationRate * 100)}%` : "—"}</C></View>
            </>)}

            {r.cash.byLocation.length > 0 && (<>
              <Text style={s.section}>Cash — by location</Text>
              <View style={s.head}><C w="28%">Location</C><C w="12%">Counts</C><C w="15%">Sales</C><C w="15%">Paid out</C><C w="15%">Counted</C><C w="15%">Over/short</C></View>
              {r.cash.byLocation.map((l, i) => (
                <View key={i} style={s.row}><C w="28%">{l.locationName || "—"}</C><C w="12%">{l.count}</C><C w="15%">{money(l.sales)}</C><C w="15%">{money(l.paidout)}</C><C w="15%">{money(l.counted)}</C><C w="15%" style={tone(l.netDiff)}>{sgn(l.netDiff, money)}</C></View>
              ))}
              <View style={s.totals}><C w="28%">Total</C><C w="12%">{r.cash.count}</C><C w="15%">{money(r.cash.sales)}</C><C w="15%">{money(r.cash.paidout)}</C><C w="15%">{money(r.cash.counted)}</C><C w="15%" style={tone(r.cash.netDiff)}>{sgn(r.cash.netDiff, money)}</C></View>
            </>)}

            {r.cash.byDrawer.length > 0 && (<>
              <Text style={s.section}>Cash — by drawer</Text>
              <View style={s.head}><C w="34%">Drawer</C><C w="30%">Location</C><C w="12%">Counts</C><C w="24%">Over/short</C></View>
              {r.cash.byDrawer.map((d, i) => (
                <View key={i} style={s.row}><C w="34%">{d.drawerName || "—"}</C><C w="30%">{d.locationName || "—"}</C><C w="12%">{d.count}</C><C w="24%" style={tone(d.netDiff)}>{sgn(d.netDiff, money)}</C></View>
              ))}
            </>)}

            {r.scratch.byGame.length > 0 && (<>
              <Text style={s.section}>Scratch-offs — by game</Text>
              <View style={s.head}><C w="46%">Game</C><C w="14%">Counts</C><C w="18%">Tickets</C><C w="22%">Dollars</C></View>
              {r.scratch.byGame.map((g, i) => (
                <View key={i} style={s.row}><C w="46%">{g.game}</C><C w="14%">{g.count}</C><C w="18%">{g.tickets}</C><C w="22%">{money(g.dollars)}</C></View>
              ))}
              <View style={s.totals}><C w="46%">Total</C><C w="14%">{r.scratch.count}</C><C w="18%">{r.scratch.tickets}</C><C w="22%">{money(r.scratch.dollars)}</C></View>
            </>)}

            {r.inventory.byItem.length > 0 && (<>
              <Text style={s.section}>Inventory — by item</Text>
              <View style={s.head}><C w="50%">Item</C><C w="16%">Counts</C><C w="16%">Counted</C><C w="18%">Net shrink</C></View>
              {r.inventory.byItem.map((it, i) => (
                <View key={i} style={s.row}><C w="50%">{it.itemName}</C><C w="16%">{it.count}</C><C w="16%">{it.counted}</C><C w="18%" style={it.netShrink < 0 ? s.neg : null}>{it.netShrink}</C></View>
              ))}
              <View style={s.totals}><C w="82%">Total net shrink (units)</C><C w="18%" style={r.inventory.netShrink < 0 ? s.neg : null}>{r.inventory.netShrink}</C></View>
            </>)}

            <Text style={s.section}>Integrity</Text>
            <Text>{r.integrity.flagged} flagged · {r.integrity.disputed} disputed · {r.integrity.resolvedWithCause} resolved with cause · {r.integrity.verified} of {r.integrity.total} verified ({Math.round(r.integrity.verificationRate * 100)}%).</Text>

            {r.labor && r.labor.length > 0 && (<>
              <Text style={s.section}>Labor — hours by employee</Text>
              <View style={s.head}><C w="60%">Employee</C><C w="18%">Shifts</C><C w="22%">Hours</C></View>
              {r.labor.map((u, i) => (
                <View key={i} style={s.row}><C w="60%">{u.userName || "—"}</C><C w="18%">{u.shifts}</C><C w="22%">{u.hours}</C></View>
              ))}
              <View style={s.totals}><C w="60%">Total</C><C w="18%">{r.labor.reduce((a, u) => a + u.shifts, 0)}</C><C w="22%">{Math.round(r.labor.reduce((a, u) => a + u.hours, 0) * 100) / 100}</C></View>
            </>)}

            {r.incidents && (r.incidents.opened + r.incidents.acknowledged + r.incidents.closed) > 0 && (<>
              <Text style={s.section}>Incidents</Text>
              <Text>{r.incidents.opened} opened · {r.incidents.acknowledged} acknowledged · {r.incidents.closed} closed within the period.</Text>
            </>)}

            <View style={s.sig}>
              <View style={s.sigLine}><Text>Prepared by · date</Text></View>
              <View style={s.sigLine}><Text>Reviewed by (manager) · date</Text></View>
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
      onToast?.("PDF failed — try Print");
    }
    setBusy(false);
  }

  // Print-friendly HTML (browser print -> paper or save-as-PDF), listing the
  // period's rows — a complement to the summary PDF for a line-by-line record.
  function printReport() {
    if (!range || !report) return; // an empty period still prints, with a "no activity" line
    const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const cash = rows.filter((e) => e.kind === "cash");
    const scratch = rows.filter((e) => e.kind === "scratch");
    const inv = rows.filter((e) => e.kind === "inventory");
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return onToast?.("Allow pop-ups to print");
    const cashRows = cash.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.drawerName)}</td><td>${esc(e.by)}</td><td>${money(e.sales)}</td><td>${money(e.paidout)}</td><td>${money(e.expected)}</td><td>${money(e.counted)}</td><td>${e.diff >= 0 ? "+" : ""}${money(e.diff)}</td><td>${esc(e.verifiedBy || "")}</td></tr>`).join("");
    const scratchRows = scratch.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.game)}</td><td>${esc(e.pack)}</td><td>${money(e.price)}</td><td>${esc(e.sold)}</td><td>${money(e.dollars)}</td><td>${esc(e.by)}</td></tr>`).join("");
    const invRows = inv.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.itemName)}</td><td>${esc(e.startQty ?? "")}</td><td>${esc(e.counted)}</td><td>${e.diff >= 0 ? "+" : ""}${esc(e.diff)}</td></tr>`).join("");
    const pct = (l) => (l.total ? `${Math.round(l.verificationRate * 100)}%` : "—");
    const cmpRow = (name, l, cell = "td") => `<tr><${cell}>${esc(name)}</${cell}><${cell}>${l.total}</${cell}><${cell}>${l.cashNet >= 0 ? "+" : ""}${money(l.cashNet)}</${cell}><${cell}>${money(l.scratchDollars)}</${cell}><${cell}>${l.invShrink}</${cell}><${cell}>${pct(l)}</${cell}></tr>`;
    const cmpTable = comparison
      ? `<h2>By location</h2><table><tr><th>Location</th><th>Counts</th><th>Over/short</th><th>Scratch $</th><th>Shrink</th><th>Verified</th></tr>${comparison.locations.map((l) => cmpRow(l.locName, l)).join("")}${cmpRow("All", comparison.total, "th")}</table>`
      : "";
    w.document.write(`<!doctype html><title>${esc(fileBase)}</title>
      <style>body{font:12px Helvetica,Arial;margin:32px;color:#1a1c2e}h1{font-size:18px;margin:0}p{color:#666;margin:2px 0}
      h2{font-size:13px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #ccc}th{border-bottom:2px solid #1a1c2e}
      .brand{display:flex;align-items:center;gap:8px}.mark{width:26px;height:26px;border-radius:5px;background:#298050;color:#fff;font-weight:bold;display:flex;align-items:center;justify-content:center;font-size:13px}
      .sig{display:flex;justify-content:space-between;margin-top:48px}.sig div{width:44%;border-top:1px solid #1a1c2e;padding-top:4px;font-size:10px;color:#666}</style>
      <div class="brand"><span class="mark">DC</span><h1>${esc(vendor.name)} — Records Report</h1></div>
      <p>Store code: ${esc(vendor.slug)} · ${esc(locLabel)} · ${esc(range.label)} (${range.startISO} → ${range.endISO})</p>
      <p>Generated by ${esc(profile.name)} at ${new Date().toLocaleString()}</p>
      ${rows.length === 0 ? "<p><i>No activity recorded for this period.</i></p>" : ""}
      ${cmpTable}
      ${cash.length ? `<h2>Cash drawers</h2><table><tr><th>Date</th><th>Drawer</th><th>By</th><th>Sales</th><th>Paid out</th><th>Expected</th><th>Counted</th><th>Over/short</th><th>Verified</th></tr>${cashRows}<tr><th colspan="3">Totals</th><th>${money(report.cash.sales)}</th><th>${money(report.cash.paidout)}</th><th></th><th>${money(report.cash.counted)}</th><th>${report.cash.netDiff >= 0 ? "+" : ""}${money(report.cash.netDiff)}</th><th></th></tr></table>` : ""}
      ${scratch.length ? `<h2>Scratch-offs</h2><table><tr><th>Date</th><th>Game</th><th>Pack</th><th>Price</th><th>Sold</th><th>Dollars</th><th>By</th></tr>${scratchRows}<tr><th colspan="4">Total</th><th>${report.scratch.tickets}</th><th>${money(report.scratch.dollars)}</th><th></th></tr></table>` : ""}
      ${inv.length ? `<h2>Inventory counts</h2><table><tr><th>Date</th><th>Item</th><th>Start</th><th>Counted</th><th>Diff</th></tr>${invRows}<tr><th colspan="4">Net shrink (units)</th><th>${report.inventory.netShrink}</th></tr></table>` : ""}
      <h2>Verification</h2><p>${report.integrity.verified} of ${report.integrity.total} entries verified by a manager (${Math.round(report.integrity.verificationRate * 100)}%).</p>
      <div class="sig"><div>Prepared by · date</div><div>Reviewed by (manager) · date</div></div>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="report-modal-title"
        className="bg-surface rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3.5 border-b border-line flex items-center justify-between">
          <h2 id="report-modal-title" className="font-semibold text-[15px]">Reports</h2>
          <button className="btn-ghost text-[13px] px-2.5 py-1" onClick={onClose} aria-label="Close"><span aria-hidden="true">✕</span></button>
        </div>
        <div className="p-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period">
              <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
                {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Location">
              <select className="input" value={locId} onChange={(e) => setLocId(e.target.value)}>
                <option value="all">All locations</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
          </div>

          {preset === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start"><input type="date" className="input" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} /></Field>
              <Field label="End"><input type="date" className="input" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} /></Field>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button className="btn-ghost px-3 py-2" onClick={() => setRefDate(stepPeriod(preset, refDate, -1, fiscalOpts))} aria-label="Previous period"><span aria-hidden="true">◀</span></button>
              <div className="flex-1 text-center">
                <div className="font-semibold text-sm">{range ? range.label : "—"}</div>
                {range && <div className="text-[11px] text-muted font-mono">{range.startISO} → {range.endISO}</div>}
              </div>
              <button className="btn-ghost px-3 py-2" onClick={() => setRefDate(stepPeriod(preset, refDate, 1, fiscalOpts))} aria-label="Next period"><span aria-hidden="true">▶</span></button>
            </div>
          )}

          {fiscalStartMonth !== 1 && preset !== "custom" && FISCAL_PRESETS.has(preset) && (
            <p className="text-[11px] text-muted -mt-1">Fiscal year starts {MONTHS[fiscalStartMonth - 1]}.</p>
          )}

          <div className="bg-panel border border-line rounded-xl p-3.5 text-sm space-y-1" aria-live="polite">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5">Will include</div>
            {!range ? (
              <div className="text-neg">End date is before the start date.</div>
            ) : loading ? (
              <div className="text-muted">Loading {range.label}…</div>
            ) : loadError ? (
              <div className="text-neg">{loadError}</div>
            ) : report ? (
              <>
                {preset === "custom" && <div className="text-muted font-mono text-[11px] mb-1">{range.startISO} → {range.endISO}</div>}
                <div>{report.counts.cash} cash counts · net {report.cash.netDiff >= 0 ? "+" : ""}{money(report.cash.netDiff)}</div>
                <div>{report.counts.scratch} scratch-off counts · {money(report.scratch.dollars)}</div>
                <div>{report.counts.inventory} inventory counts · net shrink {report.inventory.netShrink} units</div>
                <div>{report.integrity.flagged} flagged · {report.integrity.disputed} disputed</div>
                <div>{report.integrity.verified} of {report.integrity.total} verified ({Math.round(report.integrity.verificationRate * 100)}%)</div>
                {report.incidents && (report.incidents.opened + report.incidents.acknowledged + report.incidents.closed) > 0 && (
                  <div>{report.incidents.opened} incidents opened · {report.incidents.acknowledged} acknowledged · {report.incidents.closed} closed</div>
                )}
                {report.empty && <div className="text-muted italic mt-1">No activity in this period.</div>}
              </>
            ) : null}
          </div>

          {ready && comparison && !report?.empty && (
            <div className="bg-panel border border-line rounded-xl p-3.5">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">By location</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="text-muted text-left border-b border-line">
                      <th className="py-1 pr-2 font-medium">Location</th>
                      <th className="py-1 px-1 font-medium text-right">Over/short</th>
                      <th className="py-1 px-1 font-medium text-right">Scratch $</th>
                      <th className="py-1 px-1 font-medium text-right">Shrink</th>
                      <th className="py-1 pl-1 font-medium text-right">Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.locations.map((l) => (
                      <tr key={l.locId} className="border-b border-line">
                        <td className="py-1 pr-2 truncate max-w-[120px]">{l.locName}</td>
                        <td className={`py-1 px-1 text-right tabular-nums ${l.cashNet < 0 ? "text-neg" : l.cashNet > 0 ? "text-pos" : ""}`}>{l.cashNet >= 0 ? "+" : ""}{money(l.cashNet)}</td>
                        <td className="py-1 px-1 text-right tabular-nums">{money(l.scratchDollars)}</td>
                        <td className={`py-1 px-1 text-right tabular-nums ${l.invShrink < 0 ? "text-neg" : ""}`}>{l.invShrink}</td>
                        <td className="py-1 pl-1 text-right tabular-nums">{l.total ? Math.round(l.verificationRate * 100) : "—"}{l.total ? "%" : ""}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1 pr-2">All</td>
                      <td className={`py-1 px-1 text-right tabular-nums ${comparison.total.cashNet < 0 ? "text-neg" : comparison.total.cashNet > 0 ? "text-pos" : ""}`}>{comparison.total.cashNet >= 0 ? "+" : ""}{money(comparison.total.cashNet)}</td>
                      <td className="py-1 px-1 text-right tabular-nums">{money(comparison.total.scratchDollars)}</td>
                      <td className={`py-1 px-1 text-right tabular-nums ${comparison.total.invShrink < 0 ? "text-neg" : ""}`}>{comparison.total.invShrink}</td>
                      <td className="py-1 pl-1 text-right tabular-nums">{comparison.total.total ? Math.round(comparison.total.verificationRate * 100) + "%" : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!ready || busy} onClick={downloadPdf}>{busy ? "Generating…" : "Download PDF"}</button>
            <button className="btn-ghost flex-1" disabled={!ready || busy} onClick={downloadCsv}>Download CSV</button>
          </div>
          <button className="btn-ghost w-full text-[13px]" disabled={!ready || busy} onClick={printReport}>Print (line-by-line)</button>

          <div className="border-t border-line-soft pt-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">For the bookkeeper</div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1 text-[13px]" disabled={busy} onClick={downloadBookkeeperPdf}>
                {busy ? "Working…" : `Close-of-day PDF${preset === "day" && range ? "" : " (today)"}`}
              </button>
              <button className="btn-ghost flex-1 text-[13px]" disabled={!ready || busy} onClick={downloadJournalCsv}>
                QuickBooks journal CSV
              </button>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              The close-of-day sheet reconciles one day&apos;s cash{preset === "day" && range ? ` (${range.startISO})` : " (today)"} and
              previews the exact journal entry the CSV exports — paper and file always agree. The journal CSV covers the
              selected period, one balanced entry per day and location, ready to import instead of re-keying. Both are
              <b> drafts</b> your bookkeeper reviews and posts; DuoCount is the count-of-record, never the ledger.
            </p>

            <div className="flex items-center gap-2">
              <select className="input flex-1" value={franchiseProfile} aria-label="Franchise report format"
                onChange={(e) => setFranchiseProfile(e.target.value)}>
                <option value="">Franchise format: none</option>
                {Object.values(FRANCHISE_PROFILES).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              {franchiseProfile && (
                <button className="btn-ghost w-auto px-4 text-[13px]" disabled={!ready || busy} onClick={downloadFranchiseCsv}>
                  Download
                </button>
              )}
            </div>
            {franchiseProfile && (
              <p className="text-[11px] text-muted leading-relaxed">
                One row per business day in a fixed column layout (store #, gross/cash/lottery sales, paid-outs,
                over/short, verified %). A <b>generic scaffold</b> — check it against your franchisor&apos;s actual
                template before submitting; pick a location above to scope it to one store.
              </p>
            )}
          </div>

          <p className="text-[11px] text-muted">A read-only snapshot of recorded counts for the period — saved for your records.</p>
        </div>
      </div>
    </div>
  );
}
