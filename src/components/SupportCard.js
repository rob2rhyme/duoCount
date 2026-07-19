"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { watchSupportTickets, apiSupport } from "@/lib/data";
import { downscaleImage } from "@/lib/image-downscale";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, ATTACH_MAX_PER_MSG, ownerUnread, toMs } from "@/lib/support";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import Field from "./Field";

// Owner "Help & support" card: report an app issue with screenshots, then
// follow the thread — the developer replies and sets status, the owner sees it
// live and can resolve or reopen. Self-subscribing (owner-only surface); all
// writes go through the trusted /api/support route.

const STATUS_STYLE = {
  open: "text-gold border-brass/50",
  pending: "text-gold border-brass/50",
  resolved: "text-pos border-pos/50",
};

// A small screenshot picker shared by the new-ticket form and the reply box.
function Shots({ shots, setShots, onErr, t }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  async function add(e) {
    const files = [...(e.target.files || [])];
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    setBusy(true); onErr("");
    for (const f of files) {
      if (shots.length >= ATTACH_MAX_PER_MSG) { onErr(t("sup.err_attach_max", { n: ATTACH_MAX_PER_MSG })); break; }
      try { const s = await downscaleImage(f); setShots((cur) => cur.length < ATTACH_MAX_PER_MSG ? [...cur, s] : cur); }
      catch (err) { onErr(t(`sup.err_${err.code || "attach_bad"}`)); }
    }
    setBusy(false);
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {shots.map((s, i) => (
          <div key={i} className="relative">
            <img src={s.dataUri} alt={s.name} className="w-16 h-16 object-cover rounded-lg border border-line" />
            <button type="button" onClick={() => setShots((cur) => cur.filter((_, j) => j !== i))}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-paper text-[11px] leading-none grid place-items-center" aria-label={t("sup.attach_remove")}>✕</button>
          </div>
        ))}
      </div>
      {shots.length < ATTACH_MAX_PER_MSG && (
        <>
          <button type="button" className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy} onClick={() => fileRef.current?.click()}>
            📎 {busy ? t("common.saving") : t("sup.attach_add")}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={add} />
        </>
      )}
    </div>
  );
}

function Thumbs({ attachments }) {
  if (!attachments?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-1.5">
      {attachments.map((a, i) => (
        <a key={i} href={a.dataUri} target="_blank" rel="noopener noreferrer" title={a.name}>
          <img src={a.dataUri} alt={a.name} className="w-20 h-20 object-cover rounded-lg border border-line" />
        </a>
      ))}
    </div>
  );
}

