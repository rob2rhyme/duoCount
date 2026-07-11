"use client";
import { useEffect, useMemo, useState } from "react";
import { addNote, updateNote } from "@/lib/data";
import { toDate } from "@/lib/utils";
import { useSession } from "./SessionProvider";

const today = () => new Date().toISOString().slice(0, 10);

export default function NotesPanel({ notes, locations, locName, onToast }) {
  const { profile, vendor, isManager } = useSession();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;

  const [text, setText] = useState("");
  const [f, setF] = useState({ locationId: "", shift: "" });
  const [viewLoc, setViewLoc] = useState("all");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!f.locationId && (lockedLoc || locations[0]))
      setF((p) => ({ ...p, locationId: lockedLoc || locations[0].id }));
  }, [locations, lockedLoc]); // eslint-disable-line

  const canFilter = !lockedLoc && locations.length > 1;
  const visible = useMemo(() => {
    let list = notes.filter((n) => (showArchived ? true : n.active !== false));
    if (!lockedLoc && viewLoc !== "all") list = list.filter((n) => n.locationId === viewLoc);
    // pinned first, then newest first (notes arrive newest-first already)
    return [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)];
  }, [notes, viewLoc, lockedLoc, showArchived]);

  async function post() {
    const body = text.trim();
    if (!body) return onToast?.("Write a note first");
    if (!f.locationId) return onToast?.("Pick a location");
    setBusy(true);
    try {
      await addNote(vendor.id, {
        text: body.slice(0, 2000),
        locationId: f.locationId, locationName: locName(f.locationId),
        shift: f.shift || null, date: today(),
        by: profile.name, byId: profile.id, byRole: profile.role,
      });
      setText("");
      onToast?.("Note posted");
    } catch (e) { console.error(e); onToast?.("Post failed"); }
    setBusy(false);
  }

  const patch = (n, p, msg) =>
    updateNote(vendor.id, n.id, p).then(() => onToast?.(msg)).catch(() => onToast?.("Managers only"));

  return (
    <div className="space-y-4">
      {/* composer */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#dcd8cc]">
          <h2 className="font-semibold text-[15px]">Shift notes</h2>
          <p className="text-[13px] text-neutral-500 mt-0.5">The counter notebook, digitized — printer jams, IOUs, till swaps. Notes can't be edited after posting.</p>
        </div>
        <div className="p-4 space-y-3">
          <textarea className="input min-h-[76px]" maxLength={2000} value={text}
            placeholder="Leave a note for the next shift…"
            onChange={(e) => setText(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Location</label>
              <select className="input" value={f.locationId} disabled={!!lockedLoc}
                onChange={(e) => setF({ ...f, locationId: e.target.value })}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
            <div><label className="label">Shift (optional)</label>
              <select className="input" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>
                <option value="">—</option>
                <option value="open">Opening</option>
                <option value="close">Closing</option>
              </select></div>
          </div>
          <button className="btn-primary" disabled={busy} onClick={post}>{busy ? "Posting…" : "Post note"}</button>
        </div>
      </div>

      {/* filters */}
      {(canFilter || isManager) && (
        <div className="flex gap-2 flex-wrap items-center">
          {canFilter && (
            <select className="input w-auto flex-1 min-w-[140px]" value={viewLoc} onChange={(e) => setViewLoc(e.target.value)}>
              <option value="all">All locations</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {isManager && (
            <label className="flex items-center gap-2 text-[13px] text-neutral-500">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>
          )}
        </div>
      )}

      {/* feed */}
      <div className="card overflow-hidden">
        {visible.length === 0 ? (
          <div className="text-center py-12 px-5 text-neutral-500">No notes yet. Anything the next shift should know goes here.</div>
        ) : visible.map((n) => {
          const t = toDate(n.ts);
          return (
            <div key={n.id} className={`px-4 py-3.5 border-b border-[#dcd8cc] last:border-0 ${n.active === false ? "opacity-50" : ""}`}>
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="text-sm whitespace-pre-wrap">{n.pinned && <span title="Pinned">📌 </span>}{n.text}</div>
                  <div className="mt-2 flex gap-2 flex-wrap items-center">
                    <span className="text-[12px] text-neutral-500 font-mono">
                      {n.by} · {t ? `${t.toLocaleDateString()} ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "…"}
                    </span>
                    {n.locationName && <span className="pill bg-[#eceae2] text-neutral-600">{n.locationName}</span>}
                    {n.shift && <span className="pill bg-[#fbf6ec] text-brass-dk border border-brass/30">{n.shift === "open" ? "Opening" : "Closing"}</span>}
                    {n.active === false && <span className="pill bg-red-100 text-red-600">Archived</span>}
                  </div>
                </div>
                {isManager && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button className="btn-ghost text-[12px] px-2.5 py-1"
                      onClick={() => patch(n, { pinned: !n.pinned }, n.pinned ? "Unpinned" : "Pinned")}>
                      {n.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button className="btn-ghost text-[12px] px-2.5 py-1"
                      onClick={() => patch(n, { active: !(n.active !== false) }, n.active !== false ? "Archived" : "Restored")}>
                      {n.active !== false ? "Archive" : "Restore"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
