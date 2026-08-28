"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { addIncident, ackIncident, closeIncident, watchStaff } from "@/lib/data";
import { toDate } from "@/lib/utils";
import { searchTerms, matchesTerms } from "@/lib/text-match";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import EmptyState, { IconShield } from "./EmptyState";
import SearchInput from "./SearchInput";
import Highlight from "./Highlight";
import Field from "./Field";
import ShowMore, { usePaged } from "./ShowMore";

// Values are stable ids; display labels resolve through the i18n catalog
// (cat.* / sev.* / status.*), so the pills and selects follow the language.
const CATEGORIES = ["cash-handling", "till-procedure", "policy", "safety", "customer", "attendance", "other"];
const SEVERITIES = ["note", "warning", "serious"];

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
  if (urls.length > 5) return { error: "links_max" };
  for (const u of urls) {
    if (!/^https?:\/\//i.test(u) || u.length > 500)
      return { error: "links_format" };
  }
  return { links: urls };
}

export default function IncidentsPanel({ incidents, locations, locName, onToast }) {
  const { profile, vendor, isManager } = useSession();
  const { t } = useLang();

  const [staff, setStaff] = useState([]);
  const [f, setF] = useState({ title: "", subjectId: "", severity: "note", category: "other", locationId: "", text: "", links: "" });
  const [viewStatus, setViewStatus] = useState("all");
  const [query, setQuery] = useState("");
  const terms = useMemo(() => searchTerms(query), [query]);
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

  const base = useMemo(
    () => (viewStatus === "all" ? incidents : incidents.filter((i) => i.status === viewStatus)),
    [incidents, viewStatus]);
  const visible = useMemo(() => (terms.length
    ? base.filter((i) => matchesTerms(`${i.title} ${i.text} ${i.by} ${i.subjectName || ""} ${i.category} ${i.severity} ${i.locationName || ""}`, terms))
    : base), [base, terms]);
  // Reveal incidents 20 at a time; a filter/search change resets to the top.
  const incPage = usePaged(visible, { resetKey: `${viewStatus}|${terms.join(" ")}` });

  async function post() {
    const title = f.title.trim(), text = f.text.trim();
    if (!title) return onToast?.(t("incidents.err_title"));
    if (!text) return onToast?.(t("incidents.err_text"));
    if (!f.locationId) return onToast?.(t("notes.err_location"));
    const parsed = parseLinks(f.links);
    if (parsed.error) return onToast?.(t(`incidents.err_${parsed.error}`));
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
      onToast?.(t("incidents.toast_filed"));
    } catch (e) { console.error(e); onToast?.(t("incidents.toast_file_failed")); }
    setBusy(false);
  }

  async function acknowledge(inc) {
    setBusy(true);
    try {
      await ackIncident(vendor.id, inc.id, ackText);
      setAckFor(null); setAckText("");
      onToast?.(t("incidents.toast_acked"));
    } catch (e) { console.error(e); onToast?.(t("incidents.toast_ack_failed")); }
    setBusy(false);
  }

  const close = (inc) =>
    closeIncident(vendor.id, inc.id, profile.name)
      .then(() => onToast?.(t("incidents.toast_closed")))
      .catch(() => onToast?.(t("common.managers_only")));

  return (
    <div className="space-y-4">
      {isManager ? (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line">
            <h2 className="font-semibold text-[15px]">{t("incidents.file_title")}</h2>
            <p className="text-[13px] text-muted mt-0.5">
              {t("incidents.file_sub")}
            </p>
          </div>
          <div className="p-4 space-y-3">
            <Field label={t("incidents.title_label")}>
              <input ref={titleRef} className="input" maxLength={120} value={f.title}
                placeholder={t("incidents.title_ph")}
                onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("incidents.concerning")}>
                <select className="input" value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
                  <option value="">{t("incidents.general")}</option>
                  {staff.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></Field>
              <Field label={t("incidents.severity")}>
                <select className="input" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
                  {SEVERITIES.map((v) => <option key={v} value={v}>{t(`sev.${v}`)}</option>)}
                </select></Field>
              <Field label={t("incidents.category")}>
                <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                  {CATEGORIES.map((v) => <option key={v} value={v}>{t(`cat.${v}`)}</option>)}
                </select></Field>
              <Field label={t("common.location")}>
                <select className="input" value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select></Field>
            </div>
            <Field label={t("incidents.what")}>
              <textarea className="input min-h-[96px]" maxLength={4000} value={f.text}
                placeholder={t("incidents.what_ph")}
                onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
            <Field label={t("incidents.links_label")}>
              <textarea className="input min-h-[44px] font-mono text-[13px]" value={f.links}
                placeholder="https://…"
                onChange={(e) => setF({ ...f, links: e.target.value })} /></Field>
            <button className="btn-primary" disabled={busy} onClick={post}>{busy ? t("incidents.filing") : t("incidents.file")}</button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-muted px-1">
          {t("incidents.employee_intro")}
        </p>
      )}

      {incidents.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <SearchInput value={query} onChange={setQuery} placeholder={t("incidents.search")} label={t("incidents.search")} className="flex-1 min-w-[160px]" />
          {isManager && (
            <select className="input w-auto" value={viewStatus} onChange={(e) => setViewStatus(e.target.value)} aria-label={t("incidents.filter_status")}>
              <option value="all">{t("incidents.all_statuses")}</option>
              <option value="open">{t("status.open")}</option>
              <option value="acknowledged">{t("status.acknowledged")}</option>
              <option value="closed">{t("status.closed")}</option>
            </select>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        {visible.length === 0 ? (
          terms.length ? (
            <EmptyState icon={<IconShield />} title={t("incidents.no_match")}
              subtitle={t("common.no_match_hint", { q: query.trim() })}
              action={{ label: t("common.clear_search"), onClick: () => setQuery("") }} />
          ) : isManager ? (
            <EmptyState icon={<IconShield />} title={t("incidents.empty_mgr_title")}
              subtitle={t("incidents.empty_mgr_sub")}
              action={{ label: t("incidents.file_title"), onClick: () => titleRef.current?.focus() }} />
          ) : (
            <EmptyState icon={<IconShield />} title={t("incidents.empty_emp_title")}
              subtitle={t("incidents.empty_emp_sub")} />
          )
        ) : (<>
        {incPage.visible.map((inc) => (
          <div key={inc.id} className="px-4 py-3.5 border-b border-line last:border-0">
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm"><Highlight text={inc.title} terms={terms} /></div>
                <div className="mt-1.5 flex gap-2 flex-wrap items-center">
                  <span className={`pill ${sevPill(inc.severity)}`}>{t(`sev.${inc.severity}`)}</span>
                  <span className={`pill ${statusPill(inc.status)}`}>{t(`status.${inc.status}`)}</span>
                  {inc.subjectName && <span className="pill bg-subtle text-muted">{t("incidents.re", { name: inc.subjectName })}</span>}
                  {inc.locationName && <span className="pill bg-subtle text-muted">{inc.locationName}</span>}
                </div>
                <div className="mt-2 text-sm whitespace-pre-wrap"><Highlight text={inc.text} terms={terms} /></div>
                {(inc.links || []).length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {inc.links.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                        className="block text-[12px] font-mono text-gold underline underline-offset-2 truncate">🔗 {u}</a>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-[12px] text-muted font-mono">
                  {t("incidents.filed_by", { name: inc.by })} · {fmt(inc.ts)}
                </div>
                {inc.ackAt && (
                  <div className="mt-1.5 text-[13px] bg-panel border border-line-soft rounded-lg px-3 py-2">
                    <span className="text-muted">{t("incidents.acked_at", { when: fmt(inc.ackAt) })}</span>
                    {inc.ackNote && <div className="mt-1 whitespace-pre-wrap">{inc.ackNote}</div>}
                  </div>
                )}
                {inc.closedBy && (
                  <div className="mt-1.5 text-[12px] text-muted font-mono">{t("incidents.closed_by", { name: inc.closedBy })} · {fmt(inc.closedAt)}</div>
                )}
              </div>
              {isManager && inc.status !== "closed" && (
                <button className="btn-ghost text-[12px] px-3 min-h-[40px] flex-shrink-0" onClick={() => close(inc)}>{t("incidents.close")}</button>
              )}
            </div>

            {!isManager && inc.status === "open" && inc.subjectId === profile.id && (
              ackFor === inc.id ? (
                <div className="mt-3 space-y-2">
                  <textarea className="input min-h-[64px]" maxLength={1000} value={ackText}
                    aria-label={t("incidents.ack_label")}
                    placeholder={t("incidents.ack_ph")}
                    onChange={(e) => setAckText(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="btn-primary" disabled={busy} onClick={() => acknowledge(inc)}>
                      {busy ? t("common.saving") : t("incidents.acknowledge")}
                    </button>
                    <button className="btn-ghost" onClick={() => { setAckFor(null); setAckText(""); }}>{t("common.cancel")}</button>
                  </div>
                </div>
              ) : (
                <button className="btn-primary mt-3" onClick={() => setAckFor(inc.id)}>{t("incidents.acknowledge_open")}</button>
              )
            )}
          </div>
        ))}
        <ShowMore hasMore={incPage.hasMore} nextStep={incPage.nextStep} onMore={incPage.showMore} />
        </>)}
      </div>
    </div>
  );
}
