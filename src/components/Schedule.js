"use client";
import { useEffect, useMemo, useState } from "react";
import {
  watchSchedule, addScheduledShift, deleteScheduledShift, addScheduledShiftsBatch, watchStaff,
  watchAvailability, addUnavailable, deleteUnavailable, updateScheduledShift, watchSwapBoard,
  watchTemplates, addTemplate, deleteTemplate, watchOpenShifts,
  apiPublishSchedule, watchPublished,
} from "@/lib/data";
import { useSession } from "./SessionProvider";
import {
  weekStartMonday, weekDates, addDays, groupByDate, scheduledHours, findOverlaps, reconcile,
  shiftMinutes, copyShiftsToWeek, availabilityConflicts, isUnavailable,
  weekShiftsToTemplate, templateToShifts,
} from "@/lib/schedule";
import { availableActions, applySwap, swapStatusOf, SWAP_ACTIONS } from "@/lib/swaps";
import EmptyState, { IconCalendar } from "./EmptyState";
import Field from "./Field";

const SWAP_TOAST = {
  offer: "Shift offered for swap", "cancel-offer": "Offer canceled",
  claim: "Claimed — pending manager approval", "withdraw-claim": "Claim withdrawn",
  approve: "Swap approved — shift reassigned", reject: "Swap rejected",
};

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
  const [board, setBoard] = useState([]);
  const [staff, setStaff] = useState([]);
  const [avail, setAvail] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [openShifts, setOpenShifts] = useState([]);
  const [published, setPublished] = useState({});
  const [publishing, setPublishing] = useState(false);
  const [weekStart, setWeekStart] = useState(() => weekStartMonday(todayStr()));
  const [form, setForm] = useState({ userId: "", date: todayStr(), start: "09:00", end: "17:00", locationId: "" });
  const [newOff, setNewOff] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => watchSchedule(vendor.id, isManager ? null : profile.id, setShifts), [vendor.id, isManager, profile.id]);
  useEffect(() => watchAvailability(vendor.id, isManager ? null : profile.id, setAvail), [vendor.id, isManager, profile.id]);
  useEffect(() => { if (isManager) return watchStaff(vendor.id, setStaff); }, [vendor.id, isManager]);
  useEffect(() => { if (isManager) return watchTemplates(vendor.id, setTemplates); }, [vendor.id, isManager]);
  useEffect(() => { if (isManager) return watchPublished(vendor.id, setPublished); }, [vendor.id, isManager]);
  // Employees also watch the swap board (offered/claimed shifts) so they can pick
  // up coworkers' shifts; managers already see the whole roster in `shifts`.
  useEffect(() => { if (!isManager) return watchSwapBoard(vendor.id, setBoard); }, [vendor.id, isManager]);
  useEffect(() => { if (!isManager) return watchOpenShifts(vendor.id, setOpenShifts); }, [vendor.id, isManager]);

  const actor = { userId: profile.id, name: profile.name, isManager };
  async function doSwap(shift, action) {
    const patch = applySwap(shift, action, actor);
    if (!patch) return onToast?.("That swap action isn't available");
    try { await updateScheduledShift(vendor.id, shift.id, patch); onToast?.(SWAP_TOAST[action] || "Updated"); }
    catch (e) { console.error(e); onToast?.("Couldn't update the swap"); }
  }
  async function claimOpen(shift) {
    try {
      await updateScheduledShift(vendor.id, shift.id, { userId: profile.id, userName: profile.name, open: false });
      onToast?.("Shift claimed — it's yours");
    } catch (e) { console.error(e); onToast?.("Couldn't claim the shift"); }
  }
  const swapButtons = (s) => {
    const acts = availableActions(s, actor);
    if (!acts.length) return null;
    return (
      <div className="flex gap-1.5 flex-wrap mt-2">
        {acts.map((a) => {
          const danger = a === "reject" || a === "cancel-offer" || a === "withdraw-claim";
          return (
            <button key={a} onClick={() => doSwap(s, a)}
              className={`text-[12px] font-semibold px-2.5 py-1 rounded-md border ${a === "approve" ? "text-pos" : danger ? "text-neg" : "text-fg"}`}
              style={{ borderColor: "var(--line)", background: "var(--subtle)" }}>
              {SWAP_ACTIONS[a]}
            </button>
          );
        })}
      </div>
    );
  };
  const swapLabel = (s) => {
    const st = swapStatusOf(s);
    if (st === "offered") return <span className="pill bg-highlight text-gold border border-brass/30 ml-2">Offered</span>;
    if (st === "claimed") return <span className="pill bg-highlight text-gold border border-brass/30 ml-2">Claimed by {s.claimedByName}</span>;
    return null;
  };

  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const weekEnd = days[6];
  const weekShifts = useMemo(() => shifts.filter((s) => s.date >= weekStart && s.date <= weekEnd), [shifts, weekStart, weekEnd]);
  const byDate = useMemo(() => groupByDate(weekShifts), [weekShifts]);
  const overlaps = useMemo(() => findOverlaps(weekShifts), [weekShifts]);
  const conflicts = useMemo(() => availabilityConflicts(weekShifts, avail), [weekShifts, avail]);
  const formConflict = form.userId && form.date && isUnavailable(avail, form.userId, form.date);
  const hours = useMemo(() => scheduledHours(weekShifts, { from: weekStart, to: weekEnd }), [weekShifts, weekStart, weekEnd]);
  const elapsed = useMemo(() => days.filter((d) => d <= todayStr()), [days]);
  const attendance = useMemo(
    () => (isManager ? reconcile(weekShifts, punches, { dates: elapsed }) : null),
    [isManager, weekShifts, punches, elapsed]
  );

  const activeStaff = staff.filter((s) => s.active !== false);
  const nameOf = (id) => staff.find((s) => s.id === id)?.name || id;

  async function addShift() {
    const isOpen = form.userId === "__open";
    const m = isOpen ? null : staff.find((s) => s.id === form.userId);
    if (!isOpen && !m) return onToast?.("Pick an employee (or post an open shift)");
    if (!form.date) return onToast?.("Pick a date");
    if (shiftMinutes(form.start, form.end) <= 0) return onToast?.("Check the start/end times");
    setBusy(true);
    try {
      const loc = form.locationId || m?.locationId || null;
      await addScheduledShift(vendor.id, {
        userId: isOpen ? null : m.id, userName: isOpen ? null : m.name,
        locationId: loc, locationName: loc ? locName(loc) : null,
        date: form.date, start: form.start, end: form.end,
        by: profile.name, byId: profile.id,
        ...(isOpen ? { open: true } : {}),
      });
      setForm((f) => ({ ...f, userId: "" }));
      onToast?.(isOpen ? "Open shift posted" : "Shift scheduled");
    } catch (e) { console.error(e); onToast?.("Couldn't schedule — managers only"); }
    setBusy(false);
  }
  async function removeShift(id) {
    try { await deleteScheduledShift(vendor.id, id); onToast?.("Shift removed"); }
    catch (e) { console.error(e); onToast?.("Couldn't remove — managers only"); }
  }
  async function copyPrevWeek() {
    const source = shifts.filter((s) => s.date >= addDays(weekStart, -7) && s.date <= addDays(weekEnd, -7));
    const specs = copyShiftsToWeek(source, { offsetDays: 7, existing: weekShifts })
      .map((s) => ({ ...s, by: profile.name, byId: profile.id }));
    if (!specs.length) return onToast?.(source.length ? "This week already matches last week" : "Last week had no shifts to copy");
    setCopying(true);
    try {
      const n = await addScheduledShiftsBatch(vendor.id, specs);
      onToast?.(`Copied ${n} shift${n === 1 ? "" : "s"} from last week`);
    } catch (e) { console.error(e); onToast?.("Copy failed — managers only"); }
    setCopying(false);
  }
  async function publishWeek() {
    if (!weekShifts.length) return onToast?.("No shifts this week to publish");
    setPublishing(true);
    try {
      const r = await apiPublishSchedule(weekStart);
      const bits = [`Notified ${r.notified}`];
      if (r.noEmail) bits.push(`${r.noEmail} without an email`);
      if (r.failed?.length) bits.push(`${r.failed.length} failed`);
      onToast?.(`Published — ${bits.join(", ")}`);
    } catch (e) { console.error(e); onToast?.(e.message || "Publish failed"); }
    setPublishing(false);
  }
  async function saveTemplate() {
    const specs = weekShiftsToTemplate(weekShifts, weekStart);
    if (!specs.length) return onToast?.("No shifts this week to save");
    const name = prompt('Name this week template (e.g. "Standard week"):');
    if (name == null || !name.trim()) return;
    try {
      await addTemplate(vendor.id, { name: name.trim().slice(0, 60), shifts: specs, by: profile.name, byId: profile.id });
      onToast?.("Template saved");
    } catch (e) { console.error(e); onToast?.("Couldn't save — managers only"); }
  }
  async function applyTemplate(t) {
    const specs = templateToShifts(t.shifts || [], weekStart, { existing: weekShifts })
      .map((s) => ({ ...s, by: profile.name, byId: profile.id }));
    if (!specs.length) return onToast?.("This week already has those shifts");
    try {
      const n = await addScheduledShiftsBatch(vendor.id, specs);
      onToast?.(`Added ${n} shift${n === 1 ? "" : "s"} from "${t.name}"`);
    } catch (e) { console.error(e); onToast?.("Couldn't apply — managers only"); }
  }
  async function removeTemplate(id) {
    try { await deleteTemplate(vendor.id, id); onToast?.("Template deleted"); }
    catch (e) { console.error(e); onToast?.("Couldn't delete — managers only"); }
  }
  async function markUnavailable() {
    if (!newOff) return;
    if (avail.some((u) => u.userId === profile.id && u.date === newOff)) return onToast?.("That day is already marked");
    try { await addUnavailable(vendor.id, { userId: profile.id, userName: profile.name, date: newOff }); onToast?.("Marked unavailable"); }
    catch (e) { console.error(e); onToast?.("Couldn't save"); }
  }
  async function removeUnavailable(id) {
    try { await deleteUnavailable(vendor.id, id); onToast?.("Removed"); }
    catch (e) { console.error(e); onToast?.("Couldn't remove"); }
  }

  /* ---- employee view: my upcoming shifts + availability ---- */
  if (!isManager) {
    const upcoming = shifts.filter((s) => s.date >= todayStr()).slice(0, 30);
    const myOff = avail.filter((u) => u.date >= todayStr());
    const pickups = board.filter((s) => s.userId !== profile.id && swapStatusOf(s) === "offered");
    const myClaims = board.filter((s) => s.claimedById === profile.id);
    const openToClaim = openShifts.filter((s) => s.date >= todayStr());
    return (
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">Your upcoming shifts</h3></div>
          {upcoming.length === 0 ? (
            <EmptyState icon={<IconCalendar />} title="Nothing scheduled"
              subtitle="When a manager rosters you for a shift, it shows up here with the date, time, and location." />
          ) : upcoming.map((s) => (
            <div key={s.id} className="px-4 py-3 border-b border-line last:border-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{dayLabel(s.date)}{swapLabel(s)}</div>
                  {s.locationName && <div className="text-[13px] text-muted truncate">{s.locationName}</div>}
                </div>
                <div className="font-mono text-sm text-right flex-shrink-0">{hhmm(s.start)} – {hhmm(s.end)}</div>
              </div>
              {swapButtons(s)}
            </div>
          ))}
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">Shifts up for grabs</h3></div>
          {pickups.length === 0 && myClaims.length === 0 && openToClaim.length === 0 ? (
            <EmptyState icon={<IconCalendar />} title="Nothing up for grabs"
              subtitle="Open shifts a manager posts, and shifts coworkers offer to swap, appear here to claim." />
          ) : (
            <>
              {openToClaim.map((s) => (
                <div key={s.id} className="px-4 py-3 border-b border-line last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gold">Open shift</div>
                      <div className="text-[13px] text-muted">{dayLabel(s.date)}{s.locationName ? ` · ${s.locationName}` : ""}</div>
                    </div>
                    <div className="font-mono text-sm text-right flex-shrink-0">{hhmm(s.start)}–{hhmm(s.end)}</div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    <button onClick={() => claimOpen(s)}
                      className="text-[12px] font-semibold px-2.5 py-1 rounded-md border text-fg"
                      style={{ borderColor: "var(--line)", background: "var(--subtle)" }}>
                      Claim shift
                    </button>
                  </div>
                </div>
              ))}
              {myClaims.map((s) => (
                <div key={s.id} className="px-4 py-3 border-b border-line last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{s.userName}&apos;s shift</div>
                      <div className="text-[13px] text-muted">{dayLabel(s.date)}{s.locationName ? ` · ${s.locationName}` : ""} · you claimed it, pending approval</div>
                    </div>
                    <div className="font-mono text-sm text-right flex-shrink-0">{hhmm(s.start)}–{hhmm(s.end)}</div>
                  </div>
                  {swapButtons(s)}
                </div>
              ))}
              {pickups.map((s) => (
                <div key={s.id} className="px-4 py-3 border-b border-line last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{s.userName}&apos;s shift</div>
                      <div className="text-[13px] text-muted">{dayLabel(s.date)}{s.locationName ? ` · ${s.locationName}` : ""}</div>
                    </div>
                    <div className="font-mono text-sm text-right flex-shrink-0">{hhmm(s.start)}–{hhmm(s.end)}</div>
                  </div>
                  {swapButtons(s)}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="card p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-[15px]">Days you can&apos;t work</h3>
            <p className="text-[13px] text-muted">Mark dates you&apos;re unavailable so managers can roster around you.</p>
          </div>
          <div className="flex gap-2">
            <input type="date" className="input" value={newOff} min={todayStr()} onChange={(e) => setNewOff(e.target.value)} aria-label="Date you're unavailable" />
            <button className="btn-ghost px-4 whitespace-nowrap" onClick={markUnavailable}>Add</button>
          </div>
          {myOff.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {myOff.map((u) => (
                <span key={u.id} className="pill bg-subtle text-muted">
                  {dayLabel(u.date)}
                  <button onClick={() => removeUnavailable(u.id)} className="ml-1.5 text-neg" aria-label={`Remove ${u.date}`}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---- manager view: roster ---- */
  return (
    <div className="space-y-4">
      {/* week navigator + publish */}
      <div className="card p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button className="btn-ghost px-3 py-1.5 text-[13px]" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">←</button>
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Week of</div>
            <button className="font-semibold text-sm hover:text-gold transition" onClick={() => setWeekStart(weekStartMonday(todayStr()))}>
              {dayLabel(weekStart)} – {dayLabel(weekEnd)}
            </button>
          </div>
          <button className="btn-ghost px-3 py-1.5 text-[13px]" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">→</button>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-line pt-3">
          <span className="text-[12px] text-muted">
            {published[weekStart]
              ? <>Published · notified <b className="font-mono">{published[weekStart].notified}</b></>
              : "Not published yet"}
          </span>
          <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={publishing || !weekShifts.length} onClick={publishWeek}>
            {publishing ? "Publishing…" : published[weekStart] ? "Re-publish & notify" : "📣 Publish & notify"}
          </button>
        </div>
      </div>

      {/* add a shift */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-[15px]">Schedule a shift</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label={"Employee"}>
            <select className="input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">Select…</option>
              <option value="__open">🟡 Open shift (unassigned)</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label={"Date"}>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label={"Start"}>
            <input type="time" className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </Field>
          <Field label={"End"}>
            <input type="time" className="input" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </Field>
          {locations.length > 1 && (
            <Field label={"Location (optional)"} className="col-span-2">
              <select className="input" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">Employee&apos;s default</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        {formConflict && (
          <p className="text-[13px] text-neg">⚠ {nameOf(form.userId)} marked this day unavailable — you can still schedule it.</p>
        )}
        <button className="btn-primary" disabled={busy} onClick={addShift}>{busy ? "Saving…" : "Add to schedule"}</button>
      </div>

      {/* week templates */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-[15px]">Week templates</h3>
          <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={!weekShifts.length} onClick={saveTemplate}>Save this week</button>
        </div>
        {templates.length === 0 ? (
          <p className="text-[13px] text-muted">Save a typical week as a template, then stamp it onto any future week in one tap.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-subtle border" style={{ borderColor: "var(--line)" }}>
                <div className="min-w-0">
                  <span className="font-medium text-sm">{t.name}</span>
                  <span className="text-[13px] text-muted"> · {t.shifts?.length || 0} shift{(t.shifts?.length || 0) === 1 ? "" : "s"}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button className="text-[12px] font-semibold px-2.5 py-1 rounded-md border text-fg" style={{ borderColor: "var(--line)", background: "var(--surface)" }} onClick={() => applyTemplate(t)}>Apply to this week</button>
                  <button className="text-neg text-lg leading-none px-1 hover:opacity-70" onClick={() => removeTemplate(t.id)} aria-label={`Delete ${t.name}`}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* roster by day */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line flex items-center justify-between gap-3">
          <h3 className="font-semibold text-[15px]">Roster</h3>
          <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={copying} onClick={copyPrevWeek}>
            {copying ? "Copying…" : "⧉ Copy last week"}
          </button>
        </div>
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
                    {list.map((s) => {
                      const isOv = overlaps.has(s.id), isConf = conflicts.has(s.id);
                      return (
                      <div key={s.id} className={`rounded-lg px-3 py-2 border ${isOv ? "bg-highlight" : "bg-subtle"}`}
                        style={{ borderColor: isOv ? "var(--gold)" : isConf ? "var(--neg)" : "var(--line)" }}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            {s.userName
                              ? <span className="font-medium text-sm">{s.userName}</span>
                              : <span className="font-medium text-sm text-gold">Open shift</span>}
                            {s.locationName && <span className="text-[13px] text-muted"> · {s.locationName}</span>}
                            {isOv && <span className="pill bg-highlight text-gold border border-brass/30 ml-2">Overlap</span>}
                            {isConf && <span className="pill bg-red-100 text-red-700 ml-2">Unavailable</span>}
                            {swapLabel(s)}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-mono text-[13px]">{hhmm(s.start)}–{hhmm(s.end)}</span>
                            <button className="text-neg text-lg leading-none px-1 hover:opacity-70" onClick={() => removeShift(s.id)} aria-label={`Remove ${s.userName || "open"} shift`}>×</button>
                          </div>
                        </div>
                        {swapButtons(s)}
                      </div>
                      );
                    })}
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

      <p className="text-center text-[11px] text-muted px-4">
        The schedule is a plan — edit it freely. Attendance compares it to the read-only time-clock punches by business day.
      </p>
    </div>
  );
}
