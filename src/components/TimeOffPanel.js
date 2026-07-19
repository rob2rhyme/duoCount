"use client";
import { useEffect, useMemo, useState } from "react";
import { watchTimeOff, addTimeOff, decideTimeOff, cancelTimeOff, deleteTimeOff } from "@/lib/data";
import {
  TIMEOFF_TYPES, validateTimeOff, daysCount, clashes, canCancel, compareTimeOff,
} from "@/lib/timeoff";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import Field from "./Field";
import ShowMore, { usePaged } from "./ShowMore";

// Staff time-off. Employees file a request (needs a decision) or log a
// predictable future event that will need time off, and watch the live status
// + the manager's reason. Managers see everyone's, approve or deny WITH a
// reason, and are warned of clashing time off. Self-authored client writes
// gated by the same rules the swap board uses; pure logic in lib/timeoff.js.

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ""))) return d || "";
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};
const hhmm = (t) => {
  if (!/^\d{2}:\d{2}$/.test(String(t || ""))) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
};

const STATUS_STYLE = {
  pending: "text-gold border-brass/50",
  planned: "text-muted border-line",
  approved: "text-pos border-pos/50",
  denied: "text-neg border-neg/50",
  canceled: "text-muted border-line",
};

export default function TimeOffPanel({ onToast }) {
  const { vendor, profile, isManager } = useSession();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    kind: "request", type: "vacation", startDate: todayStr(), endDate: todayStr(),
    allDay: true, startTime: "09:00", endTime: "17:00", reason: "",
  });
  const [decideId, setDecideId] = useState(null); // ticket being decided
  const [decideNote, setDecideNote] = useState("");

  // Managers watch everyone; employees only their own.
  useEffect(() => watchTimeOff(vendor.id, isManager ? null : profile.id, setRows),
    [vendor.id, isManager, profile.id]);

  const list = useMemo(() => [...rows].sort(compareTimeOff), [rows]);
  const toPage = usePaged(list); // reveal 20 at a time once the team list passes 25
  const nameSpan = (r) => (isManager ? `${r.userName} · ` : "");

  async function run(key, fn) {
    setBusy(key); setError("");
    try { await fn(); }
    catch (e) { setError(t("toff.err_generic")); }
    setBusy("");
  }

  const submit = () => {
    const v = validateTimeOff(form);
    if (v.error) { setError(t(`toff.err_${v.error}`)); return; }
    run("submit", async () => {
      await addTimeOff(vendor.id, { ...v.fields, userId: profile.id, userName: profile.name });
      setForm((f) => ({ ...f, reason: "" }));
      onToast?.(v.fields.kind === "event" ? t("toff.toast_event") : t("toff.toast_requested"));
    });
  };
  const cancel = (r) => run(`cancel:${r.id}`, async () => {
    await cancelTimeOff(vendor.id, r.id); onToast?.(t("toff.toast_canceled"));
  });
  const remove = (r) => run(`del:${r.id}`, async () => {
    await deleteTimeOff(vendor.id, r.id);
  });
  const decide = (r, status) => run(`decide:${r.id}`, async () => {
    await decideTimeOff(vendor.id, r.id, {
      status, decidedBy: profile.name, decidedById: profile.id, decisionNote: decideNote,
    });
    setDecideId(null); setDecideNote("");
    onToast?.(status === "approved" ? t("toff.toast_approved", { name: r.userName }) : t("toff.toast_denied", { name: r.userName }));
  });

  const rangeLabel = (r) => {
    const days = daysCount(r.startDate, r.endDate);
    const span = r.startDate === r.endDate ? fmtDate(r.startDate) : `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`;
    const time = !r.allDay && r.startTime ? ` · ${hhmm(r.startTime)}–${hhmm(r.endTime)}` : "";
    const dcount = r.allDay ? ` · ${t("toff.n_days", { n: days })}` : "";
    return `${span}${time}${dcount}`;
  };

  const StatusChip = ({ status }) => (
    <span className={`text-[10px] uppercase tracking-wide font-bold border rounded px-1.5 py-0.5 ${STATUS_STYLE[status] || "text-muted border-line"}`}>
      {t(`toff.status_${status}`)}
    </span>
  );

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      {/* ---- submit form ---- */}
      <div className="card p-4 space-y-3">
        <div className="text-[13px] font-semibold">{t("toff.new_title")}</div>
        {/* request vs future-event heads-up */}
        <div className="flex gap-1.5 bg-subtle rounded-xl p-1">
          {[["request", "toff.kind_request"], ["event", "toff.kind_event"]].map(([k, key]) => (
            <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, kind: k }))}
              className={`flex-1 px-3 py-1.5 rounded-lg font-semibold text-[13px] transition ${form.kind === k ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}>
              {t(key)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted leading-relaxed">{t(form.kind === "event" ? "toff.event_hint" : "toff.request_hint")}</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("toff.f_type")}>
            <select className="input" value={form.type} onChange={setF("type")}>
              {TIMEOFF_TYPES.map((ty) => <option key={ty} value={ty}>{t(`toff.type_${ty}`)}</option>)}
            </select>
          </Field>
          <Field label={t("toff.f_allday")}>
            <select className="input" value={form.allDay ? "1" : "0"} onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.value === "1" }))}>
              <option value="1">{t("toff.allday_yes")}</option>
              <option value="0">{t("toff.allday_no")}</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("toff.f_start")}>
            <input type="date" className="input" value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))} />
          </Field>
          <Field label={t("toff.f_end")}>
            <input type="date" className="input" value={form.endDate} min={form.startDate} onChange={setF("endDate")} />
          </Field>
        </div>
        {!form.allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("toff.f_starttime")}><input type="time" className="input" value={form.startTime} onChange={setF("startTime")} /></Field>
            <Field label={t("toff.f_endtime")}><input type="time" className="input" value={form.endTime} onChange={setF("endTime")} /></Field>
          </div>
        )}
        <Field label={t("toff.f_reason")}>
          <input className="input" value={form.reason} maxLength={500} onChange={setF("reason")} placeholder={t("toff.f_reason_ph")} />
        </Field>
        {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
        <button className="btn-primary" disabled={busy === "submit"} onClick={submit}>
          {busy === "submit" ? t("common.saving") : (form.kind === "event" ? t("toff.submit_event") : t("toff.submit_request"))}
        </button>
      </div>

      {/* ---- list ---- */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5">
          {isManager ? t("toff.all_title") : t("toff.mine_title")}
        </div>
        {list.length === 0 ? (
          <p className="text-[13px] text-muted leading-relaxed">{t("toff.none")}</p>
        ) : (
          <div className="card overflow-hidden divide-y divide-line-soft">
            {toPage.visible.map((r) => {
              const overlap = isManager && (r.status === "pending" || r.status === "planned")
                ? clashes(r, rows, { excludeId: r.id, excludeUserId: r.userId }) : [];
              return (
                <div key={r.id} className="px-3.5 py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">
                        {nameSpan(r)}{t(`toff.type_${r.type}`)}
                        {r.kind === "event" && <span className="ml-1.5 text-[9px] uppercase tracking-wide font-bold text-muted border border-line rounded px-1 py-px align-middle">{t("toff.event_tag")}</span>}
                      </div>
                      <div className="text-[12px] text-muted">{rangeLabel(r)}</div>
                      {r.reason && <div className="text-[12px] text-muted italic">“{r.reason}”</div>}
                    </div>
                    <StatusChip status={r.status} />
                  </div>

                  {/* manager clash warning */}
                  {overlap.length > 0 && (
                    <p className="text-[12px] text-neg">{t("toff.clash", { names: overlap.map((o) => o.userName).join(", ") })}</p>
                  )}

                  {/* decision line (shown once decided) */}
                  {(r.status === "approved" || r.status === "denied") && (
                    <p className="text-[12px] text-muted">
                      {t(r.status === "approved" ? "toff.decided_approved" : "toff.decided_denied", { by: r.decidedBy || "" })}
                      {r.decisionNote ? `: “${r.decisionNote}”` : ""}
                    </p>
                  )}

                  {/* actions */}
                  {isManager ? (
                    r.status === "canceled" ? null : decideId === r.id ? (
                      <div className="space-y-2 pt-1">
                        <input className="input" value={decideNote} onChange={(e) => setDecideNote(e.target.value)} placeholder={t("toff.reason_ph")} />
                        <div className="flex gap-2">
                          <button className="btn-ghost flex-1 text-[13px] py-1.5 text-neg" disabled={!!busy} onClick={() => decide(r, "denied")}>{t("toff.deny")}</button>
                          <button className="btn-primary flex-1 text-[13px] py-1.5" disabled={!!busy} onClick={() => decide(r, "approved")}>{t("toff.approve")}</button>
                          <button className="btn-ghost w-auto px-3 text-[13px] py-1.5" onClick={() => { setDecideId(null); setDecideNote(""); }}>{t("toff.cancel_decide")}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 pt-0.5">
                        <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" onClick={() => { setDecideId(r.id); setDecideNote(""); setError(""); }}>
                          {r.status === "pending" || r.status === "planned" ? t("toff.decide") : t("toff.change_decision")}
                        </button>
                      </div>
                    )
                  ) : (
                    canCancel(r.status) && (
                      <div className="flex gap-2 pt-0.5">
                        <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === `cancel:${r.id}`} onClick={() => cancel(r)}>{t("toff.cancel_request")}</button>
                        <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto text-muted" disabled={busy === `del:${r.id}`} onClick={() => remove(r)}>{t("toff.delete")}</button>
                      </div>
                    )
                  )}
                </div>
              );
            })}
            <ShowMore hasMore={toPage.hasMore} nextStep={toPage.nextStep} onMore={toPage.showMore} />
          </div>
        )}
        <p className="text-xs text-muted leading-relaxed mt-2">{t("toff.footer")}</p>
      </div>
    </div>
  );
}
