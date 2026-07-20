"use client";
import { useEffect, useMemo, useState } from "react";
import {
  verifyEntry, investigateEntry, setDisputeStatus, addComment, watchComments, apiLogSearch,
} from "@/lib/data";
import { money, toDate, exportCSV } from "@/lib/utils";
import { searchTerms } from "@/lib/text-match";
import { applyLogFilter, buildVocabulary } from "@/lib/log-filter";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import { CATALOG } from "@/lib/i18n";
import { packDisplayParts } from "@/lib/scratch-barcode";
import EmptyState, { IconReceipt } from "./EmptyState";
import SearchInput from "./SearchInput";
import Highlight from "./Highlight";
import ShowMore, { usePaged } from "./ShowMore";

export const CAUSE_CODES = [
  ["human-error", "Human error"],
  ["training-gap", "Training gap"],
  ["equipment-fault", "Equipment fault"],
  ["register-error", "Register error"],
  ["suspected-theft", "Suspected theft"],
  ["other", "Other"],
];
// English label — what filters match on and what gets written into the
// permanent record (status comments); the UI renders through cause.* keys.
export const causeLabel = (c) => CAUSE_CODES.find(([k]) => k === c)?.[1] || c || "";

/* ---------- expanded detail: thread + dispute + resolution ---------- */
function EntryDetail({ e, onToast }) {
  const { profile, vendor, isManager } = useSession();
  const { t } = useLang();
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
    if (!body) return onToast?.(t("log.err_write_first"));
    setBusy(true);
    try {
      await addComment(vendor.id, e, { text: body, kind }, profile);
      if (!forcedText) setText("");
    } catch (err) { console.error(err); onToast?.(t("log.toast_comment_failed")); }
    setBusy(false);
  }

  async function openDispute() {
    const body = text.trim();
    if (!body) return onToast?.(t("log.err_dispute_why"));
    setBusy(true);
    try {
      await setDisputeStatus(vendor.id, e.id, "open");
      await addComment(vendor.id, e, { text: body, kind: "comment" }, profile);
      setText(""); setDisputing(false);
      onToast?.(t("log.toast_dispute_opened"));
    } catch (err) { console.error(err); onToast?.(t("log.toast_dispute_author_only")); }
    setBusy(false);
  }

  async function moveDispute(status) {
    setBusy(true);
    try {
      await setDisputeStatus(vendor.id, e.id, status);
      // Status comments are part of the shared, permanent record — they stay
      // English (one language for the record), like any store data.
      await addComment(vendor.id, { ...e, disputeStatus: status }, {
        text: status === "resolved" ? `Dispute resolved by ${profile.name}` : `Dispute marked under review by ${profile.name}`,
        kind: "status",
      }, profile);
      onToast?.(status === "resolved" ? t("log.dispute_resolved") : t("log.toast_dispute_review"));
    } catch (err) { console.error(err); onToast?.(t("common.managers_only")); }
    setBusy(false);
  }

  async function saveResolution() {
    const patch = { varianceStatus: res.status };
    if (res.causeCode) patch.causeCode = res.causeCode;
    if (res.causeNote.trim()) patch.causeNote = res.causeNote.trim().slice(0, 500);
    if (res.status === "resolved") {
      if (!res.causeCode) return onToast?.(t("log.err_pick_cause"));
      if (res.causeCode === "other" && !res.causeNote.trim()) return onToast?.(t("log.err_other_note"));
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
      onToast?.(t("common.updated"));
    } catch (err) { console.error(err); onToast?.(t("log.toast_update_failed")); }
    setBusy(false);
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-3">
      {/* resolution panel — managers, flagged entries */}
      {isManager && vStatus !== "none" && (
        <div className="bg-panel border border-line rounded-xl p-3 space-y-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("log.resolution_title")}</div>
          <div className="grid grid-cols-2 gap-2.5">
            <select className="input py-1.5 text-sm" value={res.status}
              onChange={(ev) => setRes({ ...res, status: ev.target.value })}>
              <option value="open">{t("vstatus.open")}</option>
              <option value="under-review">{t("vstatus.under-review")}</option>
              <option value="resolved">{t("vstatus.resolved")}</option>
            </select>
            <select className="input py-1.5 text-sm" value={res.causeCode}
              onChange={(ev) => setRes({ ...res, causeCode: ev.target.value })}>
              <option value="">{t("log.cause_code_ph")}</option>
              {CAUSE_CODES.map(([k]) => <option key={k} value={k}>{t(`cause.${k}`)}</option>)}
            </select>
          </div>
          <input className="input py-1.5 text-sm" maxLength={500} placeholder={t("log.note_ph")}
            value={res.causeNote} onChange={(ev) => setRes({ ...res, causeNote: ev.target.value })} />
          <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={busy} onClick={saveResolution}>{t("log.save_resolution")}</button>
          {e.resolvedBy && <span className="text-xs text-muted ml-2">{t("log.resolved_by", { name: e.resolvedBy })}</span>}
        </div>
      )}

      {/* dispute controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {isAuthor && dStatus === "none" && !disputing && (
          <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => setDisputing(true)}>{t("log.dispute_this")}</button>
        )}
        {isManager && dStatus === "open" && (
          <>
            <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={busy} onClick={() => moveDispute("under-review")}>{t("log.dispute_to_review")}</button>
            <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={busy} onClick={() => moveDispute("resolved")}>{t("log.resolve_dispute")}</button>
          </>
        )}
        {isManager && dStatus === "under-review" && (
          <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={busy} onClick={() => moveDispute("resolved")}>{t("log.resolve_dispute")}</button>
        )}
        {dStatus === "resolved" && <span className="text-[13px] text-muted">{t("log.dispute_resolved")}</span>}
      </div>

      {/* thread */}
      {comments.length > 0 && (
        <div className="space-y-2">
          {comments.map((c) => {
            const ts = toDate(c.ts); // `ts`, not `t` — don't shadow the translation function
            return c.kind === "status" ? (
              <div key={c.id} className="text-xs text-muted italic">
                — {c.text} · {ts ? ts.toLocaleDateString() : ""}
              </div>
            ) : (
              <div key={c.id} className="bg-panel rounded-lg px-3 py-2">
                <div className="text-[12px] text-muted font-mono">
                  {c.by} · {ts ? `${ts.toLocaleDateString()} ${ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "…"}
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
          placeholder={disputing ? t("log.dispute_ph") : t("log.comment_ph")}
          value={text} onChange={(ev) => setText(ev.target.value)} />
        {disputing ? (
          <>
            <button className="btn-primary w-auto px-3 py-1.5 text-[13px]" disabled={busy} onClick={openDispute}>{t("log.open_dispute")}</button>
            <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => { setDisputing(false); setText(""); }}>{t("common.cancel")}</button>
          </>
        ) : (
          <button className="btn-ghost text-[13px] px-3 py-1.5 whitespace-nowrap" disabled={busy} onClick={() => post()}>{t("log.post")}</button>
        )}
      </div>
    </div>
  );
}

/* ---------- list ---------- */
export default function LogList({ entries, onToast, locName, showLocation }) {
  const { profile, vendor, isManager } = useSession();
  const { t } = useLang();
  // Localized cause label for display; a legacy/unknown code falls back to the
  // English causeLabel rather than leaking a raw catalog key.
  const tCause = (c) => (CATALOG.en[`cause.${c}`] ? t(`cause.${c}`) : causeLabel(c));
  const [fType, setFType] = useState("all");
  const [fWho, setFWho] = useState("all");
  const [fDrawer, setFDrawer] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fOutcome, setFOutcome] = useState("any");   // set by AI search only
  const [fDateFrom, setFDateFrom] = useState(null);  // set by AI search only
  const [fDateTo, setFDateTo] = useState(null);      // set by AI search only
  const [query, setQuery] = useState("");
  const [aiNote, setAiNote] = useState(null);        // "Interpreted as…" summary
  const [asking, setAsking] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const terms = useMemo(() => searchTerms(query), [query]);

  // Natural-language search is opt-in per vendor (ai-log-search-spec.md). The
  // server route re-checks the flag + key, so this is only the UI gate.
  const aiSearch = vendor?.aiSearch === true;

  const names = useMemo(() => [...new Set(entries.map((e) => e.by))].sort(), [entries]);
  const drawerNames = useMemo(() => [...new Set(entries.map((e) => e.drawerName).filter(Boolean))].sort(), [entries]);
  const clearAll = () => {
    setFType("all"); setFStatus("all"); setFWho("all"); setFDrawer("all");
    setFOutcome("any"); setFDateFrom(null); setFDateTo(null); setQuery(""); setAiNote(null);
  };
  // Single source of truth for filtering — shared with the AI log-search feature
  // (log-filter.js). The manual dropdowns/box map straight onto the filter shape.
  const rows = applyLogFilter(entries, {
    kind: fType,
    who: fWho === "all" ? null : fWho,
    drawer: fDrawer === "all" ? null : fDrawer,
    status: fStatus,
    outcome: fOutcome,
    dateFrom: fDateFrom,
    dateTo: fDateTo,
    terms,
  }, { causeLabel });

  // Reveal the log 20 rows at a time; any filter change snaps back to the top.
  const logPage = usePaged(rows, {
    resetKey: `${fType}|${fStatus}|${fWho}|${fDrawer}|${fOutcome}|${fDateFrom}|${fDateTo}|${query}`,
  });

  // Apply a model-returned filter to the controls (values were validated
  // server-side against the vocabulary; re-guard who/drawer here too).
  function applyAiFilter(filter) {
    const who = filter.who && names.includes(filter.who) ? filter.who : "all";
    const drawer = filter.drawer && drawerNames.includes(filter.drawer) ? filter.drawer : "all";
    setFType(filter.kind || "all");
    setFWho(who);
    setFDrawer(drawer);
    setFStatus(filter.status || "all");
    setFOutcome(filter.outcome || "any");
    setFDateFrom(filter.dateFrom || null);
    setFDateTo(filter.dateTo || null);
    setQuery(filter.text || "");
    const parts = [];
    if ((filter.kind || "all") !== "all") parts.push(filter.kind);
    if (who !== "all") parts.push(who);
    if (drawer !== "all") parts.push(drawer);
    if ((filter.status || "all") !== "all") parts.push(filter.status.replace(/-/g, " "));
    if ((filter.outcome || "any") !== "any") parts.push(filter.outcome);
    if (filter.dateFrom || filter.dateTo) parts.push(`${filter.dateFrom || "…"} → ${filter.dateTo || "…"}`);
    if (filter.text) parts.push(`“${filter.text}”`);
    setAiNote(parts.length ? parts.join(" · ") : t("log.everything"));
  }

  async function runAiSearch() {
    const q = query.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const vocabulary = buildVocabulary(entries, { today: new Date().toLocaleDateString("en-CA") });
      const { filter } = await apiLogSearch(q, vocabulary);
      if (filter) applyAiFilter(filter);
      else { setAiNote(null); onToast?.(t("log.toast_ai_no_parse")); }
    } catch (err) {
      console.error(err); setAiNote(null);
      onToast?.(t("log.toast_ai_unavailable"));
    } finally { setAsking(false); }
  }

  async function doVerify(e) {
    if (!isManager) return onToast?.(t("common.managers_only"));
    if (e.byId === profile.id) return onToast?.(t("log.err_verify_own"));
    try { await verifyEntry(vendor.id, e.id, profile.name); onToast?.(t("log.toast_verified")); }
    catch (err) { console.error(err); onToast?.(t("log.toast_verify_failed")); }
  }

  return (
    <div className="space-y-4">
      {aiSearch ? (
        <div className="space-y-2">
          <div className="flex gap-2 items-start">
            <SearchInput value={query} onChange={(v) => { setQuery(v); if (aiNote) setAiNote(null); }}
              onSubmit={runAiSearch} className="flex-1"
              placeholder={t("log.search_ask_ph")} label={t("log.search_ask_label")} />
            <button type="button" className="btn-ghost whitespace-nowrap px-3" disabled={asking || !query.trim()}
              onClick={runAiSearch} title={t("log.ask_title")}>
              {asking ? t("log.asking") : t("log.ask_btn")}
            </button>
          </div>
          {aiNote && (
            <div className="flex items-center gap-2 text-[13px] flex-wrap bg-highlight border border-brass/30 rounded-lg px-3 py-1.5">
              <span className="text-muted">{t("log.interpreted_as")}</span>
              <span className="font-medium min-w-0">{aiNote}</span>
              <button type="button" className="btn-ghost text-[12px] px-2 py-0.5 ml-auto" onClick={clearAll}>{t("common.clear")}</button>
            </div>
          )}
        </div>
      ) : (
        <SearchInput value={query} onChange={setQuery} placeholder={t("log.search_ph")} label={t("log.search_label")} />
      )}
      {/* Below sm the wrap-row becomes a 2-per-row grid: three+ selects on one
          393px row squeeze to ~117px each and clip their own labels. */}
      <div className="max-sm:grid max-sm:grid-cols-2 flex gap-2 flex-wrap">
        <select className="input w-auto flex-1 min-w-[110px]" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="all">{t("log.f_all_entries")}</option>
          <option value="cash">{t("log.f_cash")}</option>
          <option value="scratch">{t("log.f_scratch")}</option>
          <option value="inventory">{t("log.f_inventory")}</option>
        </select>
        <select className="input w-auto flex-1 min-w-[110px]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">{t("log.f_any_status")}</option>
          <option value="needs-review">{t("log.needs_review")}</option>
          <option value="under-review">{t("vstatus.under-review")}</option>
          <option value="resolved">{t("vstatus.resolved")}</option>
          <option value="disputed">{t("log.disputed")}</option>
        </select>
        <select className="input w-auto flex-1 min-w-[110px]" value={fWho} onChange={(e) => setFWho(e.target.value)}>
          <option value="all">{t("log.f_everyone")}</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {drawerNames.length > 1 && (
          <select className="input w-auto flex-1 min-w-[110px]" value={fDrawer} onChange={(e) => setFDrawer(e.target.value)}>
            <option value="all">{t("log.f_all_drawers")}</option>
            {drawerNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <button className="btn-ghost" onClick={() => exportCSV(entries)}>{t("log.export_csv")}</button>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          entries.length === 0 ? (
            <EmptyState icon={<IconReceipt />} title={t("log.empty_title")}
              subtitle={t("log.empty_sub")} />
          ) : (
            <EmptyState icon={<IconReceipt />} title={t("log.no_match_title")}
              subtitle={t("log.no_match_sub")}
              action={{ label: t("log.clear_filters"), onClick: clearAll }} />
          )
        ) : (<>
        {logPage.visible.map((e) => {
          // `ts`, not `t` — a `t` here would shadow the translation function
          // for the whole row block (that shadowing was this screen's crash).
          const ts = toDate(e.ts);
          const when = `${ts ? ts.toLocaleDateString() : "…"} ${ts ? ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`;
          const byStamp = <><Highlight text={e.by} terms={terms} /> · {when}</>;
          const locChip = showLocation && e.locationName
            ? <span className="pill bg-subtle text-muted">{e.locationName}</span> : null;
          const drawerChip = e.drawerName
            ? <span className="pill bg-highlight text-gold border border-brass/30">{e.drawerName}</span> : null;
          const statusChips = (
            <>
              {e.varianceStatus === "open" && <span className="pill bg-red-100 text-red-700 font-semibold">{t("log.needs_review")}</span>}
              {e.varianceStatus === "under-review" && <span className="pill bg-amber-100 text-amber-700 font-semibold">{t("vstatus.under-review")}</span>}
              {e.varianceStatus === "resolved" && e.causeCode && <span className="pill bg-subtle text-muted">{t("log.pill_resolved_cause", { cause: tCause(e.causeCode) })}</span>}
              {["open", "under-review"].includes(e.disputeStatus) && <span className="pill bg-purple-100 text-purple-700 font-semibold">{t("log.disputed")}</span>}
              {e.blind === true && <span className="pill border border-line text-muted">{t("log.pill_blind")}</span>}
            </>
          );
          const expanded = expandedId === e.id;
          return (
            <div key={e.id} className="px-4 py-3.5 border-b border-line last:border-0">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  {e.kind === "cash" ? (
                    <>
                      <div className="font-semibold text-[15px]"><Highlight text={e.drawerName || t("log.drawer_fallback")} terms={terms} /> — {e.shift === "open" ? t("common.opening") : t("common.closing")}</div>
                      <div className="text-[13px] text-muted font-mono mt-0.5">{byStamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {Math.abs(e.diff) < 0.005
                          ? <span className="pill bg-subtle text-muted">{t("log.pill_balanced")}</span>
                          : e.diff > 0
                            ? <span className="pill bg-green-100 text-green-700">{t("log.pill_over", { v: money(e.diff) })}</span>
                            : <span className="pill bg-red-100 text-red-700">{t("log.pill_short", { v: money(Math.abs(e.diff)) })}</span>}
                        {statusChips}{locChip}
                      </div>
                    </>
                  ) : e.kind === "inventory" ? (
                    <>
                      <div className="font-semibold text-[15px]"><Highlight text={e.itemName || t("log.item_fallback")} terms={terms} /> — {e.shift === "open" ? t("common.opening") : t("common.closing")}</div>
                      <div className="text-[13px] text-muted font-mono mt-0.5">{byStamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {e.diff === 0
                          ? <span className="pill bg-subtle text-muted">{t("log.pill_exact")}</span>
                          : e.diff > 0
                            ? <span className="pill bg-green-100 text-green-700">{t("log.pill_over_units", { v: e.diff })}</span>
                            : <span className="pill bg-red-100 text-red-700">{t("log.pill_missing", { v: Math.abs(e.diff) })}</span>}
                        <span className="pill bg-highlight text-gold border border-brass/30">{e.unit || "unit"}s</span>
                        {statusChips}{locChip}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-[15px]"><Highlight text={e.game} terms={terms} /> · {t("log.price_tickets", { p: e.price })}</div>
                      <div className="text-[13px] text-muted font-mono mt-0.5">{t("log.pack_no", { n: packDisplayParts(e.pack).bookNo || "—" })} · #{e.startno}→{e.endno}</div>
                      <div className="text-[13px] text-muted font-mono">{byStamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        <span className="pill bg-subtle text-muted">{t("log.sold_pill", { n: e.sold })}</span>
                        {statusChips}{drawerChip}{locChip}
                      </div>
                    </>
                  )}
                </div>
                <div className="text-right font-mono font-bold whitespace-nowrap">
                  {e.kind === "cash" ? (
                    <>{money(e.counted)}<br /><span className="text-xs text-muted font-normal">{t("log.exp", { v: money(e.expected) })}</span></>
                  ) : e.kind === "inventory" ? (
                    <>{e.counted}<br /><span className="text-xs text-muted font-normal">{t("log.exp", { v: e.expected })}</span></>
                  ) : money(e.dollars)}
                </div>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-dashed border-line flex items-center gap-3 flex-wrap">
                {e.verifiedBy ? (
                  <span className="text-[13px] text-pos font-semibold">{t("log.verified_by", { name: e.verifiedBy })}</span>
                ) : isManager && e.byId !== profile.id ? (
                  <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => doVerify(e)}>{t("log.verify_count")}</button>
                ) : (
                  <span className="text-[13px] text-muted italic">{t("log.awaiting")}</span>
                )}
                <button className="btn-ghost text-[13px] px-3 py-1.5 ml-auto"
                  onClick={() => setExpandedId(expanded ? null : e.id)}>
                  💬 {e.commentCount || 0}{expanded ? ` · ${t("log.thread_close")}` : ""}
                </button>
              </div>
              {expanded && <EntryDetail e={e} onToast={onToast} />}
            </div>
          );
        })}
        <ShowMore hasMore={logPage.hasMore} nextStep={logPage.nextStep} onMore={logPage.showMore} />
        </>)}
      </div>
    </div>
  );
}
