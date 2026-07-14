"use client";
import { useEffect, useMemo, useState } from "react";
import {
  verifyEntry, investigateEntry, setDisputeStatus, addComment, watchComments, apiLogSearch,
} from "@/lib/data";
import { money, toDate, exportCSV } from "@/lib/utils";
import { searchTerms } from "@/lib/text-match";
import { applyLogFilter, buildVocabulary } from "@/lib/log-filter";
import { useSession } from "./SessionProvider";
import EmptyState, { IconReceipt } from "./EmptyState";
import SearchInput from "./SearchInput";
import Highlight from "./Highlight";

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
              <div key={c.id} className="text-xs text-muted italic">
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
    setAiNote(parts.length ? parts.join(" · ") : "everything");
  }

  async function runAiSearch() {
    const q = query.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const vocabulary = buildVocabulary(entries, { today: new Date().toLocaleDateString("en-CA") });
      const { filter } = await apiLogSearch(q, vocabulary);
      if (filter) applyAiFilter(filter);
      else { setAiNote(null); onToast?.("Couldn't interpret that — showing keyword matches"); }
    } catch (err) {
      console.error(err); setAiNote(null);
      onToast?.("Search unavailable — showing keyword matches");
    } finally { setAsking(false); }
  }

  async function doVerify(e) {
    if (!isManager) return onToast?.("Managers only");
    if (e.byId === profile.id) return onToast?.("Can't verify your own entry");
    try { await verifyEntry(vendor.id, e.id, profile.name); onToast?.("Verified"); }
    catch (err) { console.error(err); onToast?.("Verify failed"); }
  }

  return (
    <div className="space-y-4">
      {aiSearch ? (
        <div className="space-y-2">
          <div className="flex gap-2 items-start">
            <SearchInput value={query} onChange={(v) => { setQuery(v); if (aiNote) setAiNote(null); }}
              onSubmit={runAiSearch} className="flex-1"
              placeholder="Search or ask — “Eve’s shorts last week”, “unverified cash over $20”…" label="Search or ask" />
            <button type="button" className="btn-ghost whitespace-nowrap px-3" disabled={asking || !query.trim()}
              onClick={runAiSearch} title="Interpret this as filters">
              {asking ? "Asking…" : "✨ Ask"}
            </button>
          </div>
          {aiNote && (
            <div className="flex items-center gap-2 text-[13px] flex-wrap bg-highlight border border-brass/30 rounded-lg px-3 py-1.5">
              <span className="text-muted">Interpreted as:</span>
              <span className="font-medium min-w-0">{aiNote}</span>
              <button type="button" className="btn-ghost text-[12px] px-2 py-0.5 ml-auto" onClick={clearAll}>Clear</button>
            </div>
          )}
        </div>
      ) : (
        <SearchInput value={query} onChange={setQuery} placeholder="Search counts — drawer, item, game, person…" label="Search counts" />
      )}
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
          entries.length === 0 ? (
            <EmptyState icon={<IconReceipt />} title="No counts logged yet"
              subtitle="Saved cash, scratch-off, and inventory counts show up here for your whole team — newest first." />
          ) : (
            <EmptyState icon={<IconReceipt />} title="No entries match"
              subtitle="Try a different search, type, status, or person — or clear everything to see all counts."
              action={{ label: "Clear filters", onClick: clearAll }} />
          )
        ) : rows.map((e) => {
          const t = toDate(e.ts);
          const when = `${t ? t.toLocaleDateString() : "…"} ${t ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`;
          const byStamp = <><Highlight text={e.by} terms={terms} /> · {when}</>;
          const locChip = showLocation && e.locationName
            ? <span className="pill bg-subtle text-muted">{e.locationName}</span> : null;
          const drawerChip = e.drawerName
            ? <span className="pill bg-highlight text-gold border border-brass/30">{e.drawerName}</span> : null;
          const statusChips = (
            <>
              {e.varianceStatus === "open" && <span className="pill bg-red-100 text-red-700 font-semibold">Needs review</span>}
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
                      <div className="font-semibold text-[15px]"><Highlight text={e.drawerName || "Drawer"} terms={terms} /> — {e.shift === "open" ? "Opening" : "Closing"}</div>
                      <div className="text-[13px] text-muted font-mono mt-0.5">{byStamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {Math.abs(e.diff) < 0.005
                          ? <span className="pill bg-subtle text-muted">Balanced</span>
                          : e.diff > 0
                            ? <span className="pill bg-green-100 text-green-700">Over {money(e.diff)}</span>
                            : <span className="pill bg-red-100 text-red-700">Short {money(Math.abs(e.diff))}</span>}
                        {statusChips}{locChip}
                      </div>
                    </>
                  ) : e.kind === "inventory" ? (
                    <>
                      <div className="font-semibold text-[15px]"><Highlight text={e.itemName || "Item"} terms={terms} /> — {e.shift === "open" ? "Opening" : "Closing"}</div>
                      <div className="text-[13px] text-muted font-mono mt-0.5">{byStamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {e.diff === 0
                          ? <span className="pill bg-subtle text-muted">Exact count</span>
                          : e.diff > 0
                            ? <span className="pill bg-green-100 text-green-700">Over {e.diff}</span>
                            : <span className="pill bg-red-100 text-red-700">Missing {Math.abs(e.diff)}</span>}
                        <span className="pill bg-highlight text-gold border border-brass/30">{e.unit || "unit"}s</span>
                        {statusChips}{locChip}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-[15px]"><Highlight text={e.game} terms={terms} /> · ${e.price} tickets</div>
                      <div className="text-[13px] text-muted font-mono mt-0.5">Pack {e.pack || "—"} · #{e.startno}→{e.endno}</div>
                      <div className="text-[13px] text-muted font-mono">{byStamp}</div>
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
                  <span className="text-[13px] text-pos font-semibold">✓ Verified by {e.verifiedBy}</span>
                ) : isManager && e.byId !== profile.id ? (
                  <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => doVerify(e)}>Verify count</button>
                ) : (
                  <span className="text-[13px] text-muted italic">Awaiting manager verification</span>
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
