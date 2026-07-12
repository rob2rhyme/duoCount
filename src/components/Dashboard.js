"use client";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from "recharts";
import { money, toDate } from "@/lib/utils";
import { detectPatterns } from "@/lib/patterns";
import { useSession } from "./SessionProvider";
import { useTheme } from "./ThemeProvider";
import ReportModal from "./ReportModal";
import EmptyState, { IconChart } from "./EmptyState";

// Recharts paints SVG with literal color strings (CSS vars aren't reliable on
// SVG presentation attributes), so the chart palette is resolved from the
// active theme in JS rather than through Tailwind tokens.
const CHART = {
  light: { grid: "#e6e2d8", axis: "#8a8780", tipBg: "#ffffff", tipBorder: "#dcd8cc", tipText: "#1a1c2e", bar: "#1a1c2e" },
  dark: { grid: "#2b2d37", axis: "#6b6d78", tipBg: "#1d1f28", tipBorder: "#343643", tipText: "#e9e8ee", bar: "#c9a34f" },
};

function Stat({ label, value, tone }) {
  const color = tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-fg";
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[11px] text-muted uppercase tracking-wide font-semibold mt-1">{label}</div>
    </div>
  );
}

export default function Dashboard({ entries, locations = [], locName = () => "—", onOpenLog, onRecord, onToast }) {
  const { isManager, vendor } = useSession();
  const { theme } = useTheme();
  const ch = CHART[theme] || CHART.light;
  const tip = { borderRadius: 10, border: `1px solid ${ch.tipBorder}`, background: ch.tipBg, color: ch.tipText, fontSize: 13 };
  const [reportOpen, setReportOpen] = useState(false);
  // Recurring signals (repeat shorts, drawer hot-spots, backlog, shrink
  // streaks) — manager-facing only, so employees never see them computed.
  const patterns = useMemo(
    () => (isManager ? detectPatterns(entries, { rules: vendor?.patternRules }) : []),
    [entries, isManager, vendor?.patternRules]);
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
      <button className="btn-ghost text-[13px] px-3.5 py-2" onClick={() => setReportOpen(true)}>📄 Reports</button>
    </div>
  );
  const reportModal = reportOpen && (
    <ReportModal locations={locations} locName={locName}
      onClose={() => setReportOpen(false)} onToast={onToast} />
  );

  if (!entries.length) {
    return (
      <div className="space-y-4">
        {reportButton}
        <div className="card">
          <EmptyState icon={<IconChart />} title="No activity yet"
            subtitle="Once counts are logged, your variance, sales, and attention analytics appear here — with an end-of-day report."
            action={onRecord ? { label: "Record a count", onClick: onRecord } : undefined} />
        </div>
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
          <div className="px-4 py-3.5 border-b border-line">
            <h3 className="font-semibold text-[15px]">Patterns</h3>
            <p className="text-[12px] text-muted mt-0.5">Signals worth a look — not conclusions.</p>
          </div>
          {patterns.map((p) => (
            <div key={p.id} className="px-4 py-2.5 border-b border-line last:border-0 flex items-start gap-3">
              <span className={`pill flex-shrink-0 mt-0.5 ${p.severity === "high" ? "bg-red-100 text-red-700" : "bg-highlight text-gold border border-brass/30"}`}>
                {p.severity === "high" ? "High" : "Watch"}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-sm">{p.title}</div>
                <div className="text-[12px] text-muted">{p.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {a.attention.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line flex items-center justify-between">
            <h3 className="font-semibold text-[15px]">Needs attention</h3>
            {onOpenLog && <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={onOpenLog}>Open the Log →</button>}
          </div>
          {a.attention.map(({ e, why }) => {
            const t = toDate(e.ts);
            const label = e.kind === "cash" ? (e.drawerName || "Drawer") : e.kind === "inventory" ? (e.itemName || "Item") : e.game;
            return (
              <div key={e.id} className="px-4 py-2.5 border-b border-line last:border-0 flex items-start gap-3 cursor-pointer hover:bg-panel"
                onClick={onOpenLog}>
                <span className={`pill flex-shrink-0 mt-0.5 ${why === "Unverified > 24h" ? "bg-subtle text-muted" : "bg-red-100 text-red-700"}`}>{why}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{label}</div>
                  <div className="text-[12px] text-muted font-mono truncate">{e.by} · {t ? t.toLocaleDateString() : ""}</div>
                </div>
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
            <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
            <YAxis tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
            <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
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
            <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
            <YAxis tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
            <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
            <Line type="monotone" dataKey="sales" stroke="#b8863b" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {a.gameRows.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold text-[15px] mb-3">Top scratch-off games</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, a.gameRows.length * 42)}>
            <BarChart layout="vertical" data={a.gameRows} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: ch.axis }} stroke={ch.axis} />
              <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
              <Bar dataKey="dollars" fill={ch.bar} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">By drawer</h3></div>
        <div className="overflow-auto max-h-[26rem]">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
              <th className="px-4 py-2 font-semibold">Drawer</th>
              <th className="px-4 py-2 font-semibold text-right">Entries</th>
              <th className="px-4 py-2 font-semibold text-right">Net +/−</th>
              <th className="px-4 py-2 font-semibold text-right">Cash counted</th>
              <th className="px-4 py-2 font-semibold text-right">Scratch $</th>
            </tr></thead>
            <tbody>
              {a.drawerRows.map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < -0.005 ? "text-neg" : r.diff > 0.005 ? "text-pos" : ""}`}>{r.diff >= 0 ? "+" : ""}{money(r.diff)}</td>
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
          <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">By item</h3></div>
          <div className="overflow-auto max-h-[26rem]">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
                <th className="px-4 py-2 font-semibold">Item</th>
                <th className="px-4 py-2 font-semibold text-right">Counts</th>
                <th className="px-4 py-2 font-semibold text-right">Net units +/−</th>
                <th className="px-4 py-2 font-semibold text-right">Short counts</th>
              </tr></thead>
              <tbody>
                {a.itemRows.map((r) => (
                  <tr key={r.name} className="border-t border-line">
                    <td className="px-4 py-2.5 font-medium">{r.name} <span className="text-muted text-xs">({r.unit}s)</span></td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < 0 ? "text-neg" : r.diff > 0 ? "text-pos" : ""}`}>{r.diff >= 0 ? "+" : ""}{r.diff}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${r.missing ? "text-neg" : ""}`}>{r.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">By employee</h3></div>
        <div className="overflow-auto max-h-[26rem]">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold text-right">Entries</th>
              <th className="px-4 py-2 font-semibold text-right">Net +/−</th>
              <th className="px-4 py-2 font-semibold text-right">Shorts</th>
              <th className="px-4 py-2 font-semibold text-right">Scratch $</th>
            </tr></thead>
            <tbody>
              {a.empRows.map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < -0.005 ? "text-neg" : r.diff > 0.005 ? "text-pos" : ""}`}>{r.diff >= 0 ? "+" : ""}{money(r.diff)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${r.shorts ? "text-neg" : ""}`}>{r.shorts}</td>
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
