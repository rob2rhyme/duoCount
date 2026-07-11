"use client";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from "recharts";
import { money, toDate } from "@/lib/utils";
import { detectPatterns } from "@/lib/patterns";
import { useSession } from "./SessionProvider";
import ReportModal from "./ReportModal";

function Stat({ label, value, tone }) {
  const color = tone === "neg" ? "text-red-600" : tone === "pos" ? "text-green-700" : "text-ink";
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[11px] text-neutral-500 uppercase tracking-wide font-semibold mt-1">{label}</div>
    </div>
  );
}

export default function Dashboard({ entries, locations = [], locName = () => "—", onOpenLog, onToast }) {
  const { isManager } = useSession();
  const [reportOpen, setReportOpen] = useState(false);
  // Recurring signals (repeat shorts, drawer hot-spots, backlog, shrink
  // streaks) — manager-facing only, so employees never see them computed.
  const patterns = useMemo(() => (isManager ? detectPatterns(entries) : []), [entries, isManager]);
  const a = useMemo(() => {
    const cash = entries.filter((e) => e.kind === "cash");
    const scratch = entries.filter((e) => e.kind === "scratch");
    const inv = entries.filter((e) => e.kind === "inventory");

    const netDiff = cash.reduce((s, e) => s + (e.diff || 0), 0);
    const shorts = cash.filter((e) => e.diff < -0.005).length;
    const overs = cash.filter((e) => e.diff > 0.005).length;
    const scratchDollars = scratch.reduce((s, e) => s + (e.dollars || 0), 0);
    const cashSales = cash.reduce((s, e) => s + (e.sales || 0), 0);
    const missingUnits = inv.reduce((s, e) => s + (e.diff < 0 ? -e.diff : 0), 0);

    // tier one: attention counters + top-10 needs-attention list
    const openVariances = entries.filter((e) => e.varianceStatus === "open").length;
    const openDisputes = entries.filter((e) => e.disputeStatus === "open").length;
    const unverified = entries.filter((e) => !e.verifiedBy).length;
    const dayMs = 24 * 60 * 60 * 1000;
    const attention = entries
      .map((e) => {
        const why =
          e.varianceStatus === "open" ? "Variance open"
          : e.disputeStatus === "open" ? "Dispute open"
          : !e.verifiedBy && toDate(e.ts) && Date.now() - toDate(e.ts).getTime() > dayMs ? "Unverified > 24h"
          : null;
        return why ? { e, why } : null;
      })
      .filter(Boolean)
      .slice(0, 10);
    const verified = entries.filter((e) => e.verifiedBy).length;
    const verifyRate = entries.length ? Math.round((verified / entries.length) * 100) : 0;

    // by day (last 14 with data)
    const byDay = {};
    cash.forEach((e) => {
      const d = e.date || (toDate(e.ts)?.toISOString().slice(0, 10)) || "?";
      byDay[d] = byDay[d] || { date: d, diff: 0, sales: 0 };
      byDay[d].diff += e.diff || 0;
      byDay[d].sales += e.sales || 0;
    });
    const dayRows = Object.values(byDay).sort((x, y) => x.date.localeCompare(y.date)).slice(-14)
      .map((r) => ({ ...r, diff: Math.round(r.diff * 100) / 100, sales: Math.round(r.sales * 100) / 100, label: r.date.slice(5) }));

    // by employee
    const byEmp = {};
    entries.forEach((e) => {
      byEmp[e.by] = byEmp[e.by] || { name: e.by, entries: 0, diff: 0, shorts: 0, scratch: 0 };
      byEmp[e.by].entries++;
      if (e.kind === "cash") { byEmp[e.by].diff += e.diff || 0; if (e.diff < -0.005) byEmp[e.by].shorts++; }
      if (e.kind === "scratch") byEmp[e.by].scratch += e.dollars || 0;
    });
    const empRows = Object.values(byEmp)
      .map((r) => ({ ...r, diff: Math.round(r.diff * 100) / 100, scratch: Math.round(r.scratch * 100) / 100 }))
      .sort((x, y) => x.diff - y.diff);

    // by item (inventory)
    const byItem = {};
    inv.forEach((e) => {
      const key = e.itemName || "(item)";
      byItem[key] = byItem[key] || { name: key, unit: e.unit || "unit", entries: 0, diff: 0, missing: 0 };
      byItem[key].entries++;
      byItem[key].diff += e.diff || 0;
      if (e.diff < 0) byItem[key].missing++;
    });
    const itemRows = Object.values(byItem).sort((x, y) => x.diff - y.diff);

    // by drawer (cash & scratch only — inventory has no drawer)
    const byDrawer = {};
    entries.forEach((e) => {
      if (e.kind === "inventory") return;
      const key = e.drawerName || "(no drawer)";
      byDrawer[key] = byDrawer[key] || { name: key, entries: 0, diff: 0, cash: 0, scratch: 0 };
      byDrawer[key].entries++;
      if (e.kind === "cash") { byDrawer[key].diff += e.diff || 0; byDrawer[key].cash += e.counted || 0; }
      if (e.kind === "scratch") byDrawer[key].scratch += e.dollars || 0;
    });
    const drawerRows = Object.values(byDrawer)
      .map((r) => ({ ...r, diff: Math.round(r.diff * 100) / 100, cash: Math.round(r.cash * 100) / 100, scratch: Math.round(r.scratch * 100) / 100 }))
      .sort((x, y) => y.entries - x.entries);

    // top scratch games
    const byGame = {};
    scratch.forEach((e) => { byGame[e.game] = (byGame[e.game] || 0) + (e.dollars || 0); });
    const gameRows = Object.entries(byGame).map(([name, v]) => ({ name, dollars: Math.round(v * 100) / 100 }))
      .sort((x, y) => y.dollars - x.dollars).slice(0, 6);

    return { count: entries.length, netDiff, shorts, overs, scratchDollars, cashSales, verifyRate, missingUnits, invCount: inv.length, openVariances, openDisputes, unverified, attention, dayRows, empRows, gameRows, drawerRows, itemRows };
  }, [entries]);

  const reportButton = isManager && (
    <div className="flex justify-end">
      <button className="btn-ghost text-[13px] px-3.5 py-2" onClick={() => setReportOpen(true)}>📄 End-of-day report</button>
    </div>
  );
  const reportModal = reportOpen && (
    <ReportModal entries={entries} locations={locations} locName={locName}
      onClose={() => setReportOpen(false)} onToast={onToast} />
  );

  if (!entries.length) {
    return (
      <div className="space-y-4">
        {reportButton}
        <div className="card text-center py-14 text-neutral-500">No activity yet. Once counts are logged, analytics appear here.</div>
        {reportModal}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reportButton}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total entries" value={a.count} />
        <Stat label="Net over/short" value={`${a.netDiff >= 0 ? "+" : ""}${money(a.netDiff)}`} tone={a.netDiff < -0.005 ? "neg" : a.netDiff > 0.005 ? "pos" : null} />
        <Stat label="Short counts" value={a.shorts} tone={a.shorts ? "neg" : null} />
        <Stat label="Verified" value={`${a.verifyRate}%`} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Open variances" value={a.openVariances} tone={a.openVariances ? "neg" : null} />
        <Stat label="Open disputes" value={a.openDisputes} tone={a.openDisputes ? "neg" : null} />
        <Stat label="Unverified" value={a.unverified} tone={null} />
      </div>

      {isManager && patterns.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#dcd8cc]">
            <h3 className="font-semibold text-[15px]">Patterns</h3>
            <p className="text-[12px] text-neutral-500 mt-0.5">Signals worth a look — not conclusions.</p>
          </div>
          {patterns.map((p) => (
            <div key={p.id} className="px-4 py-2.5 border-b border-[#dcd8cc] last:border-0 flex items-start gap-3">
              <span className={`pill flex-shrink-0 mt-0.5 ${p.severity === "high" ? "bg-red-100 text-red-600" : "bg-[#fbf6ec] text-brass-dk border border-brass/30"}`}>
                {p.severity === "high" ? "High" : "Watch"}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-sm">{p.title}</div>
                <div className="text-[12px] text-neutral-500">{p.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {a.attention.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#dcd8cc] flex items-center justify-between">
            <h3 className="font-semibold text-[15px]">Needs attention</h3>
            {onOpenLog && <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={onOpenLog}>Open the Log →</button>}
          </div>
          {a.attention.map(({ e, why }) => {
            const t = toDate(e.ts);
            const label = e.kind === "cash" ? (e.drawerName || "Drawer") : e.kind === "inventory" ? (e.itemName || "Item") : e.game;
            return (
              <div key={e.id} className="px-4 py-2.5 border-b border-[#dcd8cc] last:border-0 flex items-center gap-3 cursor-pointer hover:bg-[#faf8f2]"
                onClick={onOpenLog}>
                <span className={`pill flex-shrink-0 ${why === "Unverified > 24h" ? "bg-neutral-200 text-neutral-600" : "bg-red-100 text-red-600"}`}>{why}</span>
                <span className="font-medium text-sm truncate">{label}</span>
                <span className="text-[12px] text-neutral-500 font-mono ml-auto whitespace-nowrap">{e.by} · {t ? t.toLocaleDateString() : ""}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Cash sales logged" value={money(a.cashSales)} />
        <Stat label="Scratch-off sales" value={money(a.scratchDollars)} />
        <Stat label="Over counts" value={a.overs} tone={a.overs ? "pos" : null} />
        <Stat label="Staff active" value={a.empRows.length} />
      </div>
      {a.invCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Inventory counts" value={a.invCount} />
          <Stat label="Missing units" value={a.missingUnits} tone={a.missingUnits ? "neg" : null} />
        </div>
      )}

      <div className="card p-4">
        <h3 className="font-semibold text-[15px] mb-3">Daily over / short</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={a.dayRows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e2d8" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#8a8780" />
            <YAxis tick={{ fontSize: 11 }} stroke="#8a8780" />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 10, border: "1px solid #dcd8cc", fontSize: 13 }} />
            <Bar dataKey="diff" radius={[4, 4, 0, 0]}>
              {a.dayRows.map((r, i) => <Cell key={i} fill={r.diff < 0 ? "#b03a3a" : "#2f7d5b"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-[15px] mb-3">Cash sales trend</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={a.dayRows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e2d8" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#8a8780" />
            <YAxis tick={{ fontSize: 11 }} stroke="#8a8780" />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 10, border: "1px solid #dcd8cc", fontSize: 13 }} />
            <Line type="monotone" dataKey="sales" stroke="#b8863b" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {a.gameRows.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold text-[15px] mb-3">Top scratch-off games</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, a.gameRows.length * 42)}>
            <BarChart layout="vertical" data={a.gameRows} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e2d8" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#8a8780" />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} stroke="#8a8780" />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 10, border: "1px solid #dcd8cc", fontSize: 13 }} />
              <Bar dataKey="dollars" fill="#1a1c2e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#dcd8cc]"><h3 className="font-semibold text-[15px]">By drawer</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2 font-semibold">Drawer</th>
              <th className="px-4 py-2 font-semibold text-right">Entries</th>
              <th className="px-4 py-2 font-semibold text-right">Net +/−</th>
              <th className="px-4 py-2 font-semibold text-right">Cash counted</th>
              <th className="px-4 py-2 font-semibold text-right">Scratch $</th>
            </tr></thead>
            <tbody>
              {a.drawerRows.map((r) => (
                <tr key={r.name} className="border-t border-[#dcd8cc]">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < -0.005 ? "text-red-600" : r.diff > 0.005 ? "text-green-700" : ""}`}>{r.diff >= 0 ? "+" : ""}{money(r.diff)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{money(r.cash)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{money(r.scratch)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {a.itemRows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#dcd8cc]"><h3 className="font-semibold text-[15px]">By item</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-2 font-semibold">Item</th>
                <th className="px-4 py-2 font-semibold text-right">Counts</th>
                <th className="px-4 py-2 font-semibold text-right">Net units +/−</th>
                <th className="px-4 py-2 font-semibold text-right">Short counts</th>
              </tr></thead>
              <tbody>
                {a.itemRows.map((r) => (
                  <tr key={r.name} className="border-t border-[#dcd8cc]">
                    <td className="px-4 py-2.5 font-medium">{r.name} <span className="text-neutral-400 text-xs">({r.unit}s)</span></td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < 0 ? "text-red-600" : r.diff > 0 ? "text-green-700" : ""}`}>{r.diff >= 0 ? "+" : ""}{r.diff}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${r.missing ? "text-red-600" : ""}`}>{r.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#dcd8cc]"><h3 className="font-semibold text-[15px]">By employee</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold text-right">Entries</th>
              <th className="px-4 py-2 font-semibold text-right">Net +/−</th>
              <th className="px-4 py-2 font-semibold text-right">Shorts</th>
              <th className="px-4 py-2 font-semibold text-right">Scratch $</th>
            </tr></thead>
            <tbody>
              {a.empRows.map((r) => (
                <tr key={r.name} className="border-t border-[#dcd8cc]">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < -0.005 ? "text-red-600" : r.diff > 0.005 ? "text-green-700" : ""}`}>{r.diff >= 0 ? "+" : ""}{money(r.diff)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${r.shorts ? "text-red-600" : ""}`}>{r.shorts}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{money(r.scratch)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
