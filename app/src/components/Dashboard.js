"use client";
import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from "recharts";
import { money, toDate } from "@/lib/utils";

function Stat({ label, value, tone }) {
  const color = tone === "neg" ? "text-red-600" : tone === "pos" ? "text-green-700" : "text-ink";
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[11px] text-neutral-500 uppercase tracking-wide font-semibold mt-1">{label}</div>
    </div>
  );
}

export default function Dashboard({ entries }) {
  const a = useMemo(() => {
    const cash = entries.filter((e) => e.kind === "cash");
    const scratch = entries.filter((e) => e.kind === "scratch");

    const netDiff = cash.reduce((s, e) => s + (e.diff || 0), 0);
    const shorts = cash.filter((e) => e.diff < -0.005).length;
    const overs = cash.filter((e) => e.diff > 0.005).length;
    const scratchDollars = scratch.reduce((s, e) => s + (e.dollars || 0), 0);
    const cashSales = cash.reduce((s, e) => s + (e.sales || 0), 0);
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

    // by drawer
    const byDrawer = {};
    entries.forEach((e) => {
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

    return { count: entries.length, netDiff, shorts, overs, scratchDollars, cashSales, verifyRate, dayRows, empRows, gameRows, drawerRows };
  }, [entries]);

  if (!entries.length) {
    return <div className="card text-center py-14 text-neutral-500">No activity yet. Once counts are logged, analytics appear here.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total entries" value={a.count} />
        <Stat label="Net over/short" value={`${a.netDiff >= 0 ? "+" : ""}${money(a.netDiff)}`} tone={a.netDiff < -0.005 ? "neg" : a.netDiff > 0.005 ? "pos" : null} />
        <Stat label="Short counts" value={a.shorts} tone={a.shorts ? "neg" : null} />
        <Stat label="Verified" value={`${a.verifyRate}%`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Cash sales logged" value={money(a.cashSales)} />
        <Stat label="Scratch-off sales" value={money(a.scratchDollars)} />
        <Stat label="Over counts" value={a.overs} tone={a.overs ? "pos" : null} />
        <Stat label="Staff active" value={a.empRows.length} />
      </div>

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