export default function SupportCard() {
  const { vendor, profile } = useSession();
  const { t, lang } = useLang();
  const [tickets, setTickets] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // New-ticket form
  const [form, setForm] = useState({ subject: "", category: "bug", priority: "normal", body: "" });
  const [shots, setShots] = useState([]);
  // Reply box
  const [reply, setReply] = useState("");
  const [replyShots, setReplyShots] = useState([]);

  useEffect(() => watchSupportTickets(vendor.id, setTickets), [vendor.id]);

  const fmt = (v) => { const ms = toMs(v); return ms ? new Date(ms).toLocaleString(lang === "es" ? "es" : "en") : ""; };
  const open = useMemo(() => tickets.find((x) => x.id === openId) || null, [tickets, openId]);

  async function run(fn) {
    setBusy(true); setError("");
    try { await fn(); }
    catch (e) { setError(e?.code ? t(`sup.err_${e.code}`) : (e?.message || t("sup.err_generic"))); }
    setBusy(false);
  }
  const submit = () => run(async () => {
    const r = await apiSupport({ action: "create", ...form, attachments: shots });
    setForm({ subject: "", category: "bug", priority: "normal", body: "" });
    setShots([]); setOpenId(r.id);
  });
  const sendReply = () => run(async () => {
    await apiSupport({ action: "reply", ticketId: openId, text: reply, attachments: replyShots });
    setReply(""); setReplyShots([]);
  });
  const setStatus = (status) => run(() => apiSupport({ action: "setStatus", ticketId: openId, status }));

  // Mark a ticket seen when the owner opens it (clears the unread dot).
  function openTicket(id) {
    setOpenId(id); setError(""); setReply(""); setReplyShots([]);
    const tk = tickets.find((x) => x.id === id);
    if (tk && ownerUnread(tk, toMs(tk.ownerSeenAt))) apiSupport({ action: "markSeen", ticketId: id }).catch(() => {});
  }

  const StatusChip = ({ status }) => (
    <span className={`text-[10px] uppercase tracking-wide font-bold border rounded px-1.5 py-0.5 ${STATUS_STYLE[status] || "text-muted border-line"}`}>
      {t(`sup.status_${status}`)}
    </span>
  );

  return (
    <div id="adm-support" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px]">{t("sup.title")}</h2>
        <p className="text-[13px] text-muted mt-0.5">{t("sup.sub")}</p>
      </div>

      {open ? (
        /* ---- thread view ---- */
        <div className="p-4 space-y-3.5">
          <button type="button" className="text-[13px] text-muted hover:text-fg font-semibold flex items-center gap-1.5" onClick={() => setOpenId(null)}>
            <span aria-hidden="true">←</span> {t("sup.back")}
          </button>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-[15px] flex items-center gap-2 flex-wrap"><span className="break-words">{open.subject}</span> <StatusChip status={open.status} /></div>
              <div className="text-[12px] text-muted mt-0.5">{t(`sup.cat_${open.category}`)} · {t(`sup.pri_${open.priority}`)} · {fmt(open.createdAt)}</div>
            </div>
          </div>

          {/* opening message */}
          <div className="border border-line rounded-xl p-3 bg-panel">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{t("sup.you")}</div>
            <p className="text-[13px] whitespace-pre-wrap break-words">{open.body}</p>
            <Thumbs attachments={open.attachments} />
          </div>

          {/* thread */}
          {(open.messages || []).map((m, i) => (
            m.system ? (
              <div key={i} className="text-center text-[12px] text-muted">
                — {t(`sup.sys_${m.text}`, { by: m.byName || "" })}{m.reason ? `: “${m.reason}”` : ""} —
              </div>
            ) : (
              <div key={i} className={`border rounded-xl p-3 ${m.by === "dev" ? "border-brass/40 bg-brass/5" : "border-line bg-panel"}`}>
                <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">
                  {m.by === "dev" ? t("sup.support_team") : t("sup.you")} · <span className="normal-case font-normal">{fmt(m.ts)}</span>
                </div>
                {m.text && <p className="text-[13px] whitespace-pre-wrap break-words">{m.text}</p>}
                <Thumbs attachments={m.attachments} />
              </div>
            )
          ))}

          {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}

          {/* reply + status actions */}
          <div className="border-t border-line pt-3 space-y-2.5">
            <Field label={t("sup.reply_label")}>
              <textarea className="input min-h-[70px]" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("sup.reply_ph")} />
            </Field>
            <Shots shots={replyShots} setShots={setReplyShots} onErr={setError} t={t} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary flex-1 min-w-[8rem]" disabled={busy || (!reply.trim() && !replyShots.length)} onClick={sendReply}>
                {busy ? t("common.saving") : t("sup.send")}
              </button>
              {open.status !== "resolved" ? (
                <button className="btn-ghost w-auto px-4" disabled={busy} onClick={() => setStatus("resolved")}>{t("sup.mark_resolved")}</button>
              ) : (
                <button className="btn-ghost w-auto px-4" disabled={busy} onClick={() => setStatus("open")}>{t("sup.reopen")}</button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ---- list + new-ticket form ---- */
        <div className="p-4 space-y-4">
          <div className="border border-line rounded-xl p-3.5 bg-panel space-y-3">
            <div className="text-[13px] font-semibold">{t("sup.new_title")}</div>
            <Field label={t("sup.f_subject")}>
              <input className="input" value={form.subject} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder={t("sup.f_subject_ph")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("sup.f_category")}>
                <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{t(`sup.cat_${c}`)}</option>)}
                </select>
              </Field>
              <Field label={t("sup.f_priority")}>
                <select className="input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                  {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{t(`sup.pri_${p}`)}</option>)}
                </select>
              </Field>
            </div>
            <Field label={t("sup.f_body")}>
              <textarea className="input min-h-[90px]" value={form.body} maxLength={4000} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder={t("sup.f_body_ph")} />
            </Field>
            <div>
              <span className="label">{t("sup.f_shots")}</span>
              <Shots shots={shots} setShots={setShots} onErr={setError} t={t} />
            </div>
            {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
            <button className="btn-primary" disabled={busy || form.subject.trim().length < 3 || !form.body.trim()} onClick={submit}>
              {busy ? t("common.saving") : t("sup.submit")}
            </button>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5">{t("sup.my_tickets")}</div>
            {tickets.length === 0 ? (
              <p className="text-[13px] text-muted leading-relaxed">{t("sup.none")}</p>
            ) : (
              <div className="border border-line rounded-xl overflow-hidden divide-y divide-line-soft">
                {tickets.map((tk) => {
                  const unread = ownerUnread(tk, toMs(tk.ownerSeenAt));
                  return (
                    <button key={tk.id} type="button" onClick={() => openTicket(tk.id)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-subtle transition">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {unread && <span className="w-2 h-2 rounded-full bg-neg flex-shrink-0" aria-label={t("sup.unread")} />}
                          <span className="font-medium text-[14px] truncate">{tk.subject}</span>
                        </span>
                        <span className="block text-[12px] text-muted">{t(`sup.cat_${tk.category}`)} · {fmt(tk.lastActivityAt)}</span>
                      </span>
                      <StatusChip status={tk.status} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-xs text-muted leading-relaxed">{t("sup.footer")}</p>
        </div>
      )}
    </div>
  );
}
