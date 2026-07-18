"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { money, entriesToCSV, downloadCSV } from "@/lib/utils";
import { PRESETS, periodRange, stepPeriod } from "@/lib/report-period";
import { buildPortfolioSummary, buildStoreLeaderboard, buildEmployeeRollup } from "@/lib/portfolio-rollup";
import { fetchEntriesInRange } from "@/lib/data";
import { useSession } from "./SessionProvider";
import EmptyState, { IconChart } from "./EmptyState";
import ReportModal from "./ReportModal";
import Field from "./Field";

const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const FISCAL_PRESETS = new Set(["year", "quarter", "half"]);

// A rate rendered as a percent; null (zero denominator) renders as an honest —.
const pct = (r, digits = 1) => (r == null ? "—" : `${(r * 100).toFixed(digits)}%`);
const toneOf = (n) => (n < -0.005 ? "text-neg" : n > 0.005 ? "text-pos" : "text-fg");

// Sortable leaderboard columns. `key` must be a numeric field on the decorated
// leaderboard row (portfolio-rollup.js); clearing the sort returns to the
// default attention order.
const COLUMNS = [
  { key: "total", label: "Counts", title: "Entries recorded in the period" },
  { key: "cashNet", label: "Over/short", title: "Net cash over/short ($)" },
  { key: "cashNetRate", label: "O/S rate", title: "Over/short per cash-sales dollar — comparable across store sizes" },
  { key: "invShrink", label: "Shrink", title: "Net inventory shrink (units — not dollars)" },
  { key: "flagRate", label: "Flags", title: "Share of entries with an unresolved variance" },
  { key: "verificationRate", label: "Verified", title: "Share of entries verified by a second person" },
];

