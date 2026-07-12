"use client";
import { useState } from "react";
import { parseCSV, guessColumns, reconcileSettlement } from "@/lib/settlement";
import { money } from "@/lib/utils";

function Stat({ label, value, tone }) {
  const color = tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : tone === "gold" ? "text-gold" : "text-fg";
  return (
    <div className="rounded-lg bg-subtle px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

export default function SettlementReconcile({ packs = [], onToast }) {
  const [table, setTable] = useState([]);
  const [fileName, setFileName] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [packCol, setPackCol] = useState(-1);
  const [amountCol, setAmountCol] = useState(-1);
  const [basis, setBasis] = useState("dollars");
  const [result, setResult] = useState(null);

  const headers = table[0] || [];
  const colOptions = headers.map((h, i) => ({ i, label: hasHeader ? (String(h).trim() || `Column ${i + 1}`) : `Column ${i + 1}` }));
  const fmt = (n) => (basis === "tickets" ? `${n}` : money(n));

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(reader.result);
      setTable(rows);
      setFileName(f.name);
      const guess = guessColumns(rows[0] || []);
      setPackCol(guess.packNumber);
      setAmountCol(guess.amount);
    };
    reader.readAsText(f);
  }

  function run() {
    if (packCol < 0 || amountCol < 0) return onToast?.("Pick the pack-number and amount columns");
    const dataRows = hasHeader ? table.slice(1) : table;
    const mapped = dataRows.map((r) => ({ packNumber: r[packCol], amount: r[amountCol] }));
    setResult(reconcileSettlement(packs, mapped, { basis }));
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px]">Lottery settlement reconciliation</h2>
        <p className="text-[13px] text-muted mt-0.5">Upload your state settlement/invoice CSV and match it against your recorded scratch-off packs — no fixed format, you map the columns.</p>
      </div>
      <div className="p-4 space-y-3.5">
        <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile}
          className="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-subtle file:text-fg file:font-semibold file:text-sm file:cursor-pointer" />

        {table.length > 0 && (
          <>
            <div className="text-[13px] text-muted">{fileName} · {table.length} rows</div>
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
              First row is a header
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Pack-number column</label>
                <select className="input" value={packCol} onChange={(e) => setPackCol(Number(e.target.value))}>
                  <option value={-1}>Select…</option>
                  {colOptions.map((c) => <option key={c.i} value={c.i}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Amount column</label>
                <select className="input" value={amountCol} onChange={(e) => setAmountCol(Number(e.target.value))}>
                  <option value={-1}>Select…</option>
                  {colOptions.map((c) => <option key={c.i} value={c.i}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Compare the amount against</label>
              <select className="input" value={basis} onChange={(e) => setBasis(e.target.value)}>
                <option value="dollars">Gross dollars (tickets sold × price)</option>
                <option value="tickets">Tickets sold</option>
              </select>
            </div>
            <button className="btn-primary" onClick={run}>Reconcile</button>
          </>
        )}

        {result && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Matched" value={result.matched.length} tone="pos" />
              <Stat label="Discrepancies" value={result.discrepancies.length} tone={result.discrepancies.length ? "neg" : "muted"} />
              <Stat label="Unknown in file" value={result.unknown.length} tone={result.unknown.length ? "gold" : "muted"} />
              <Stat label="Settled, not billed" value={result.missing.length} tone={result.missing.length ? "gold" : "muted"} />
            </div>
            <div className="text-[13px] text-muted">
              File total <b className="font-mono text-fg">{fmt(result.totals.file)}</b> · net discrepancy{" "}
              <b className={`font-mono ${result.totals.delta ? "text-neg" : "text-fg"}`}>{result.totals.delta >= 0 ? "+" : ""}{fmt(result.totals.delta)}</b>
            </div>

            {result.discrepancies.length > 0 && (
              <div className="border border-line rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-panel text-[11px] uppercase tracking-wide text-muted font-semibold">Discrepancies</div>
                <div className="overflow-auto max-h-[18rem]">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
                      <th className="px-3 py-2 font-semibold">Pack</th>
                      <th className="px-3 py-2 font-semibold text-right">File</th>
                      <th className="px-3 py-2 font-semibold text-right">Recorded</th>
                      <th className="px-3 py-2 font-semibold text-right">Δ</th>
                    </tr></thead>
                    <tbody>
                      {result.discrepancies.map((d, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-3 py-2 font-mono">{d.packNumber}{d.game ? <span className="text-muted"> · {d.game}</span> : ""}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmt(d.fileAmount)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmt(d.recorded)}</td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold ${d.delta < 0 ? "text-neg" : "text-pos"}`}>{d.delta >= 0 ? "+" : ""}{fmt(d.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.unknown.length > 0 && (
              <p className="text-[13px] text-muted"><b className="text-gold">In the file, not in your records:</b> {result.unknown.map((u) => u.packNumber).join(", ")}</p>
            )}
            {result.missing.length > 0 && (
              <p className="text-[13px] text-muted"><b className="text-gold">Settled but not on the file:</b> {result.missing.map((m) => m.packNumber).join(", ")}</p>
            )}
            {result.onFileNotYetSettled?.length > 0 && (
              <p className="text-[13px] text-muted"><b className="text-gold">On the file, not settled yet:</b> {result.onFileNotYetSettled.map((m) => m.packNumber).join(", ")}</p>
            )}
            {result.unparsed?.length > 0 && (
              <p className="text-[13px] text-neg"><b>Couldn&apos;t read the amount for {result.unparsed.length} row{result.unparsed.length > 1 ? "s" : ""}</b> — check the amount-column mapping or the file&apos;s number format.</p>
            )}
            {result.discrepancies.length === 0 && result.unknown.length === 0 && result.missing.length === 0 && !result.onFileNotYetSettled?.length && !result.unparsed?.length && (
              <p className="text-[13px] text-pos font-semibold">✓ Everything reconciles.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
