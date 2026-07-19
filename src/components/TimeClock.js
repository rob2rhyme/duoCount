"use client";
import { useEffect, useMemo, useState } from "react";
import {
  watchPunches, addPunch, addPunchCorrection,
  watchPayrollLocks, approvePayrollWeek, releasePayrollWeek,
} from "@/lib/data";
import { useSession } from "./SessionProvider";
import {
  computeShifts, summarizeHours, openShiftFor, formatDuration,
} from "@/lib/timeclock";
import { weekStartMonday, weekDates, addDays } from "@/lib/schedule";
import { activeLockDays, weekLockInfo } from "@/lib/payroll-lock";
import { useLang } from "./LangProvider";
import EmptyState, { IconClock } from "./EmptyState";
import Schedule from "./Schedule";
import TimeOffPanel from "./TimeOffPanel";
import { csvCell } from "@/lib/utils";

const DAY = 24 * 3600 * 1000;
const PERIODS = [7, 14, 30];
const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDay = (ms) => new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
// A punch's business day is stamped as the UTC date of the moment (see addPunch);
// derive the same label from a shift's ms so lock checks line up with the docs.
const dayOfMs = (ms) => new Date(ms).toISOString().slice(0, 10);
const fmtDateStr = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });

// <input type="datetime-local"> speaks local "YYYY-MM-DDTHH:mm"; convert both ways.
const toLocalInput = (ms) => {
  const d = new Date(ms), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (s) => { const t = new Date(s).getTime(); return Number.isNaN(t) ? null : t; };

function downloadCSV(lines, name) {
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

export default function TimeClock({ locations = [], locName, onToast }) {
  const { profile, vendor, isManager } = useSession();
  const { t } = useLang();
  const isOwner = profile.role === "owner";
  const [punches, setPunches] = useState([]);
  const [locks, setLocks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(7);
  const [view, setView] = useState("clock"); // "clock" | "schedule" | "timeoff"
  const [, setTick] = useState(0); // re-render so the running duration stays live

  // Managers watch the whole store; employees watch their own (rules enforce it).
  useEffect(
    () => watchPunches(vendor.id, isManager ? null : profile.id, setPunches),
    [vendor.id, isManager, profile.id]
  );
  // Pay-period locks (manager-only reads per the rules).
  useEffect(() => {
    if (!isManager) return;
    return watchPayrollLocks(vendor.id, setLocks);
  }, [vendor.id, isManager]);
  const lockedDays = useMemo(() => activeLockDays(locks), [locks]);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
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
      onToast?.(open ? t("time.toast_out") : t("time.toast_in"));
    } catch (e) {
      console.error(e);
      onToast?.(t("time.toast_punch_failed"));
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
    onToast?.(t("time.toast_payroll"));
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 bg-subtle rounded-xl p-1">
        {[["clock", t("time.tab_clock")], ["schedule", t("time.tab_schedule")], ["timeoff", t("time.tab_timeoff")]].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex-1 px-3 py-2 rounded-lg font-semibold text-sm transition ${view === id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "schedule" ? (
        <Schedule punches={punches} locations={locations} locName={locName} onToast={onToast} />
      ) : view === "timeoff" ? (
        <TimeOffPanel onToast={onToast} />
      ) : (
      <>
      {/* self clock in/out — everyone */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl grid place-items-center flex-shrink-0 ${open ? "bg-highlight text-gold" : "bg-subtle text-muted"}`}>
            <IconClock />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("time.tab_clock")}</div>
            {open ? (
              <>
                <div className="font-semibold text-pos leading-tight">{t("time.on_clock", { dur: formatDuration(now - open.inMs) })}</div>
                <div className="text-[13px] text-muted">{t("time.in_at", { time: fmtTime(open.inMs) })}{open.locationName ? ` · ${open.locationName}` : ""}</div>
              </>
            ) : (
              <>
                <div className="font-semibold leading-tight">{t("time.state_out")}</div>
                <div className="text-[13px] text-muted">{myShifts[0] ? t("time.last_shift", { dur: formatDuration(myShifts[0].ms), time: fmtTime(myShifts[0].outMs) }) : t("time.tap_start")}</div>
              </>
            )}
          </div>
        </div>
        <button className={open ? "btn-ghost w-full" : "btn-primary"} disabled={busy} onClick={togglePunch}>
          {busy ? t("common.saving") : open ? t("time.clock_out") : t("time.clock_in")}
        </button>
      </div>

      {/* my recent shifts */}
      {myShifts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-line"><h3 className="font-semibold text-[15px]">{t("time.recent_title")}</h3></div>
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
              <h3 className="font-semibold text-[15px]">{t("time.hours_title")}</h3>
              <p className="text-[13px] text-muted mt-0.5">{t("time.hours_sub")}</p>
            </div>
            <div className="flex gap-1.5 bg-subtle rounded-lg p-1">
              {PERIODS.map((p) => (
                <button key={p} onClick={() => setDays(p)}
                  className={`px-2.5 py-1 rounded-md text-[13px] font-semibold transition ${days === p ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
                  {t("time.n_days", { n: p })}
                </button>
              ))}
            </div>
          </div>

          {summary.length === 0 ? (
            <EmptyState icon={<IconClock />} title={t("time.empty_period_title")}
              subtitle={t("time.empty_hours_sub")} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
                    <th className="px-4 py-2 font-semibold">{t("common.employee")}</th>
                    <th className="px-4 py-2 font-semibold text-right">{t("time.col_shifts")}</th>
                    <th className="px-4 py-2 font-semibold text-right">{t("time.col_hours")}</th>
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
                      <td className="px-4 py-2.5 font-semibold">{t("common.total")}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{totalShifts}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{totalHours.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-line">
                <button className="btn-ghost w-full" onClick={exportPayroll}>{t("time.export_payroll")}</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* manager: pay-period approval (lock a week's timesheet) — belongs with
          the clock/schedule, not the time-off view. */}
      {isManager && view !== "timeoff" && (
        <PayrollApproval
          locks={locks} vendorId={vendor.id} actor={profile} isOwner={isOwner} onToast={onToast}
        />
      )}

      {/* manager: append-only timesheet corrections */}
      {isManager && (
        <TimesheetCorrections
          punches={punches} days={days} now={now} lockedDays={lockedDays}
          vendorId={vendor.id} actor={profile} onToast={onToast}
        />
      )}

      <p className="text-center text-[11px] text-muted px-4">
        {isManager ? t("time.footer_mgr") : t("time.footer_emp")}
      </p>
      </>
      )}
    </div>
  );
}

// Manager-only. Approve (lock) a Mon–Sun payroll week: freezes timesheet
// corrections for those days (rules-enforced via one lock doc per day), so the
// reviewed hours can't drift after export. Owner can release a lock (audited);
// a released week can be re-approved. Punches themselves are already immutable.
function PayrollApproval({ locks, vendorId, actor, isOwner, onToast }) {
  const { t } = useLang();
  const todayISO = dayOfMs(Date.now());
  // Default to LAST week — the natural approval target once a week has ended.
  const [weekStart, setWeekStart] = useState(() => weekStartMonday(addDays(todayISO, -7)));
  const [busy, setBusy] = useState(false);
  const week = weekDates(weekStart);
  const info = weekLockInfo(locks, weekStart);
  const finished = week[6] < todayISO;
  const label = `${fmtDateStr(week[0])} – ${fmtDateStr(week[6])}`;

  async function run(job, ok, fail) {
    setBusy(true);
    try { await job(); onToast?.(ok); }
    catch (e) { console.error(e); onToast?.(fail); }
    setBusy(false);
  }
  const approve = () => {
    if (!confirm(t(isOwner ? "time.confirm_approve_owner" : "time.confirm_approve_mgr", { label }))) return;
    run(() => approvePayrollWeek(vendorId, weekStart, locks, { byId: actor.id, byName: actor.name }),
      t("time.toast_approved"), t("time.toast_approve_failed"));
  };
  const release = () => {
    if (!confirm(t("time.confirm_release", { label }))) return;
    run(() => releasePayrollWeek(vendorId, weekStart, locks, { byId: actor.id, byName: actor.name }),
      t("time.toast_released"), t("time.toast_release_failed"));
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-[15px]">{t("time.payroll_title")}</h3>
          <p className="text-[13px] text-muted mt-0.5">{t("time.payroll_sub")}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-ghost px-2.5 py-1 text-sm" aria-label={t("common.prev_week")}
            onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
          <span className="text-sm font-semibold min-w-[130px] text-center">{label}</span>
          <button className="btn-ghost px-2.5 py-1 text-sm" aria-label={t("common.next_week")}
            onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 flex-wrap text-sm">
        {info.state === "approved" && (
          <>
            <span className="pill bg-highlight text-gold border border-brass/30">{t("time.pill_approved")}</span>
            <span className="text-muted text-[13px]">{t("time.approved_by", { name: info.byName || t("time.a_manager") })}</span>
            {isOwner && <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={busy} onClick={release}>{t("time.release_lock")}</button>}
          </>
        )}
        {info.state === "partial" && (
          <span className="text-[13px] text-muted">{t("time.partial")}</span>
        )}
        {(info.state === "open" || info.state === "released" || info.state === "partial") && (
          <>
            {info.state === "released" && (
              <span className="text-[13px] text-muted">{t("time.released_by", { name: info.byName || t("time.the_owner") })}</span>
            )}
            <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={busy || !finished}
              title={finished ? undefined : t("time.week_not_over")} onClick={approve}>
              {busy ? t("common.saving") : info.state === "released" ? t("time.reapprove") : t("time.approve_week")}
            </button>
            {!finished && <span className="text-[12px] text-faint">{t("time.avail_after_end")}</span>}
          </>
        )}
      </div>
    </div>
  );
}

// Manager-only. Lists store-wide shifts over the period and files append-only
// corrections (edit a punch time, add a forgotten punch, void a stray one).
// Nothing here mutates a punch — each action writes a signed correction record
// that `computeShifts` folds in (see lib/timeclock `applyCorrections`).
function TimesheetCorrections({ punches, days, now, lockedDays = new Set(), vendorId, actor, onToast }) {
  const { t } = useLang();
  const shifts = useMemo(
    () => computeShifts(punches).filter((s) => s.inMs >= now - days * DAY).sort((a, b) => b.inMs - a.inMs),
    [punches, days, now]
  );
  const employees = useMemo(() => {
    const m = new Map();
    for (const p of punches) if (p.userId && p.kind !== "correction") m.set(p.userId, p.userName || p.userId);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [punches]);

  const [editing, setEditing] = useState(null); // a shift object
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ inStr: "", outStr: "", reason: "" });
  const [addForm, setAddForm] = useState({ userId: "", type: "in", atStr: "", reason: "" });

  const commonFor = (s) => ({
    userId: s.userId, userName: s.userName, locationId: s.locationId, locationName: s.locationName,
    byId: actor.id, byName: actor.name,
  });

  function openEdit(s) {
    setAdding(false);
    setEditing(s);
    setForm({ inStr: s.inMs ? toLocalInput(s.inMs) : "", outStr: s.outMs ? toLocalInput(s.outMs) : "", reason: "" });
  }

  async function run(job, okMsg) {
    setBusy(true);
    try { await job(); onToast?.(okMsg); return true; }
    catch (e) { console.error(e); onToast?.(t("time.toast_correction_failed")); return false; }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    const reason = form.reason.trim();
    if (!reason) return onToast?.(t("time.err_reason"));
    // Compare against the prefilled strings (minute granularity), so saving an
    // untouched field doesn't file a no-op correction that nudges the seconds.
    const origIn = editing.inMs ? toLocalInput(editing.inMs) : "";
    const origOut = editing.outMs ? toLocalInput(editing.outMs) : "";
    const newIn = fromLocalInput(form.inStr), newOut = fromLocalInput(form.outStr);
    const c = { ...commonFor(editing), reason };
    const jobs = [];
    if (form.inStr && form.inStr !== origIn && newIn != null)
      jobs.push({ ...c, action: editing.inId ? "edit" : "add", targetId: editing.inId, type: "in", atMs: newIn });
    if (form.outStr && form.outStr !== origOut && newOut != null)
      jobs.push({ ...c, action: editing.outId ? "edit" : "add", targetId: editing.outId, type: "out", atMs: newOut });
    if (!jobs.length) return onToast?.(t("time.toast_nothing_changed"));
    if (await run(() => Promise.all(jobs.map((j) => addPunchCorrection(vendorId, j))), t("time.toast_correction_filed"))) setEditing(null);
  }

  async function voidShift() {
    const reason = form.reason.trim();
    if (!reason) return onToast?.(t("time.err_reason_void"));
    const c = { ...commonFor(editing), reason, action: "void" };
    const jobs = [editing.inId, editing.outId].filter(Boolean).map((targetId) => ({ ...c, targetId }));
    if (!jobs.length) return onToast?.(t("time.toast_nothing_void"));
    if (await run(() => Promise.all(jobs.map((j) => addPunchCorrection(vendorId, j))), t("time.toast_voided"))) setEditing(null);
  }

  async function saveAdd() {
    const reason = addForm.reason.trim();
    const atMs = fromLocalInput(addForm.atStr);
    const emp = employees.find((e) => e.id === addForm.userId);
    if (!emp) return onToast?.(t("time.err_pick_employee"));
    if (atMs == null) return onToast?.(t("time.err_pick_datetime"));
    if (lockedDays.has(dayOfMs(atMs)))
      return onToast?.(t("time.err_day_locked"));
    if (!reason) return onToast?.(t("time.err_add_reason"));
    const ok = await run(() => addPunchCorrection(vendorId, {
      action: "add", type: addForm.type, atMs,
      userId: emp.id, userName: emp.name, byId: actor.id, byName: actor.name, reason,
    }), t("time.toast_punch_added"));
    if (ok) { setAdding(false); setAddForm({ userId: "", type: "in", atStr: "", reason: "" }); }
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[15px]">{t("time.corrections_title")}</h3>
          <p className="text-[13px] text-muted mt-0.5">{t("time.corrections_sub")}</p>
        </div>
        <button className="btn-ghost text-sm px-3 py-1.5 flex-shrink-0"
          onClick={() => { setEditing(null); setAdding((v) => !v); }}>
          {adding ? t("time.close_btn") : t("time.add_punch")}
        </button>
      </div>

      {adding && (
        <div className="p-4 border-b border-line bg-panel space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={addForm.userId} aria-label={t("common.employee")}
              onChange={(e) => setAddForm({ ...addForm, userId: e.target.value })}>
              <option value="">{t("time.employee_ph")}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select className="input" value={addForm.type} aria-label={t("time.punch_type")}
              onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}>
              <option value="in">{t("time.clock_in")}</option>
              <option value="out">{t("time.clock_out")}</option>
            </select>
          </div>
          <input className="input" type="datetime-local" aria-label={t("time.punch_time")}
            value={addForm.atStr} onChange={(e) => setAddForm({ ...addForm, atStr: e.target.value })} />
          <input className="input" placeholder={t("time.reason_ph")} value={addForm.reason}
            onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })} />
          <button className="btn-primary w-full" disabled={busy} onClick={saveAdd}>
            {busy ? t("common.saving") : t("time.add_punch_btn")}
          </button>
        </div>
      )}

      {shifts.length === 0 ? (
        <EmptyState icon={<IconClock />} title={t("time.empty_period_title")}
          subtitle={t("time.empty_corrections_sub")} />
      ) : (
        <div className="divide-y divide-line">
          {shifts.map((s) => {
            const isEditing = editing && editing.inId === s.inId && editing.outId === s.outId && editing.inMs === s.inMs;
            // Any day the shift touches being payroll-approved locks it here too.
            const locked = lockedDays.has(dayOfMs(s.inMs)) || (s.outMs && lockedDays.has(dayOfMs(s.outMs)));
            return (
              <div key={`${s.inId}:${s.outId}:${s.inMs}`} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.userName || "—"}
                      {s.corrected && <span className="pill ml-2 bg-highlight text-gold border border-brass/30">{t("time.pill_corrected")}</span>}
                      {s.open && <span className="pill ml-2 bg-subtle text-muted">{t("time.pill_open")}</span>}
                    </div>
                    <div className="text-[12px] text-muted">{fmtDay(s.inMs)} · {fmtTime(s.inMs)} – {s.outMs ? fmtTime(s.outMs) : "—"}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-mono font-semibold">{formatDuration(s.ms)}</span>
                    {locked ? (
                      <span className="pill bg-subtle text-muted" title={t("time.locked_title")}>{t("time.pill_locked")}</span>
                    ) : (
                      <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => (isEditing ? setEditing(null) : openEdit(s))}>
                        {isEditing ? t("common.cancel") : t("time.correct_btn")}
                      </button>
                    )}
                  </div>
                </div>

                {isEditing && !locked && (
                  <div className="mt-3 space-y-3 bg-panel rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[12px] text-muted">{t("time.clock_in")}
                        <input className="input mt-1" type="datetime-local" value={form.inStr}
                          onChange={(e) => setForm({ ...form, inStr: e.target.value })} />
                      </label>
                      <label className="text-[12px] text-muted">{t("time.clock_out")}
                        <input className="input mt-1" type="datetime-local" value={form.outStr}
                          onChange={(e) => setForm({ ...form, outStr: e.target.value })} />
                      </label>
                    </div>
                    <input className="input" placeholder={t("time.reason_ph")} value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                    <div className="flex gap-2">
                      <button className="btn-primary flex-1" disabled={busy} onClick={saveEdit}>
                        {busy ? t("common.saving") : t("time.save_correction")}
                      </button>
                      <button className="btn-ghost text-neg" disabled={busy} onClick={voidShift}>{t("time.void_btn")}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
