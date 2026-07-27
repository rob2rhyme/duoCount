"use client";
import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { money, downloadCSV } from "@/lib/utils";
import { buildScratchAnalytics, buildScratchStaffCSV } from "@/lib/scratch-analytics";
import { buildShiftLog, groupShiftLogByDate } from "@/lib/scratch-shift-log";
import { resolveScratchShifts } from "@/lib/scratch-settings";
import { chartBar } from "@/lib/branding";
import { useSession } from "./SessionProvider";
import { useTheme } from "./ThemeProvider";
import { useLang } from "./LangProvider";
import ShowMore, { usePaged } from "./ShowMore";

// Recharts paints literal colors; neutral chrome + the store's bar hue (mirrors
// ReportModal so every chart in the app reads as one system).
const CHART = {
  light: { grid: "#e6e7e4", axis: "#82857f", tipBg: "#ffffff", tipBorder: "#dbdcd9", tipText: "#1a241c" },
  dark: { grid: "#2c2e2c", axis: "#777a76", tipBg: "#1c1d1c", tipBorder: "#353736", tipText: "#e8eee9" },
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const shortDay = (iso) => (iso || "").slice(5).replace("-", "/"); // MM/DD
// A scan's clock time — the shift bound. The row carries its own date column.
const fmtTime = (d) => (d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—");
// A business-date string as a day heading, built from the PARTS so it can't
// shift a day across timezones.
const fmtDay = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso || "";
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};

function Tile({ label, value, tone }) {
  const color = tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-fg";
  return (
    <div className="bg-surface border border-line rounded-lg px-3 py-2.5 text-center">
      <div className={`text-lg font-bold font-mono leading-tight ${color}`}>{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wide font-semibold mt-0.5 truncate">{label}</div>
    </div>
  );
}

// Staff-facing scratch-off history — a per-staff, per-shift read of the counts
// already flowing into the tab. A clerk sees only their own numbers (+ store
// totals); a manager/owner sees everyone. Reads the live entries prop (last 180
// days) — no extra fetch. Export is a CSV of the per-staff/shift table.
export default function ScratchHistory({ entries = [], locations = [], locName = () => "" }) {
  const { profile, vendor, isManager } = useSession();
  const { theme } = useTheme();
  const { t } = useLang();
  const [days, setDays] = useState(30);
  const [shift, setShift] = useState("all");   // all | open | close
  const [locId, setLocId] = useState("");       // manager location filter ("" = all)
  const [measure, setMeasure] = useState("dollars"); // dollars | tickets

  const ch = { ...(CHART[theme] || CHART.light), bar: chartBar(vendor, theme) };
  const tip = { borderRadius: 10, border: `1px solid ${ch.tipBorder}`, background: ch.tipBg, color: ch.tipText, fontSize: 12 };
  const from = daysAgoISO(days - 1);
  const staffId = isManager ? "" : (profile?.id || "");

  const scoped = useMemo(
    () => (shift === "all" ? entries : entries.filter((e) => (e.shift === "close" ? "close" : "open") === shift)),
    [entries, shift]
  );
  const a = useMemo(
    () => buildScratchAnalytics(scoped, { from, to: todayISO(), locationId: isManager ? locId : "", staffId }),
    [scoped, from, locId, isManager, staffId]
  );
  const chartData = useMemo(() => a.byDay.map((d) => ({ ...d, label: shortDay(d.date) })), [a.byDay]);
  const rangeLabel = `${from} → ${todayISO()}`;
  // staffId scoping already limits a clerk to their own rows; managers see all.
  const page = usePaged(a.byStaffShift, { resetKey: `${days}|${shift}|${locId}` });

  // The shift log is built from the UNFILTERED entries on purpose: an opening and
  // a closing must pair into one row, and the shift chips above deliberately keep
  // only one side. `staffId` then filters whole ROWS, so a clerk sees the shifts
  // they signed with the coworker on the other side still named.
  const policy = resolveScratchShifts(vendor);
  const shiftLog = useMemo(() => buildShiftLog(entries, {
    from, to: todayISO(), locationId: isManager ? locId : "", staffId, policy,
  }), [entries, from, locId, isManager, staffId, policy]);
  const logPage = usePaged(shiftLog.rows, { initial: 25, step: 25, resetKey: `${days}|${locId}|log` });
  const logBands = useMemo(() => groupShiftLogByDate(logPage.visible), [logPage.visible]);

  const exportCsv = () => downloadCSV(buildScratchStaffCSV(a, { rangeLabel, shiftLog }), `scratch-staff-${from}_${todayISO()}.csv`);
  const fmt = (v) => (measure === "dollars" ? money(v) : v);
  const hasData = a.totals.counts > 0;

  const chip = (val, label, cur, set) => (
    <button type="button" onClick={() => set(val)}
      className={`text-[12px] px-2.5 py-1 rounded-lg border transition ${cur === val ? "bg-fg text-surface border-fg" : "border-line text-muted hover:text-fg"}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[12px] text-muted">{isManager ? t("shist.sub_manager") : t("shist.sub_staff")}</p>
        <button type="button" className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={!hasData} onClick={exportCsv}>
          ⬇ {t("shist.export")}
        </button>
      </div>

      {/* Filters — one row above the charts */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {chip(7, t("shist.d7"), days, setDays)}
        {chip(30, t("shist.d30"), days, setDays)}
        {chip(90, t("shist.d90"), days, setDays)}
        <span className="w-px h-5 bg-line mx-0.5" aria-hidden="true" />
        {chip("all", t("shist.all_shifts"), shift, setShift)}
        {chip("open", t("common.opening"), shift, setShift)}
        {chip("close", t("common.closing"), shift, setShift)}
        {isManager && locations.length > 1 && (
          <select className="input w-auto text-[12px] py-1 ml-auto" value={locId} onChange={(e) => setLocId(e.target.value)}>
            <option value="">{t("shist.all_locations")}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>

      {/* KPI tiles */}
      <div className={`grid grid-cols-2 ${isManager ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-2.5`}>
        <Tile label={t("shist.tickets")} value={a.totals.tickets} />
        <Tile label={t("shist.sales")} value={money(a.totals.dollars)} tone={a.totals.dollars > 0 ? "pos" : undefined} />
        <Tile label={t("shist.packs")} value={a.totals.packs} />
        <Tile label={t("shist.soldout")} value={a.totals.soldOut} />
        {isManager && <Tile label={t("shist.gap")} value={money(a.totals.gapDollars)} tone={a.totals.gapDollars > 0 ? "neg" : undefined} />}
      </div>

      {!hasData ? (
        <div className="card p-6 text-center text-[13px] text-muted">{t("shist.empty")}</div>
      ) : (
        <>
          {/* Sales/tickets by day — single measure at a time (one axis) */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-[14px]">{t("shist.by_day")}</h3>
              <div className="flex gap-1.5">
                {chip("dollars", t("shist.m_sales"), measure, setMeasure)}
                {chip("tickets", t("shist.m_tickets"), measure, setMeasure)}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: ch.grid }} />
                <YAxis tick={{ fill: ch.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={44}
                  tickFormatter={(v) => (measure === "dollars" ? `$${v}` : v)} />
                <Tooltip contentStyle={tip} formatter={(v) => [fmt(v), measure === "dollars" ? t("shist.m_sales") : t("shist.m_tickets")]} cursor={{ fill: ch.grid, opacity: 0.4 }} />
                <Bar dataKey={measure} fill={ch.bar} radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Shift split — two tiles instead of a two-hue chart (beginner-clear) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="card p-3.5">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">🌅 {t("common.opening")}</div>
              <div className="text-xl font-bold font-mono mt-0.5">{money(a.byShift.open.dollars)}</div>
              <div className="text-[11px] text-muted">{t("shist.n_tickets", { n: a.byShift.open.tickets })}</div>
            </div>
            <div className="card p-3.5">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">🌇 {t("common.closing")}</div>
              <div className="text-xl font-bold font-mono mt-0.5">{money(a.byShift.close.dollars)}</div>
              <div className="text-[11px] text-muted">{t("shist.n_tickets", { n: a.byShift.close.tickets })}</div>
            </div>
          </div>

          {/* Shift log — the readings themselves: what each pack stood at when
              the shift opened and when it closed. A clerk sees their own shifts. */}
          {shiftLog.rows.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-line">
                <h3 className="font-semibold text-[14px]">{t("srep.log_title")}</h3>
                <p className="text-[12px] text-muted mt-0.5">{isManager ? t("srep.log_sub") : t("shist.log_sub_staff")}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-[10px] uppercase tracking-wide text-muted">
                    <th className="text-left font-semibold px-4 py-2">{t("srep.th_game")}</th>
                    <th className="text-left font-semibold px-2 py-2">{t("srep.th_book")}</th>
                    <th className="text-right font-semibold px-2 py-2">{t("srep.th_at_open")}</th>
                    <th className="text-right font-semibold px-2 py-2">{t("srep.th_at_close")}</th>
                    <th className="text-right font-semibold px-2 py-2">{t("srep.th_sold_shift")}</th>
                    <th className="text-right font-semibold px-4 py-2">{t("srep.th_sales")}</th>
                  </tr></thead>
                  {logBands.map((g) => (
                  <tbody key={g.date}>
                    {/* One heading per day instead of the date on every line. */}
                    <tr className="border-t border-line bg-subtle">
                      <td colSpan={6} className="px-4 py-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[12px] font-semibold">{fmtDay(g.date)}</span>
                          <span className="text-[11px] text-muted font-mono tabular-nums">
                            {t("srep.log_day_total", { n: g.sold, money: money(g.dollars) })}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {g.rows.map((r) => (
                    <tr key={r.key} className="border-t border-line-soft align-top">
                      <td className="px-4 py-2">
                        <div className="truncate">{r.game}</div>
                        {r.gameNo && <div className="text-[11px] text-muted font-mono">#{r.gameNo}</div>}
                      </td>
                      <td className="px-2 py-2 font-mono text-[12px]">{r.bookNo}</td>
                      <td className="px-2 py-2 text-right">
                        <div className="font-mono tabular-nums">{r.openTicket != null ? `#${r.openTicket}` : "—"}</div>
                        <div className="text-[11px] text-muted">{r.openTicket != null
                          ? `${fmtTime(r.openTs)} · ${r.openBy}` : t("srep.log_no_open")}</div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="font-mono tabular-nums">{r.closeTicket != null ? `#${r.closeTicket}` : "—"}
                          {r.soldOut && <span className="ml-1 text-[10px] uppercase font-bold text-neg">{t("srep.log_soldout")}</span>}</div>
                        <div className="text-[11px] text-muted">{r.closeTicket != null
                          ? `${fmtTime(r.closeTs)} · ${r.closeBy}` : t("srep.log_no_close")}</div>
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {r.sold != null ? r.sold : <span className="text-neg" title={t("srep.log_rollback")}>⚠</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{r.dollars != null ? money(r.dollars) : "—"}</td>
                    </tr>
                    ))}
                  </tbody>
                  ))}
                </table>
              </div>
              <div className="px-4 py-2"><ShowMore hasMore={logPage.hasMore} nextStep={logPage.nextStep} onMore={logPage.showMore} /></div>
            </div>
          )}

          {/* Per staff × shift table (the report's data view) */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <h3 className="font-semibold text-[14px]">{t("shist.table_title")}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted">
                    <th className="text-left font-semibold px-4 py-2">{t("shist.th_staff")}</th>
                    <th className="text-left font-semibold px-2 py-2">{t("shist.th_shift")}</th>
                    <th className="text-right font-semibold px-2 py-2">{t("shist.th_tickets")}</th>
                    <th className="text-right font-semibold px-4 py-2">{t("shist.th_sales")}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.visible.map((s) => (
                    <tr key={`${s.byId || s.by}|${s.shift}`} className="border-t border-line-soft">
                      <td className="px-4 py-2 font-medium truncate">{s.by}</td>
                      <td className="px-2 py-2 text-muted">{s.shift === "close" ? t("common.closing") : t("common.opening")}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{s.tickets}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{money(s.dollars)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2"><ShowMore hasMore={page.hasMore} nextStep={page.nextStep} onMore={page.showMore} /></div>
          </div>
        </>
      )}
    </div>
  );
}