// Owner-only portfolio cockpit: one view of every store for any report period.
// A read-only lens, exactly like the Report center — one bounded unscoped fetch,
// all aggregation client-side via the unit-tested portfolio-rollup lib, and the
// consolidated numbers reconcile with Reports by construction. Drill-down opens
// the existing ReportModal pre-scoped, so the single-store math is the report's.
// Phase 3 adds the people-across-stores panel (expandable per-store splits) and
// the portfolio PDF/CSV export, reusing the records report's visual language.
export default function PortfolioView({ locations = [], locName = () => "—", incidents = [], onGoAdmin, onToast }) {
  const { profile, vendor } = useSession();
  const [preset, setPreset] = useState("week");
  const [refDate, setRefDate] = useState(today());
  const [customStart, setCustomStart] = useState(today());
  const [customEnd, setCustomEnd] = useState(today());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sort, setSort] = useState(null); // null = attention order; else { key, dir }
  const [drill, setDrill] = useState(null); // locId being drilled into
  const [reload, setReload] = useState(0); // bumped by Retry to re-run the fetch
  const [expanded, setExpanded] = useState(() => new Set()); // person keys with the per-store split open
  const [pdfBusy, setPdfBusy] = useState(false);

  const fiscalStartMonth = vendor.fiscalStartMonth ?? 1;
  const fiscalOpts = useMemo(() => ({ fiscalStartMonth }), [fiscalStartMonth]);

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

  // One bounded, unscoped fetch per window — every store's rows in one query;
  // store count never multiplies the read (see the spec's performance notes).
  useEffect(() => {
    if (!startISO || !endISO) { setRows([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setLoadError(null);
    fetchEntriesInRange(vendor.id, startISO, endISO)
      .then((es) => { if (alive) { setRows(es); setLoading(false); } })
      .catch((err) => { if (alive) { console.error(err); setLoadError("Couldn't load this period — try again."); setLoading(false); } });
    return () => { alive = false; };
  }, [vendor.id, startISO, endISO, reload]);

  const summary = useMemo(() => (range ? buildPortfolioSummary(rows, range) : null), [rows, range]);
  const board = useMemo(
    () => (range ? buildStoreLeaderboard(rows, range, locations, sort ? { sortBy: sort.key, dir: sort.dir } : {}) : null),
    [rows, range, locations, sort],
  );
  const employees = useMemo(() => (range ? buildEmployeeRollup(rows, range, locations) : null), [rows, range, locations]);

  // Header click: first desc, again asc, third back to the attention order.
  function toggleSort(key) {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "desc" };
      if (s.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }

  function togglePerson(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Raw rows for the whole portfolio window — every store, one CSV.
  function downloadCsv() {
    downloadCSV(entriesToCSV(rows), `duocount-portfolio-${range.key}.csv`);
  }

  // One-page portfolio PDF: the consolidated close, the leaderboard exactly as
  // sorted on screen, and the people-across-stores table with per-store splits.
  // Reuses the records report's visual language (DC mark, styles) so the two
  // documents read as one family; numbers reconcile with each store's report by
  // construction.
  async function downloadPdf() {
    if (!range || !summary || !board || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { pdf, Document, Page, Text, View, StyleSheet } = await import("@react-pdf/renderer");
      const s = StyleSheet.create({
        page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#1a1c2e" },
        brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
        mark: { width: 22, height: 22, borderRadius: 4, backgroundColor: "#b8863b", alignItems: "center", justifyContent: "center", marginRight: 7 },
        markText: { color: "#1a1c2e", fontFamily: "Helvetica-Bold", fontSize: 11 },
        h1: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 2 },
        meta: { color: "#666", marginBottom: 2, fontSize: 8 },
        section: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 5 },
        row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 3 },
        sub: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e4e2da", paddingVertical: 2, color: "#555" },
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
        cap: { fontSize: 7, color: "#888", marginTop: 4 },
      });
      const C = ({ w, children, style }) => (
        <Text style={[{ width: w }, ...(Array.isArray(style) ? style : style ? [style] : [])]}>{children}</Text>
      );
      const tone = (n) => (n < -0.005 ? s.neg : n > 0.005 ? s.pos : null);
      const sgn = (n, fmt = (x) => x) => `${n >= 0 ? "+" : ""}${fmt(n)}`;
      const pdfPct = (r, d = 0) => (r == null ? "—" : `${(r * 100).toFixed(d)}%`);

      const doc = (
        <Document title={`duocount-portfolio-${range.key}`}>
          <Page size="A4" style={s.page}>
            <View style={s.brandRow}>
              <View style={s.mark}><Text style={s.markText}>DC</Text></View>
              <Text style={s.h1}>{vendor.name} — Portfolio Report</Text>
            </View>
            <Text style={s.meta}>Store code: {vendor.slug} · {locations.length} locations · {range.startISO} → {range.endISO}</Text>
            <Text style={s.meta}>{range.label} · generated by {profile.name} at {new Date().toLocaleString()}</Text>

            {summary.empty && <Text style={s.empty}>No activity recorded in this period.</Text>}

            <View style={s.kpis}>
              <View style={s.kpi}><Text style={[s.kpiV, tone(summary.cash.netDiff)]}>{sgn(summary.cash.netDiff, money)}</Text><Text style={s.kpiL}>Net over/short</Text></View>
              <View style={s.kpi}><Text style={s.kpiV}>{money(summary.cash.sales)}</Text><Text style={s.kpiL}>Cash sales</Text></View>
              <View style={s.kpi}><Text style={s.kpiV}>{money(summary.scratch.dollars)}</Text><Text style={s.kpiL}>Scratch $</Text></View>
              <View style={s.kpi}><Text style={[s.kpiV, summary.inventory.netShrink < 0 ? s.neg : null]}>{summary.inventory.netShrink} u</Text><Text style={s.kpiL}>Net shrink</Text></View>
              <View style={[s.kpi, { marginRight: 0 }]}><Text style={s.kpiV}>{Math.round(summary.integrity.verificationRate * 100)}%</Text><Text style={s.kpiL}>Verified</Text></View>
            </View>

            <Text style={s.section}>Store leaderboard{sort ? "" : " — ranked by needs-attention"}</Text>
            <View style={s.head}><C w="6%">#</C><C w="24%">Store</C><C w="10%">Counts</C><C w="15%">Over/short</C><C w="12%">O/S rate</C><C w="11%">Shrink</C><C w="10%">Flags</C><C w="12%">Verified</C></View>
            {board.rows.map((r) => (
              <View key={r.locId} style={s.row}>
                <C w="6%">{r.rank}</C><C w="24%">{r.locName}</C><C w="10%">{r.total}</C>
                <C w="15%" style={tone(r.cashNet)}>{sgn(r.cashNet, money)}</C>
                <C w="12%" style={tone(r.cashNetRate ?? 0)}>{pdfPct(r.cashNetRate, 1)}</C>
                <C w="11%" style={r.invShrink < 0 ? s.neg : null}>{r.invShrink}</C>
                <C w="10%">{pdfPct(r.flagRate)}</C>
                <C w="12%">{r.total ? pdfPct(r.verificationRate) : "—"}</C>
              </View>
            ))}
            <View style={s.totals}>
              <C w="6%"> </C><C w="24%">All stores</C><C w="10%">{board.total.total}</C>
              <C w="15%" style={tone(board.total.cashNet)}>{sgn(board.total.cashNet, money)}</C>
              <C w="12%" style={tone(board.total.cashNetRate ?? 0)}>{pdfPct(board.total.cashNetRate, 1)}</C>
              <C w="11%" style={board.total.invShrink < 0 ? s.neg : null}>{board.total.invShrink}</C>
              <C w="10%">{pdfPct(board.total.flagRate)}</C>
              <C w="12%">{board.total.total ? pdfPct(board.total.verificationRate) : "—"}</C>
            </View>
            <Text style={s.cap}>O/S rate = over/short per cash-sales dollar. Shrink is units, not dollars. Each row equals that store&apos;s own records report for this period.</Text>

            {employees && employees.rows.length > 0 && (<>
              <Text style={s.section}>People across stores — most short first</Text>
              <View style={s.head}><C w="30%">Person</C><C w="12%">Entries</C><C w="16%">Over/short</C><C w="12%">Shorts</C><C w="16%">Scratch $</C><C w="14%">Verified</C></View>
              {employees.rows.map((p) => (
                <Fragment key={p.key}>
                  <View style={s.row}>
                    <C w="30%">{p.name}</C><C w="12%">{p.entries}</C>
                    <C w="16%" style={tone(p.cashNet)}>{sgn(p.cashNet, money)}</C>
                    <C w="12%">{p.shorts}</C><C w="16%">{money(p.scratchDollars)}</C>
                    <C w="14%">{pdfPct(p.verificationRate)}</C>
                  </View>
                  {p.byLocation.length > 1 && p.byLocation.map((l, i) => (
                    <View key={i} style={s.sub}>
                      <C w="30%">    ↳ {l.locationName}</C><C w="12%">{l.entries}</C>
                      <C w="16%" style={tone(l.cashNet)}>{sgn(l.cashNet, money)}</C>
                      <C w="12%">{l.shorts}</C><C w="16%">{money(l.scratchDollars)}</C>
                      <C w="14%">{pdfPct(l.verificationRate)}</C>
                    </View>
                  ))}
                </Fragment>
              ))}
            </>)}

            <View style={s.sig}>
              <View style={s.sigLine}><Text>Prepared by · date</Text></View>
              <View style={s.sigLine}><Text>Reviewed by (owner) · date</Text></View>
            </View>
          </Page>
        </Document>
      );
      const blob = await pdf(doc).toBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `duocount-portfolio-${range.key}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error(err);
      onToast?.("PDF failed — try the CSV");
    }
    setPdfBusy(false);
  }

  if (locations.length < 2) {
    return (
      <div className="card">
        <EmptyState icon={<IconChart />} title="Your portfolio starts at two stores"
          subtitle="This view compares every location side by side — over/short, shrink, and verification, ranked by what needs attention. Add a second location to light it up."
          action={onGoAdmin ? { label: "Add a location in Admin →", onClick: onGoAdmin } : undefined} />
      </div>
    );
  }

  const ready = !!range && !loading && !loadError && summary && board;

  return (
    <div className="space-y-4">
      {/* Period picker — the same controls as Reports, so periods mean the same thing */}
      <div className="card p-4 space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-[15px]">Portfolio</h2>
          <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">All {locations.length} stores</span>
        </div>
        {/* On phones the ◀ label ▶ stepper can't share a half-column with the
            Period select — the label wraps word-per-line. Stack to one column
            below sm (the Reports modal already uses this full-width shape). */}
        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
          <Field label="Period">
            <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          {preset === "custom" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start"><input type="date" className="input" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} /></Field>
              <Field label="End"><input type="date" className="input" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} /></Field>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <button className="btn-ghost px-3 py-2" onClick={() => setRefDate(stepPeriod(preset, refDate, -1, fiscalOpts))} aria-label="Previous period"><span aria-hidden="true">◀</span></button>
              <div className="flex-1 text-center pb-1">
                <div className="font-semibold text-sm leading-tight">{range ? range.label : "—"}</div>
                {range && <div className="text-[10px] text-muted font-mono leading-tight">{range.startISO} → {range.endISO}</div>}
              </div>
              <button className="btn-ghost px-3 py-2" onClick={() => setRefDate(stepPeriod(preset, refDate, 1, fiscalOpts))} aria-label="Next period"><span aria-hidden="true">▶</span></button>
            </div>
          )}
        </div>
        {fiscalStartMonth !== 1 && preset !== "custom" && FISCAL_PRESETS.has(preset) && (
          <p className="text-[11px] text-muted -mt-1">Fiscal year starts {MONTHS[fiscalStartMonth - 1]}.</p>
        )}
      </div>

      {!range ? (
        <div className="card p-4 text-sm text-neg">End date is before the start date.</div>
      ) : loading ? (
        <div className="card p-6 text-center text-sm text-muted" aria-live="polite">Loading {range.label}…</div>
      ) : loadError ? (
        <div className="card p-4 flex items-center justify-between gap-3">
          <span className="text-sm text-neg">{loadError}</span>
          <button className="btn-ghost w-auto px-4" onClick={() => setReload((n) => n + 1)}>Retry</button>
        </div>
      ) : ready && (
        <>
          {/* Consolidated close — identical to the report's scope-All numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Net over/short" value={`${summary.cash.netDiff >= 0 ? "+" : ""}${money(summary.cash.netDiff)}`} tone={toneOf(summary.cash.netDiff)} />
            <Kpi label="Cash sales" value={money(summary.cash.sales)} />
            <Kpi label="Scratch dollars" value={money(summary.scratch.dollars)} />
            <Kpi label="Net shrink" value={`${summary.inventory.netShrink} units`} tone={toneOf(summary.inventory.netShrink)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Total counts" value={summary.counts.total} small />
            <Kpi label="Open flags · disputes" value={`${summary.integrity.flagged} · ${summary.integrity.disputed}`} small
              tone={summary.integrity.flagged + summary.integrity.disputed > 0 ? "text-neg" : "text-fg"} />
            <Kpi label="Verified" value={pct(summary.integrity.verificationRate, 0)} small />
          </div>

          {/* Store leaderboard */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
              <h3 className="font-semibold text-[14px]">Store leaderboard</h3>
              <span className="text-[11px] text-muted">
                {sort ? "Tap the column again to flip or reset" : "Ranked by needs-attention"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[560px]">
                <thead className="bg-panel text-muted text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-8">#</th>
                    <th className="text-left font-semibold px-3 py-2">Store</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="text-right font-semibold px-3 py-2"
                        aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                        <button type="button" onClick={() => toggleSort(c.key)} title={c.title}
                          className={`inline-flex items-center gap-1 uppercase tracking-wide ${sort?.key === c.key ? "text-fg" : "hover:text-fg"}`}>
                          {c.label}{sort?.key === c.key && <span aria-hidden="true">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((r) => (
                    <tr key={r.locId} className="border-t border-line-soft hover:bg-subtle cursor-pointer"
                      onClick={() => setDrill(r.locId)}>
                      <td className="px-3 py-2.5 font-mono text-muted">{r.rank}</td>
                      <td className="px-3 py-2.5 font-semibold">
                        <button type="button" className="text-left hover:underline" onClick={(e) => { e.stopPropagation(); setDrill(r.locId); }}>
                          {r.locName}
                        </button>
                        {r.total === 0 && <span className="ml-1.5 text-[11px] text-faint font-normal">idle</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.total}</td>
                      <td className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold ${toneOf(r.cashNet)}`}>
                        {r.cashNet >= 0 ? "+" : ""}{money(r.cashNet)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${r.cashNetRate == null ? "text-faint" : toneOf(r.cashNetRate)}`}>{pct(r.cashNetRate)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${toneOf(r.invShrink)}`}>{r.invShrink}</td>
                      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${r.flagRate ? "text-neg" : r.flagRate == null ? "text-faint" : ""}`}>{pct(r.flagRate, 0)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${r.verificationRate == null ? "text-faint" : ""}`}>{r.total ? pct(r.verificationRate, 0) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2.5 text-[11px] text-muted border-t border-line-soft leading-relaxed">
              O/S rate = over/short per cash-sales dollar, so a big store and a small one compare fairly.
              Shrink is in <b>units</b>, not dollars. Tap a store for its full report — the numbers there are the
              same ones this table is built from.
            </p>
          </div>

          {/* People across stores — the split a single store's Dashboard can't show */}
          {employees && employees.rows.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
                <h3 className="font-semibold text-[14px]">People across stores</h3>
                <span className="text-[11px] text-muted">Most short first</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[560px]">
                  <thead className="bg-panel text-muted text-[11px] uppercase tracking-wide">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">Person</th>
                      <th className="text-right font-semibold px-3 py-2">Stores</th>
                      <th className="text-right font-semibold px-3 py-2">Entries</th>
                      <th className="text-right font-semibold px-3 py-2">Over/short</th>
                      <th className="text-right font-semibold px-3 py-2">Shorts</th>
                      <th className="text-right font-semibold px-3 py-2">Scratch $</th>
                      <th className="text-right font-semibold px-3 py-2">Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.rows.map((p) => (
                      <Fragment key={p.key}>
                        <tr className="border-t border-line-soft hover:bg-subtle cursor-pointer" onClick={() => togglePerson(p.key)}>
                          <td className="px-3 py-2.5 font-semibold">
                            <button type="button" aria-expanded={expanded.has(p.key)}
                              className="inline-flex items-center gap-1.5 text-left"
                              onClick={(e) => { e.stopPropagation(); togglePerson(p.key); }}>
                              <span aria-hidden="true" className={`text-muted text-[11px] transition-transform ${expanded.has(p.key) ? "rotate-90" : ""}`}>▶</span>
                              {p.name}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                            {p.byLocation.length}
                            {p.byLocation.length > 1 && <span aria-hidden="true" className="ml-1 text-brass">●</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums">{p.entries}</td>
                          <td className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold ${toneOf(p.cashNet)}`}>
                            {p.cashNet >= 0 ? "+" : ""}{money(p.cashNet)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${p.shorts ? "text-neg" : ""}`}>{p.shorts}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums">{money(p.scratchDollars)}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums">{pct(p.verificationRate, 0)}</td>
                        </tr>
                        {expanded.has(p.key) && p.byLocation.map((l, i) => (
                          <tr key={`${p.key}-${l.locationId || i}`} className="border-t border-line-soft bg-panel text-[12px] text-muted">
                            <td className="pl-9 pr-3 py-2">↳ {l.locationName}</td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{l.entries}</td>
                            <td className={`px-3 py-2 text-right font-mono tabular-nums ${toneOf(l.cashNet)}`}>
                              {l.cashNet >= 0 ? "+" : ""}{money(l.cashNet)}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono tabular-nums ${l.shorts ? "text-neg" : ""}`}>{l.shorts}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{money(l.scratchDollars)}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{pct(l.verificationRate, 0)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2.5 text-[11px] text-muted border-t border-line-soft leading-relaxed">
                A <span className="text-brass">●</span> marks someone who worked at more than one store — expand them
                to compare their record store by store. A different profile at each store is a training or coverage
                conversation, not a verdict.
              </p>
            </div>
          )}

          {/* Export the portfolio for the record */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="btn-ghost w-auto px-4 text-[13px]" onClick={downloadCsv}>⬇ Download CSV</button>
            <button className="btn-ghost w-auto px-4 text-[13px]" disabled={pdfBusy} onClick={downloadPdf}>
              {pdfBusy ? "Building PDF…" : "📄 Download PDF"}
            </button>
          </div>
        </>
      )}

      {drill && (
        <ReportModal locations={locations} locName={locName} incidents={incidents}
          initialLocId={drill} initialPreset={preset} initialRefDate={refDate}
          initialCustomStart={customStart} initialCustomEnd={customEnd}
          onClose={() => setDrill(null)} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone = "text-fg", small = false }) {
  return (
    <div className="card px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</div>
      <div className={`${small ? "text-base" : "text-xl"} font-bold font-mono mt-0.5 ${tone}`}>{value}</div>
    </div>
  );
}
