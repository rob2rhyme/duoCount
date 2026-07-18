"use client";
import { useMemo, useRef, useState } from "react";
import { parseCsv, guessMapping, validateItems, validateStaff, validateBaselines, validateStock, validateCustomers, importTargets, missingRequired } from "@/lib/import-parse";
import { renderImportMsg } from "@/lib/import-msg";
import { apiImport } from "@/lib/data";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";

// Owner-only "Import / migrate" card (Phase 1: items, Phase 2: staff, Phase 3:
// opening inventory counts). Parses a CSV in the browser, lets the owner map
// columns onto DuoCount's fields, shows a live per-row dry-run preview (the same
// validators the server re-runs at commit), and writes the valid rows through
// POST /api/import. Nothing is written until Commit; the server re-validates
// against live state, so the preview never gates a write on its own.

const STATUS_STYLE = { create: "text-pos", update: "text-gold", skip: "text-muted", error: "text-neg" };
const PREVIEW_CAP = 60;
const TYPE_IDS = ["items", "staff", "baselines", "stock", "customers"];

export default function ImportCard({ locations = [], items = [], staff = [], entries = [], customers = [], onToast }) {
  const { profile } = useSession();
  const { t } = useLang();
  const [type, setType] = useState("items");
  const [parsed, setParsed] = useState(null); // { headers, rows, fileName }
  const [mapping, setMapping] = useState({});
  const [parseError, setParseError] = useState("");
  const [allowPartial, setAllowPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const activeLocations = locations.filter((l) => l.active !== false);
  const defaultLocationId = activeLocations.length === 1 ? activeLocations[0].id : null;

  // Write-once guard for baselines: items that already have any inventory entry.
  const baselinedItemIds = useMemo(
    () => [...new Set(entries.filter((e) => e.kind === "inventory").map((e) => e.itemId).filter(Boolean))],
    [entries]
  );

  const report = useMemo(() => {
    if (!parsed) return null;
    if (type === "items") return validateItems(parsed.rows, mapping, { locations, existingItems: items, defaultLocationId });
    if (type === "staff") return validateStaff(parsed.rows, mapping, { locations, existingStaff: staff, defaultLocationId });
    if (type === "stock") return validateStock(parsed.rows, mapping, { locations, items, defaultLocationId });
    // The preview matches against the live customer list the shell already
    // watches (empty when rewards is off); the route re-checks at commit.
    if (type === "customers") return validateCustomers(parsed.rows, mapping, { existingCustomers: customers });
    return validateBaselines(parsed.rows, mapping, {
      locations, items, existingStaff: staff, baselinedItemIds,
      defaultBy: { id: profile.id, name: profile.name, role: profile.role },
    });
  }, [parsed, mapping, type, locations, items, staff, customers, baselinedItemIds, defaultLocationId, profile]);

  const targets = importTargets(type);
  const missing = missingRequired(mapping, type);
  const writable = report ? report.summary.create + report.summary.update : 0;
  const noun = t(`imp.noun_${type}`);
  // Baselines append to the permanent log, so errors block the whole commit
  // unless the owner explicitly opts into importing just the valid rows.
  const partialBlocked = type === "baselines" && report && report.summary.error > 0 && !allowPartial;

  function reset() {
    setParsed(null); setMapping({}); setParseError(""); setAllowPartial(false);
    if (fileRef.current) fileRef.current.value = "";
  }
  function pickType(id) {
    if (id === type) return;
    setType(id); reset();
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(""); setParsed(null); setMapping({});
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { headers, rows } = parseCsv(String(reader.result || ""));
        if (!rows.length) throw Object.assign(new Error("No data rows found under the header row."), { code: "imp.err_no_rows" });
        setParsed({ headers, rows, fileName: file.name });
        setMapping(guessMapping(headers, type));
      } catch (err) { setParseError(err.code ? t(err.code) : (err.message || t("imp.err_read"))); }
    };
    reader.onerror = () => setParseError(t("imp.err_read"));
    reader.readAsText(file);
  }

  async function commit() {
    if (missing.length || !writable || busy || partialBlocked) return;
    setBusy(true);
    try {
      const r = await apiImport({ type, mode: "commit", mapping, rows: parsed.rows, allowPartial });
      const c = r.counts || {};
      onToast?.(t("imp.toast_imported", {
        create: c.create || 0,
        noun: c.create === 1 ? t(`imp.noun_${type}`) : t(`imp.nounpl_${type}`),
        updated: c.update ? t("imp.toast_updated_bit", { n: c.update }) : "",
        skipped: c.error ? t("imp.toast_skipped_bit", { n: c.error }) : "",
      }));
      reset();
    } catch (e) { onToast?.(e.message || t("imp.toast_failed")); }
    setBusy(false);
  }

  const detail = (f) => {
    if (type === "items") return f.locationName ? `${f.locationName}` : "";
    if (type === "customers") return f.customerName && f.phone ? f.phone : "";
    if (type === "stock") return [
      f.quantity != null ? `${f.quantity} ${f.unit}${f.quantity === 1 ? "" : "s"}` : "",
      f.price != null ? `$${f.price}` : "",
      f.expiresAt || "",
      f.locationName,
    ].filter(Boolean).join(" · ");
    if (type === "staff") return [
      t(`admin.role_${f.role}`),
      f.locationName || (f.role === "manager" ? t("imp.detail_all_loc") : ""),
      f.hasPin ? t("imp.detail_sets_pin") : t("imp.detail_no_pin"),
      f.email,
    ].filter(Boolean).join(" · ");
    return [
      f.quantity != null ? `${f.quantity} ${f.unit}${f.quantity === 1 ? "" : "s"}` : "",
      f.locationName, f.date, f.by ? t("imp.detail_by", { name: f.by }) : "",
    ].filter(Boolean).join(" · ");
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px]">{t("imp.title")}</h2>
        <p className="text-[13px] text-muted mt-0.5">{t("imp.sub")}</p>
      </div>
      <div className="p-4 space-y-4">
        {/* Type picker */}
        <div className="flex gap-1.5 bg-panel border border-line rounded-xl p-1">
          {TYPE_IDS.map((id) => (
            <button key={id} type="button" onClick={() => pickType(id)}
              className={`flex-1 px-3 py-2 rounded-lg font-semibold text-sm transition ${type === id ? "bg-fg text-surface" : "text-muted hover:text-fg"}`}>
              {t(`imp.type_${id}`)}
            </button>
          ))}
        </div>

        {type === "items" && activeLocations.length === 0 && (
          <p className="text-[13px] text-neg">{t("imp.err_no_loc_items")}</p>
        )}
        {type === "staff" && (
          <p className="text-[13px] text-muted">{t("imp.staff_note")}</p>
        )}
        {type === "baselines" && (
          <p className="text-[13px] text-muted">{t("imp.baselines_note")}</p>
        )}
        {type === "stock" && (
          <p className="text-[13px] text-muted">{t("imp.stock_note")}</p>
        )}
        {type === "customers" && (
          <p className="text-[13px] text-muted">{t("imp.customers_note")}</p>
        )}

        <div>
          <label className="label">{t("imp.csv_file", { label: t(`imp.type_${type}`) })}</label>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile}
            className="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-line file:bg-subtle file:text-fg file:font-semibold file:text-[13px] file:cursor-pointer" />
          <p className="text-xs text-muted mt-1.5">{t("imp.file_hint", { noun })}</p>
        </div>

        {parseError && <p role="alert" className="text-[13px] text-neg">{parseError}</p>}

        {parsed && (
          <>
            <div className="text-[13px] text-muted">
              <b className="text-fg">{parsed.fileName}</b> — {t(`imp.rows_${parsed.rows.length === 1 ? "one" : "other"}`, { n: parsed.rows.length })}, {t(`imp.cols_${parsed.headers.length === 1 ? "one" : "other"}`, { n: parsed.headers.length })}.
            </div>

            {/* Column mapping */}
            <div className="space-y-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("imp.match_columns")}</div>
              {targets.map((tg) => (
                <div key={tg.field} className="grid grid-cols-2 gap-3 items-center">
                  <label className="text-sm font-medium">
                    {t(`imp.tgt.${type}.${tg.field}`)}{tg.required && <span className="text-neg"> *</span>}
                    {tg.field === "location" && type === "items" && activeLocations.length === 1 && (
                      <span className="block text-[11px] text-muted font-normal">{t("imp.optional_defaults", { loc: activeLocations[0].name })}</span>
                    )}
                  </label>
                  <select className="input" value={mapping[tg.field] || ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [tg.field]: e.target.value || undefined }))}>
                    <option value="">{tg.required ? t("imp.choose_column") : t("imp.skip_column")}</option>
                    {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Dry-run preview */}
            {report && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold">
                  <span className="text-pos">{report.summary.create} {t("imp.status_create")}</span>
                  <span className="text-gold">{report.summary.update} {t("imp.status_update")}</span>
                  <span className="text-muted">{report.summary.skip} {t("imp.status_skip")}</span>
                  <span className="text-neg">{report.summary.error} {t("imp.status_error")}</span>
                </div>
                <div className="border border-line rounded-xl overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-[13px]">
                      <thead className="bg-panel text-muted text-[11px] uppercase tracking-wide sticky top-0">
                        <tr>
                          <th className="text-left font-semibold px-2.5 py-2 w-12">{t("imp.col_line")}</th>
                          <th className="text-left font-semibold px-2.5 py-2 w-16">{t("imp.col_status")}</th>
                          <th className="text-left font-semibold px-2.5 py-2">{type === "staff" || type === "customers" ? t("imp.col_person") : t("imp.col_item")}</th>
                          <th className="text-left font-semibold px-2.5 py-2">{t("imp.col_notes")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.rows.slice(0, PREVIEW_CAP).map((r) => (
                          <tr key={r.line} className="border-t border-line-soft align-top">
                            <td className="px-2.5 py-2 font-mono text-muted">{r.line}</td>
                            <td className={`px-2.5 py-2 font-semibold ${STATUS_STYLE[r.status] || ""}`}>{t(`imp.status_${r.status}`)}</td>
                            <td className="px-2.5 py-2">
                              {r.fields.name || <span className="text-faint">—</span>}
                              {detail(r.fields) && <span className="text-muted"> · {detail(r.fields)}</span>}
                            </td>
                            <td className="px-2.5 py-2 text-muted">{r.messages.map((msg) => renderImportMsg(msg, t)).join(" ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {report.rows.length > PREVIEW_CAP && (
                    <div className="px-2.5 py-2 text-[12px] text-muted border-t border-line-soft bg-panel">
                      {t("imp.preview_more", { cap: PREVIEW_CAP, total: report.rows.length })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {missing.length > 0 && (
              <p className="text-[13px] text-neg">{t("imp.map_to_continue", { label: t(`imp.tgt.${type}.${missing[0]}`) })}</p>
            )}

            {type === "baselines" && report && report.summary.error > 0 && (
              <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={allowPartial}
                  onChange={(e) => setAllowPartial(e.target.checked)} />
                <span className="text-muted leading-snug">
                  <b className="text-fg">{t("imp.partial_label")}</b>{" "}
                  {t(`imp.partial_hint_${report.summary.error === 1 ? "one" : "other"}`, { n: report.summary.error })}
                </span>
              </label>
            )}

            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy || !!missing.length || !writable || partialBlocked} onClick={commit}>
                {busy ? t("imp.importing")
                  : partialBlocked ? t("imp.fix_errors")
                  : writable ? t(`imp.import_n_${writable === 1 ? "one" : "other"}`, { n: writable })
                  : t("imp.nothing_to_import")}
              </button>
              <button className="btn-ghost w-auto px-4" disabled={busy} onClick={reset}>{t("imp.cancel")}</button>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              {type === "baselines"
                ? t("imp.foot_baselines")
                : t("imp.foot_other", { pin: type === "staff" ? t("imp.foot_pin") : "" })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
