"use client";
import { useEffect, useMemo, useState } from "react";
import {
  verifyEntry, investigateEntry, setDisputeStatus, addComment, watchComments,
} from "@/lib/data";
import { money, toDate, exportCSV } from "@/lib/utils";
import { useSession } from "./SessionProvider";

export const CAUSE_CODES = [
  ["human-error", "Human error"],
  ["training-gap", "Training gap"],
  ["equipment-fault", "Equipment fault"],
  ["register-error", "Register error"],
  ["suspected-theft", "Suspected theft"],
  ["other", "Other"],
];
export const causeLabel = (c) => CAUSE_CODES.find(([k]) => k === c)?.[1] || c || "";

/* ---------- expanded detail: thread + dispute + resolution ---------- */
function EntryDetail({ e, onToast }) {
  const { profile, vendor, isManager } = useSession();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [disputing, setDisputing] = useState(false);

  useEffect(() => watchComments(vendor.id, e.id, setComments), [vendor.id, e.id]);

  const isAuthor = e.byId === profile.id;
  const dStatus = e.disputeStatus || "none";
  const vStatus = e.varianceStatus || "none";

  /* resolution panel state (managers) */
  const [res, setRes] = useState({ status: vStatus, causeCode: e.causeCode || "", causeNote: e.causeNote || "" });
  useEffect(() => { setRes({ status: vStatus, causeCode: e.causeCode || "", causeNote: e.causeNote || "" }); }, [vStatus, e.causeCode, e.causeNote]);

  async function post(kind = "comment", forcedText) {
    const body = (forcedText ?? text).trim();
    if (!body) return onToast?.("Write something first");
    setBusy(true);
    try {
      await addComment(vendor.id, e, { text: body, kind }, profile);
      if (!forcedText) setText("");
    } catch (err) { console.error(err); onToast?.("Comment failed"); }
    setBusy(false);
  }

  async function openDispute() {
    const body = text.trim();
    if (!body) return onToast?.("Explain why you're disputing this count");
    setBusy(true);
    try {
      await setDisputeStatus(vendor.id, e.id, "open");
      await addComment(vendor.id, e, { text: body, kind: "comment" }, profile);
      setText(""); setDisputing(false);
      onToast?.("Dispute opened");
    } catch (err) { console.error(err); onToast?.("Failed — only the author can dispute"); }
    setBusy(false);
  }

  async function moveDispute(status) {
    setBusy(true);
    try {
      await setDisputeStatus(vendor.id, e.id, status);
      await addComment(vendor.id, { ...e, disputeStatus: status }, {
        text: status === "resolved" ? `Dispute resolved by ${profile.name}` : `Dispute marked under review by ${profile.name}`,
        kind: "status",
      }, profile);
      onToast?.(status === "resolved" ? "Dispute resolved" : "Dispute under review");
    } catch (err) { console.error(err); onToast?.("Managers only"); }
    setBusy(false);
  }

  async function saveResolution() {
    const patch = { varianceStatus: res.status };
    if (res.causeCode) patch.causeCode = res.causeCode;
    if (res.causeNote.trim()) patch.causeNote = res.causeNote.trim().slice(0, 500);
    if (res.status === "resolved") {
      if (!res.causeCode) return onToast?.("Pick a cause code to resolve");
      if (res.causeCode === "other" && !res.causeNote.trim()) return onToast?.("'Other' needs a note");
      patch.resolvedBy = profile.name;
      patch.resolvedAt = new Date();
    }
    setBusy(true);
    try {
      await investigateEntry(vendor.id, e.id, patch);
      await addComment(vendor.id, e, {
        text: res.status === "resolved" ? `Resolved — ${causeLabel(res.causeCode)}` : `Marked ${res.status.replace("-", " ")}`,
        kind: "status",
      }, profile);
      onToast?.("Updated");
    } catch (err) { console.error(err); onToast?.("Update failed"); }
    setBusy(false);
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-3">
      {/* resolution panel — managers, flagged entries */}
      {isManager && vStatus !== "none" && (
        <div className="bg-panel border border-line rounded-xl p-3 space-y-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Variance resolution</div>
          <div className="grid grid-cols-2 gap-2.5">
            <select className="input py-1.5 text-sm" value={res.status}
              onChange={(ev) => setRes({ ...res, status: ev.target.value })}>
              <option value="open">Open</option>
              <option value="under-review">Under review</option>
              <option value="resolved">Resolved</option>
            </select>
            <select className="input py-1.5 text-sm" value={res.causeCode}
              onChange={(ev) => setRes({ ...res, causeCode: ev.target.value })}>
              <option value="">Cause code…</option>
              {CAUSE_CODES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <input className="input py-1.5 text-sm" maxLength={500} placeholder="Note (required for 'Other')"
            value={res.causeNote} onChange={(ev) => setRes({ ...res, causeNote: ev.target.value })} />
          <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={busy} onClick={saveResolution}>Save resolution</button>
          {e.resolvedBy && <span className="text-xs text-muted ml-2">Resolved by {e.resolvedBy}</span>}
        </div>
      )}

      {/* dispute controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {isAuthor && dStatus === "none" && !disputing && (
          <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => setDisputing(true)}>Dispute this count</button>
        )}
        {isManager && dStatus === "open" && (
          <>
            <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={busy} onClick={() => moveDispute("under-review")}>Dispute → under review</button>
            <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={busy} onClick={() => moveDispute("resolved")}>Resolve dispute</button>
          </>
        )}
        {isManager && dStatus === "under-review" && (
          <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={busy} onClick={() => moveDispute("resolved")}>Resolve dispute</button>
        )}
        {dStatus === "resolved" && <span className="text-[13px] text-muted">Dispute resolved</span>}
      </div>

      {/* thread */}
      {comments.length > 0 && (
        <div className="space-y-2">
          {comments.map((c) => {
            const t = toDate(c.ts);
            return c.kind === "status" ? (
              <div key={c.id} className="text-xs text-faint italic">
                — {c.text} · {t ? t.toLocaleDateString() : ""}
              </div>
            ) : (
              <div key={c.id} className="bg-panel rounded-lg px-3 py-2">
                <div className="text-[12px] text-muted font-mono">
                  {c.by} · {t ? `${t.toLocaleDateString()} ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "…"}
                </div>
                <div className="text-sm mt-0.5 whitespace-pre-wrap">{c.text}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* composer */}
      <div className="flex gap-2">
        <input className="input py-1.5 text-sm" maxLength={2000}
          placeholder={disputing ? "Why are you disputing this count?" : "Add a comment…"}
          value={text} onChange={(ev) => setText(ev.target.value)} />
        {disputing ? (
          <>
            <button className="btn-primary w-auto px-3 py-1.5 text-[13px]" disabled={busy} onClick={openDispute}>Open dispute</button>
            <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => { setDisputing(false); setText(""); }}>Cancel</button>
          </>
        ) : (
          <button className="btn-ghost text-[13px] px-3 py-1.5 whitespace-nowrap" disabled={busy} onClick={() => post()}>Post</button>
        )}
      </div>
    </div>
  );
}

/* ---------- list ---------- */
export default function LogList({ entries, onToast, locName, showLocation }) {
  const { profile, vendor, isManager } = useSession();
  const [fType, setFType] = useState("all");
  const [fWho, setFWho] = useState("all");
  const [fDrawer, setFDrawer] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  const names = useMemo(() => [...new Set(entries.map((e) => e.by))].sort(), [entries]);
  const drawerNames = useMemo(() => [...new Set(entries.map((e) => e.drawerName).filter(Boolean))].sort(), [entries]);
  const rows = entries.filter((e) =>
    (fType === "all" || e.kind === fType) &&
    (fWho === "all" || e.by === fWho) &&
    (fDrawer === "all" || e.drawerName === fDrawer) &&
    (fStatus === "all"
      || (fStatus === "needs-review" && e.varianceStatus === "open")
      || (fStatus === "under-review" && e.varianceStatus === "under-review")
      || (fStatus === "resolved" && e.varianceStatus === "resolved")
      || (fStatus === "disputed" && ["open", "under-review"].includes(e.disputeStatus))));

  async function doVerify(e) {
    if (!isManager) return onToast?.("Managers only");
    if (e.byId === profile.id) return onToast?.("Can't verify your own entry");
    try { await verifyEntry(vendor.id, e.id, profile.name); onToast?.("Verified"); }
    catch (err) { console.error(err); onToast?.("Verify failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <select className="input w-auto flex-1 min-w-[110px]" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="all">All entries</option>
          <option value="cash">Cash only</option>
          <option value="scratch">Scratch-offs only</option>
          <option value="inventory">Inventory only</option>
        </select>
        <select className="input w-auto flex-1 min-w-[110px]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">Any status</option>
          <option value="needs-review">Needs review</option>
          <option value="under-review">Under review</option>
          <option value="resolved">Resolved</option>
          <option value="disputed">Disputed</option>
        </select>
        <select className="input w-auto flex-1 min-w-[110px]" value={fWho} onChange={(e) => setFWho(e.target.value)}>
          <option value="all">Everyone</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {drawerNames.length > 1 && (
          <select className="input w-auto flex-1 min-w-[110px]" value={fDrawer} onChange={(e) => setFDrawer(e.target.value)}>
            <option value="all">All drawers</option>
            {drawerNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <button className="btn-ghost" onClick={() => exportCSV(entries)}>Export CSV</button>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-12 px-5 text-muted">No entries match. Saved counts show up here for your team.</div>
        ) : rows.map((e) => {
          const t = toDate(e.ts);
          const stamp = `${e.by} · ${t ? t.toLocaleDateString() : "…"} ${t ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`;
          const locChip = showLocation && e.locationName
            ? <span className="pill bg-subtle text-muted">{e.locationName}</span> : null;
          const drawerChip = e.drawerName
            ? <span className="pill bg-highlight text-gold border border-brass/30">{e.drawerName}</span> : null;
          const statusChips = (
            <>
              {e.varianceStatus === "open" && <span className="pill bg-red-100 text-red-600 font-semibold">Needs review</span>}
              {e.varianceStatus === "under-review" && <span className="pill bg-amber-100 text-amber-700 font-semibold">Under review</span>}
              {e.varianceStatus === "resolved" && e.causeCode && <span className="pill bg-subtle text-muted">Resolved · {causeLabel(e.causeCode)}</span>}
              {["open", "under-review"].includes(e.disputeStatus) && <span className="pill bg-purple-100 text-purple-700 font-semibold">Disputed</span>}
              {e.blind === true && <span className="pill border border-line text-muted">Blind</span>}
            </>
          );
          const expanded = expandedId === e.id;
          return (
            <div key={e.id} className="px-4 py-3.5 border-b border-line last:border-0">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  {e.kind === "cash" ? (
                    <>
                      <div className="font-semibold text-[15px]">{e.drawerName || "Drawer"} — {e.shift === "open" ? "Opening" : "Closing"}</div>
                      <div className="text-[13px] text-muted font-mono mt-0.5">{stamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {Math.abs(e.diff) < 0.005
                          ? <span className="pill bg-subtle text-muted">Balanced</span>
                          : e.diff > 0
                            ? <span className="pill bg-green-100 text-green-700">Over {money(e.diff)}</span>
                            : <span className="pill bg-red-100 text-red-600">Short {money(Math.abs(e.diff))}</span>}
                        {statusChips}{locChip}
                      </div>
                    </>
                  ) : e.kind === "inventory" ? (
                    <>
                      <div className="font-semibold text-[15px]">{e.itemName || "Item"} — {e.shift === "open" ? "Opening" : "Closing"}</div>
                      <div className="text-[13px] text-muted font-mono mt-0.5">{stamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {e.diff === 0
                          ? <span className="pill bg-subtle text-muted">Exact count</span>
                          : e.diff > 0
                            ? <span className="pill bg-green-100 text-green-700">Over {e.diff}</span>
                            : <span className="pill bg-red-100 text-red-600">Missing {Math.abs(e.diff)}</span>}
                        <span className="pill bg-highlight text-gold border border-brass/30">{e.unit || "unit"}s</span>
                        {statusChips}{locChip}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-[15px]">{e.game} · ${e.price} tickets</div>
                      <div className="text-[13px] text-muted font-mono mt-0.5">Pack {e.pack || "—"} · #{e.startno}→{e.endno}</div>
                      <div className="text-[13px] text-muted font-mono">{stamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        <span className="pill bg-subtle text-muted">{e.sold} sold</span>
                        {statusChips}{drawerChip}{locChip}
                      </div>
                    </>
                  )}
                </div>
                <div className="text-right font-mono font-bold whitespace-nowrap">
                  {e.kind === "cash" ? (
                    <>{money(e.counted)}<br /><span className="text-xs text-muted font-normal">exp {money(e.expected)}</span></>
                  ) : e.kind === "inventory" ? (
                    <>{e.counted}<br /><span className="text-xs text-muted font-normal">exp {e.expected}</span></>
                  ) : money(e.dollars)}
                </div>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-dashed border-line flex items-center gap-3 flex-wrap">
                {e.verifiedBy ? (
                  <span className="text-[13px] text-green-700 font-semibold">✓ Verified by {e.verifiedBy}</span>
                ) : isManager && e.byId !== profile.id ? (
                  <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => doVerify(e)}>Verify count</button>
                ) : (
                  <span className="text-[13px] text-faint italic">Awaiting manager verification</span>
                )}
                <button className="btn-ghost text-[13px] px-3 py-1.5 ml-auto"
                  onClick={() => setExpandedId(expanded ? null : e.id)}>
                  💬 {e.commentCount || 0}{expanded ? " · close" : ""}
                </button>
              </div>
              {expanded && <EntryDetail e={e} onToast={onToast} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
