"use client";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from "recharts";
import { money, toDate, isUnresolved, printCloseHtml } from "@/lib/utils";
import { useModalA11y } from "@/lib/use-modal-a11y";
import { detectPatterns, resolvePatternRules } from "@/lib/patterns";
import { buildRewardAudit, outstandingLiability } from "@/lib/reward-audit";
import { renderPattern } from "@/lib/pattern-format";
import { buildStockAlerts } from "@/lib/stock-alerts";
import { buildStockMoveAudit } from "@/lib/stockmove-audit";
import { featureEnabled } from "@/lib/features";
import { scopeEntries, seesEveryone } from "@/lib/staff-scope";
import { chartBar, paletteAccent, paletteInk } from "@/lib/branding";
import { apiPatternNarrative, fetchEntriesInRange, fetchRewardEventsInRange } from "@/lib/data";
import { buildTheftReport } from "@/lib/theft-report";
import { useSession } from "./SessionProvider";
import { useTheme } from "./ThemeProvider";
import { useLang } from "./LangProvider";
import ReportModal from "./ReportModal";
import EmptyState, { IconChart } from "./EmptyState";

// Recharts paints SVG with literal color strings (CSS vars aren't reliable on
// SVG presentation attributes), so the chart palette is resolved from the
// active theme in JS rather than through Tailwind tokens.
// grid/axis/tooltip are neutral grays (theme-independent chrome); `bar` is
// replaced per store by chartBar(vendor, theme), so nothing here reads green.
const CHART = {
  light: { grid: "#e6e7e4", axis: "#82857f", tipBg: "#ffffff", tipBorder: "#dbdcd9", tipText: "#1a241c", bar: "#14532d" },
  dark: { grid: "#2c2e2c", axis: "#777a76", tipBg: "#1c1d1c", tipBorder: "#353736", tipText: "#e8eee9", bar: "#7fd39e" },
};

function Stat({ label, value, tone }) {
  const color = tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-fg";
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[11px] text-muted uppercase tracking-wide font-semibold mt-1">{label}</div>
    </div>
  );
}

