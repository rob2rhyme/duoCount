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
  lateArrivals, shiftMinutes, copyShiftsToWeek, availabilityConflicts, isUnavailable,
  weekShiftsToTemplate, templateToShifts,
} from "@/lib/schedule";
import { availableActions, applySwap, swapStatusOf, SWAP_ACTIONS } from "@/lib/swaps";
import { dayISO } from "@/lib/timeclock";
import { useLang } from "./LangProvider";
import EmptyState, { IconCalendar } from "./EmptyState";
import Field from "./Field";
import ShowMore, { usePaged } from "./ShowMore";

// The store's LOCAL today (not the UTC date), so scheduled shift dates and the
// week anchor line up with the local day punches are filed under (dayISO).
const todayStr = () => dayISO();
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
  const { t } = useLang();
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

  // Employee-view lists are derived here (not inside the !isManager branch)
  // so their pagination hooks below always run — Rules of Hooks. They're empty
  // for managers, who never populate the swap board / open-shift watchers.
  const today = todayStr();
  const myUpcoming = useMemo(() => (isManager ? [] : shifts.filter((s) => s.date >= today)),
    [isManager, shifts, today]);
  const openToClaim = useMemo(() => (isManager ? [] : openShifts.filter((s) => s.date >= today)),
    [isManager, openShifts, today]);
  const pickups = useMemo(() => (isManager ? [] : board.filter((s) => s.userId !== profile.id && swapStatusOf(s) === "offered")),
    [isManager, board, profile.id]);
  const upcomingPage = usePaged(myUpcoming);
  const openPage = usePaged(openToClaim);
  const pickupsPage = usePaged(pickups);

  async function doSwap(shift, action) {
    const patch = applySwap(shift, action, actor);
    if (!patch) return onToast?.(t("sched.err_swap_unavailable"));
    try { await updateScheduledShift(vendor.id, shift.id, patch); onToast?.(SWAP_ACTIONS[action] ? t(`swaptoast.${action}`) : t("common.updated")); }
    catch (e) { console.error(e); onToast?.(t("sched.toast_swap_failed")); }
  }
  async function claimOpen(shift) {
    try {
      await updateScheduledShift(vendor.id, shift.id, { userId: profile.id, userName: profile.name, open: false });
      onToast?.(t("sched.toast_open_claimed"));
    } catch (e) { console.error(e); onToast?.(t("sched.toast_claim_failed")); }
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
              {t(`swapact.${a}`)}
            </button>
          );
        })}
      </div>
    );
  };
  const swapLabel = (s) => {
    const st = swapStatusOf(s);
    if (st === "offered") return <span className="pill bg-highlight text-gold border border-brass/30 ml-2">{t("sched.pill_offered")}</span>;
    if (st === "claimed") return <span className="pill bg-highlight text-gold border border-brass/30 ml-2">{t("sched.pill_claimed_by", { name: s.claimedByName })}</span>;
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
  // Arrivals more than the grace period past the scheduled start (paired to the
  // nearest in-punch; pure lib, see lateArrivals). Manager-facing only.
  const late = useMemo(
    () => (isManager ? lateArrivals(weekShifts, punches, { dates: elapsed }) : []),
    [isManager, weekShifts, punches, elapsed]
  );

  const activeStaff = staff.filter((s) => s.active !== false);
  const nameOf = (id) => staff.find((s) => s.id === id)?.name || id;

  async function addShift() {
    const isOpen = form.userId === "__open";
    const m = isOpen ? null : staff.find((s) => s.id === form.userId);
    if (!isOpen && !m) return onToast?.(t("sched.err_pick_employee"));
    if (!form.date) return onToast?.(t("sched.err_pick_date"));
    // start == end would be read as a 24h overnight shift; that's never intended.
    if (form.start && form.end && form.start === form.end)
      return onToast?.(t("sched.err_same_time"));
    if (shiftMinutes(form.start, form.end) <= 0) return onToast?.(t("sched.err_times"));
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
      onToast?.(isOpen ? t("sched.toast_open_posted") : t("sched.toast_scheduled"));
    } catch (e) { console.error(e); onToast?.(t("sched.toast_schedule_failed")); }
    setBusy(false);
  }
  async function removeShift(id) {
    try { await deleteScheduledShift(vendor.id, id); onToast?.(t("sched.toast_removed")); }
    catch (e) { console.error(e); onToast?.(t("sched.toast_remove_failed")); }
  }
  async function copyPrevWeek() {
    const source = shifts.filter((s) => s.date >= addDays(weekStart, -7) && s.date <= addDays(weekEnd, -7));
    const specs = copyShiftsToWeek(source, { offsetDays: 7, existing: weekShifts })
      .map((s) => ({ ...s, by: profile.name, byId: profile.id }));
    if (!specs.length) return onToast?.(source.length ? t("sched.toast_already_matches") : t("sched.toast_nothing_to_copy"));
    setCopying(true);
    try {
      const n = await addScheduledShiftsBatch(vendor.id, specs);
      onToast?.(n === 1 ? t("sched.toast_copied_one") : t("sched.toast_copied", { n }));
    } catch (e) { console.error(e); onToast?.(t("sched.toast_copy_failed")); }
    setCopying(false);
  }
  async function publishWeek() {
    if (!weekShifts.length) return onToast?.(t("sched.err_no_shifts_publish"));
    setPublishing(true);
    try {
      const r = await apiPublishSchedule(weekStart);
      const bits = [t("sched.notified_n", { n: r.notified })];
      if (r.noEmail) bits.push(t("sched.no_email_n", { n: r.noEmail }));
      if (r.failed?.length) bits.push(t("sched.failed_n", { n: r.failed.length }));
      onToast?.(t("sched.toast_published", { bits: bits.join(", ") }));
    } catch (e) { console.error(e); onToast?.(e.message || t("sched.toast_publish_failed")); }
    setPublishing(false);
  }
  async function saveTemplate() {
    const specs = weekShiftsToTemplate(weekShifts, weekStart);
    if (!specs.length) return onToast?.(t("sched.err_no_shifts_save"));
    const name = prompt(t("sched.prompt_template_name"));
    if (name == null || !name.trim()) return;
    try {
      await addTemplate(vendor.id, { name: name.trim().slice(0, 60), shifts: specs, by: profile.name, byId: profile.id });
      onToast?.(t("sched.toast_template_saved"));
    } catch (e) { console.error(e); onToast?.(t("sched.toast_template_save_failed")); }
  }
  async function applyTemplate(tpl) {
    const specs = templateToShifts(tpl.shifts || [], weekStart, { existing: weekShifts })
      .map((s) => ({ ...s, by: profile.name, byId: profile.id }));
    if (!specs.length) return onToast?.(t("sched.toast_template_dup"));
    try {
      const n = await addScheduledShiftsBatch(vendor.id, specs);
      onToast?.(n === 1 ? t("sched.toast_template_applied_one", { name: tpl.name }) : t("sched.toast_template_applied", { n, name: tpl.name }));
    } catch (e) { console.error(e); onToast?.(t("sched.toast_template_apply_failed")); }
  }
  async function removeTemplate(id) {
    // A template is a whole saved week — one mis-tap shouldn't wipe it silently.
    if (typeof window !== "undefined" && !window.confirm(t("sched.confirm_delete_template"))) return;
    try { await deleteTemplate(vendor.id, id); onToast?.(t("sched.toast_template_deleted")); }
    catch (e) { console.error(e); onToast?.(t("sched.toast_template_delete_failed")); }
  }
  async function markUnavailable() {
    if (!newOff) return;
    if (avail.some((u) => u.userId === profile.id && u.date === newOff)) return onToast?.(t("sched.toast_day_marked"));
    try { await addUnavailable(vendor.id, { userId: profile.id, userName: profile.name, date: newOff }); onToast?.(t("sched.toast_marked")); }
    catch (e) { console.error(e); onToast?.(t("sched.toast_save_failed")); }
  }
  async function removeUnavailable(id) {
    try { await deleteUnavailable(vendor.id, id); onToast?.(t("sched.toast_unavail_removed")); }
    catch (e) { console.error(e); onToast?.(t("sched.toast_unavail_remove_failed")); }
  }

  /* ---- employee view: my upcoming shifts + availability ---- */
  if (!isManager) {
    const myOff = avail.filter((u) => u.date >= todayStr());
    const myClaims = board.filter((s) => s.claimedById === profile.id);
    return (
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">{t("sched.upcoming_title")}</h3></div>
          {myUpcoming.length === 0 ? (
            <EmptyState icon={<IconCalendar />} title={t("sched.empty_upcoming_title")}
              subtitle={t("sched.empty_upcoming_sub")} />
          ) : (<>
            {upcomingPage.visible.map((s) => (
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
            <ShowMore hasMore={upcomingPage.hasMore} nextStep={upcomingPage.nextStep} onMore={upcomingPage.showMore} />
          </>)}
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">{t("sched.grabs_title")}</h3></div>
          {pickups.length === 0 && myClaims.length === 0 && openToClaim.length === 0 ? (
            <EmptyState icon={<IconCalendar />} title={t("sched.empty_grabs_title")}
              subtitle={t("sched.empty_grabs_sub")} />
          ) : (
            <>
              {openPage.visible.map((s) => (
                <div key={s.id} className="px-4 py-3 border-b border-line last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gold">{t("sched.open_shift")}</div>
                      <div className="text-[13px] text-muted">{dayLabel(s.date)}{s.locationName ? ` · ${s.locationName}` : ""}</div>
                    </div>
                    <div className="font-mono text-sm text-right flex-shrink-0">{hhmm(s.start)}–{hhmm(s.end)}</div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    <button onClick={() => claimOpen(s)}
                      className="text-[12px] font-semibold px-2.5 py-1 rounded-md border text-fg"
                      style={{ borderColor: "var(--line)", background: "var(--subtle)" }}>
                      {t("swapact.claim")}
                    </button>
                  </div>
                </div>
              ))}
              <ShowMore hasMore={openPage.hasMore} nextStep={openPage.nextStep} onMore={openPage.showMore} />
              {myClaims.map((s) => (
                <div key={s.id} className="px-4 py-3 border-b border-line last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{t("sched.persons_shift", { name: s.userName })}</div>
                      <div className="text-[13px] text-muted">{dayLabel(s.date)}{s.locationName ? ` · ${s.locationName}` : ""} · {t("sched.you_claimed")}</div>
                    </div>
                    <div className="font-mono text-sm text-right flex-shrink-0">{hhmm(s.start)}–{hhmm(s.end)}</div>
                  </div>
                  {swapButtons(s)}
                </div>
              ))}
              {pickupsPage.visible.map((s) => (
                <div key={s.id} className="px-4 py-3 border-b border-line last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{t("sched.persons_shift", { name: s.userName })}</div>
                      <div className="text-[13px] text-muted">{dayLabel(s.date)}{s.locationName ? ` · ${s.locationName}` : ""}</div>
                    </div>
                    <div className="font-mono text-sm text-right flex-shrink-0">{hhmm(s.start)}–{hhmm(s.end)}</div>
                  </div>
                  {swapButtons(s)}
                </div>
              ))}
              <ShowMore hasMore={pickupsPage.hasMore} nextStep={pickupsPage.nextStep} onMore={pickupsPage.showMore} />
            </>
          )}
        </div>

        <div className="card p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-[15px]">{t("sched.unavail_title")}</h3>
            <p className="text-[13px] text-muted">{t("sched.unavail_sub")}</p>
          </div>
          <div className="flex gap-2">
            <input type="date" className="input" value={newOff} min={todayStr()} onChange={(e) => setNewOff(e.target.value)} aria-label={t("sched.unavail_date_aria")} />
            <button className="btn-ghost px-4 whitespace-nowrap" onClick={markUnavailable}>{t("sched.add_btn")}</button>
          </div>
          {myOff.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {myOff.map((u) => (
                <span key={u.id} className="pill bg-subtle text-muted">
                  {dayLabel(u.date)}
                  <button onClick={() => removeUnavailable(u.id)} className="ml-1.5 text-neg" aria-label={t("sched.remove_date_aria", { date: u.date })}>×</button>
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
          <button className="btn-ghost px-3 py-1.5 text-[13px]" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label={t("common.prev_week")}>←</button>
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("sched.week_of")}</div>
            <button className="font-semibold text-sm hover:text-gold transition" onClick={() => setWeekStart(weekStartMonday(todayStr()))}>
              {dayLabel(weekStart)} – {dayLabel(weekEnd)}
            </button>
          </div>
          <button className="btn-ghost px-3 py-1.5 text-[13px]" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label={t("common.next_week")}>→</button>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-line pt-3">
          <span className="text-[12px] text-muted">
            {published[weekStart]
              ? <>{t("sched.published_notified")} <b className="font-mono">{published[weekStart].notified}</b></>
              : t("sched.not_published")}
          </span>
          <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={publishing || !weekShifts.length} onClick={publishWeek}>
            {publishing ? t("sched.publishing") : published[weekStart] ? t("sched.republish") : t("sched.publish")}
          </button>
        </div>
      </div>

      {/* add a shift */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-[15px]">{t("sched.add_title")}</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("common.employee")}>
            <select className="input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">{t("sched.select_ph")}</option>
              <option value="__open">{t("sched.open_shift_option")}</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label={t("common.date")}>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label={t("sched.start")}>
            <input type="time" className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </Field>
          <Field label={t("sched.end")}>
            <input type="time" className="input" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </Field>
          {locations.length > 1 && (
            <Field label={t("sched.loc_optional")} className="col-span-2">
              <select className="input" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">{t("sched.emp_default")}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        {formConflict && (
          <p className="text-[13px] text-neg">{t("sched.conflict_warning", { name: nameOf(form.userId) })}</p>
        )}
        <button className="btn-primary" disabled={busy} onClick={addShift}>{busy ? t("common.saving") : t("sched.add_to_schedule")}</button>
      </div>

      {/* week templates */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-[15px]">{t("sched.templates_title")}</h3>
          <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={!weekShifts.length} onClick={saveTemplate}>{t("sched.save_this_week")}</button>
        </div>
        {templates.length === 0 ? (
          <p className="text-[13px] text-muted">{t("sched.templates_hint")}</p>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-subtle border" style={{ borderColor: "var(--line)" }}>
                <div className="min-w-0">
                  <span className="font-medium text-sm">{tpl.name}</span>
                  <span className="text-[13px] text-muted"> · {(tpl.shifts?.length || 0) === 1 ? t("sched.n_shifts_one") : t("sched.n_shifts", { n: tpl.shifts?.length || 0 })}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button className="text-[12px] font-semibold px-2.5 py-1 rounded-md border text-fg" style={{ borderColor: "var(--line)", background: "var(--surface)" }} onClick={() => applyTemplate(tpl)}>{t("sched.apply_week")}</button>
                  <button className="text-neg text-lg leading-none px-1 hover:opacity-70" onClick={() => removeTemplate(tpl.id)} aria-label={t("sched.delete_template_aria", { name: tpl.name })}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* roster by day */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line flex items-center justify-between gap-3">
          <h3 className="font-semibold text-[15px]">{t("sched.roster_title")}</h3>
          <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={copying} onClick={copyPrevWeek}>
            {copying ? t("sched.copying") : t("sched.copy_last_week")}
          </button>
        </div>
        {weekShifts.length === 0 ? (
          <EmptyState icon={<IconCalendar />} title={t("sched.empty_roster_title")}
            subtitle={t("sched.empty_roster_sub")} />
        ) : (
          days.map((d) => {
            const list = byDate.get(d) || [];
            return (
              <div key={d} className="px-4 py-3 border-b border-line last:border-0">
                <div className={`text-[13px] font-semibold mb-1.5 ${d === todayStr() ? "text-gold" : "text-muted"}`}>{dayLabel(d)}{d === todayStr() ? ` · ${t("sched.today_suffix")}` : ""}</div>
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
                              : <span className="font-medium text-sm text-gold">{t("sched.open_shift")}</span>}
                            {s.locationName && <span className="text-[13px] text-muted"> · {s.locationName}</span>}
                            {isOv && <span className="pill bg-highlight text-gold border border-brass/30 ml-2">{t("sched.pill_overlap")}</span>}
                            {isConf && <span className="pill bg-red-100 text-red-700 ml-2">{t("sched.pill_unavailable")}</span>}
                            {swapLabel(s)}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-mono text-[13px]">{hhmm(s.start)}–{hhmm(s.end)}</span>
                            <button className="text-neg text-lg leading-none px-1 hover:opacity-70" onClick={() => removeShift(s.id)} aria-label={t("sched.remove_shift_aria", { name: s.userName || t("sched.open_shift") })}>×</button>
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
          <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">{t("sched.hours_title")}</h3></div>
          <div className="overflow-auto max-h-[22rem]">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
                <th className="px-4 py-2 font-semibold">{t("common.employee")}</th>
                <th className="px-4 py-2 font-semibold text-right">{t("time.col_shifts")}</th>
                <th className="px-4 py-2 font-semibold text-right">{t("time.col_hours")}</th>
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
          <h3 className="font-semibold text-[15px] mb-2">{t("sched.attendance_title")}</h3>
          <p className="text-[13px] text-muted mb-3">{t("sched.attendance_sub")}</p>
          <div className="flex gap-4 flex-wrap text-sm">
            <span><b className="font-mono">{attendance.worked}</b>/<span className="font-mono">{attendance.scheduled}</span> <span className="text-muted">{t("sched.worked_as_scheduled")}</span></span>
            {attendance.noShow.length > 0 && <span className="text-neg"><b className="font-mono">{attendance.noShow.length}</b> {attendance.noShow.length === 1 ? t("sched.no_show_word") : t("sched.no_shows_word")}</span>}
            {attendance.unscheduled.length > 0 && <span className="text-gold"><b className="font-mono">{attendance.unscheduled.length}</b> {t("sched.unscheduled_word")}</span>}
            {late.length > 0 && <span className="text-gold"><b className="font-mono">{late.length}</b> {late.length === 1 ? t("sched.late_word") : t("sched.late_words")}</span>}
          </div>
          {attendance.noShow.length > 0 && (
            <div className="mt-2.5 text-[13px] text-muted">
              {t("sched.no_shows_list")} {attendance.noShow.map((n) => `${n.userName || nameOf(n.userId)} (${dayLabel(n.date)})`).join(", ")}
            </div>
          )}
          {late.length > 0 && (
            <div className="mt-2.5 text-[13px] text-muted">
              {t("sched.late_list")} {late.map((l) =>
                `${l.userName || nameOf(l.userId)} (${dayLabel(l.date)} ${l.start}, +${l.lateMin}m)`).join(", ")}
            </div>
          )}
        </div>
      )}

      <p className="text-center text-[11px] text-muted px-4">
        {t("sched.footer")}
      </p>
    </div>
  );
}
