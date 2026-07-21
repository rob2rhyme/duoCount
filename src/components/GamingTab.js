"use client";
import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { useLang } from "./LangProvider";
import { useTheme } from "./ThemeProvider";
import { useSession } from "./SessionProvider";
import { apiGaming } from "@/lib/data";
import { buildGamingSummary } from "@/lib/gaming";
import { chartBar } from "@/lib/branding";
import { money, csvCell, downloadCSV } from "@/lib/utils";
import EmptyState, { IconChart } from "./EmptyState";
import Field from "./Field";

// The Gaming tab. Two audiences, one screen:
//   • ANY staff record a machine's collection + payout on collection day. The
//     split is computed server-side and never comes back — staff enter blind.
//   • The OWNER additionally sees the oversight below: totals, the store's take,
//     a per-machine and per-company breakdown, a store-take chart, and a CSV
//     export over any timeframe. (The collection ledger is owner-read-only, so
//     `collections` is empty for non-owners — the oversight simply doesn't show.)

const CHART = {
  light: { grid: "#e6e7e4", axis: "#82857f", tipBg: "#ffffff", tipBorder: "#dbdcd9", tipText: "#1a241c", bar: "#14532d" },
  dark: { grid: "#2c2e2c", axis: "#777a76", tipBg: "#1c1d1c", tipBorder: "#353736", tipText: "#e8eee9", bar: "#7fd39e" },
};

