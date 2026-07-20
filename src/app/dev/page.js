"use client";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { apiDev } from "@/lib/data";
import { downscaleImage } from "@/lib/image-downscale";
import { compareTickets, toMs, ATTACH_MAX_PER_MSG } from "@/lib/support";
import Link from "next/link";
import { useLang } from "@/components/LangProvider";
import ShowMore, { usePaged } from "@/components/ShowMore";

// Developer / platform-admin console. A standalone page (the app shell is
// tenant-scoped; this spans every store), gated by /api/dev whoami against the
// PLATFORM_ADMIN_UIDS allowlist. The developer signs in through their normal
// store account first; this page reuses that Firebase session (idToken()).

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

export default function DevConsole() {
  const { t, lang } = useLang();
  const [gate, setGate] = useState("loading"); // loading | signin | denied | ok
  const [uid, setUid] = useState("");          // the caller's platform-admin id, for the denied screen
  const [tab, setTab] = useState("inbox");

  useEffect(() => {
    // Wait for Firebase to restore the persisted session before whoami — on a
    // cold /dev load auth.currentUser is null for a beat even when signed in.
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { setGate("signin"); return; }
      apiDev({ action: "whoami" })
        .then((r) => { setUid(r.uid || ""); setGate(r.platformAdmin ? "ok" : "denied"); })
        .catch((e) => setGate(e?.status === 401 ? "signin" : "denied"));
    });
    return unsub;
  }, []);

  // Sign out from the console — needed to switch accounts (e.g. signed in as the
  // wrong store, or done working). Hand off to the login page afterward.
  const signOutLabel = t("prefs.sign_out");
  const doSignOut = async () => { try { await signOut(auth); } finally { window.location.href = "/"; } };

  if (gate === "loading") return <Shell><p className="text-muted text-sm">{t("common.loading")}</p></Shell>;
  if (gate === "signin") return <Shell><Notice title={t("dev.signin_title")} body={t("dev.signin_body")} /></Shell>;
  if (gate === "denied") return <Shell onSignOut={doSignOut} signOutLabel={signOutLabel}><Notice title={t("dev.denied_title")} body={t("dev.denied_body")} uid={uid} t={t} /></Shell>;

  return (
    <Shell onSignOut={doSignOut} signOutLabel={signOutLabel}>
      <div className="flex gap-1.5 bg-surface border border-line rounded-xl p-1.5 mb-4">
        {[["inbox", "dev.tab_inbox"], ["stores", "dev.tab_stores"]].map(([id, key]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 px-3 py-2 rounded-lg font-semibold text-sm transition ${tab === id ? "bg-fg text-surface" : "text-muted hover:text-fg"}`}>
            {t(key)}
          </button>
        ))}
      </div>
      {tab === "inbox" ? <Inbox t={t} lang={lang} /> : <Stores t={t} lang={lang} />}
    </Shell>
  );
}

function Shell({ children, onSignOut = null, signOutLabel = "" }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-ink text-paper px-4 py-3 pt-safe px-safe flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-lg bg-brass grid place-items-center text-white font-bold text-sm">D</span>
        <h1 className="text-base font-semibold">DuoCount · Developer</h1>
        {onSignOut && (
          <button type="button" onClick={onSignOut}
            className="ml-auto flex-shrink-0 text-[13px] font-semibold text-paper/80 hover:text-paper underline underline-offset-2">
            {signOutLabel}
          </button>
        )}
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4">{children}</main>
    </div>
  );
}
function Notice({ title, body, uid = "", t = null }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard?.writeText(uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the id is shown, so it can still be typed */ }
  };
  return (
    <div className="card p-6 text-center">
      <p className="font-semibold text-[15px]">{title}</p>
      <p className="text-[13px] text-muted mt-1.5 leading-relaxed">{body}</p>
      {/* Bootstrap helper: a signed-in-but-not-allowlisted developer sees their
          own id here and can copy it straight into PLATFORM_ADMIN_UIDS. */}
      {uid && t && (
        <div className="mt-4 border border-line rounded-xl bg-panel p-3.5 text-left">
          <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("dev.your_id")}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="flex-1 min-w-0 truncate font-mono text-[13px] text-fg select-all">{uid}</code>
            <button type="button" onClick={copy}
              className="flex-shrink-0 btn-ghost w-auto px-3 py-1.5 text-[13px]">
              {copied ? t("dev.copied") : t("dev.copy")}
            </button>
          </div>
          <p className="text-[12px] text-muted mt-2 leading-relaxed">{t("dev.your_id_hint")}</p>
        </div>
      )}
      <Link href="/" className="btn-ghost inline-flex mt-4 px-4 w-auto">← DuoCount</Link>
    </div>
  );
}

/* ------------------------------ Support inbox ------------------------------ */
function Inbox({ t, lang }) {
  const [filter, setFilter] = useState("open");
  const [data, setData] = useState({ tickets: [], counts: { open: 0, pending: 0 } });
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [shots, setShots] = useState([]);
  const [reason, setReason] = useState("");

  const load = () => apiDev({ action: "listTickets", status: filter === "all" ? null : filter })
    .then(setData).catch((e) => setError(e?.message || "load failed"));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const tickets = useMemo(() => [...(data.tickets || [])].sort(compareTickets), [data]);
  const ticketPage = usePaged(tickets, { resetKey: filter }); // reveal 20 at a time
  const open = tickets.find((x) => x.id === openId) || null;
  const fmt = (v) => { const ms = toMs(v); return ms ? new Date(ms).toLocaleString(lang === "es" ? "es" : "en") : ""; };

  async function act(payload, after) {
    setBusy(true); setError("");
    try { await apiDev(payload); await load(); after?.(); }
    catch (e) { setError(e?.code ? t(`sup.err_${e.code}`) : (e?.message || "failed")); }
    setBusy(false);
  }
  const sendReply = () => act({ action: "ticketReply", ticketId: openId, text: reply, attachments: shots }, () => { setReply(""); setShots([]); });
  const setStatus = (status) => act({ action: "ticketStatus", ticketId: openId, status, reason }, () => setReason(""));

  async function addShot(e) {
    const files = [...(e.target.files || [])]; e.target.value = "";
    for (const f of files) {
      if (shots.length >= ATTACH_MAX_PER_MSG) break;
      try { const s = await downscaleImage(f); setShots((c) => c.length < ATTACH_MAX_PER_MSG ? [...c, s] : c); }
      catch (err) { setError(t(`sup.err_${err.code || "attach_bad"}`)); }
    }
  }

  if (open) {
    return (
      <div className="space-y-3.5">
        <button className="text-[13px] text-muted hover:text-fg font-semibold" onClick={() => setOpenId(null)}>← {t("dev.all_tickets")}</button>
        <div className="card p-4 space-y-3">
          <div>
            <div className="font-semibold text-[15px] break-words">{open.subject}</div>
            <div className="text-[12px] text-muted mt-0.5">
              <b>{open.storeName}</b> · {t(`sup.cat_${open.category}`)} · {t(`sup.pri_${open.priority}`)} · {t(`sup.status_${open.status}`)} · {fmt(open.createdAt)}
            </div>
          </div>
          <div className="border border-line rounded-xl p-3 bg-panel">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{open.createdByName || t("dev.owner")}</div>
            <p className="text-[13px] whitespace-pre-wrap break-words">{open.body}</p>
            <Thumbs attachments={open.attachments} />
          </div>
          {(open.messages || []).map((m, i) => m.system ? (
            <div key={i} className="text-center text-[12px] text-muted">— {t(`sup.sys_${m.text}`, { by: m.byName || "" })}{m.reason ? `: “${m.reason}”` : ""} —</div>
          ) : (
            <div key={i} className={`border rounded-xl p-3 ${m.by === "dev" ? "border-brass/40 bg-brass/5" : "border-line bg-panel"}`}>
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{m.by === "dev" ? t("sup.support_team") : (m.byName || t("dev.owner"))} · <span className="normal-case font-normal">{fmt(m.ts)}</span></div>
              {m.text && <p className="text-[13px] whitespace-pre-wrap break-words">{m.text}</p>}
              <Thumbs attachments={m.attachments} />
            </div>
          ))}

          {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
          <div className="border-t border-line pt-3 space-y-2.5">
            <textarea className="input min-h-[70px]" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("dev.reply_ph")} />
            <div className="flex flex-wrap gap-2 items-center">
              {shots.map((s, i) => (
                <div key={i} className="relative"><img src={s.dataUri} alt="" className="w-12 h-12 object-cover rounded border border-line" />
                  <button onClick={() => setShots((c) => c.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-ink text-paper text-[10px] grid place-items-center">✕</button></div>
              ))}
              {shots.length < ATTACH_MAX_PER_MSG && <label className="btn-ghost text-[13px] px-3 py-1.5 w-auto cursor-pointer">📎 {t("sup.attach_add")}<input type="file" accept="image/*" multiple className="hidden" onChange={addShot} /></label>}
            </div>
            <button className="btn-primary" disabled={busy || (!reply.trim() && !shots.length)} onClick={sendReply}>{busy ? t("common.saving") : t("dev.send_reply")}</button>
            <div className="border-t border-line pt-3 space-y-2">
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("dev.reason_ph")} />
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" disabled={busy} onClick={() => setStatus("pending")}>{t("dev.set_pending")}</button>
                <button className="btn-primary flex-1" disabled={busy} onClick={() => setStatus("resolved")}>{t("dev.set_resolved")}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto">
        {[["open", "sup.status_open"], ["pending", "sup.status_pending"], ["resolved", "sup.status_resolved"], ["all", "dev.filter_all"]].map(([k, key]) => (
          <button key={k} onClick={() => { setFilter(k); setOpenId(null); }}
            className={`flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-full border transition ${filter === k ? "border-brass text-fg bg-brass/10" : "border-line bg-subtle text-muted hover:text-fg"}`}>
            {t(key)}{k === "open" && data.counts?.open ? ` · ${data.counts.open}` : ""}{k === "pending" && data.counts?.pending ? ` · ${data.counts.pending}` : ""}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
      {tickets.length === 0 ? (
        <p className="text-[13px] text-muted">{t("dev.no_tickets")}</p>
      ) : (
        <div className="card overflow-hidden divide-y divide-line-soft">
          {ticketPage.visible.map((tk) => (
            <button key={tk.id} onClick={() => setOpenId(tk.id)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-subtle transition">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[14px] truncate">{tk.subject}</span>
                <span className="block text-[12px] text-muted truncate"><b>{tk.storeName}</b> · {t(`sup.cat_${tk.category}`)} · {fmt(tk.lastActivityAt)}</span>
              </span>
              <span className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`text-[10px] uppercase tracking-wide font-bold border rounded px-1.5 py-0.5 ${tk.status === "resolved" ? "text-pos border-pos/50" : "text-gold border-brass/50"}`}>{t(`sup.status_${tk.status}`)}</span>
                {tk.priority === "urgent" && <span className="text-[10px] uppercase tracking-wide font-bold text-neg">{t("sup.pri_urgent")}</span>}
              </span>
            </button>
          ))}
          <ShowMore hasMore={ticketPage.hasMore} nextStep={ticketPage.nextStep} onMore={ticketPage.showMore} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Store manager ------------------------------ */
function Stores({ t, lang }) {
  const [stores, setStores] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");

  const load = () => apiDev({ action: "listStores" }).then((r) => setStores(r.stores)).catch((e) => setError(e?.message || "load failed"));
  useEffect(() => { load(); }, []);

  async function op(vendorId, payload, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(vendorId); setError("");
    try { await apiDev({ action: "storeAction", vendorId, ...payload }); await load(); }
    catch (e) { setError(e?.code ? t(`sup.err_${e.code}`) : (e?.message || "failed")); }
    setBusy("");
  }
  const fmt = (v) => { const ms = toMs(v); return ms ? new Date(ms).toLocaleDateString(lang === "es" ? "es" : "en") : ""; };

  const shown = useMemo(() => {
    if (!stores) return [];
    const needle = q.trim().toLowerCase();
    return needle ? stores.filter((s) => `${s.name} ${s.slug} ${s.ownerName}`.toLowerCase().includes(needle)) : stores;
  }, [stores, q]);
  const storePage = usePaged(shown, { resetKey: q }); // reveal 20 at a time

  if (stores === null) return <p className="text-muted text-sm">{t("common.loading")}</p>;

  return (
    <div className="space-y-3">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dev.store_search")} />
      {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
      <p className="text-[12px] text-muted">{t("dev.store_count", { n: stores.length })}</p>
      {storePage.visible.map((s) => (
        <div key={s.id} className={`card p-3.5 space-y-2 ${s.status === "suspended" ? "border-neg/40" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-[14px] flex items-center gap-2 flex-wrap">
                <span className="truncate">{s.name}</span>
                {s.status === "suspended" && <span className="text-[10px] uppercase tracking-wide font-bold text-neg border border-neg/50 rounded px-1.5 py-0.5">{t("dev.suspended")}</span>}
                {s.openTickets > 0 && <span className="text-[10px] uppercase tracking-wide font-bold text-gold border border-brass/50 rounded px-1.5 py-0.5">{t("dev.open_tix", { n: s.openTickets })}</span>}
              </div>
              <div className="text-[12px] text-muted font-mono">/{s.slug}</div>
              <div className="text-[12px] text-muted">{t("dev.owner")}: {s.ownerName || "—"}{s.ownerEmail ? ` · ${s.ownerEmail}` : ""} · {t("dev.staff_n", { n: s.staffCount })} · {fmt(s.createdAt)}</div>
              {s.note && <div className="text-[12px] text-fg mt-1 italic">“{s.note}”</div>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {s.status === "suspended" ? (
              <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id} onClick={() => op(s.id, { op: "activate" })}>{t("dev.reactivate")}</button>
            ) : (
              <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id} onClick={() => op(s.id, { op: "suspend" }, t("dev.confirm_suspend", { name: s.name }))}>{t("dev.suspend")}</button>
            )}
            <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id}
              onClick={() => { const name = window.prompt(t("dev.rename_prompt"), s.name); if (name != null && name.trim()) op(s.id, { op: "rename", name: name.trim() }); }}>{t("dev.rename")}</button>
            <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id}
              onClick={() => { const note = window.prompt(t("dev.note_prompt"), s.note || ""); if (note != null) op(s.id, { op: "note", note }); }}>{t("dev.note")}</button>
            <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id}
              onClick={() => { const pin = window.prompt(t("dev.pin_prompt")); if (pin != null && pin.trim()) op(s.id, { op: "resetOwnerPin", pin: pin.trim() }, t("dev.confirm_pin", { name: s.name })); }}>{t("dev.reset_pin")}</button>
          </div>
        </div>
      ))}
      <ShowMore hasMore={storePage.hasMore} nextStep={storePage.nextStep} onMore={storePage.showMore} />
    </div>
  );
}
