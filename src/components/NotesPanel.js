"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { addNote, updateNote } from "@/lib/data";
import { toDate } from "@/lib/utils";
import { searchTerms, matchesTerms } from "@/lib/text-match";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import EmptyState, { IconNote } from "./EmptyState";
import SearchInput from "./SearchInput";
import Highlight from "./Highlight";
import Field from "./Field";

const today = () => new Date().toISOString().slice(0, 10);

export default function NotesPanel({ notes, locations, locName, onToast }) {
  const { profile, vendor, isManager } = useSession();
  const { t } = useLang();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;

  const [text, setText] = useState("");
  const composerRef = useRef(null);
  const focusComposer = () => composerRef.current?.focus();
  const [f, setF] = useState({ locationId: "", shift: "" });
  const [viewLoc, setViewLoc] = useState("all");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const terms = useMemo(() => searchTerms(query), [query]);

  useEffect(() => {
    if (!f.locationId && (lockedLoc || locations[0]))
      setF((p) => ({ ...p, locationId: lockedLoc || locations[0].id }));
  }, [locations, lockedLoc]); // eslint-disable-line

  const canFilter = !lockedLoc && locations.length > 1;
  const base = useMemo(() => {
    let list = notes.filter((n) => (showArchived ? true : n.active !== false));
    if (!lockedLoc && viewLoc !== "all") list = list.filter((n) => n.locationId === viewLoc);
    // pinned first, then newest first (notes arrive newest-first already)
    return [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)];
  }, [notes, viewLoc, lockedLoc, showArchived]);
  const visible = useMemo(() => (terms.length
    ? base.filter((n) => matchesTerms(`${n.text} ${n.by} ${n.locationName || ""}`, terms))
    : base), [base, terms]);

  async function post() {
    const body = text.trim();
    if (!body) return onToast?.(t("notes.err_empty"));
    if (!f.locationId) return onToast?.(t("notes.err_location"));
    setBusy(true);
    try {
      await addNote(vendor.id, {
        text: body.slice(0, 2000),
        locationId: f.locationId, locationName: locName(f.locationId),
        shift: f.shift || null, date: today(),
        by: profile.name, byId: profile.id, byRole: profile.role,
      });
      setText("");
      onToast?.(t("notes.toast_posted"));
    } catch (e) { console.error(e); onToast?.(t("notes.toast_failed")); }
    setBusy(false);
  }

  const patch = (n, p, msg) =>
    updateNote(vendor.id, n.id, p).then(() => onToast?.(msg)).catch(() => onToast?.(t("common.managers_only")));

  return (
    <div className="space-y-4">
      {/* composer */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">{t("notes.title")}</h2>
          <p className="text-[13px] text-muted mt-0.5">{t("notes.subtitle")}</p>
        </div>
        <div className="p-4 space-y-3">
          <textarea ref={composerRef} className="input min-h-[76px]" maxLength={2000} value={text}
            aria-label={t("notes.composer_label")}
            placeholder={t("notes.placeholder")}
            onChange={(e) => setText(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.location")}>
              <select className="input" value={f.locationId} disabled={!!lockedLoc}
                onChange={(e) => setF({ ...f, locationId: e.target.value })}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></Field>
            <Field label={t("notes.shift_optional")}>
              <select className="input" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>
                <option value="">—</option>
                <option value="open">🌅 {t("common.opening")}</option>
                <option value="close">🌇 {t("common.closing")}</option>
              </select></Field>
          </div>
          <button className="btn-primary" disabled={busy} onClick={post}>{busy ? t("notes.posting") : t("notes.post")}</button>
        </div>
      </div>

      {/* search */}
      <SearchInput value={query} onChange={setQuery} placeholder={t("notes.search")} label={t("notes.search")} />

      {/* filters */}
      {(canFilter || isManager) && (
        <div className="flex gap-2 flex-wrap items-center">
          {canFilter && (
            <select className="input w-auto flex-1 min-w-[140px]" value={viewLoc} onChange={(e) => setViewLoc(e.target.value)} aria-label={t("notes.filter_location")}>
              <option value="all">{t("common.all_locations")}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {isManager && (
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              {t("notes.show_archived")}
            </label>
          )}
        </div>
      )}

      {/* feed */}
      <div className="card overflow-hidden">
        {visible.length === 0 ? (
          terms.length ? (
            <EmptyState icon={<IconNote />} title={t("notes.no_match")}
              subtitle={t("common.no_match_hint", { q: query.trim() })}
              action={{ label: t("common.clear_search"), onClick: () => setQuery("") }} />
          ) : (
            <EmptyState icon={<IconNote />} title={t("notes.empty_title")}
              subtitle={t("notes.empty_sub")}
              action={{ label: t("notes.write_first"), onClick: focusComposer }} />
          )
        ) : visible.map((n) => {
          const t = toDate(n.ts);
          return (
            <div key={n.id} className={`px-4 py-3.5 border-b border-line last:border-0 ${n.active === false ? "opacity-50" : ""}`}>
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="text-sm whitespace-pre-wrap">{n.pinned && <span title={t("notes.pinned")}>📌 </span>}<Highlight text={n.text} terms={terms} /></div>
                  <div className="mt-2 flex gap-2 flex-wrap items-center">
                    <span className="text-[12px] text-muted font-mono">
                      {n.by} · {t ? `${t.toLocaleDateString()} ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "…"}
                    </span>
                    {n.locationName && <span className="pill bg-subtle text-muted">{n.locationName}</span>}
                    {n.shift && <span className="pill bg-highlight text-gold border border-brass/30">{n.shift === "open" ? t("common.opening") : t("common.closing")}</span>}
                    {n.active === false && <span className="pill bg-red-100 text-red-700">{t("notes.archived_pill")}</span>}
                  </div>
                </div>
                {isManager && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button className="btn-ghost text-[12px] px-2.5 py-1"
                      onClick={() => patch(n, { pinned: !n.pinned }, n.pinned ? t("notes.toast_unpinned") : t("notes.toast_pinned"))}>
                      {n.pinned ? t("notes.unpin") : t("notes.pin")}
                    </button>
                    <button className="btn-ghost text-[12px] px-2.5 py-1"
                      onClick={() => patch(n, { active: !(n.active !== false) }, n.active !== false ? t("notes.toast_archived") : t("notes.toast_restored"))}>
                      {n.active !== false ? t("notes.archive") : t("notes.restore")}
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
