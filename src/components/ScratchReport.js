"use client";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { money, downloadCSV } from "@/lib/utils";
import { buildScratchAnalytics, buildScratchReportCSV } from "@/lib/scratch-analytics";
import { chartBar, paletteAccent, paletteInk } from "@/lib/branding";
import { fetchEntriesInRange, fetchScratchCensus, verifyEntry } from "@/lib/data";
import { buildPackAudit } from "@/lib/scratch-audit";
import { buildCensusReconcile } from "@/lib/scratch-census";
import { useSession } from "./SessionProvider";
import { useTheme } from "./ThemeProvider";
import { useLang } from "./LangProvider";
import TabIcon from "./TabIcon";
import ShowMore, { usePaged } from "./ShowMore";

const CHART = {
  light: { grid: "#e6e7e4", axis: "#82857f", tipBg: "#ffffff", tipBorder: "#dbdcd9", tipText: "#1a241c" },
  dark: { grid: "#2c2e2c", axis: "#777a76", tipBg: "#1c1d1c", tipBorder: "#353736", tipText: "#e8eee9" },
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const shortDay = (iso) => (iso || "").slice(5).replace("-", "/");
const pad2 = (n) => String(n).padStart(2, "0");
// A count's server-pinned ts (a Date via toDate) as a short local date+time —
// the "when" on each side of a ticket-sequence gap. Local tz shows the store's
// clock; null (a pending write) reads as a dash.
const fmtTs = (d, lang) => (d ? d.toLocaleString(lang === "es" ? "es" : "en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

function rangeFor(id, customFrom, customTo) {
  const to = todayISO();
  const d = new Date();
  if (id === "custom") return { from: customFrom || daysAgoISO(29), to: customTo || to };
  if (id === "90d") return { from: daysAgoISO(89), to };
  if (id === "mtd") return { from: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`, to };
  if (id === "ytd") return { from: `${d.getFullYear()}-01-01`, to };
  return { from: daysAgoISO(29), to }; // 30d default
}

function Tile({ label, value, tone }) {
  const color = tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-fg";
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold font-mono leading-tight ${color}`}>{value}</div>
      <div className="text-[11px] text-muted uppercase tracking-wide font-semibold mt-1 truncate">{label}</div>
    </div>
  );
}

// Owner-only combined scratch-off report: pick a period + location, and read the
// whole store's counts as KPIs, charts (sales over time, top games, by staff)
// and tables — one place for the numbers, exportable as CSV or a branded print.
// One-shot read via fetchEntriesInRange; it never mutates the signed log.
export default function ScratchReport({ locations = [], locName = () => "" }) {
  const { vendor, profile } = useSession();
  const { theme } = useTheme();
  const { t, lang } = useLang();
  const [rangeId, setRangeId] = useState("30d");
  const [customFrom, setCustomFrom] = useState(daysAgoISO(29));
  const [customTo, setCustomTo] = useState(todayISO());
  const [locId, setLocId] = useState("");
  const [measure, setMeasure] = useState("dollars");
  const [rows, setRows] = useState(null);
  const [recon, setRecon] = useState(null);
  const [err, setErr] = useState("");
  // Optimistic set of entry ids countersigned this session (the one-shot fetch
  // won't refresh verifiedBy until the range reloads).
  const [verifiedLocal, setVerifiedLocal] = useState(() => new Set());
  const [verifyBusy, setVerifyBusy] = useState("");

  const { from, to } = rangeFor(rangeId, customFrom, customTo);
  const ch = { ...(CHART[theme] || CHART.light), bar: chartBar(vendor, theme) };
  const tip = { borderRadius: 10, border: `1px solid ${ch.tipBorder}`, background: ch.tipBg, color: ch.tipText, fontSize: 12 };

  useEffect(() => {
    let alive = true;
    setRows(null); setErr("");
    fetchEntriesInRange(vendor.id, from, to, locId || null)
      .then((list) => { if (alive) setRows(list); })
      .catch((e) => { if (alive) setErr(e?.message || "load failed"); });
    return () => { alive = false; };
  }, [vendor.id, from, to, locId]);

  // Books-on-hand reconcile is a NOW-state, not a period metric — always over a
  // fixed recent window (180d) so it sees the last two censuses and enough count
  // history to judge "ever counted" / "sold out", independent of the range picker.
  useEffect(() => {
    let alive = true;
    const rFrom = daysAgoISO(179), rTo = todayISO();
    Promise.all([
      fetchScratchCensus(vendor.id, rFrom, rTo),
      fetchEntriesInRange(vendor.id, rFrom, rTo, locId || null),
    ])
      .then(([cen, ent]) => { if (alive) setRecon(buildCensusReconcile(cen, ent, { locationId: locId })); })
      .catch(() => { if (alive) setRecon(null); });
    return () => { alive = false; };
  }, [vendor.id, locId]);

  const a = useMemo(() => buildScratchAnalytics(rows || [], { from, to, locationId: locId }), [rows, from, to, locId]);
  const dayData = useMemo(() => a.byDay.map((d) => ({ ...d, label: shortDay(d.date) })), [a.byDay]);
  const gameData = useMemo(() => a.byGame.slice(0, 8).map((g) => ({ name: g.game, dollars: g.dollars, tickets: g.tickets })), [a.byGame]);
  const staffData = useMemo(() => a.byStaff.slice(0, 8).map((s) => ({ name: s.by, dollars: s.dollars, tickets: s.tickets })), [a.byStaff]);
  // Pack audit "missing" = books with history that stopped being counted (the
  // detail the Dashboard card used to show); wide window so the fetched period
  // isn't truncated by the rolling default.
  const audit = useMemo(() => buildPackAudit(rows || [], { days: 3650 }), [rows]);
  // Ticket-sequence gaps: the per-boundary events buildPackAudit already computes
  // (prevEnd/nextStart + who + server ts on each side) — surfaced as a table so an
  // owner can read exactly what the pack was at when one shift closed and the next
  // opened, and where tickets went missing between. Worst-dollars first.
  const seqGaps = useMemo(() => audit.gaps.filter((g) => g.totalMissing > 0), [audit]);
  const rowsById = useMemo(() => {
    const m = new Map();
    (rows || []).forEach((e) => { if (e.id) m.set(e.id, e); });
    return m;
  }, [rows]);
  // Countersign the anomalous read (the open above the prior close, or a
  // sellout-short book). verifyOnly() bars self-verify server-side; we also hide
  // the button on the owner's own counts. Optimistically flip it verified so the
  // control clears at once despite the one-shot fetch.
  const countersign = async (id) => {
    if (!id || verifyBusy) return;
    setVerifyBusy(id);
    try { await verifyEntry(vendor.id, id, profile.name); setVerifiedLocal((s) => new Set(s).add(id)); }
    catch (e) { setErr(e?.message || "verify failed"); }
    setVerifyBusy("");
  };
  const gamePage = usePaged(a.byGame, { resetKey: `${from}|${to}|${locId}` });
  const staffPage = usePaged(a.byStaff, { resetKey: `${from}|${to}|${locId}g` });

  const rangeLabel = `${from} → ${to}`;
  const hasData = a.totals.counts > 0;
  const chip = (val, label, cur, set) => (
    <button type="button" onClick={() => set(val)}
      className={`text-[12px] px-2.5 py-1 rounded-lg border transition ${cur === val ? "bg-fg text-surface border-fg" : "border-line text-muted hover:text-fg"}`}>
      {label}
    </button>
  );

  const exportCsv = () => downloadCSV(buildScratchReportCSV(a, { rangeLabel }), `scratch-report-${from}_${to}.csv`);

  const print = () => {
    const win = window.open("", "_blank");
    if (!win) { setErr(t("scratch.report_popup")); return; }
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const accent = paletteAccent(vendor), ink = paletteInk(vendor);
    const kpi = (label, val) => `<div class="kpi"><div class="v">${esc(val)}</div><div class="l">${esc(label)}</div></div>`;
    const tRows = (list, cols) => list.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? "num" : ""}">${esc(c.get(r))}</td>`).join("")}</tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>${esc(vendor.name)} — ${esc(t("srep.title"))}</title>
    <style>body{font:12px Helvetica,Arial;margin:32px;color:#1a241c}h1{font-size:18px;margin:0}h2{font-size:13px;margin:22px 0 6px}p{color:#666;margin:2px 0}
    table{border-collapse:collapse;width:100%;margin-top:6px;font-size:11px}th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #ccc}th{border-bottom:2px solid ${ink}}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
    .kpis{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}.kpi{border:1px solid #ccc;border-radius:8px;padding:8px 12px;min-width:90px}.kpi .v{font-size:16px;font-weight:bold}.kpi .l{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.04em;margin-top:2px}
    .brand{display:flex;align-items:center;gap:8px}.mark{width:26px;height:26px;border-radius:5px;background:${accent};color:#fff;font-weight:bold;display:flex;align-items:center;justify-content:center}</style>
    </head><body>
    <div class="brand"><div class="mark">D</div><div><h1>${esc(vendor.name)} — ${esc(t("srep.title"))}</h1>
    <p>${esc(rangeLabel)}${locId ? ` · ${esc(locName(locId))}` : ` · ${esc(t("srep.all_locations"))}`}</p></div></div>
    <div class="kpis">
      ${kpi(t("srep.tickets"), a.totals.tickets)}${kpi(t("srep.sales"), money(a.totals.dollars))}
      ${kpi(t("srep.packs"), a.totals.packs)}${kpi(t("srep.soldout"), a.totals.soldOut)}${kpi(t("srep.gap"), money(a.totals.gapDollars))}
    </div>
    <h2>${esc(t("srep.by_game"))}</h2>
    <table><thead><tr><th>${esc(t("srep.th_game"))}</th><th class="num">${esc(t("srep.th_tickets"))}</th><th class="num">${esc(t("srep.th_sales"))}</th></tr></thead>
    <tbody>${tRows(a.byGame, [{ get: (r) => r.game }, { get: (r) => r.tickets, num: 1 }, { get: (r) => money(r.dollars), num: 1 }])}</tbody></table>
    <h2>${esc(t("srep.by_staff"))}</h2>
    <table><thead><tr><th>${esc(t("srep.th_staff"))}</th><th class="num">${esc(t("srep.th_tickets"))}</th><th class="num">${esc(t("srep.th_sales"))}</th></tr></thead>
    <tbody>${tRows(a.byStaff, [{ get: (r) => r.by }, { get: (r) => r.tickets, num: 1 }, { get: (r) => money(r.dollars), num: 1 }])}</tbody></table>
    </body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { try { win.print(); } catch { /* user prints manually */ } }, 250);
  };

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold text-[15px] flex items-center gap-2"><TabIcon id="scratchreport" size={18} className="text-gold" /> {t("srep.title")}</h2>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={!hasData} onClick={exportCsv}>⬇ {t("srep.export_csv")}</button>
            <button type="button" className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={!hasData} onClick={print}>🖨 {t("srep.print")}</button>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[12px] text-muted">{t("srep.sub")}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {chip("30d", t("srep.r_30d"), rangeId, setRangeId)}
            {chip("90d", t("srep.r_90d"), rangeId, setRangeId)}
            {chip("mtd", t("srep.r_mtd"), rangeId, setRangeId)}
            {chip("ytd", t("srep.r_ytd"), rangeId, setRangeId)}
            {chip("custom", t("srep.r_custom"), rangeId, setRangeId)}
            {locations.length > 1 && (
              <select className="input w-auto text-[12px] py-1 ml-auto" value={locId} onChange={(e) => setLocId(e.target.value)}>
                <option value="">{t("srep.all_locations")}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
          </div>
          {rangeId === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">{t("srep.from")}</span>
                <input type="date" className="input" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} /></label>
              <label className="block"><span className="label">{t("srep.to")}</span>
                <input type="date" className="input" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} /></label>
            </div>
          )}
        </div>
      </div>

      {err && <p role="alert" className="text-[13px] text-neg">{err}</p>}
      {rows === null ? (
        <p className="text-muted text-sm">{t("common.loading")}</p>
      ) : !hasData ? (
        <div className="card p-8 text-center text-[13px] text-muted">{t("srep.empty")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile label={t("srep.tickets")} value={a.totals.tickets} />
            <Tile label={t("srep.sales")} value={money(a.totals.dollars)} tone="pos" />
            <Tile label={t("srep.packs")} value={a.totals.packs} />
            <Tile label={t("srep.soldout")} value={a.totals.soldOut} />
            <Tile label={t("srep.gap")} value={money(a.totals.gapDollars)} tone={a.totals.gapDollars > 0 ? "neg" : undefined} />
          </div>

          {/* Sales over time — one measure at a time */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-[15px]">{t("srep.over_time")}</h3>
              <div className="flex gap-1.5">
                {chip("dollars", t("srep.m_sales"), measure, setMeasure)}
                {chip("tickets", t("srep.m_tickets"), measure, setMeasure)}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dayData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: ch.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: ch.grid }} minTickGap={16} />
                <YAxis tick={{ fill: ch.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={48}
                  tickFormatter={(v) => (measure === "dollars" ? `$${v}` : v)} />
                <Tooltip contentStyle={tip} cursor={{ fill: ch.grid, opacity: 0.4 }}
                  formatter={(v) => [measure === "dollars" ? money(v) : v, measure === "dollars" ? t("srep.m_sales") : t("srep.m_tickets")]} />
                <Bar dataKey={measure} fill={ch.bar} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Top games */}
            <div className="card p-4">
              <h3 className="font-semibold text-[15px] mb-3">{t("srep.top_games")}</h3>
              <ResponsiveContainer width="100%" height={Math.max(160, gameData.length * 34)}>
                <BarChart data={gameData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fill: ch.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: ch.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={96} />
                  <Tooltip contentStyle={tip} cursor={{ fill: ch.grid, opacity: 0.4 }} formatter={(v) => [money(v), t("srep.m_sales")]} />
                  <Bar dataKey="dollars" fill={ch.bar} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* By staff */}
            <div className="card p-4">
              <h3 className="font-semibold text-[15px] mb-3">{t("srep.by_staff")}</h3>
              <ResponsiveContainer width="100%" height={Math.max(160, staffData.length * 34)}>
                <BarChart data={staffData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fill: ch.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: ch.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={96} />
                  <Tooltip contentStyle={tip} cursor={{ fill: ch.grid, opacity: 0.4 }} formatter={(v) => [money(v), t("srep.m_sales")]} />
                  <Bar dataKey="dollars" fill={ch.bar} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Shift split tiles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">🌅 {t("common.opening")}</div>
              <div className="text-2xl font-bold font-mono mt-0.5">{money(a.byShift.open.dollars)}</div>
              <div className="text-[12px] text-muted">{t("srep.n_tickets", { n: a.byShift.open.tickets })}</div>
            </div>
            <div className="card p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">🌇 {t("common.closing")}</div>
              <div className="text-2xl font-bold font-mono mt-0.5">{money(a.byShift.close.dollars)}</div>
              <div className="text-[12px] text-muted">{t("srep.n_tickets", { n: a.byShift.close.tickets })}</div>
            </div>
          </div>

          {/* By-game table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-line"><h3 className="font-semibold text-[15px]">{t("srep.by_game")}</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="text-[10px] uppercase tracking-wide text-muted">
                  <th className="text-left font-semibold px-4 py-2">{t("srep.th_game")}</th>
                  <th className="text-right font-semibold px-2 py-2">{t("srep.th_price")}</th>
                  <th className="text-right font-semibold px-2 py-2">{t("srep.th_tickets")}</th>
                  <th className="text-right font-semibold px-4 py-2">{t("srep.th_sales")}</th>
                </tr></thead>
                <tbody>{gamePage.visible.map((g) => (
                  <tr key={g.game} className="border-t border-line-soft">
                    <td className="px-4 py-2 font-medium truncate">{g.game}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-muted">{money(g.price)}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{g.tickets}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{money(g.dollars)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="px-4 py-2"><ShowMore hasMore={gamePage.hasMore} nextStep={gamePage.nextStep} onMore={gamePage.showMore} /></div>
          </div>

          {/* By-staff table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-line"><h3 className="font-semibold text-[15px]">{t("srep.by_staff")}</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="text-[10px] uppercase tracking-wide text-muted">
                  <th className="text-left font-semibold px-4 py-2">{t("srep.th_staff")}</th>
                  <th className="text-right font-semibold px-2 py-2">{t("srep.th_tickets")}</th>
                  <th className="text-right font-semibold px-2 py-2">{t("srep.th_soldout")}</th>
                  <th className="text-right font-semibold px-4 py-2">{t("srep.th_sales")}</th>
                </tr></thead>
                <tbody>{staffPage.visible.map((s) => (
                  <tr key={s.byId || s.by} className="border-t border-line-soft">
                    <td className="px-4 py-2 font-medium truncate">{s.by}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{s.tickets}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{s.soldOut}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{money(s.dollars)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="px-4 py-2"><ShowMore hasMore={staffPage.hasMore} nextStep={staffPage.nextStep} onMore={staffPage.showMore} /></div>
          </div>

          {/* Ticket-sequence gaps — per pack, the closing→opening boundary with
              ticket numbers, who counted, and the server time on each side. */}
          {seqGaps.length > 0 && (
            <div className="card overflow-hidden border-neg/30">
              <div className="px-4 py-3 border-b border-line">
                <h3 className="font-semibold text-[15px] text-neg">⚠ {t("srep.gaps_title")}</h3>
                <p className="text-[12px] text-muted mt-0.5">{t("srep.gaps_sub")}</p>
              </div>
              {seqGaps.slice(0, 20).map((g) => (
                <div key={g.key} className="border-t border-line-soft px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3 text-[13px] mb-1.5">
                    <span className="min-w-0 truncate font-medium">{g.game} <span className="text-muted font-mono text-[11px]">#{g.pack}</span></span>
                    <span className="font-mono tabular-nums text-neg flex-shrink-0">{t("srep.gap_n", { n: g.totalMissing })} · {money(g.missingDollars)}</span>
                  </div>
                  <div className="space-y-1">
                    {g.events.filter((ev) => ev.missing > 0).map((ev, i) => {
                      // The accountable read to countersign: the open (next) of a
                      // continuity gap, or the finaled book of a sellout-short.
                      const targetId = ev.selloutShort ? ev.lastId : ev.nextId;
                      const target = targetId ? rowsById.get(targetId) : null;
                      const verified = target && (target.verifiedBy || verifiedLocal.has(targetId));
                      return (
                        <div key={i} className="text-[12px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {ev.selloutShort ? (
                            <span className="text-muted">{t("srep.seq_soldout", { n: ev.prevEnd, by: ev.prevBy, when: fmtTs(ev.prevTs, lang), size: ev.nextStart })}</span>
                          ) : (
                            <>
                              <span className="text-muted"><span className="text-fg font-mono tabular-nums">#{ev.prevEnd}</span> {t("srep.seq_close", { by: ev.prevBy, when: fmtTs(ev.prevTs, lang) })}</span>
                              <span className="text-muted" aria-hidden="true">→</span>
                              <span className="text-muted"><span className="text-fg font-mono tabular-nums">#{ev.nextStart}</span> {t("srep.seq_open", { by: ev.nextBy, when: fmtTs(ev.nextTs, lang) })}</span>
                            </>
                          )}
                          <span className="text-neg font-mono tabular-nums">+{ev.missing}</span>
                          {target && (verified ? (
                            <span className="text-[11px] text-pos flex-shrink-0" title={t("log.verified_by", { name: target.verifiedBy || profile.name })}>{t("srep.seq_verified", { by: target.verifiedBy || profile.name })}</span>
                          ) : target.byId === profile.id ? (
                            <span className="text-[11px] text-muted italic flex-shrink-0">{t("srep.seq_verify_own")}</span>
                          ) : (
                            <button type="button" className="text-[11px] text-brass font-semibold underline underline-offset-2 flex-shrink-0 disabled:opacity-50"
                              disabled={verifyBusy === targetId} onClick={() => countersign(targetId)}>{t("srep.seq_verify")}</button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {audit.missing.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-line">
                <h3 className="font-semibold text-[15px]">{t("srep.missing_title")}</h3>
                <p className="text-[12px] text-muted mt-0.5">{t("srep.missing_sub")}</p>
              </div>
              {audit.missing.slice(0, 20).map((m) => (
                <div key={m.key} className="px-4 py-2 border-t border-line-soft text-[13px]">
                  <div className="truncate">{m.game} <span className="text-muted font-mono text-[11px]">#{m.pack}</span></div>
                  <div className="text-[12px] text-muted">{t("srep.missing_line", { end: m.lastEnd ?? "—", by: m.lastBy, when: fmtTs(m.lastTs, lang), days: m.missedDays })}</div>
                </div>
              ))}
            </div>
          )}

          {/* Books-on-hand reconcile — walked books (theft) and on-hand books that
              were never counted (the never-counted blind spot a count can't see). */}
          {recon && (
            <div className={`card overflow-hidden ${recon.walked.length > 0 ? "border-neg/30" : ""}`}>
              <div className="px-4 py-3 border-b border-line">
                <h3 className="font-semibold text-[15px]">{t("srep.recon_title")}</h3>
                <p className="text-[12px] text-muted mt-0.5">
                  {recon.latest
                    ? t("srep.recon_latest", { date: recon.latest.date, by: recon.latest.by, n: recon.latest.count })
                    : t("srep.recon_none")}
                </p>
              </div>
              {recon.walked.length > 0 && (
                <div className="border-t border-line-soft py-1">
                  <div className="px-4 pt-1.5 pb-0.5 text-[12px] font-semibold text-neg">⚠ {t("srep.recon_walked_title", { date: recon.prior?.date || "—" })}</div>
                  {recon.walked.slice(0, 20).map((w) => (
                    <div key={w.pack} className="px-4 py-1.5 text-[13px] flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{w.game || t("srep.recon_book")} <span className="text-muted font-mono text-[11px]">#{w.pack}</span></span>
                      <span className="text-[11px] text-muted flex-shrink-0">{w.counted ? t("srep.recon_was_counted") : t("srep.recon_never_counted")}</span>
                    </div>
                  ))}
                </div>
              )}
              {recon.uncounted.length > 0 && (
                <div className="border-t border-line-soft py-1">
                  <div className="px-4 pt-1.5 pb-0.5 text-[12px] font-semibold">{t("srep.recon_uncounted_title")}</div>
                  <p className="px-4 pb-1 text-[11px] text-muted">{t("srep.recon_uncounted_sub")}</p>
                  {recon.uncounted.slice(0, 20).map((u) => (
                    <div key={u.pack} className="px-4 py-1.5 text-[13px] truncate">{u.game || t("srep.recon_book")} <span className="text-muted font-mono text-[11px]">#{u.pack}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