export default function Dashboard({ entries, locations = [], locName = () => "—", incidents = [], items = [], rewardEvents = [], customers = [], stockMoves = [], collections = [], punches = [], onOpenLog, onRecord, onOpenScratchReport, onToast, locPicker = null }) {
  const { isManager, vendor, profile } = useSession();
  const profileName = profile?.name || "";
  const { theme } = useTheme();
  const { t, lang } = useLang();
  const ch = { ...(CHART[theme] || CHART.light), bar: chartBar(vendor, theme) };
  const tip = { borderRadius: 10, border: `1px solid ${ch.tipBorder}`, background: ch.tipBg, color: ch.tipText, fontSize: 13 };
  const [reportOpen, setReportOpen] = useState(false);
  // Recurring signals (repeat shorts, drawer hot-spots, backlog, shrink
  // streaks) — manager-facing only, so employees never see them computed.
  const basePatterns = useMemo(
    () => (isManager ? detectPatterns(entries, { rules: vendor?.patternRules, punches }) : []),
    [entries, isManager, vendor?.patternRules, punches]);
  // Rewards audit (rewards-program-spec.md Phase 2): the ledger reconciled
  // against the countersigned cash sales, plus per-day skim/burst detectors.
  // Its alerts are pattern-shaped and merge into the same Patterns card and
  // AI-insight flow (clerk names ride the redactor's person list).
  const rewardsOn = vendor?.rewards?.enabled === true;
  // Hide a disabled module's figures everywhere on the dashboard — a store that
  // turned scratch/inventory/cash off should never see its stats, charts, or
  // table columns. Grids/tables below drop the cell or column so the layout
  // reflows cleanly rather than leaving a hole.
  const inventoryOn = featureEnabled(vendor, "inventory");
  const cashOn = featureEnabled(vendor, "cash");
  const rewardAudit = useMemo(
    () => (isManager && rewardsOn
      ? buildRewardAudit(rewardEvents, entries, {
          rules: vendor?.rewards, customers,
          windowDays: resolvePatternRules(vendor?.patternRules).windowDays,
        })
      : { alerts: [], totals: { earned: 0, redeemed: 0, earns: 0, redemptions: 0 } }),
    [rewardEvents, entries, customers, isManager, rewardsOn, vendor?.rewards, vendor?.patternRules]);
  // Backroom pull ledger detectors (outsized pulls, clerk-dominated outflow) —
  // manager-only, over the 30-day window of moves the shell already watches.
  const stockMoveAudit = useMemo(
    () => (isManager && featureEnabled(vendor, "inventory") ? buildStockMoveAudit(stockMoves, { days: 30 }) : { alerts: [] }),
    [stockMoves, isManager, vendor]);
  const patterns = useMemo(
    () => [...basePatterns, ...rewardAudit.alerts, ...stockMoveAudit.alerts],
    [basePatterns, rewardAudit.alerts, stockMoveAudit.alerts]);
  const liability = useMemo(
    () => outstandingLiability(customers, vendor?.rewards),
    [customers, vendor?.rewards]);
  // Stock attention: expiring-soon + need-order lists from the items' synced
  // quantity/expiry fields (pos-inventory-sync-spec.md Phase 1). Manager-only,
  // thresholds owner-tuned in Admin → Stock alerts.
  const stock = useMemo(
    () => (isManager ? buildStockAlerts(items, { rules: vendor?.stockAlerts }) : { expiring: [], lowStock: [], rules: {} }),
    [items, isManager, vendor?.stockAlerts]);
  // WHOSE numbers this dashboard shows. A manager/owner is accountable for the
  // whole store, so they see everyone. An EMPLOYEE sees their own work only:
  // the store-wide totals and the needs-attention queue used to name coworkers
  // and their counts, which is a manager's job to review — a clerk doesn't need
  // (and shouldn't get) a performance read on the person beside them. The
  // Scratch history view has always scoped this way; this brings the dashboard
  // in line. Reads are unchanged — this is what the screen shows, not what the
  // rules allow (a clerk still needs a coworker's last ticket # to chain a count).
  // An owner who runs the log as a shared board can opt back in (staffScope).
  const own = useMemo(
    () => scopeEntries(entries, { vendor, isManager, viewerId: profile?.id }),
    [entries, vendor, isManager, profile?.id]);
  const teamView = seesEveryone(vendor, isManager);
  const a = useMemo(() => {
    const cash = own.filter((e) => e.kind === "cash");
    const inv = own.filter((e) => e.kind === "inventory");

    const netDiff = cash.reduce((s, e) => s + (e.diff || 0), 0);
    const shorts = cash.filter((e) => e.diff < -0.005).length;
    const overs = cash.filter((e) => e.diff > 0.005).length;
    const cashSales = cash.reduce((s, e) => s + (e.sales || 0), 0);
    const missingUnits = inv.reduce((s, e) => s + (e.diff < 0 ? -e.diff : 0), 0);

    // tier one: attention counters + top-10 needs-attention list. "Open" here
    // means unresolved (open OR under-review) — the same definition the digest
    // and period report use, so the surfaces can't disagree (M3).
    const openVariances = own.filter((e) => isUnresolved(e.varianceStatus)).length;
    const openDisputes = own.filter((e) => isUnresolved(e.disputeStatus)).length;
    const unverified = own.filter((e) => !e.verifiedBy).length;
    const dayMs = 24 * 60 * 60 * 1000;
    // `why` is a stable code (variance | dispute | unverified) plus the raw
    // status; the pill text + style resolve from the code so localization can't
    // break the styling check (Phase 2c).
    const attention = own
      .map((e) => {
        if (isUnresolved(e.varianceStatus)) return { e, why: "variance", status: e.varianceStatus };
        if (isUnresolved(e.disputeStatus)) return { e, why: "dispute", status: e.disputeStatus };
        if (!e.verifiedBy && toDate(e.ts) && Date.now() - toDate(e.ts).getTime() > dayMs) return { e, why: "unverified" };
        return null;
      })
      .filter(Boolean)
      .slice(0, 10);
    const verified = own.filter((e) => e.verifiedBy).length;
    const verifyRate = own.length ? Math.round((verified / own.length) * 100) : 0;

    // by day (last 14 with data)
    const byDay = {};
    cash.forEach((e) => {
      const d = e.date || (toDate(e.ts)?.toISOString().slice(0, 10)) || "?";
      byDay[d] = byDay[d] || { date: d, diff: 0, sales: 0 };
      byDay[d].diff += e.diff || 0;
      byDay[d].sales += e.sales || 0;
    });
    const dayRows = Object.values(byDay).sort((x, y) => x.date.localeCompare(y.date)).slice(-14)
      .map((r) => ({ ...r, diff: Math.round(r.diff * 100) / 100, sales: Math.round(r.sales * 100) / 100, label: r.date.slice(5) }));

    // by employee
    const byEmp = {};
    own.forEach((e) => {
      byEmp[e.by] = byEmp[e.by] || { name: e.by, entries: 0, diff: 0, shorts: 0 };
      byEmp[e.by].entries++;
      if (e.kind === "cash") { byEmp[e.by].diff += e.diff || 0; if (e.diff < -0.005) byEmp[e.by].shorts++; }
    });
    const empRows = Object.values(byEmp)
      .map((r) => ({ ...r, diff: Math.round(r.diff * 100) / 100 }))
      .sort((x, y) => x.diff - y.diff);

    // by item (inventory)
    const byItem = {};
    inv.forEach((e) => {
      const key = e.itemName || "(item)";
      byItem[key] = byItem[key] || { name: key, unit: e.unit || "unit", entries: 0, diff: 0, missing: 0 };
      byItem[key].entries++;
      byItem[key].diff += e.diff || 0;
      if (e.diff < 0) byItem[key].missing++;
    });
    const itemRows = Object.values(byItem).sort((x, y) => x.diff - y.diff);

    // by drawer (cash only — a drawer is a cash concept; scratch is a pack count
    // tied to a location/shift, and inventory has no drawer)
    const byDrawer = {};
    own.forEach((e) => {
      if (e.kind !== "cash") return;
      const key = e.drawerName || "(no drawer)";
      byDrawer[key] = byDrawer[key] || { name: key, entries: 0, diff: 0, cash: 0 };
      byDrawer[key].entries++;
      byDrawer[key].diff += e.diff || 0;
      byDrawer[key].cash += e.counted || 0;
    });
    const drawerRows = Object.values(byDrawer)
      .map((r) => ({ ...r, diff: Math.round(r.diff * 100) / 100, cash: Math.round(r.cash * 100) / 100 }))
      .sort((x, y) => y.entries - x.entries);

    return { count: own.length, netDiff, shorts, overs, cashSales, verifyRate, missingUnits, invCount: inv.length, openVariances, openDisputes, unverified, attention, dayRows, empRows, drawerRows, itemRows };
  }, [own]);

  // On-demand AI narrative over the pattern alerts (ai-pattern-narrative-spec.md).
  // Opt-in per vendor; the server route re-checks the flag + key. Cached per
  // pattern-set so re-reads don't re-call; it regenerates when the signals change.
  const aiInsights = vendor?.aiInsights === true;
  const patternsKey = useMemo(() => patterns.map((p) => `${p.id}:${p.severity}`).join("|"), [patterns]);
  const [insight, setInsight] = useState(null);
  const [insightFor, setInsightFor] = useState(null);
  const [insightBusy, setInsightBusy] = useState(false);
  const insightShown = insight && insightFor === patternsKey;
  async function runInsight() {
    if (insightBusy || !patterns.length) return;
    setInsightBusy(true);
    try {
      const { narrative } = await apiPatternNarrative({
        patterns, openVariances: a.openVariances, openDisputes: a.openDisputes, unverified: a.unverified,
      });
      if (narrative) { setInsight(narrative); setInsightFor(patternsKey); }
      else onToast?.(t("dash.ai_none"));
    } catch (err) { console.error(err); onToast?.(t("dash.ai_failed")); }
    finally { setInsightBusy(false); }
  }

  // Theft & loss report: pick a range, print every theft signal with its
  // signers — flagged cash/backroom counts, scratch gaps, rewards alerts.
  const [theftOpen, setTheftOpen] = useState(false);
  const [theftBusy, setTheftBusy] = useState(false);
  const [theftErr, setTheftErr] = useState("");
  const [theftRange, setTheftRange] = useState(() => ({
    from: new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  }));
  async function runTheftReport() {
    setTheftBusy(true); setTheftErr("");
    try {
      const [rangedRaw, rangedEvents] = await Promise.all([
        fetchEntriesInRange(vendor.id, theftRange.from, theftRange.to, null),
        fetchRewardEventsInRange(vendor.id, theftRange.from, theftRange.to),
      ]);
      // Keep a disabled module out of the theft report too.
      const rangedEntries = rangedRaw.filter((e) => featureEnabled(vendor, e.kind));
      const r = buildTheftReport(rangedEntries, rangedEvents, {
        from: theftRange.from, to: theftRange.to, rewardRules: vendor?.rewards,
      });
      const win = window.open("", "_blank");
      if (!win) { setTheftErr(t("scratch.report_popup")); setTheftBusy(false); return; }
      const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
      const sec = (title, bodyHtml, empty) =>
        `<h2>${esc(title)}</h2>${bodyHtml || `<p class="muted">${esc(empty)}</p>`}`;
      const cashRows = r.flaggedCash.length ? `<table><thead><tr><th>${esc(t("trpt.h_date"))}</th><th>${esc(t("common.location"))}</th><th>${esc(t("trpt.h_drawer"))}</th><th>${esc(t("trpt.h_by"))}</th><th class="num">${esc(t("trpt.h_expected"))}</th><th class="num">${esc(t("trpt.h_counted"))}</th><th class="num">${esc(t("trpt.h_overshort"))}</th></tr></thead><tbody>${
        r.flaggedCash.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.locationName)}</td><td>${esc(e.drawerName)}</td><td>${esc(e.by)}</td><td class="num">${esc(money(e.expected))}</td><td class="num">${esc(money(e.counted))}</td><td class="num${e.diff < 0 ? " gap" : ""}">${e.diff >= 0 ? "+" : ""}${esc(money(e.diff))}</td></tr>`).join("")
      }</tbody></table>` : "";
      const invRows = r.flaggedInventory.length ? `<table><thead><tr><th>${esc(t("trpt.h_date"))}</th><th>${esc(t("common.location"))}</th><th>${esc(t("trpt.h_item"))}</th><th>${esc(t("trpt.h_by"))}</th><th class="num">${esc(t("trpt.h_expected"))}</th><th class="num">${esc(t("trpt.h_counted"))}</th><th class="num">±</th></tr></thead><tbody>${
        r.flaggedInventory.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.locationName)}</td><td>${esc(e.itemName)}</td><td>${esc(e.by)}</td><td class="num">${esc(e.expected)}</td><td class="num">${esc(e.counted)}</td><td class="num${e.diff < 0 ? " gap" : ""}">${e.diff >= 0 ? "+" : ""}${esc(e.diff)}</td></tr>`).join("")
      }</tbody></table>` : "";
      const packRows = r.packGaps.length ? r.packGaps.map((row) => `<p><b>${esc(row.game)}</b> (…${esc(row.pack.slice(-6))}) — <span class="gap">${esc(t("trpt.pack_line", { n: row.gapTickets, d: money(row.gapDollars) }))}</span></p>${
        row.gaps.map((g) => `<p class="muted">· ${esc(g.selloutShort
          ? t("srpt.short_line", { game: row.game, pack: row.pack.slice(-6), end: g.prevEnd, n: g.nextStart, missing: g.missing, by: g.prevBy, date: g.prevDate || "" })
          : t("srpt.gap_line", { game: row.game, pack: row.pack.slice(-6), missing: g.missing, prevBy: g.prevBy, prevEnd: g.prevEnd, prevDate: g.prevDate || "", nextBy: g.nextBy, nextStart: g.nextStart, nextDate: g.nextDate || "" }))}</p>`).join("")
      }`).join("") : "";
      const rewardRows = r.rewardAlerts.length
        ? r.rewardAlerts.map((al) => `<p><b>${esc(al.title)}</b> — ${esc(al.detail)}</p>`).join("") : "";
      const accent = paletteAccent(vendor), ink = paletteInk(vendor);
      win.document.write(`<!doctype html><html><head><title>${esc(vendor.name)} — ${esc(t("trpt.title"))}</title>
      <style>body{font:12px Helvetica,Arial;margin:32px;color:#1a241c}h1{font-size:18px;margin:0}h2{font-size:14px;margin:22px 0 6px;border-bottom:2px solid ${ink};padding-bottom:2px}p{margin:3px 0}
      table{border-collapse:collapse;width:100%;margin-top:6px;font-size:11px}
      th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #ccc}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
      .gap{color:#b91c1c;font-weight:bold}.muted{color:#666;font-size:11px}
      .brand{display:flex;align-items:center;gap:8px}.mark{width:26px;height:26px;border-radius:5px;background:${accent};color:#fff;font-weight:bold;display:flex;align-items:center;justify-content:center;font-size:13px}</style>
      </head><body>
      ${printCloseHtml(t("common.close"))}
      <div class="brand"><div class="mark">D</div><div><h1>${esc(vendor.name)} — ${esc(t("trpt.title"))}</h1>
      <p class="muted">${esc(t("srpt.range", { from: theftRange.from, to: theftRange.to }))} · ${esc(t("srpt.generated", { date: new Date().toLocaleString(), name: profileName }))}</p></div></div>
      <p><b>${esc(t("trpt.summary", { flags: r.totals.flags, cash: money(r.cashShort), tickets: r.packGapTickets, dollars: money(r.packGapDollars), ralerts: r.totals.rewardAlerts }))}</b></p>
      ${sec(t("trpt.s_cash"), cashRows, t("trpt.none"))}
      ${sec(t("trpt.s_inv"), invRows, t("trpt.none"))}
      ${sec(t("trpt.s_pack"), packRows, t("trpt.none"))}
      ${sec(t("trpt.s_rewards"), rewardRows, t("trpt.none"))}
      <p class="muted">${esc(t("trpt.foot"))}</p>
      </body></html>`);
      win.document.close(); win.focus();
      setTimeout(() => { try { win.print(); } catch { /* manual print */ } }, 250);
      setTheftOpen(false);
    } catch (err) {
      console.error(err);
      setTheftErr(t("admin.engage_range_err"));
    }
    setTheftBusy(false);
  }

  // One row: the location picker (when the shell passes it) beside the
  // Reports button, instead of stacking on two rows.
  const reportButton = (isManager || locPicker) && (
    <div className="flex items-center justify-end gap-3 flex-wrap">
      {locPicker && <div className="flex-1 min-w-0">{locPicker}</div>}
      {isManager && (
        <button className="btn-ghost min-h-[44px] px-4 text-sm font-semibold gap-2 flex-shrink-0" onClick={() => { setTheftErr(""); setTheftOpen(true); }}>
          <span aria-hidden="true">🚨</span> {t("dash.theft_btn")}
        </button>
      )}
      {isManager && (
        <button className="btn-ghost min-h-[44px] px-4 text-sm font-semibold gap-2 flex-shrink-0" onClick={() => setReportOpen(true)}>
          <span aria-hidden="true">📄</span> {t("dash.reports_export")}
        </button>
      )}
      {onOpenScratchReport && (
        <button className="btn-ghost min-h-[44px] px-4 text-sm font-semibold gap-2 flex-shrink-0" onClick={onOpenScratchReport}>
          <span aria-hidden="true">🎟️</span> {t("dash.scratch_report_btn")}
        </button>
      )}
    </div>
  );
  const reportModal = reportOpen && (
    <ReportModal locations={locations} locName={locName} incidents={incidents} collections={collections}
      onClose={() => setReportOpen(false)} onToast={onToast} />
  );
  const theftPanelRef = useModalA11y(() => setTheftOpen(false), theftOpen);
  const theftModal = theftOpen && (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setTheftOpen(false)}>
      <div ref={theftPanelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("trpt.title")}
        className="bg-surface rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <h2 className="font-semibold text-[15px]">{t("trpt.title")}</h2>
          <button className="btn-ghost text-[13px] px-2.5 py-1" onClick={() => setTheftOpen(false)} aria-label={t("shell.close")}><span aria-hidden="true">✕</span></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("scratch.report_from")}</label>
              <input type="date" className="input" value={theftRange.from} max={theftRange.to}
                onChange={(e) => setTheftRange((p) => ({ ...p, from: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t("scratch.report_to")}</label>
              <input type="date" className="input" value={theftRange.to} min={theftRange.from}
                onChange={(e) => setTheftRange((p) => ({ ...p, to: e.target.value }))} />
            </div>
          </div>
          <p className="text-xs text-muted leading-relaxed">{t("trpt.hint")}</p>
          {theftErr && <p role="alert" className="text-[13px] text-neg">{theftErr}</p>}
          <button className="btn-primary" disabled={theftBusy || !theftRange.from || !theftRange.to || theftRange.from > theftRange.to} onClick={runTheftReport}>
            🚨 {theftBusy ? t("scratch.report_busy") : t("scratch.report_print")}
          </button>
        </div>
      </div>
    </div>
  );

  // `own`, not `entries`: a clerk whose store is busy but who hasn't counted yet
  // should get the "record your first count" nudge, not a wall of zeros.
  if (!own.length) {
    return (
      <div className="space-y-4">
        {reportButton}
        <div className="card">
          <EmptyState icon={<IconChart />} title={t("dash.empty_title")}
            subtitle={t("dash.empty_sub")}
            action={onRecord ? { label: t("dash.record_count"), onClick: onRecord } : undefined} />
        </div>
        {reportModal}
        {theftModal}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Say whose numbers these are, so a clerk doesn't read their own tally as
          the store's (or wonder where the rest of the store went). */}
      {!teamView && <p className="text-[12px] text-muted">{t("dash.scope_own")}</p>}
      {reportButton}
      {reportModal}
      {theftModal}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t("dash.stat_total")} value={a.count} />
        <Stat label={t("dash.stat_net")} value={`${a.netDiff >= 0 ? "+" : ""}${money(a.netDiff)}`} tone={a.netDiff < -0.005 ? "neg" : a.netDiff > 0.005 ? "pos" : null} />
        <Stat label={t("dash.stat_shorts")} value={a.shorts} tone={a.shorts ? "neg" : null} />
        <Stat label={t("dash.stat_verified")} value={`${a.verifyRate}%`} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("dash.stat_open_var")} value={a.openVariances} tone={a.openVariances ? "neg" : null} />
        <Stat label={t("dash.stat_open_disp")} value={a.openDisputes} tone={a.openDisputes ? "neg" : null} />
        <Stat label={t("dash.stat_unverified")} value={a.unverified} tone={null} />
      </div>

      {/* Rewards at a glance — issued/redeemed over the alert window, and the
          outstanding liability at the store's own settings (what the points
          would cost if every one were redeemed today). */}
      {isManager && rewardsOn && (customers.length > 0 || rewardAudit.totals.earns > 0) && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t("dash.rw_earned", { days: resolvePatternRules(vendor?.patternRules).windowDays })} value={rewardAudit.totals.earned} />
          <Stat label={t("dash.rw_redeemed", { days: resolvePatternRules(vendor?.patternRules).windowDays })} value={rewardAudit.totals.redeemed} />
          <Stat label={t("dash.rw_liability")} value={`${liability.points} ≈ ${money(liability.dollars)}`} />
        </div>
      )}

      {isManager && patterns.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-[15px]">{t("dash.patterns_title")}</h3>
              <p className="text-[12px] text-muted mt-0.5">{t("dash.patterns_sub")}</p>
            </div>
            {aiInsights && (
              <button className="btn-ghost text-[13px] px-3 py-1.5 whitespace-nowrap" disabled={insightBusy} onClick={runInsight}>
                {insightBusy ? t("dash.ai_thinking") : insightShown ? t("dash.ai_refresh") : t("dash.ai_explain")}
              </button>
            )}
          </div>
          {aiInsights && insightShown && (
            <div className="px-4 py-3 border-b border-line bg-highlight">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{t("dash.ai_summary_label")}</div>
              {insight.summary && <p className="text-sm leading-relaxed">{insight.summary}</p>}
              {insight.watch?.length > 0 && (
                <>
                  <p className="text-[12px] text-muted mt-2 mb-1">{t("dash.ai_watch")}</p>
                  <ul className="list-disc pl-5 text-[13px] space-y-0.5">
                    {insight.watch.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}
          {patterns.map((p) => {
            const { title, detail } = renderPattern(p, lang);
            return (
              <div key={p.id} className="px-4 py-2.5 border-b border-line last:border-0 flex items-start gap-3">
                <span className={`pill flex-shrink-0 mt-0.5 ${p.severity === "high" ? "bg-red-100 text-red-700" : "bg-highlight text-gold border border-brass/30"}`}>
                  {p.severity === "high" ? t("dash.pill_high") : t("dash.pill_watch")}
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-sm">{title}</div>
                  <div className="text-[12px] text-muted">{detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* Stock attention — the synced catalog's two actionable lists: items
          expiring inside the owner's window, and items below the reorder
          threshold. Only data the store maintains ever alerts. */}
      {isManager && featureEnabled(vendor, "inventory") && (stock.expiring.length > 0 || stock.lowStock.length > 0) && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line">
            <h3 className="font-semibold text-[15px]">{t("dash.stock_title")}</h3>
            <p className="text-[12px] text-muted mt-0.5">{t("dash.stock_sub", { days: stock.rules.expiryDays, units: stock.rules.lowStockUnits })}</p>
          </div>
          {stock.expiring.length > 0 && (
            <div className="px-4 py-3 border-b border-line last:border-0">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{t("dash.stock_expiring")}</div>
              {stock.expiring.slice(0, 8).map(({ item, daysLeft }) => (
                <div key={item.id} className="flex items-baseline justify-between gap-3 py-0.5">
                  <div className="text-sm font-medium truncate">
                    {item.name}
                    {item.locationId && locations.length > 1 && <span className="text-muted font-normal text-[12px]"> · {locName(item.locationId)}</span>}
                  </div>
                  <div className={`text-[12px] flex-shrink-0 ${daysLeft < 0 ? "text-neg font-semibold" : "text-muted"}`}>
                    {daysLeft < 0
                      ? t("dash.stock_expired", { date: item.expiresAt })
                      : t(`dash.stock_days_${daysLeft === 1 ? "one" : "other"}`, { n: daysLeft, date: item.expiresAt })}
                  </div>
                </div>
              ))}
              {stock.expiring.length > 8 && (
                <div className="text-[12px] text-muted mt-1">{t("dash.stock_more", { n: stock.expiring.length - 8 })}</div>
              )}
            </div>
          )}
          {stock.lowStock.length > 0 && (
            <div className="px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{t("dash.stock_low")}</div>
              {stock.lowStock.slice(0, 8).map(({ item, quantity }) => (
                <div key={item.id} className="flex items-baseline justify-between gap-3 py-0.5">
                  <div className="text-sm font-medium truncate">
                    {item.name}
                    {item.locationId && locations.length > 1 && <span className="text-muted font-normal text-[12px]"> · {locName(item.locationId)}</span>}
                  </div>
                  <div className={`text-[12px] flex-shrink-0 font-mono ${quantity === 0 ? "text-neg font-semibold" : "text-muted"}`}>
                    {t(`dash.stock_left_${quantity === 1 ? "one" : "other"}`, { n: quantity, unit: `${item.unit || "unit"}${quantity === 1 ? "" : "s"}` })}
                  </div>
                </div>
              ))}
              {stock.lowStock.length > 8 && (
                <div className="text-[12px] text-muted mt-1">{t("dash.stock_more", { n: stock.lowStock.length - 8 })}</div>
              )}
            </div>
          )}
        </div>
      )}

      {a.attention.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line flex items-center justify-between">
            <h3 className="font-semibold text-[15px]">{t("dash.attention_title")}</h3>
            {onOpenLog && <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={onOpenLog}>{t("dash.open_log")}</button>}
          </div>
          {a.attention.map(({ e, why, status }) => {
            const ts = toDate(e.ts);
            const label = e.kind === "cash" ? (e.drawerName || t("log.drawer_fallback")) : e.kind === "inventory" ? (e.itemName || t("log.item_fallback")) : e.game;
            const isUnver = why === "unverified";
            const whyText = isUnver ? t("dash.why_unverified")
              : why === "variance" ? t("dash.why_variance", { status: t(`vstatus.${status}`) })
              : t("dash.why_dispute", { status: t(`vstatus.${status}`) });
            return (
              <div key={e.id} className="px-4 py-2.5 border-b border-line last:border-0 flex items-start gap-3 cursor-pointer hover:bg-panel"
                onClick={onOpenLog}>
                <span className={`pill flex-shrink-0 mt-0.5 ${isUnver ? "bg-subtle text-muted" : "bg-red-100 text-red-700"}`}>{whyText}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{label}</div>
                  <div className="text-[12px] text-muted font-mono truncate">{e.by} · {ts ? ts.toLocaleDateString(lang) : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cashOn && <Stat label={t("dash.stat_cash_sales")} value={money(a.cashSales)} />}
        {cashOn && <Stat label={t("dash.stat_overs")} value={a.overs} tone={a.overs ? "pos" : null} />}
        <Stat label={t("dash.stat_staff")} value={a.empRows.length} />
      </div>
      {inventoryOn && a.invCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label={t("dash.stat_inv_counts")} value={a.invCount} />
          <Stat label={t("dash.stat_missing_units")} value={a.missingUnits} tone={a.missingUnits ? "neg" : null} />
        </div>
      )}

      {cashOn && (
      <div className="card p-4">
        <h3 className="font-semibold text-[15px] mb-3">{t("dash.chart_daily")}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={a.dayRows}>
            <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
            <YAxis tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
            <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
            <Bar dataKey="diff" radius={[4, 4, 0, 0]}>
              {a.dayRows.map((r, i) => <Cell key={i} fill={r.diff < 0 ? "#b03a3a" : "#2f7d5b"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}

      {cashOn && (
      <div className="card p-4">
        <h3 className="font-semibold text-[15px] mb-3">{t("dash.chart_cash_trend")}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={a.dayRows}>
            <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
            <YAxis tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
            <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
            <Line type="monotone" dataKey="sales" stroke={ch.bar} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}

      {cashOn && (
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">{t("dash.by_drawer")}</h3></div>
        <div className="overflow-auto max-h-[26rem]">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
              <th className="px-4 py-2 font-semibold">{t("dash.col_drawer")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_entries")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_net")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_cash_counted")}</th>
            </tr></thead>
            <tbody>
              {a.drawerRows.map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < -0.005 ? "text-neg" : r.diff > 0.005 ? "text-pos" : ""}`}>{r.diff >= 0 ? "+" : ""}{money(r.diff)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{money(r.cash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {inventoryOn && a.itemRows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">{t("dash.by_item")}</h3></div>
          <div className="overflow-auto max-h-[26rem]">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
                <th className="px-4 py-2 font-semibold">{t("dash.col_item")}</th>
                <th className="px-4 py-2 font-semibold text-right">{t("dash.col_counts")}</th>
                <th className="px-4 py-2 font-semibold text-right">{t("dash.col_net_units")}</th>
                <th className="px-4 py-2 font-semibold text-right">{t("dash.col_short_counts")}</th>
              </tr></thead>
              <tbody>
                {a.itemRows.map((r) => (
                  <tr key={r.name} className="border-t border-line">
                    <td className="px-4 py-2.5 font-medium">{r.name} <span className="text-muted text-xs">({r.unit}s)</span></td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < 0 ? "text-neg" : r.diff > 0 ? "text-pos" : ""}`}>{r.diff >= 0 ? "+" : ""}{r.diff}</td>
                    <td className={`px-4 py-2.5 text-right font-mono ${r.missing ? "text-neg" : ""}`}>{r.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Staff-vs-staff comparison is a manager view by definition; scoped to a
          clerk it is one row of their own name, which teaches nothing. */}
      {teamView && (
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">{t("dash.by_employee")}</h3></div>
        <div className="overflow-auto max-h-[26rem]">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
              <th className="px-4 py-2 font-semibold">{t("dash.col_name")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_entries")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_net")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_shorts")}</th>
            </tr></thead>
            <tbody>
              {a.empRows.map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < -0.005 ? "text-neg" : r.diff > 0.005 ? "text-pos" : ""}`}>{r.diff >= 0 ? "+" : ""}{money(r.diff)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${r.shorts ? "text-neg" : ""}`}>{r.shorts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
