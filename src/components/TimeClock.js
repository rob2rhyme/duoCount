"use client";
import { useEffect, useMemo, useState } from "react";
import { watchPunches, addPunch } from "@/lib/data";
import { useSession } from "./SessionProvider";
import {
  computeShifts, summarizeHours, openShiftFor, formatDuration,
} from "@/lib/timeclock";
import EmptyState, { IconClock } from "./EmptyState";
import Schedule from "./Schedule";
import { csvCell } from "@/lib/utils";

const DAY = 24 * 3600 * 1000;
const PERIODS = [
  { key: 7, label: "7 days" },
  { key: 14, label: "14 days" },
  { key: 30, label: "30 days" },
];
const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDay = (ms) => new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

function downloadCSV(lines, name) {
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

export default function TimeClock({ locations = [], locName, onToast }) {
  const { profile, vendor, isManager } = useSession();
  const [punches, setPunches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(7);
  const [view, setView] = useState("clock"); // "clock" | "schedule"
  const [, setTick] = useState(0); // re-render so the running duration stays live

  // Managers watch the whole store; employees watch their own (rules enforce it).
  useEffect(
    () => watchPunches(vendor.id, isManager ? null : profile.id, setPunches),
    [vendor.id, isManager, profile.id]
  );
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const myPunches = useMemo(() => punches.filter((p) => p.userId === profile.id), [punches, profile.id]);
  const open = useMemo(() => openShiftFor(myPunches, profile.id), [myPunches, profile.id]);
  const myShifts = useMemo(
    () => computeShifts(myPunches).filter((s) => !s.open).slice(-6).reverse(),
    [myPunches]
  );

  async function togglePunch() {
    setBusy(true);
    try {
      const hasLoc = profile.locationId != null;
      await addPunch(vendor.id, {
        userId: profile.id,
        userName: profile.name,
        locationId: profile.locationId ?? null,
        locationName: hasLoc ? locName(profile.locationId) : null,
        type: open ? "out" : "in",
      });
      onToast?.(open ? "Clocked out" : "Clocked in — have a good shift");
    } catch (e) {
      console.error(e);
      onToast?.("Punch failed — try again");
    }
    setBusy(false);
  }

  // Manager summary over the selected trailing window. `now` is in the deps so
  // the window keeps sliding as time passes (the live-duration tick re-renders
  // us) — otherwise a shift that aged out, or a day rollover, wouldn't update the
  // totals until punches or the period changed.
  const summary = useMemo(
    () => (isManager ? summarizeHours(punches, { fromMs: now - days * DAY, toMs: now }) : []),
    [isManager, punches, days, now]
  );
  const totalHours = summary.reduce((s, r) => s + r.hours, 0);
  const totalShifts = summary.reduce((s, r) => s + r.shifts, 0);

  function exportPayroll() {
    const period = `last ${days} days`;
    const head = ["Employee", "Shifts", "Hours", "Period", "Exported"];
    const lines = [head.join(",")];
    for (const r of summary)
      lines.push([r.userName, r.shifts, r.hours.toFixed(2), period, new Date(now).toISOString()].map(csvCell).join(","));
    lines.push(["TOTAL", totalShifts, totalHours.toFixed(2), period, ""].map(csvCell).join(","));
    downloadCSV(lines, `duocount-payroll-${days}d.csv`);
    onToast?.("Payroll CSV downloaded");
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 bg-subtle rounded-xl p-1">
        {[["clock", "Time clock"], ["schedule", "Schedule"]].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex-1 px-3 py-2 rounded-lg font-semibold text-sm transition ${view === id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "schedule" ? (
        <Schedule punches={punches} locations={locations} locName={locName} onToast={onToast} />
      ) : (
      <>
      {/* self clock in/out — everyone */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl grid place-items-center flex-shrink-0 ${open ? "bg-highlight text-gold" : "bg-subtle text-muted"}`}>
            <IconClock />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Time clock</div>
            {open ? (
              <>
                <div className="font-semibold text-pos leading-tight">On the clock · {formatDuration(now - open.inMs)}</div>
                <div className="text-[13px] text-muted">Clocked in at {fmtTime(open.inMs)}{open.locationName ? ` · ${open.locationName}` : ""}</div>
              </>
            ) : (
              <>
                <div className="font-semibold leading-tight">Clocked out</div>
                <div className="text-[13px] text-muted">{myShifts[0] ? `Last shift ${formatDuration(myShifts[0].ms)}, out ${fmtTime(myShifts[0].outMs)}` : "Tap below to start your shift"}</div>
              </>
            )}
          </div>
        </div>
        <button className={open ? "btn-ghost w-full" : "btn-primary"} disabled={busy} onClick={togglePunch}>
          {busy ? "Saving…" : open ? "Clock out" : "Clock in"}
        </button>
      </div>

      {/* my recent shifts */}
      {myShifts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-line"><h3 className="font-semibold text-[15px]">Your recent shifts</h3></div>
          {myShifts.map((s, i) => (
            <div key={i} className="px-4 py-2.5 border-b border-line last:border-0 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">{fmtDay(s.inMs)}</span>
              <span className="font-mono">{fmtTime(s.inMs)} – {fmtTime(s.outMs)}</span>
              <span className="font-mono font-semibold">{formatDuration(s.ms)}</span>
            </div>
          ))}
        </div>
      )}

      {/* manager: hours by employee + payroll export */}
      {isManager && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-[15px]">Hours by employee</h3>
              <p className="text-[13px] text-muted mt-0.5">Paired clock in/out punches over the period.</p>
            </div>
            <div className="flex gap-1.5 bg-subtle rounded-lg p-1">
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => setDays(p.key)}
                  className={`px-2.5 py-1 rounded-md text-[13px] font-semibold transition ${days === p.key ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {summary.length === 0 ? (
            <EmptyState icon={<IconClock />} title="No shifts in this period"
              subtitle="Once staff clock in and out, their paired hours show up here — ready to export for payroll." />
          ) : (
            <>
              <div className="overflow-auto max-h-[26rem]">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
                    <th className="px-4 py-2 font-semibold">Employee</th>
                    <th className="px-4 py-2 font-semibold text-right">Shifts</th>
                    <th className="px-4 py-2 font-semibold text-right">Hours</th>
                  </tr></thead>
                  <tbody>
                    {summary.map((r) => (
                      <tr key={r.userId} className="border-t border-line">
                        <td className="px-4 py-2.5 font-medium">{r.userName}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{r.shifts}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">{r.hours.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-line bg-panel">
                      <td className="px-4 py-2.5 font-semibold">Total</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{totalShifts}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{totalHours.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-line">
                <button className="btn-ghost w-full" onClick={exportPayroll}>⬇ Export payroll CSV</button>
              </div>
            </>
          )}
        </div>
      )}

      <p className="text-center text-[11px] text-muted px-4">
        Punches are permanent — a mistake is fixed by punching again, never edited. A forgotten clock-out shows as an open shift and adds no hours until you clock out.
      </p>
      </>
      )}
    </div>
  );
}
