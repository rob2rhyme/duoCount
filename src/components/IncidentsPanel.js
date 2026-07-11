"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { addIncident, ackIncident, closeIncident, watchStaff } from "@/lib/data";
import { toDate } from "@/lib/utils";
import { useSession } from "./SessionProvider";
import EmptyState, { IconShield } from "./EmptyState";

const CATEGORIES = [
  ["cash-handling", "Cash handling"],
  ["till-procedure", "Till procedure"],
  ["policy", "Policy"],
  ["safety", "Safety"],
  ["customer", "Customer"],
  ["attendance", "Attendance"],
  ["other", "Other"],
];
const SEVERITIES = [
  ["note", "Note"],
  ["warning", "Warning"],
  ["serious", "Serious"],
];

const sevPill = (s) =>
  s === "serious" ? "bg-red-100 text-red-700"
  : s === "warning" ? "bg-highlight text-gold border border-brass/30"
  : "bg-subtle text-muted";
const statusPill = (s) =>
  s === "open" ? "bg-red-100 text-red-700"
  : s === "acknowledged" ? "bg-highlight text-gold border border-brass/30"
  : "bg-subtle text-muted";

const fmt = (ts) => {
  const t = toDate(ts);
  return t ? `${t.toLocaleDateString()} ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "…";
};

// Evidence links: up to 5 http(s) URLs, one per line.
function parseLinks(raw) {
  const urls = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (urls.length > 5) return { error: "At most 5 evidence links" };
  for (const u of urls) {
    if (!/^https?:\/\//i.test(u) || u.length > 500)
      return { error: "Links must start with http(s):// (max 500 chars each)" };
  }
  return { links: urls };
}

export default function IncidentsPanel({ incidents, locations, locName, onToast }) {
  const { profile, vendor, isManager } = useSession();

  const [staff, setStaff] = useState([]);
  const [f, setF] = useState({ title: "", subjectId: "", severity: "note", category: "other", locationId: "", text: "", links: "" });
  const [viewStatus, setViewStatus] = useState("all");
  const [busy, setBusy] = useState(false);
  const [ackFor, setAckFor] = useState(null); // incident id with the ack composer open
  const [ackText, setAckText] = useState("");
  const titleRef = useRef(null);

  useEffect(() => {
    if (isManager) return watchStaff(vendor.id, setStaff);
  }, [vendor.id, isManager]);
  useEffect(() => {
    if (!f.locationId && locations[0]) setF((p) => ({ ...p, locationId: locations[0].id }));
  }, [locations]); // eslint-disable-line

  const visible = useMemo(
    () => (viewStatus === "all" ? incidents : incidents.filter((i) => i.status === viewStatus)),
    [incidents, viewStatus]);

  async function post() {
    const title = f.title.trim(), text = f.text.trim();
    if (!title) return onToast?.("Give the incident a title");
    if (!text) return onToast?.("Describe what happened");
    if (!f.locationId) return onToast?.("Pick a location");
    const parsed = parseLinks(f.links);
    if (parsed.error) return onToast?.(parsed.error);
    const subject = staff.find((s) => s.id === f.subjectId) || null;
    setBusy(true);
    try {
      await addIncident(vendor.id, {
        title: title.slice(0, 120), text: text.slice(0, 4000),
        category: f.category, severity: f.severity,
        subjectId: subject ? subject.id : null, subjectName: subject ? subject.name : null,
        entryId: null, links: parsed.links,
        locationId: f.locationId, locationName: locName(f.locationId),
        by: profile.name, byId: profile.id, byRole: profile.role,
      });
      setF((p) => ({ ...p, title: "", subjectId: "", severity: "note", category: "other", text: "", links: "" }));
      onToast?.("Incident filed");
    } catch (e) { console.error(e); onToast?.("Filing failed"); }
    setBusy(false);
  }

  async function acknowledge(inc) {
    setBusy(true);
    try {
      await ackIncident(vendor.id, inc.id, ackText);
      setAckFor(null); setAckText("");
      onToast?.("Acknowledged — your response is on the record");
    } catch (e) { console.error(e); onToast?.("Acknowledge failed"); }
    setBusy(false);
  }

  const close = (inc) =>
    closeIncident(vendor.id, inc.id, profile.name)
      .then(() => onToast?.("Incident closed"))
      .catch(() => onToast?.("Managers only"));

  return (
    <div className="space-y-4">
      {isManager ? (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line">
            <h2 className="font-semibold text-[15px]">File an incident</h2>
            <p className="text-[13px] text-muted mt-0.5">
              Signed, permanent, and shown to the person it concerns — they can acknowledge and add their side. Write-ups can't be edited after filing.
            </p>
          </div>
          <div className="p-4 space-y-3">
            <div><label className="label">Title</label>
              <input ref={titleRef} className="input" maxLength={120} value={f.title}
                placeholder="e.g. Till left unlocked during break"
                onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Concerning</label>
                <select className="input" value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
                  <option value="">General — no one specific</option>
                  {staff.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label className="label">Severity</label>
                <select className="input" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
                  {SEVERITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
              <div><label className="label">Category</label>
                <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                  {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
              <div><label className="label">Location</label>
                <select className="input" value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select></div>
            </div>
            <div><label className="label">What happened</label>
              <textarea className="input min-h-[96px]" maxLength={4000} value={f.text}
                placeholder="Facts, times, who was present, what was said…"
                onChange={(e) => setF({ ...f, text: e.target.value })} /></div>
            <div><label className="label">Evidence links (optional, one per line — camera clips, photos)</label>
              <textarea className="input min-h-[44px] font-mono text-[13px]" value={f.links}
                placeholder="https://…"
                onChange={(e) => setF({ ...f, links: e.target.value })} /></div>
            <button className="btn-primary" disabled={busy} onClick={post}>{busy ? "Filing…" : "File incident"}</button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-muted px-1">
          Write-ups that concern you appear here. Acknowledging means "I've seen this" — not "I agree" — and you can add your side to the permanent record.
        </p>
      )}

      {isManager && incidents.length > 0 && (
        <select className="input w-auto" value={viewStatus} onChange={(e) => setViewStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="closed">Closed</option>
        </select>
      )}

      <div className="card overflow-hidden">
        {visible.length === 0 ? (
          isManager ? (
            <EmptyState icon={<IconShield />} title="No incidents on file"
              subtitle="A clean record. If something needs documenting, file a signed write-up above — it can't be edited after filing."
              action={{ label: "File an incident", onClick: () => titleRef.current?.focus() }} />
          ) : (
            <EmptyState icon={<IconShield />} title="Nothing on file"
              subtitle="Write-ups that concern you would appear here. There's nothing to acknowledge right now." />
          )
        ) : visible.map((inc) => (
          <div key={inc.id} className="px-4 py-3.5 border-b border-line last:border-0">
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm">{inc.title}</div>
                <div className="mt-1.5 flex gap-2 flex-wrap items-center">
                  <span className={`pill ${sevPill(inc.severity)}`}>{inc.severity}</span>
                  <span className={`pill ${statusPill(inc.status)}`}>{inc.status}</span>
                  {inc.subjectName && <span className="pill bg-subtle text-muted">re: {inc.subjectName}</span>}
                  {inc.locationName && <span className="pill bg-subtle text-muted">{inc.locationName}</span>}
                </div>
                <div className="mt-2 text-sm whitespace-pre-wrap">{inc.text}</div>
                {(inc.links || []).length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {inc.links.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                        className="block text-[12px] font-mono text-gold underline underline-offset-2 truncate">🔗 {u}</a>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-[12px] text-muted font-mono">
                  Filed by {inc.by} · {fmt(inc.ts)}
                </div>
                {inc.ackAt && (
                  <div className="mt-1.5 text-[13px] bg-panel border border-line-soft rounded-lg px-3 py-2">
                    <span className="text-muted">Acknowledged {fmt(inc.ackAt)}</span>
                    {inc.ackNote && <div className="mt-1 whitespace-pre-wrap">{inc.ackNote}</div>}
                  </div>
                )}
                {inc.closedBy && (
                  <div className="mt-1.5 text-[12px] text-muted font-mono">Closed by {inc.closedBy} · {fmt(inc.closedAt)}</div>
                )}
              </div>
              {isManager && inc.status !== "closed" && (
                <button className="btn-ghost text-[12px] px-2.5 py-1 flex-shrink-0" onClick={() => close(inc)}>Close</button>
              )}
            </div>

            {!isManager && inc.status === "open" && inc.subjectId === profile.id && (
              ackFor === inc.id ? (
                <div className="mt-3 space-y-2">
                  <textarea className="input min-h-[64px]" maxLength={1000} value={ackText}
                    placeholder="Your side, on the record (optional)…"
                    onChange={(e) => setAckText(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="btn-primary" disabled={busy} onClick={() => acknowledge(inc)}>
                      {busy ? "Saving…" : "Acknowledge"}
                    </button>
                    <button className="btn-ghost" onClick={() => { setAckFor(null); setAckText(""); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn-primary mt-3" onClick={() => setAckFor(inc.id)}>Acknowledge…</button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