// Local business day (YYYY-MM-DD), DST-safe — the collection date the ledger keys on.
function localISO(ms = Date.now()) {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function Stat({ label, value, tone }) {
  const color = tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-fg";
  return (
    <div className="card p-3.5">
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[11px] text-muted uppercase tracking-wide font-semibold mt-1">{label}</div>
    </div>
  );
}

export default function GamingTab({ machines = [], collections = [], isOwner = false, onToast, adminAction, onSetup }) {
  const { t } = useLang();
  const { theme } = useTheme();
  const { vendor } = useSession();
  const ch = { ...(CHART[theme] || CHART.light), bar: chartBar(vendor, theme) };
  const tip = { borderRadius: 10, border: `1px solid ${ch.tipBorder}`, background: ch.tipBg, color: ch.tipText, fontSize: 13 };

  const activeMachines = useMemo(() => machines.filter((m) => m.active !== false), [machines]);

  // ---- staff entry ----
  const [machineId, setMachineId] = useState("");
  const [date, setDate] = useState(localISO);
  const [collection, setCollection] = useState("");
  const [payout, setPayout] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // ---- owner oversight timeframe ----
  const [from, setFrom] = useState(() => localISO(Date.now() - 90 * 24 * 3600 * 1000));
  const [to, setTo] = useState(localISO);
  const summary = useMemo(() => buildGamingSummary(collections, { from, to }), [collections, from, to]);
  const inRange = useMemo(
    () => collections.filter((c) => {
      const d = String(c.collectionDate || "");
      return d && (!from || d >= from) && (!to || d <= to);
    }),
    [collections, from, to]
  );

  if (activeMachines.length === 0) {
    return (
      <EmptyState icon={<IconChart />} title={t("game.empty_title")}
        action={isOwner ? adminAction : undefined}
        subtitle={isOwner ? t("game.empty_owner") : t("game.empty_staff")} />
    );
  }

  const submit = async () => {
    if (!machineId) { onToast?.(t("game.err_machine")); return; }
    setBusy(true);
    try {
      await apiGaming({ machineId, collectionDate: date, collection, payout, note });
      onToast?.(t("game.toast_saved"));
      setCollection(""); setPayout(""); setNote("");
    } catch (err) {
      onToast?.(err.message);
    } finally { setBusy(false); }
  };

  const exportCSV = () => {
    const header = ["Date", "Machine", "Company", "Type", "Collection", "Payout", "Net", "Store %", "Store share", "Company share", "Entered by"];
    const lines = [header.map(csvCell).join(",")];
    for (const c of [...inRange].sort((a, b) => (a.collectionDate < b.collectionDate ? -1 : 1))) {
      lines.push([c.collectionDate, c.machineName, c.company, c.machineType, c.collection, c.payout, c.net, c.storePct, c.storeShare, c.companyShare, c.by]
        .map(csvCell).join(","));
    }
    downloadCSV(lines.join("\n"), `gaming-${from}_to_${to}.csv`);
  };

  return (
    <div className="space-y-4">
      {/* ---------------- collection entry (everyone) ---------------- */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">{t("game.entry_title")}</h2>
          <p className="text-[13px] text-muted mt-0.5">{t("game.entry_sub")}</p>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("game.f_machine")}>
              <select className="input" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                <option value="">{t("game.pick_machine")}</option>
                {activeMachines.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} — {m.company}</option>
                ))}
              </select>
            </Field>
            <Field label={t("game.f_date")}>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("game.f_collection")}>
              <input className="input" inputMode="decimal" value={collection}
                onChange={(e) => setCollection(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label={t("game.f_payout")}>
              <input className="input" inputMode="decimal" value={payout}
                onChange={(e) => setPayout(e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          <Field label={t("game.f_note")}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("game.ph_note")} />
          </Field>
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>{t("game.submit")}</button>
          <p className="text-xs text-muted leading-relaxed">{t("game.enter_blind_hint")}</p>
        </div>
      </div>

      {/* ---------------- owner oversight ---------------- */}
      {isOwner && (
        <>
          <div className="card p-4 space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <Field label={t("game.tf_from")} className="flex-1 min-w-[130px]">
                <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label={t("game.tf_to")} className="flex-1 min-w-[130px]">
                <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              <button type="button" className="btn-ghost text-[13px] px-3 py-2" disabled={inRange.length === 0} onClick={exportCSV}>
                {t("game.export_csv")}
              </button>
              {onSetup && (
                <button type="button" className="btn-ghost text-[13px] px-3 py-2" onClick={onSetup}>⚙ {t("game.setup_machines")}</button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat label={t("game.stat_collection")} value={money(summary.totals.collection)} />
              <Stat label={t("game.stat_payout")} value={money(summary.totals.payout)} />
              <Stat label={t("game.stat_net")} value={money(summary.totals.net)} tone={summary.totals.net < 0 ? "neg" : null} />
              <Stat label={t("game.stat_store")} value={money(summary.totals.storeShare)} tone="pos" />
              <Stat label={t("game.stat_company")} value={money(summary.totals.companyShare)} />
              <Stat label={t("game.stat_count")} value={summary.count} />
            </div>
          </div>

          {summary.count === 0 ? (
            <div className="card p-4"><p className="text-sm text-muted">{t("game.no_data")}</p></div>
          ) : (
            <>
              {summary.series.length > 1 && (
                <div className="card p-4">
                  <h3 className="font-semibold text-[15px] mb-3">{t("game.chart_take")}</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={summary.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
                      <YAxis tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
                      <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
                      <Bar dataKey="storeShare" radius={[4, 4, 0, 0]} fill={ch.bar} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-line"><h3 className="font-semibold text-[15px]">{t("game.by_machine")}</h3></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-muted">
                        <th className="text-left font-semibold px-4 py-2">{t("game.col_machine")}</th>
                        <th className="text-right font-semibold px-2 py-2">{t("game.col_net")}</th>
                        <th className="text-right font-semibold px-2 py-2">{t("game.col_store")}</th>
                        <th className="text-right font-semibold px-4 py-2">{t("game.col_count")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.machines.map((m) => (
                        <tr key={m.machineId || m.machineName} className="border-t border-line">
                          <td className="px-4 py-2">
                            <span className="font-medium block truncate">{m.machineName}</span>
                            <span className="text-xs text-muted">{m.company}</span>
                          </td>
                          <td className={`text-right font-mono px-2 py-2 ${m.net < 0 ? "text-neg" : ""}`}>{money(m.net)}</td>
                          <td className="text-right font-mono px-2 py-2 text-pos">{money(m.storeShare)}</td>
                          <td className="text-right font-mono px-4 py-2">{m.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-line"><h3 className="font-semibold text-[15px]">{t("game.by_company")}</h3></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-muted">
                        <th className="text-left font-semibold px-4 py-2">{t("game.col_company")}</th>
                        <th className="text-right font-semibold px-2 py-2">{t("game.col_store")}</th>
                        <th className="text-right font-semibold px-4 py-2">{t("game.col_company_share")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.companies.map((c) => (
                        <tr key={c.company} className="border-t border-line">
                          <td className="px-4 py-2 font-medium truncate">{c.company}</td>
                          <td className="text-right font-mono px-2 py-2 text-pos">{money(c.storeShare)}</td>
                          <td className={`text-right font-mono px-4 py-2 ${c.companyShare < 0 ? "text-neg" : ""}`}>{money(c.companyShare)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
