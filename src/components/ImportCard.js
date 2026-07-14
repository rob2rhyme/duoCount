"use client";
import { useMemo, useRef, useState } from "react";
import { parseCsv, guessMapping, validateItems, validateStaff, validateBaselines, importTargets, missingRequired } from "@/lib/import-parse";
import { apiImport } from "@/lib/data";
import { useSession } from "./SessionProvider";

// Owner-only "Import / migrate" card (Phase 1: items, Phase 2: staff, Phase 3:
// opening inventory counts). Parses a CSV in the browser, lets the owner map
// columns onto DuoCount's fields, shows a live per-row dry-run preview (the same
// validators the server re-runs at commit), and writes the valid rows through
// POST /api/import. Nothing is written until Commit; the server re-validates
// against live state, so the preview never gates a write on its own.

const STATUS_STYLE = { create: "text-pos", update: "text-gold", skip: "text-muted", error: "text-neg" };
const PREVIEW_CAP = 60;

const TYPES = [
  { id: "items", label: "Items", noun: "item" },
  { id: "staff", label: "Staff", noun: "staff member" },
  { id: "baselines", label: "Opening counts", noun: "opening count" },
];

export default function ImportCard({ locations = [], items = [], staff = [], entries = [], onToast }) {
  const { profile } = useSession();
  const [type, setType] = useState("items");
  const [parsed, setParsed] = useState(null); // { headers, rows, fileName }
  const [mapping, setMapping] = useState({});
  const [parseError, setParseError] = useState("");
  const [allowPartial, setAllowPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const activeLocations = locations.filter((l) => l.active !== false);
  const defaultLocationId = activeLocations.length === 1 ? activeLocations[0].id : null;

  // Write-once guard for baselines: items that already have any inventory entry.
  const baselinedItemIds = useMemo(
    () => [...new Set(entries.filter((e) => e.kind === "inventory").map((e) => e.itemId).filter(Boolean))],
    [entries]
  );

  const report = useMemo(() => {
    if (!parsed) return null;
    if (type === "items") return validateItems(parsed.rows, mapping, { locations, existingItems: items, defaultLocationId });
    if (type === "staff") return validateStaff(parsed.rows, mapping, { locations, existingStaff: staff, defaultLocationId });
    return validateBaselines(parsed.rows, mapping, {
      locations, items, existingStaff: staff, baselinedItemIds,
      defaultBy: { id: profile.id, name: profile.name, role: profile.role },
    });
  }, [parsed, mapping, type, locations, items, staff, baselinedItemIds, defaultLocationId, profile]);

  const targets = importTargets(type);
  const missing = missingRequired(mapping, type);
  const writable = report ? report.summary.create + report.summary.update : 0;
  const noun = TYPES.find((t) => t.id === type)?.noun || "row";
  // Baselines append to the permanent log, so errors block the whole commit
  // unless the owner explicitly opts into importing just the valid rows.
  const partialBlocked = type === "baselines" && report && report.summary.error > 0 && !allowPartial;

  function reset() {
    setParsed(null); setMapping({}); setParseError(""); setAllowPartial(false);
    if (fileRef.current) fileRef.current.value = "";
  }
  function pickType(t) {
    if (t === type) return;
    setType(t); reset();
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(""); setParsed(null); setMapping({});
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { headers, rows } = parseCsv(String(reader.result || ""));
        if (!rows.length) throw new Error("No data rows found under the header row.");
        setParsed({ headers, rows, fileName: file.name });
        setMapping(guessMapping(headers, type));
      } catch (err) { setParseError(err.message || "Couldn't read that file."); }
    };
    reader.onerror = () => setParseError("Couldn't read that file.");
    reader.readAsText(file);
  }

  async function commit() {
    if (missing.length || !writable || busy || partialBlocked) return;
    setBusy(true);
    try {
      const r = await apiImport({ type, mode: "commit", mapping, rows: parsed.rows, allowPartial });
      const c = r.counts || {};
      onToast?.(`Imported ${c.create || 0} new ${noun}${c.create === 1 ? "" : "s"}` +
        (c.update ? `, updated ${c.update}` : "") + (c.error ? `, ${c.error} skipped` : ""));
      reset();
    } catch (e) { onToast?.(e.message || "Import failed — check your connection"); }
    setBusy(false);
  }

  const detail = (f) => {
    if (type === "items") return f.locationName ? `${f.locationName}` : "";
    if (type === "staff") return [f.role, f.locationName || (f.role === "manager" ? "all locations" : ""), f.hasPin ? "sets PIN" : "no PIN", f.email].filter(Boolean).join(" · ");
    return [f.quantity != null ? `${f.quantity} ${f.unit}${f.quantity === 1 ? "" : "s"}` : "", f.locationName, f.date, f.by ? `by ${f.by}` : ""].filter(Boolean).join(" · ");
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px]">Import / migrate</h2>
        <p className="text-[13px] text-muted mt-0.5">
          Bring your catalog or roster in from a CSV (from Excel, your old POS, a spreadsheet) instead of keying it
          in one at a time. This writes your store&apos;s <b>real</b> records — preview every row first.
        </p>
      </div>
      <div className="p-4 space-y-4">
        {/* Type picker */}
        <div className="flex gap-1.5 bg-panel border border-line rounded-xl p-1">
          {TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => pickType(t.id)}
              className={`flex-1 px-3 py-2 rounded-lg font-semibold text-sm transition ${type === t.id ? "bg-fg text-surface" : "text-muted hover:text-fg"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {type === "items" && activeLocations.length === 0 && (
          <p className="text-[13px] text-neg">Add a store location above before importing items — every item lands at a location.</p>
        )}
        {type === "staff" && (
          <p className="text-[13px] text-muted">
            PINs are optional — import names, roles, and locations now, and set each person&apos;s PIN in Admin (or at
            first sign-in). Owner rows are never imported. An existing person (matched by name) is updated, never duplicated.
          </p>
        )}
        {type === "baselines" && (
          <p className="text-[13px] text-muted">
            An opening count records what&apos;s on each shelf today, so your first real count has a baseline to compare
            against. Import your <b>items first</b> — each row must name a tracked item. Opening counts land in the
            permanent log like any signed count: an item that already has a count is skipped, and a wrong number is
            corrected with a fresh count, never an edit.
          </p>
        )}

        <div>
          <label className="label">{TYPES.find((t) => t.id === type)?.label} CSV file</label>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile}
            className="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-line file:bg-subtle file:text-fg file:font-semibold file:text-[13px] file:cursor-pointer" />
          <p className="text-xs text-muted mt-1.5">A header row plus one {noun} per line. Columns can be in any order — you map them next.</p>
        </div>

        {parseError && <p role="alert" className="text-[13px] text-neg">{parseError}</p>}

        {parsed && (
          <>
            <div className="text-[13px] text-muted">
              <b className="text-fg">{parsed.fileName}</b> — {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}, {parsed.headers.length} column{parsed.headers.length === 1 ? "" : "s"}.
            </div>

            {/* Column mapping */}
            <div className="space-y-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Match your columns</div>
              {targets.map((t) => (
                <div key={t.field} className="grid grid-cols-2 gap-3 items-center">
                  <label className="text-sm font-medium">
                    {t.label}{t.required && <span className="text-neg"> *</span>}
                    {t.field === "location" && type === "items" && activeLocations.length === 1 && (
                      <span className="block text-[11px] text-muted font-normal">Optional — defaults to {activeLocations[0].name}</span>
                    )}
                  </label>
                  <select className="input" value={mapping[t.field] || ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [t.field]: e.target.value || undefined }))}>
                    <option value="">{t.required ? "— choose a column —" : "— skip —"}</option>
                    {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Dry-run preview */}
            {report && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold">
                  <span className="text-pos">{report.summary.create} create</span>
                  <span className="text-gold">{report.summary.update} update</span>
                  <span className="text-muted">{report.summary.skip} skip</span>
                  <span className="text-neg">{report.summary.error} error</span>
                </div>
                <div className="border border-line rounded-xl overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-[13px]">
                      <thead className="bg-panel text-muted text-[11px] uppercase tracking-wide sticky top-0">
                        <tr>
                          <th className="text-left font-semibold px-2.5 py-2 w-12">Line</th>
                          <th className="text-left font-semibold px-2.5 py-2 w-16">Status</th>
                          <th className="text-left font-semibold px-2.5 py-2">{type === "staff" ? "Person" : "Item"}</th>
                          <th className="text-left font-semibold px-2.5 py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.rows.slice(0, PREVIEW_CAP).map((r) => (
                          <tr key={r.line} className="border-t border-line-soft align-top">
                            <td className="px-2.5 py-2 font-mono text-muted">{r.line}</td>
                            <td className={`px-2.5 py-2 font-semibold ${STATUS_STYLE[r.status] || ""}`}>{r.status}</td>
                            <td className="px-2.5 py-2">
                              {r.fields.name || <span className="text-faint">—</span>}
                              {detail(r.fields) && <span className="text-muted"> · {detail(r.fields)}</span>}
                            </td>
                            <td className="px-2.5 py-2 text-muted">{r.messages.join(" ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {report.rows.length > PREVIEW_CAP && (
                    <div className="px-2.5 py-2 text-[12px] text-muted border-t border-line-soft bg-panel">
                      Showing the first {PREVIEW_CAP} of {report.rows.length} rows — all of them import on commit.
                    </div>
                  )}
                </div>
              </div>
            )}

            {missing.length > 0 && (
              <p className="text-[13px] text-neg">Map a column for <b>{targets.find((t) => t.field === missing[0])?.label}</b> to continue.</p>
            )}

            {type === "baselines" && report && report.summary.error > 0 && (
              <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={allowPartial}
                  onChange={(e) => setAllowPartial(e.target.checked)} />
                <span className="text-muted leading-snug">
                  <b className="text-fg">Import the valid rows anyway.</b> Opening counts can&apos;t be un-written, so
                  the safer default is to fix the {report.summary.error} error row{report.summary.error === 1 ? "" : "s"} in
                  your CSV and re-upload — re-running skips anything already imported.
                </span>
              </label>
            )}

            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy || !!missing.length || !writable || partialBlocked} onClick={commit}>
                {busy ? "Importing…" : partialBlocked ? "Fix errors to import" : writable ? `Import ${writable} row${writable === 1 ? "" : "s"}` : "Nothing to import"}
              </button>
              <button className="btn-ghost w-auto px-4" disabled={busy} onClick={reset}>Cancel</button>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              {type === "baselines"
                ? "Each opening count is a signed, permanent entry (diff 0, nothing flags). Re-running is safe — an item that already has any inventory count is skipped, never double-written."
                : <>Rows marked <b>error</b> are skipped with a reason and never block the rest. Re-running is safe —
                  records already in your store are matched and updated or skipped, never duplicated
                  {type === "staff" && ", and an existing PIN is never changed by import"}.</>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
