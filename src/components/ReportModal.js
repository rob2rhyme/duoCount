"use client";
import { useEffect, useMemo, useState } from "react";
import { money, entriesToCSV, downloadCSV } from "@/lib/utils";
import { useSession } from "./SessionProvider";
import { useModalA11y } from "@/lib/use-modal-a11y";
import Field from "./Field";
import { PRESETS, periodRange, stepPeriod } from "@/lib/report-period";
import { buildPeriodReport } from "@/lib/report-build";
import { fetchEntriesInRange } from "@/lib/data";

const today = () => new Date().toISOString().slice(0, 10);
const slug = (s) => String(s || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "x";

// The Reports center: pick any period (day … year, or custom dates) and a
// location scope, preview what it contains, and export it for the record.
// Reports only READ the append-only log (one-shot, via fetchEntriesInRange) and
// render client-side — they never mutate the signed history.
export default function ReportModal({ locations = [], locName = () => "—", onClose, onToast }) {
  const { profile, vendor } = useSession();
  const panelRef = useModalA11y(onClose);

  const [preset, setPreset] = useState("day");
  const [refDate, setRefDate] = useState(today());
  const [customStart, setCustomStart] = useState(today());
  const [customEnd, setCustomEnd] = useState(today());
  const [locId, setLocId] = useState("all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Resolve the selected period; an invalid custom range (end before start)
  // yields null so the UI can flag it and disable the exports.
  const range = useMemo(() => {
    try {
      return preset === "custom"
        ? periodRange("custom", null, { start: customStart, end: customEnd })
        : periodRange(preset, refDate);
    } catch {
      return null;
    }
  }, [preset, refDate, customStart, customEnd]);

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

  const report = useMemo(() => (range ? buildPeriodReport(rows, range, locId) : null), [rows, range, locId]);

  const locLabel = locId === "all" ? "All locations" : locName(locId);
  const fileBase = `duocount-report-${locId === "all" ? "all" : slug(locName(locId))}-${range ? range.key : "period"}`;
  const ready = !!range && !loading && !loadError;

  // An empty period is a valid record too — it exports a header-only CSV.
  function downloadCsv() {
    downloadCSV(entriesToCSV(rows), `${fileBase}.csv`);
  }

  // Print-friendly HTML (browser print -> paper or save-as-PDF), period-formatted.
  // A period-native @react-pdf export lands in the next phase.
  function printReport() {
    if (!range || !report) return; // an empty period still prints, with a "no activity" line
    const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const cash = rows.filter((e) => e.kind === "cash");
    const scratch = rows.filter((e) => e.kind === "scratch");
    const inv = rows.filter((e) => e.kind === "inventory");
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return onToast?.("Allow pop-ups to print");
    const cashRows = cash.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.drawerName)}</td><td>${esc(e.by)}</td><td>${money(e.sales)}</td><td>${money(e.paidout)}</td><td>${money(e.expected)}</td><td>${money(e.counted)}</td><td>${e.diff >= 0 ? "+" : ""}${money(e.diff)}</td><td>${esc(e.verifiedBy || "")}</td></tr>`).join("");
    const scratchRows = scratch.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.game)}</td><td>${esc(e.pack)}</td><td>${money(e.price)}</td><td>${e.sold}</td><td>${money(e.dollars)}</td><td>${esc(e.by)}</td></tr>`).join("");
    const invRows = inv.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.itemName)}</td><td>${e.startQty ?? ""}</td><td>${e.counted}</td><td>${e.diff >= 0 ? "+" : ""}${e.diff}</td></tr>`).join("");
    w.document.write(`<!doctype html><title>${esc(fileBase)}</title>
      <style>body{font:12px Helvetica,Arial;margin:32px;color:#1a1c2e}h1{font-size:18px;margin:0}p{color:#666;margin:2px 0}
      h2{font-size:13px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #ccc}th{border-bottom:2px solid #1a1c2e}
      .sig{display:flex;justify-content:space-between;margin-top:48px}.sig div{width:44%;border-top:1px solid #1a1c2e;padding-top:4px;font-size:10px;color:#666}</style>
      <h1>${esc(vendor.name)} — Records Report</h1>
      <p>Store code: ${esc(vendor.slug)} · ${esc(locLabel)} · ${esc(range.label)} (${range.startISO} → ${range.endISO})</p>
      <p>Generated by ${esc(profile.name)} at ${new Date().toLocaleString()}</p>
      ${rows.length === 0 ? "<p><i>No activity recorded for this period.</i></p>" : ""}
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
              <button className="btn-ghost px-3 py-2" onClick={() => setRefDate(stepPeriod(preset, refDate, -1))} aria-label="Previous period"><span aria-hidden="true">◀</span></button>
              <div className="flex-1 text-center">
                <div className="font-semibold text-sm">{range ? range.label : "—"}</div>
                {range && <div className="text-[11px] text-muted font-mono">{range.startISO} → {range.endISO}</div>}
              </div>
              <button className="btn-ghost px-3 py-2" onClick={() => setRefDate(stepPeriod(preset, refDate, 1))} aria-label="Next period"><span aria-hidden="true">▶</span></button>
            </div>
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
                {report.empty && <div className="text-muted italic mt-1">No activity in this period.</div>}
              </>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!ready} onClick={downloadCsv}>Download CSV</button>
            <button className="btn-ghost flex-1" disabled={!ready} onClick={printReport}>Print</button>
          </div>
          <p className="text-[11px] text-muted">A read-only snapshot of recorded counts for the period — saved for your records.</p>
        </div>
      </div>
    </div>
  );
}
