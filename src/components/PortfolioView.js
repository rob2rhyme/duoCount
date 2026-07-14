"use client";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/utils";
import { PRESETS, periodRange, stepPeriod } from "@/lib/report-period";
import { buildPortfolioSummary, buildStoreLeaderboard } from "@/lib/portfolio-rollup";
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
export default function PortfolioView({ locations = [], locName = () => "—", incidents = [], onGoAdmin }) {
  const { vendor } = useSession();
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

  // Header click: first desc, again asc, third back to the attention order.
  function toggleSort(key) {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "desc" };
      if (s.dir === "desc") return { key, dir: "asc" };
      return null;
    });
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
        <div className="grid grid-cols-2 gap-3">
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
