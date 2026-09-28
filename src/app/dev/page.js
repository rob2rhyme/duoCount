"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut, signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { apiDev, apiDevLogin, apiDevNeedsCode } from "@/lib/data";
import { downscaleImage } from "@/lib/image-downscale";
import { compareTickets, toMs, ATTACH_MAX_PER_MSG } from "@/lib/support";
import { BILLING_PLANS, BILLING_STATUSES, BILLING_CYCLES, buildBillingSummary, DEFAULT_BILLING } from "@/lib/billing";
import { money, csvCell, downloadCSV } from "@/lib/utils";
import Link from "next/link";
import { useLang } from "@/components/LangProvider";
import ShowMore, { usePaged } from "@/components/ShowMore";
import Field from "@/components/Field";
import RevealInput from "@/components/RevealInput";
import ActionIcon from "@/components/ActionIcon";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";

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
  const [me, setMe] = useState({ role: null, scopes: [] }); // this operator's RBAC role + scopes
  const [tab, setTab] = useState("inbox");
  const can = (scope) => (me.scopes || []).includes(scope);

  useEffect(() => {
    // Wait for Firebase to restore the persisted session before whoami — on a
    // cold /dev load auth.currentUser is null for a beat even when signed in.
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { setGate("signin"); return; }
      apiDev({ action: "whoami" })
        .then((r) => { setUid(r.uid || ""); setMe({ role: r.role || null, scopes: r.scopes || [] }); setGate(r.platformAdmin ? "ok" : "denied"); })
        .catch((e) => setGate(e?.status === 401 ? "signin" : "denied"));
    });
    return unsub;
  }, []);

  // Sign out from the console — needed to switch accounts (e.g. signed in as the
  // wrong store, or done working). Hand off to the login page afterward.
  const signOutLabel = t("prefs.sign_out");
  const doSignOut = async () => { try { await signOut(auth); } finally { window.location.href = "/"; } };

  if (gate === "loading") return <Shell><p className="text-muted text-sm">{t("common.loading")}</p></Shell>;
  if (gate === "signin") return <Shell><DevLogin t={t} /></Shell>;
  if (gate === "denied") return <Shell onSignOut={doSignOut} signOutLabel={signOutLabel}><Notice title={t("dev.denied_title")} body={t("dev.denied_body")} uid={uid} t={t} /></Shell>;

  return (
    <Shell onSignOut={doSignOut} signOutLabel={signOutLabel}>
      <div className="flex gap-1.5 bg-surface border border-line rounded-xl p-1.5 mb-4">
        {[
          can("tickets") && ["inbox", "dev.tab_inbox"],
          ["stores", "dev.tab_stores"],
          ["audit", "dev.tab_audit"],
          can("operators") && ["operators", "dev.tab_operators"],
        ].filter(Boolean).map(([id, key]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 px-3 py-2 rounded-lg font-semibold text-sm transition ${tab === id ? "bg-fg text-surface" : "text-muted hover:text-fg"}`}>
            {t(key)}
          </button>
        ))}
      </div>
      {tab === "inbox" && can("tickets") ? <Inbox t={t} lang={lang} />
        : tab === "audit" ? <Audit t={t} lang={lang} />
        : tab === "operators" && can("operators") ? <Operators t={t} lang={lang} myId={uid} />
        : <Stores t={t} lang={lang} me={me} />}
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

// Dedicated developer sign-in — the developer isn't a store owner, so this is a
// direct email + password, not a store PIN. On success it signs in with the
// platform-admin custom token the server mints; the parent's auth listener then
// flips the gate to the console.
function DevLogin({ t }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Ask the server whether this deployment has a second factor configured, so
  // the field appears before the first attempt rather than after a rejection.
  // The answer reveals only that — never a credential.
  useEffect(() => {
    let live = true;
    apiDevNeedsCode().then((r) => { if (live) setNeedsCode(!!r.totp); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const errText = (e) => (e?.code && t(`autherr.${e.code}`) !== `autherr.${e.code}`
    ? t(`autherr.${e.code}`) : e?.message || t("autherr.login_failed"));
  async function submit() {
    setErr(""); setBusy(true);
    try {
      const { token } = await apiDevLogin({ email, password, code });
      await signInWithCustomToken(auth, token); // parent's onAuthStateChanged takes it from here
    } catch (e) { setErr(errText(e)); setBusy(false); }
  }
  return (
    <div className="card p-6 max-w-sm mx-auto">
      <p className="font-semibold text-[15px]">{t("dev.login_title")}</p>
      <p className="text-[13px] text-muted mt-1.5 leading-relaxed">{t("dev.login_body")}</p>
      <label className="label mt-4">{t("dev.login_email")}</label>
      <input className="input" type="email" inputMode="email" autoComplete="username" autoCapitalize="none"
        value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dev@duocount.app" />
      <label className="label mt-3">{t("dev.login_password")}</label>
      <RevealInput autoComplete="current-password"
        value={password} onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && email && password && !busy && submit()} />
      {needsCode && (
        <>
          <label className="label mt-3">{t("dev.login_code")}</label>
          <input className="input text-center tracking-[0.3em] font-mono" inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && email && password && !busy && submit()} />
          <p className="text-[12px] text-muted mt-1.5">{t("dev.login_code_hint")}</p>
        </>
      )}
      {err && <p role="alert" className="text-[13px] text-neg mt-3">{err}</p>}
      <button className="btn-primary mt-5" disabled={busy || !email.trim() || !password} onClick={submit}>
        {busy ? t("dev.login_checking") : t("dev.login_button")}
      </button>
      <Link href="/" className="block text-center text-[12px] text-muted underline underline-offset-2 mt-4 hover:text-fg">
        {t("dev.login_back")}
      </Link>
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
  const [notice, setNotice] = useState("");
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
    setBusy(true); setError(""); setNotice("");
    try { const r = await apiDev(payload); await load(); after?.(r); }
    catch (e) { setError(e?.code ? t(`sup.err_${e.code}`) : (e?.message || "failed")); }
    setBusy(false);
  }
  const sendReply = () => act(
    { action: "ticketReply", ticketId: openId, text: reply, attachments: shots },
    // On a signed-out ticket the reply is emailed — the sender can't read the
    // thread. Report whether that send worked instead of leaving it silent.
    (r) => { setReply(""); setShots([]); setNotice(r?.emailed == null ? "" : t(r.emailed ? "dev.reply_emailed" : "dev.reply_not_emailed")); });
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
              <b>{open.public ? t("dev.public_ticket") : open.storeName}</b> · {t(`sup.cat_${open.category}`)} · {t(`sup.pri_${open.priority}`)} · {t(`sup.status_${open.status}`)} · {fmt(open.createdAt)}
            </div>
          </div>
          {/* A signed-out request: everything in it is what an anonymous visitor
              typed, including the store code. Say so, and show where a reply
              actually goes — the sender can't read this thread, that's why they
              wrote in. */}
          {open.public && (
            <div className="border border-brass/40 bg-brass/5 rounded-xl p-3 text-[12px] leading-relaxed">
              <p className="font-semibold text-gold">{t("dev.public_hint", { email: open.contactEmail || "—" })}</p>
              {open.claimedSlug && <p className="text-muted mt-1 font-mono">{t("dev.claimed_store", { slug: open.claimedSlug })}</p>}
            </div>
          )}
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
          {notice && <p className="text-[13px] text-muted">{notice}</p>}
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
                <span className="block text-[12px] text-muted truncate">
                  <b>{tk.public ? t("dev.public_ticket") : tk.storeName}</b> · {t(`sup.cat_${tk.category}`)} · {fmt(tk.lastActivityAt)}
                </span>
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

/* ------------------------------ Audit log ------------------------------ */
// Append-only record of platform-admin store actions, read through /api/dev
// (clients are denied by firestore.rules). Read-only view — newest first.
function Audit({ t, lang }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiDev({ action: "listAudit" }).then((r) => setEntries(r.entries)).catch((e) => setError(e?.message || "load failed"));
  }, []);
  const fmt = (v) => { const ms = toMs(v); return ms ? new Date(ms).toLocaleString(lang === "es" ? "es" : "en") : ""; };

  if (entries === null && !error) return <p className="text-muted text-sm">{t("common.loading")}</p>;
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted">{t("dev.audit_sub")}</p>
      {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
      {entries && entries.length === 0 ? (
        <div className="card p-6 text-center text-[13px] text-muted">{t("dev.audit_empty")}</div>
      ) : (
        <div className="card overflow-hidden divide-y divide-line-soft">
          {(entries || []).map((e) => (
            <div key={e.id} className="px-4 py-2.5 flex items-start gap-3 text-[13px]">
              <span className={`pill flex-shrink-0 mt-0.5 ${e.action === "delete" ? "bg-neg/10 text-neg" : "bg-subtle text-muted"}`}>{t(`dev.aud_${e.action}`)}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{e.vendorName || e.vendorId}{e.detail ? <span className="text-muted font-normal"> · {e.detail}</span> : null}</div>
                <div className="text-[11px] text-muted">{t("dev.audit_by", { actor: e.actor })} · {fmt(e.ts)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Operators (RBAC) ------------------------------ */
// Grant / revoke platform-admin access + role — superadmin only (gated by the
// "operators" scope on both the tab and the server). Operators still sign in as
// their normal store user; this only sets their platform role in the server-only
// platformAdmins registry. The env dev login + PLATFORM_ADMIN_UIDS stay as
// break-glass superadmins, so the console can't be locked out from here.
const OP_ROLES = ["superadmin", "support", "finance", "readonly"];
function Operators({ t, lang, myId }) {
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ uid: "", name: "", email: "", role: "support" });
  const fmt = (v) => { const ms = toMs(v); return ms ? new Date(ms).toLocaleDateString(lang === "es" ? "es" : "en") : ""; };

  const load = () => apiDev({ action: "listAdmins" }).then((r) => setAdmins(r.admins)).catch((e) => setError(e?.message || "load failed"));
  useEffect(() => { load(); }, []);

  async function act(payload, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(payload.uid || "add"); setError("");
    try { await apiDev({ action: "adminAction", ...payload }); await load(); }
    catch (e) { setError(e?.code ? t(`sup.err_${e.code}`) : (e?.message || "failed")); }
    setBusy("");
  }
  const add = async () => {
    const uid = form.uid.trim();
    if (!uid) return;
    await act({ op: "upsert", uid, name: form.name.trim(), email: form.email.trim(), role: form.role, active: true });
    setForm({ uid: "", name: "", email: "", role: "support" });
  };

  if (admins === null && !error) return <p className="text-muted text-sm">{t("common.loading")}</p>;
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted">{t("dev.ops_sub")}</p>
      {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}

      <div className="card p-3.5 space-y-2.5">
        <div className="text-[13px] font-semibold">{t("dev.ops_add")}</div>
        <input className="input font-mono" value={form.uid} onChange={(e) => setForm((f) => ({ ...f, uid: e.target.value }))} placeholder={t("dev.ops_uid_ph")} />
        <div className="grid grid-cols-2 gap-2.5">
          <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("dev.ops_name_ph")} />
          <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {OP_ROLES.map((r) => <option key={r} value={r}>{t(`dev.role_${r}`)}</option>)}
          </select>
        </div>
        <input className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder={t("dev.ops_email_ph")} />
        <button type="button" className="btn-primary" disabled={!form.uid.trim() || busy === "add"} onClick={add}>{t("dev.ops_grant")}</button>
        <p className="text-[11px] text-muted leading-relaxed">{t("dev.ops_hint")}</p>
      </div>

      {admins && admins.length === 0 ? (
        <div className="card p-6 text-center text-[13px] text-muted">{t("dev.ops_empty")}</div>
      ) : (
        <div className="card overflow-hidden divide-y divide-line-soft">
          {(admins || []).map((a) => (
            <div key={a.id} className="px-4 py-2.5 flex items-center gap-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{a.name || a.id}{a.active === false ? <span className="text-muted font-normal"> · {t("dev.ops_inactive")}</span> : null}</div>
                <div className="text-[11px] text-muted font-mono truncate">{a.id}{a.email ? ` · ${a.email}` : ""}</div>
                {a.createdAt ? <div className="text-[11px] text-muted">{t("dev.ops_added", { date: fmt(a.createdAt) })}</div> : null}
              </div>
              {a.id === myId ? (
                <span className="pill bg-subtle text-muted flex-shrink-0">{t(`dev.role_${a.role}`)} · {t("dev.ops_you")}</span>
              ) : (
                <div className="flex gap-1.5 flex-shrink-0 items-center">
                  <select className="input w-auto text-[12px] py-1" value={a.role} disabled={busy === a.id}
                    onChange={(e) => act({ op: "upsert", uid: a.id, role: e.target.value, name: a.name, email: a.email, active: a.active !== false })}>
                    {OP_ROLES.map((r) => <option key={r} value={r}>{t(`dev.role_${r}`)}</option>)}
                  </select>
                  <button type="button" className="btn-ghost text-[13px] px-2.5 py-1 w-auto text-neg" disabled={busy === a.id}
                    onClick={() => act({ op: "remove", uid: a.id }, t("dev.ops_confirm_remove", { name: a.name || a.id }))}>{t("dev.ops_remove")}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Store manager ------------------------------ */
function Stores({ t, lang, me }) {
  const can = (scope) => (me?.scopes || []).includes(scope);
  const [stores, setStores] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [editBill, setEditBill] = useState(null); // vendorId whose billing editor is open
  const [resetFor, setResetFor] = useState(null);  // vendorId whose owner-recovery panel is open
  const [resetReason, setResetReason] = useState("");
  const [resetMode, setResetMode] = useState("link");
  const [resetLang, setResetLang] = useState("en"); // the OWNER's language, not the operator's
  const [resetResult, setResetResult] = useState(null);
  const [bill, setBill] = useState(DEFAULT_BILLING);
  const [toast, setToast] = useState(null);        // { msg, fn } — undo pill after a delete
  const toastTimer = useRef(null);
  const [fStatus, setFStatus] = useState("all");   // store lifecycle filter: all | active | suspended | deleted

  const load = () => apiDev({ action: "listStores" }).then((r) => setStores(r.stores)).catch((e) => setError(e?.message || "load failed"));
  useEffect(() => { load(); }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // The /dev page is outside AppShell, so it has no `ping` — this is a local
  // clone of that 8-second undo toast, shown after a soft-delete so a mis-click
  // is one tap away from reversal (the store is also restorable from its row).
  const showUndo = (msg, fn) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, fn });
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  };
  const runUndo = async () => {
    const fn = toast?.fn;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
    if (fn) await fn();
  };

  const summary = useMemo(() => buildBillingSummary(stores || []), [stores]);
  const openBilling = (s) => { setBill({ ...DEFAULT_BILLING, ...(s.billing || {}), price: String(s.billing?.price ?? "") }); setEditBill(s.id); };

  // Owner-lockout recovery (see the panel below the store row).
  const openReset = (s) => {
    setResetFor(s.id); setResetReason(""); setResetResult(null);
    // Default to the link unless there's nowhere to send it.
    setResetMode(s.ownerEmail ? "link" : "temp");
    setResetLang(lang === "es" ? "es" : "en");
  };
  const closeReset = () => { setResetFor(null); setResetResult(null); };
  async function doReset(s) {
    setBusy(s.id); setError("");
    try {
      const r = await apiDev({
        action: "storeAction", vendorId: s.id, op: "resetOwnerPin",
        reason: resetReason.trim(), mode: resetMode, lang: resetLang,
      });
      setResetResult(r.mode === "temp"
        ? { vendorId: s.id, msg: t("dev.reset_temp", { pin: r.pin }), tone: "pos" }
        : { vendorId: s.id, tone: r.sent ? "pos" : "neg",
            msg: r.sent ? t("dev.reset_sent", { email: r.email }) : t("dev.reset_unsent") });
      setResetReason("");
      await load();
    } catch (e) { setError(e?.code ? t(`sup.err_${e.code}`) : (e?.message || "failed")); }
    setBusy("");
  }
  // Show a store's plan in one line: "Pro · Active · $49/mo".
  const billLine = (b) => `${t(`dev.plan_${b.plan}`)} · ${t(`dev.bs_${b.status}`)} · ${money(b.price)}${b.cycle === "annual" ? t("dev.per_yr") : t("dev.per_mo")}`;

  async function op(vendorId, payload, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return false;
    setBusy(vendorId); setError("");
    let ok = true;
    try { await apiDev({ action: "storeAction", vendorId, ...payload }); await load(); }
    catch (e) { ok = false; setError(e?.code ? t(`sup.err_${e.code}`) : (e?.message || "failed")); }
    setBusy("");
    return ok;
  }
  // Soft-delete a store, then offer an immediate 8s undo. The confirm stays
  // (a whole store is a big object to remove); the undo and the row's Restore
  // button make it fully reversible either way — nothing is actually erased.
  async function deleteStore(s) {
    if (!window.confirm(t("dev.confirm_delete", { name: s.name }))) return;
    setBusy(s.id); setError("");
    try {
      await apiDev({ action: "storeAction", vendorId: s.id, op: "delete" });
      await load();
      showUndo(t("dev.deleted_toast", { name: s.name }), () => op(s.id, { op: "restore" }));
    } catch (e) { setError(e?.code ? t(`sup.err_${e.code}`) : (e?.message || "failed")); }
    setBusy("");
  }
  const fmt = (v) => { const ms = toMs(v); return ms ? new Date(ms).toLocaleDateString(lang === "es" ? "es" : "en") : ""; };
  const statusOf = (s) => s.status || "active";

  // Store-lifecycle counts for the filter chips (a store with no status is active).
  const counts = useMemo(() => {
    const c = { all: 0, active: 0, suspended: 0, deleted: 0 };
    for (const s of stores || []) { c.all += 1; c[statusOf(s)] = (c[statusOf(s)] || 0) + 1; }
    return c;
  }, [stores]);

  const shown = useMemo(() => {
    if (!stores) return [];
    const needle = q.trim().toLowerCase();
    return stores.filter((s) =>
      (fStatus === "all" || statusOf(s) === fStatus) &&
      (!needle || `${s.name} ${s.slug} ${s.ownerName}`.toLowerCase().includes(needle)));
  }, [stores, q, fStatus]);
  const storePage = usePaged(shown, { resetKey: `${q}|${fStatus}` }); // reveal 20 at a time

  // Export the (filtered) store roster — a plain admin record. csvCell guards
  // against CSV-injection; downloadCSV does the Blob + anchor download.
  const exportStores = () => {
    const rows = [["Store", "Code", "Status", "Owner", "Email", "Staff", "Created", "Plan", "Billing status", "Price", "Note"]];
    for (const s of shown) rows.push([
      s.name, s.slug, statusOf(s), s.ownerName || "", s.ownerEmail || "", s.staffCount ?? 0, fmt(s.createdAt),
      s.billing?.plan || "", s.billing?.status || "", s.billing?.price != null ? Number(s.billing.price).toFixed(2) : "", s.note || "",
    ]);
    downloadCSV(rows.map((r) => r.map(csvCell).join(",")).join("\n"), "duocount-stores.csv");
  };

  if (stores === null) return <p className="text-muted text-sm">{t("common.loading")}</p>;

  return (
    <div className="space-y-3">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dev.store_search")} />
      {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}

      {/* Subscriber roll-up — status counts + monthly recurring revenue. */}
      <div className="card p-3.5">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
          <div><div className="text-lg font-bold font-mono">{summary.total}</div><div className="text-[10px] uppercase tracking-wide text-muted font-semibold">{t("dev.subs_total")}</div></div>
          <div><div className="text-lg font-bold font-mono text-pos">{summary.byStatus.active}</div><div className="text-[10px] uppercase tracking-wide text-muted font-semibold">{t("dev.bs_active")}</div></div>
          <div><div className="text-lg font-bold font-mono">{summary.byStatus.trial}</div><div className="text-[10px] uppercase tracking-wide text-muted font-semibold">{t("dev.bs_trial")}</div></div>
          <div><div className={`text-lg font-bold font-mono ${summary.byStatus.past_due ? "text-neg" : ""}`}>{summary.byStatus.past_due}</div><div className="text-[10px] uppercase tracking-wide text-muted font-semibold">{t("dev.bs_past_due")}</div></div>
          <div><div className="text-lg font-bold font-mono text-gold">{money(summary.mrr)}</div><div className="text-[10px] uppercase tracking-wide text-muted font-semibold">{t("dev.mrr")}</div></div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {[["all", t("dev.f_all"), counts.all], ["active", t("dev.bs_active"), counts.active], ["suspended", t("dev.suspended"), counts.suspended], ["deleted", t("dev.deleted"), counts.deleted]].map(([val, label, n]) => (
          <button key={val} type="button" onClick={() => setFStatus(val)}
            className={`text-[12px] px-2.5 py-1 rounded-lg border transition ${fStatus === val ? "bg-fg text-surface border-fg" : "border-line text-muted hover:text-fg"}`}>
            {label} <span className="tabular-nums opacity-70">{n}</span>
          </button>
        ))}
        <button type="button" className="btn-ghost text-[13px] px-3 py-1.5 w-auto ml-auto" disabled={!shown.length} onClick={exportStores}><ActionIcon name="download" />{t("dev.export_stores")}</button>
      </div>

      <p className="text-[12px] text-muted">{t("dev.store_count", { n: shown.length })}</p>
      {storePage.visible.map((s) => (
        <div key={s.id} className={`card p-3.5 space-y-2 ${s.status === "suspended" || s.status === "deleted" ? "border-neg/40" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-[14px] flex items-center gap-2 flex-wrap">
                <span className={`truncate ${s.status === "deleted" ? "line-through text-muted" : ""}`}>{s.name}</span>
                {s.status === "suspended" && <span className="text-[10px] uppercase tracking-wide font-bold text-neg border border-neg/50 rounded px-1.5 py-0.5">{t("dev.suspended")}</span>}
                {s.status === "deleted" && <span className="text-[10px] uppercase tracking-wide font-bold text-neg border border-neg/50 rounded px-1.5 py-0.5">{t("dev.deleted")}</span>}
                {/* The forget-me-not: a canceled billing record on a store that can
                    still sign in. Stays red until the store is suspended (or the
                    record leaves canceled), so a skipped suspend can't hide. */}
                {s.billing?.status === "canceled" && (s.status || "active") === "active" &&
                  <span className="text-[10px] uppercase tracking-wide font-bold text-neg border border-neg/50 rounded px-1.5 py-0.5">{t("dev.bill_canceled_active")}</span>}
                {s.openTickets > 0 && <span className="text-[10px] uppercase tracking-wide font-bold text-gold border border-brass/50 rounded px-1.5 py-0.5">{t("dev.open_tix", { n: s.openTickets })}</span>}
              </div>
              <div className="text-[12px] text-muted font-mono">/{s.slug}</div>
              <div className="text-[12px] text-muted">{t("dev.owner")}: {s.ownerName || "—"}{s.ownerEmail ? ` · ${s.ownerEmail}` : ""} · {t("dev.staff_n", { n: s.staffCount })} · {fmt(s.createdAt)}</div>
              {s.status === "deleted" && <div className="text-[12px] text-neg mt-0.5">{t("dev.deleted_at", { date: fmt(s.deletedAt) || "—", by: s.deletedBy || "—" })}</div>}
              <div className="text-[12px] mt-1">
                <span className="text-muted">{t("dev.billing")}: </span>
                {s.billing ? <span className="text-fg font-medium">{billLine(s.billing)}</span> : <span className="text-muted italic">{t("dev.no_billing")}</span>}
              </div>
              {s.note && <div className="text-[12px] text-fg mt-1 italic">“{s.note}”</div>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {s.status === "deleted" ? (
              can("lifecycle") && <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id} onClick={() => op(s.id, { op: "restore" })}><ActionIcon name="restore" />{t("dev.restore")}</button>
            ) : (
              <>
                {can("lifecycle") && (s.status === "suspended" ? (
                  <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id} onClick={() => op(s.id, { op: "activate" })}><ActionIcon name="reactivate" />{t("dev.reactivate")}</button>
                ) : (
                  <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id} onClick={() => op(s.id, { op: "suspend" }, t("dev.confirm_suspend", { name: s.name }))}><ActionIcon name="suspend" />{t("dev.suspend")}</button>
                ))}
                {can("billing") && <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id}
                  onClick={() => (editBill === s.id ? setEditBill(null) : openBilling(s))}><ActionIcon name="billing" />{t("dev.edit_billing")}</button>}
                {can("stores") && <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id}
                  onClick={() => { const name = window.prompt(t("dev.rename_prompt"), s.name); if (name != null && name.trim()) op(s.id, { op: "rename", name: name.trim() }); }}><ActionIcon name="rename" />{t("dev.rename")}</button>}
                {can("stores") && <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id}
                  onClick={() => { const note = window.prompt(t("dev.note_prompt"), s.note || ""); if (note != null) op(s.id, { op: "note", note }); }}><ActionIcon name="note" />{t("dev.note")}</button>}
                {can("pin") && <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={busy === s.id}
                  onClick={() => (resetFor === s.id ? closeReset() : openReset(s))}><ActionIcon name="pin" />{t("dev.reset_pin")}</button>}
                {can("lifecycle") && <button className="btn-ghost text-[13px] px-3 py-1.5 w-auto text-neg" disabled={busy === s.id}
                  onClick={() => deleteStore(s)}><ActionIcon name="delete" />{t("dev.delete")}</button>}
              </>
            )}
          </div>

          {/* Owner-lockout recovery. The operator no longer picks the PIN: the
              default mails the owner the same one-time link the self-serve flow
              uses, so support never sees a working credential. The temporary-PIN
              fallback exists only for an owner with no confirmed address, and
              what it issues dies at that owner's next sign-in. Either way a
              written reason lands in the audit log. */}
          {resetFor === s.id && (
            <div className="border-t border-line pt-3 mt-1 space-y-2.5">
              <Field label={t("dev.reset_reason")}>
                <input className="input" value={resetReason} onChange={(e) => setResetReason(e.target.value)} />
              </Field>
              <div className="space-y-1.5">
                {[["link", t("dev.reset_mode_link")], ["temp", t("dev.reset_mode_temp")]].map(([val, label]) => (
                  <label key={val} className="flex items-start gap-2 text-[13px]">
                    <input type="radio" name={`resetmode-${s.id}`} className="mt-1" checked={resetMode === val}
                      onChange={() => setResetMode(val)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <p className="text-[12px] text-muted leading-relaxed">{t("dev.reset_mode_hint")}</p>
              {resetMode === "link" && !s.ownerEmail && <p className="text-[12px] text-gold">{t("dev.reset_no_email")}</p>}
              <div className="flex gap-2">
                <select className="input w-auto" value={resetLang} onChange={(e) => setResetLang(e.target.value)}
                  aria-label={t("lang.language")}>
                  {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l] || l}</option>)}
                </select>
                <button className="btn-primary flex-1" disabled={busy === s.id || resetReason.trim().length < 10}
                  onClick={() => doReset(s)}>{t("dev.reset_send")}</button>
                <button className="btn-ghost w-auto px-4" disabled={busy === s.id} onClick={closeReset}>{t("dev.cancel")}</button>
              </div>
              {/* Shown exactly once — it is never stored anywhere the console can
                  read it back, which is the point of a one-trip credential. */}
              {resetResult?.vendorId === s.id && (
                <p className={`text-[13px] ${resetResult.tone === "neg" ? "text-neg" : "text-pos"} font-medium break-words`}>{resetResult.msg}</p>
              )}
            </div>
          )}

          {editBill === s.id && (
            <div className="border-t border-line pt-3 mt-1 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block"><span className="label">{t("dev.plan")}</span>
                  <select className="input" value={bill.plan} onChange={(e) => setBill((b) => ({ ...b, plan: e.target.value }))}>
                    {BILLING_PLANS.map((p) => <option key={p} value={p}>{t(`dev.plan_${p}`)}</option>)}
                  </select></label>
                <label className="block"><span className="label">{t("dev.bstatus")}</span>
                  <select className="input" value={bill.status} onChange={(e) => setBill((b) => ({ ...b, status: e.target.value }))}>
                    {BILLING_STATUSES.map((st) => <option key={st} value={st}>{t(`dev.bs_${st}`)}</option>)}
                  </select></label>
                <label className="block"><span className="label">{t("dev.cycle")}</span>
                  <select className="input" value={bill.cycle} onChange={(e) => setBill((b) => ({ ...b, cycle: e.target.value }))}>
                    {BILLING_CYCLES.map((cy) => <option key={cy} value={cy}>{t(`dev.cyc_${cy}`)}</option>)}
                  </select></label>
                <label className="block"><span className="label">{t("dev.price")}</span>
                  <input className="input" inputMode="decimal" value={bill.price}
                    onChange={(e) => setBill((b) => ({ ...b, price: e.target.value }))} placeholder="0.00" /></label>
              </div>
              <input className="input" value={bill.note || ""} onChange={(e) => setBill((b) => ({ ...b, note: e.target.value }))} placeholder={t("dev.billing_note_ph")} />
              <p className="text-[11px] text-muted leading-relaxed">{t("dev.billing_hint")}</p>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={busy === s.id}
                  onClick={async () => {
                    const saved = await op(s.id, { op: "billing", billing: bill });
                    setEditBill(null);
                    // Billing status is a RECORD; access is the suspend switch. A
                    // canceled record on a still-active store is the gap where a
                    // store keeps using the app free — so the moment the record
                    // goes canceled, offer the (audited) suspend right here. No
                    // silent auto-block: a cancellation often has a paid runway,
                    // and cutting access stays a deliberate, visible action.
                    if (saved && bill.status === "canceled" && statusOf(s) === "active" && can("lifecycle")
                        && window.confirm(t("dev.bill_canceled_suspend", { name: s.name }))) {
                      await op(s.id, { op: "suspend" });
                    }
                  }}>{t("dev.save_billing")}</button>
                <button className="btn-ghost w-auto px-4" disabled={busy === s.id} onClick={() => setEditBill(null)}>{t("dev.cancel")}</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <ShowMore hasMore={storePage.hasMore} nextStep={storePage.nextStep} onMore={storePage.showMore} />

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-50 flex items-center gap-3 bg-ink text-paper rounded-full px-4 py-2.5 shadow-lg text-[13px]" role="status">
          <span>{toast.msg}</span>
          <button className="font-bold uppercase tracking-wide text-gold" onClick={runUndo}>{t("common.undo")}</button>
        </div>
      )}
    </div>
  );
}
