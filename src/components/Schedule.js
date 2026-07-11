"use client";
import { useEffect, useMemo, useState } from "react";
import { watchSchedule, addScheduledShift, deleteScheduledShift, watchStaff } from "@/lib/data";
import { useSession } from "./SessionProvider";
import {
  weekStartMonday, weekDates, addDays, groupByDate, scheduledHours, findOverlaps, reconcile, shiftMinutes,
} from "@/lib/schedule";
import EmptyState, { IconCalendar } from "./EmptyState";

const todayStr = () => new Date().toISOString().slice(0, 10);
const dayLabel = (d) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};
const hhmm = (t) => {
  const [h, m] = t.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
};

export default function Schedule({ punches = [], locations = [], locName, onToast }) {
  const { profile, vendor, isManager } = useSession();
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [weekStart, setWeekStart] = useState(() => weekStartMonday(todayStr()));
  const [form, setForm] = useState({ userId: "", date: todayStr(), start: "09:00", end: "17:00", locationId: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => watchSchedule(vendor.id, isManager ? null : profile.id, setShifts), [vendor.id, isManager, profile.id]);
  useEffect(() => { if (isManager) return watchStaff(vendor.id, setStaff); }, [vendor.id, isManager]);

  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const weekEnd = days[6];
  const weekShifts = useMemo(() => shifts.filter((s) => s.date >= weekStart && s.date <= weekEnd), [shifts, weekStart, weekEnd]);
  const byDate = useMemo(() => groupByDate(weekShifts), [weekShifts]);
  const overlaps = useMemo(() => findOverlaps(weekShifts), [weekShifts]);
  const hours = useMemo(() => scheduledHours(weekShifts, { from: weekStart, to: weekEnd }), [weekShifts, weekStart, weekEnd]);
  const elapsed = useMemo(() => days.filter((d) => d <= todayStr()), [days]);
  const attendance = useMemo(
    () => (isManager ? reconcile(weekShifts, punches, { dates: elapsed }) : null),
    [isManager, weekShifts, punches, elapsed]
  );

  const activeStaff = staff.filter((s) => s.active !== false);
  const nameOf = (id) => staff.find((s) => s.id === id)?.name || id;

  async function addShift() {
    const m = staff.find((s) => s.id === form.userId);
    if (!m) return onToast?.("Pick an employee");
    if (!form.date) return onToast?.("Pick a date");
    if (shiftMinutes(form.start, form.end) <= 0) return onToast?.("Check the start/end times");
    setBusy(true);
    try {
      const loc = form.locationId || m.locationId || null;
      await addScheduledShift(vendor.id, {
        userId: m.id, userName: m.name,
        locationId: loc, locationName: loc ? locName(loc) : null,
        date: form.date, start: form.start, end: form.end,
        by: profile.name, byId: profile.id,
      });
      setForm((f) => ({ ...f, userId: "" }));
      onToast?.("Shift scheduled");
    } catch (e) { console.error(e); onToast?.("Couldn't schedule — managers only"); }
    setBusy(false);
  }
  async function removeShift(id) {
    try { await deleteScheduledShift(vendor.id, id); onToast?.("Shift removed"); }
    catch (e) { console.error(e); onToast?.("Couldn't remove — managers only"); }
  }

  /* ---- employee view: my upcoming shifts ---- */
  if (!isManager) {
    const upcoming = shifts.filter((s) => s.date >= todayStr()).slice(0, 30);
    return (
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">Your upcoming shifts</h3></div>
        {upcoming.length === 0 ? (
          <EmptyState icon={<IconCalendar />} title="Nothing scheduled"
            subtitle="When a manager rosters you for a shift, it shows up here with the date, time, and location." />
        ) : upcoming.map((s) => (
          <div key={s.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-sm">{dayLabel(s.date)}</div>
              {s.locationName && <div className="text-[13px] text-muted truncate">{s.locationName}</div>}
            </div>
            <div className="font-mono text-sm text-right flex-shrink-0">{hhmm(s.start)} – {hhmm(s.end)}</div>
          </div>
        ))}
      </div>
    );
  }

  /* ---- manager view: roster ---- */
  return (
    <div className="space-y-4">
      {/* week navigator */}
      <div className="card p-3 flex items-center justify-between gap-3">
        <button className="btn-ghost px-3 py-1.5 text-[13px]" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">←</button>
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Week of</div>
          <button className="font-semibold text-sm hover:text-gold transition" onClick={() => setWeekStart(weekStartMonday(todayStr()))}>
            {dayLabel(weekStart)} – {dayLabel(weekEnd)}
          </button>
        </div>
        <button className="btn-ghost px-3 py-1.5 text-[13px]" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">→</button>
      </div>

      {/* add a shift */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-[15px]">Schedule a shift</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Employee</label>
            <select className="input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">Select…</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="label">Start</label>
            <input type="time" className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </div>
          <div>
            <label className="label">End</label>
            <input type="time" className="input" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
          {locations.length > 1 && (
            <div className="col-span-2">
              <label className="label">Location (optional)</label>
              <select className="input" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">Employee&apos;s default</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <button className="btn-primary" disabled={busy} onClick={addShift}>{busy ? "Saving…" : "Add to schedule"}</button>
      </div>

      {/* roster by day */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">Roster</h3></div>
        {weekShifts.length === 0 ? (
          <EmptyState icon={<IconCalendar />} title="No shifts this week"
            subtitle="Add shifts above and they'll lay out by day here, with double-booking warnings and weekly hours." />
        ) : (
          days.map((d) => {
            const list = byDate.get(d) || [];
            return (
              <div key={d} className="px-4 py-3 border-b border-line last:border-0">
                <div className={`text-[13px] font-semibold mb-1.5 ${d === todayStr() ? "text-gold" : "text-muted"}`}>{dayLabel(d)}{d === todayStr() ? " · today" : ""}</div>
                {list.length === 0 ? (
                  <div className="text-[13px] text-faint">—</div>
                ) : (
                  <div className="space-y-1.5">
                    {list.map((s) => (
                      <div key={s.id} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 border ${overlaps.has(s.id) ? "bg-highlight" : "bg-subtle"}`}
                        style={{ borderColor: overlaps.has(s.id) ? "var(--gold)" : "var(--line)" }}>
                        <div className="min-w-0">
                          <span className="font-medium text-sm">{s.userName}</span>
                          {s.locationName && <span className="text-[13px] text-muted"> · {s.locationName}</span>}
                          {overlaps.has(s.id) && <span className="pill bg-highlight text-gold border border-brass/30 ml-2">Overlap</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-mono text-[13px]">{hhmm(s.start)}–{hhmm(s.end)}</span>
                          <button className="text-neg text-lg leading-none px-1 hover:opacity-70" onClick={() => removeShift(s.id)} aria-label={`Remove ${s.userName}'s shift`}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* weekly hours + attendance */}
      {hours.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">Scheduled hours this week</h3></div>
          <div className="overflow-auto max-h-[22rem]">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
                <th className="px-4 py-2 font-semibold">Employee</th>
                <th className="px-4 py-2 font-semibold text-right">Shifts</th>
                <th className="px-4 py-2 font-semibold text-right">Hours</th>
              </tr></thead>
              <tbody>
                {hours.map((r) => (
                  <tr key={r.userId} className="border-t border-line">
                    <td className="px-4 py-2.5 font-medium">{r.userName}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.shifts}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{r.hours.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {attendance && attendance.scheduled > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold text-[15px] mb-2">Attendance so far</h3>
          <p className="text-[13px] text-muted mb-3">Scheduled vs. actually clocked in, for elapsed days this week.</p>
          <div className="flex gap-4 flex-wrap text-sm">
            <span><b className="font-mono">{attendance.worked}</b>/<span className="font-mono">{attendance.scheduled}</span> <span className="text-muted">worked as scheduled</span></span>
            {attendance.noShow.length > 0 && <span className="text-neg"><b className="font-mono">{attendance.noShow.length}</b> no-show{attendance.noShow.length === 1 ? "" : "s"}</span>}
            {attendance.unscheduled.length > 0 && <span className="text-gold"><b className="font-mono">{attendance.unscheduled.length}</b> unscheduled</span>}
          </div>
          {attendance.noShow.length > 0 && (
            <div className="mt-2.5 text-[13px] text-muted">
              No-shows: {attendance.noShow.map((n) => `${n.userName || nameOf(n.userId)} (${dayLabel(n.date)})`).join(", ")}
            </div>
          )}
        </div>
      )}

      <p className="text-center text-[11px] text-faint px-4">
        The schedule is a plan — edit it freely. Attendance compares it to the read-only time-clock punches by business day.
      </p>
    </div>
  );
}
