"use client";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from "recharts";
import { money, toDate, isUnresolved } from "@/lib/utils";
import { detectPatterns, resolvePatternRules } from "@/lib/patterns";
import { buildRewardAudit, outstandingLiability } from "@/lib/reward-audit";
import { renderPattern } from "@/lib/pattern-format";
import { buildPackAudit } from "@/lib/scratch-audit";
import { buildStockAlerts } from "@/lib/stock-alerts";
import { apiPatternNarrative } from "@/lib/data";
import { useSession } from "./SessionProvider";
import { useTheme } from "./ThemeProvider";
import { useLang } from "./LangProvider";
import ReportModal from "./ReportModal";
import EmptyState, { IconChart } from "./EmptyState";

// Recharts paints SVG with literal color strings (CSS vars aren't reliable on
// SVG presentation attributes), so the chart palette is resolved from the
// active theme in JS rather than through Tailwind tokens.
const CHART = {
  light: { grid: "#e6e2d8", axis: "#8a8780", tipBg: "#ffffff", tipBorder: "#dcd8cc", tipText: "#1a1c2e", bar: "#1a1c2e" },
  dark: { grid: "#2b2d37", axis: "#6b6d78", tipBg: "#1d1f28", tipBorder: "#343643", tipText: "#e9e8ee", bar: "#c9a34f" },
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

export default function Dashboard({ entries, locations = [], locName = () => "—", incidents = [], items = [], rewardEvents = [], customers = [], onOpenLog, onRecord, onToast, locPicker = null }) {
  const { isManager, vendor } = useSession();
  const { theme } = useTheme();
  const { t, lang } = useLang();
  // en + es both pluralize the pack-audit prose on the 1-vs-not-1 boundary.
  const plur = (n) => (Number(n) === 1 ? "_one" : "_other");
  const ch = CHART[theme] || CHART.light;
  const tip = { borderRadius: 10, border: `1px solid ${ch.tipBorder}`, background: ch.tipBg, color: ch.tipText, fontSize: 13 };
  const [reportOpen, setReportOpen] = useState(false);
  // Recurring signals (repeat shorts, drawer hot-spots, backlog, shrink
  // streaks) — manager-facing only, so employees never see them computed.
  const basePatterns = useMemo(
    () => (isManager ? detectPatterns(entries, { rules: vendor?.patternRules }) : []),
    [entries, isManager, vendor?.patternRules]);
  // Rewards audit (rewards-program-spec.md Phase 2): the ledger reconciled
  // against the countersigned cash sales, plus per-day skim/burst detectors.
  // Its alerts are pattern-shaped and merge into the same Patterns card and
  // AI-insight flow (clerk names ride the redactor's person list).
  const rewardsOn = vendor?.rewards?.enabled === true;
  const rewardAudit = useMemo(
    () => (isManager && rewardsOn
      ? buildRewardAudit(rewardEvents, entries, {
          rules: vendor?.rewards, customers,
          windowDays: resolvePatternRules(vendor?.patternRules).windowDays,
        })
      : { alerts: [], totals: { earned: 0, redeemed: 0, earns: 0, redemptions: 0 } }),
    [rewardEvents, entries, customers, isManager, rewardsOn, vendor?.rewards, vendor?.patternRules]);
  const patterns = useMemo(
    () => [...basePatterns, ...rewardAudit.alerts],
    [basePatterns, rewardAudit.alerts]);
  const liability = useMemo(
    () => outstandingLiability(customers, vendor?.rewards),
    [customers, vendor?.rewards]);
  // Pack audit: shift-boundary ticket #s checked against each other (gaps +
  // packs that stopped being counted). The pack-gap pattern above is the
  // signal; this card is the who/when detail behind it. Manager-only.
  const packAudit = useMemo(
    () => (isManager ? buildPackAudit(entries) : { gaps: [], missing: [], packsSeen: 0 }),
    [entries, isManager]);
  // Stock attention: expiring-soon + need-order lists from the items' synced
  // quantity/expiry fields (pos-inventory-sync-spec.md Phase 1). Manager-only,
  // thresholds owner-tuned in Admin → Stock alerts.
  const stock = useMemo(
    () => (isManager ? buildStockAlerts(items, { rules: vendor?.stockAlerts }) : { expiring: [], lowStock: [], rules: {} }),
    [items, isManager, vendor?.stockAlerts]);
  const a = useMemo(() => {
    const cash = entries.filter((e) => e.kind === "cash");
    const scratch = entries.filter((e) => e.kind === "scratch");
    const inv = entries.filter((e) => e.kind === "inventory");

    const netDiff = cash.reduce((s, e) => s + (e.diff || 0), 0);
    const shorts = cash.filter((e) => e.diff < -0.005).length;
    const overs = cash.filter((e) => e.diff > 0.005).length;
    const scratchDollars = scratch.reduce((s, e) => s + (e.dollars || 0), 0);
    const cashSales = cash.reduce((s, e) => s + (e.sales || 0), 0);
    const missingUnits = inv.reduce((s, e) => s + (e.diff < 0 ? -e.diff : 0), 0);

    // tier one: attention counters + top-10 needs-attention list. "Open" here
    // means unresolved (open OR under-review) — the same definition the digest
    // and period report use, so the surfaces can't disagree (M3).
    const openVariances = entries.filter((e) => isUnresolved(e.varianceStatus)).length;
    const openDisputes = entries.filter((e) => isUnresolved(e.disputeStatus)).length;
    const unverified = entries.filter((e) => !e.verifiedBy).length;
    const dayMs = 24 * 60 * 60 * 1000;
    // `why` is a stable code (variance | dispute | unverified) plus the raw
    // status; the pill text + style resolve from the code so localization can't
    // break the styling check (Phase 2c).
    const attention = entries
      .map((e) => {
        if (isUnresolved(e.varianceStatus)) return { e, why: "variance", status: e.varianceStatus };
        if (isUnresolved(e.disputeStatus)) return { e, why: "dispute", status: e.disputeStatus };
        if (!e.verifiedBy && toDate(e.ts) && Date.now() - toDate(e.ts).getTime() > dayMs) return { e, why: "unverified" };
        return null;
      })
      .filter(Boolean)
      .slice(0, 10);
    const verified = entries.filter((e) => e.verifiedBy).length;
    const verifyRate = entries.length ? Math.round((verified / entries.length) * 100) : 0;

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
    entries.forEach((e) => {
      byEmp[e.by] = byEmp[e.by] || { name: e.by, entries: 0, diff: 0, shorts: 0, scratch: 0 };
      byEmp[e.by].entries++;
      if (e.kind === "cash") { byEmp[e.by].diff += e.diff || 0; if (e.diff < -0.005) byEmp[e.by].shorts++; }
      if (e.kind === "scratch") byEmp[e.by].scratch += e.dollars || 0;
    });
    const empRows = Object.values(byEmp)
      .map((r) => ({ ...r, diff: Math.round(r.diff * 100) / 100, scratch: Math.round(r.scratch * 100) / 100 }))
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

    // by drawer (cash & scratch only — inventory has no drawer)
    const byDrawer = {};
    entries.forEach((e) => {
      if (e.kind === "inventory") return;
      const key = e.drawerName || "(no drawer)";
      byDrawer[key] = byDrawer[key] || { name: key, entries: 0, diff: 0, cash: 0, scratch: 0 };
      byDrawer[key].entries++;
      if (e.kind === "cash") { byDrawer[key].diff += e.diff || 0; byDrawer[key].cash += e.counted || 0; }
      if (e.kind === "scratch") byDrawer[key].scratch += e.dollars || 0;
    });
    const drawerRows = Object.values(byDrawer)
      .map((r) => ({ ...r, diff: Math.round(r.diff * 100) / 100, cash: Math.round(r.cash * 100) / 100, scratch: Math.round(r.scratch * 100) / 100 }))
      .sort((x, y) => y.entries - x.entries);

    // top scratch games
    const byGame = {};
    scratch.forEach((e) => { byGame[e.game] = (byGame[e.game] || 0) + (e.dollars || 0); });
    const gameRows = Object.entries(byGame).map(([name, v]) => ({ name, dollars: Math.round(v * 100) / 100 }))
      .sort((x, y) => y.dollars - x.dollars).slice(0, 6);

    return { count: entries.length, netDiff, shorts, overs, scratchDollars, cashSales, verifyRate, missingUnits, invCount: inv.length, openVariances, openDisputes, unverified, attention, dayRows, empRows, gameRows, drawerRows, itemRows };
  }, [entries]);

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

  // One row: the location picker (when the shell passes it) beside the
  // Reports button, instead of stacking on two rows.
  const reportButton = (isManager || locPicker) && (
    <div className="flex items-center justify-end gap-3">
      {locPicker && <div className="flex-1 min-w-0">{locPicker}</div>}
      {isManager && (
        <button className="btn-ghost min-h-[44px] px-4 text-sm font-semibold gap-2 flex-shrink-0" onClick={() => setReportOpen(true)}>
          <span aria-hidden="true">📄</span> {t("dash.reports_export")}
        </button>
      )}
    </div>
  );
  const reportModal = reportOpen && (
    <ReportModal locations={locations} locName={locName} incidents={incidents}
      onClose={() => setReportOpen(false)} onToast={onToast} />
  );

  if (!entries.length) {
    return (
      <div className="space-y-4">
        {reportButton}
        <div className="card">
          <EmptyState icon={<IconChart />} title={t("dash.empty_title")}
            subtitle={t("dash.empty_sub")}
            action={onRecord ? { label: t("dash.record_count"), onClick: onRecord } : undefined} />
        </div>
        {reportModal}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reportButton}
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

      {/* Pack audit — the who/when detail behind the pack-gap signal: every
          discontinuity between consecutive counts of a pack, and packs that
          stopped being counted. Settlement math is the lottery's job. */}
      {isManager && (packAudit.gaps.length > 0 || packAudit.missing.length > 0) && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line">
            <h3 className="font-semibold text-[15px]">{t("dash.pack_audit_title")}</h3>
            <p className="text-[12px] text-muted mt-0.5">{t("dash.pack_audit_sub", { days: 14 })}</p>
          </div>
          {packAudit.gaps.slice(0, 8).map((g) => (
            <div key={g.key} className="px-4 py-2.5 border-b border-line last:border-0 flex items-start gap-3">
              <span className={`pill flex-shrink-0 mt-0.5 ${g.totalMissing > 0 ? "bg-red-100 text-red-700" : "bg-subtle text-muted"}`}>
                {g.totalMissing > 0 ? t("dash.pack_pill_missing", { n: g.totalMissing }) : t("dash.pack_pill_recount")}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-sm">
                  {g.game} · #{g.pack}
                  {g.totalMissing > 0 && <span className="text-neg font-semibold"> · ≈{money(g.missingDollars)}</span>}
                  {g.locationName && <span className="text-muted font-normal"> · {g.locationName}</span>}
                </div>
                {g.events.map((ev, i) => {
                  const lead = ev.missing > 0
                    ? t(`dash.pack_event_unaccounted${plur(ev.missing)}`, { n: ev.missing })
                    : t("dash.pack_event_reopened", { n: -ev.missing });
                  const when = (ts) => ts
                    ? ` (${ts.toLocaleDateString(lang)} ${ts.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })})`
                    : "";
                  return (
                    <div key={i} className="text-[12px] text-muted">
                      {t("dash.pack_event_line", {
                        lead, prevEnd: ev.prevEnd, prevBy: ev.prevBy, prevWhen: when(ev.prevTs),
                        nextStart: ev.nextStart, nextBy: ev.nextBy, nextWhen: when(ev.nextTs),
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {packAudit.gaps.length > 8 && (
            <div className="px-4 py-2 text-[12px] text-muted border-b border-line">{t("dash.pack_more_gaps", { n: packAudit.gaps.length - 8 })}</div>
          )}
          {packAudit.missing.length > 0 && (
            <div className="px-4 py-3 bg-panel">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{t("dash.pack_missing_title")}</div>
              {packAudit.missing.slice(0, 8).map((m) => (
                <div key={m.key} className="text-[12px] text-muted">
                  {t(`dash.pack_missing_line${plur(m.missedDays)}`, {
                    game: m.game, pack: m.pack, lastDate: m.lastDate, lastBy: m.lastBy,
                    lastAt: m.lastEnd != null ? t("dash.pack_missing_at_ticket", { n: m.lastEnd }) : "",
                    n: m.missedDays,
                    loc: m.locationName ? t("dash.pack_at_location", { loc: m.locationName }) : "",
                  })}
                </div>
              ))}
              {packAudit.missing.length > 8 && (
                <div className="text-[12px] text-muted mt-1">{t("dash.pack_more", { n: packAudit.missing.length - 8 })}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stock attention — the synced catalog's two actionable lists: items
          expiring inside the owner's window, and items below the reorder
          threshold. Only data the store maintains ever alerts. */}
      {isManager && (stock.expiring.length > 0 || stock.lowStock.length > 0) && (
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
        <Stat label={t("dash.stat_cash_sales")} value={money(a.cashSales)} />
        <Stat label={t("dash.stat_scratch_sales")} value={money(a.scratchDollars)} />
        <Stat label={t("dash.stat_overs")} value={a.overs} tone={a.overs ? "pos" : null} />
        <Stat label={t("dash.stat_staff")} value={a.empRows.length} />
      </div>
      {a.invCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label={t("dash.stat_inv_counts")} value={a.invCount} />
          <Stat label={t("dash.stat_missing_units")} value={a.missingUnits} tone={a.missingUnits ? "neg" : null} />
        </div>
      )}

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

      <div className="card p-4">
        <h3 className="font-semibold text-[15px] mb-3">{t("dash.chart_cash_trend")}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={a.dayRows}>
            <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
            <YAxis tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
            <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
            <Line type="monotone" dataKey="sales" stroke="#b8863b" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {a.gameRows.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold text-[15px] mb-3">{t("dash.chart_top_games")}</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, a.gameRows.length * 42)}>
            <BarChart layout="vertical" data={a.gameRows} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ch.grid} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: ch.axis }} stroke={ch.axis} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: ch.axis }} stroke={ch.axis} />
              <Tooltip formatter={(v) => money(v)} contentStyle={tip} labelStyle={{ color: ch.tipText }} itemStyle={{ color: ch.tipText }} />
              <Bar dataKey="dollars" fill={ch.bar} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">{t("dash.by_drawer")}</h3></div>
        <div className="overflow-auto max-h-[26rem]">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
              <th className="px-4 py-2 font-semibold">{t("dash.col_drawer")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_entries")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_net")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_cash_counted")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_scratch")}</th>
            </tr></thead>
            <tbody>
              {a.drawerRows.map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < -0.005 ? "text-neg" : r.diff > 0.005 ? "text-pos" : ""}`}>{r.diff >= 0 ? "+" : ""}{money(r.diff)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{money(r.cash)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{money(r.scratch)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {a.itemRows.length > 0 && (
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

      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line"><h3 className="font-semibold text-[15px]">{t("dash.by_employee")}</h3></div>
        <div className="overflow-auto max-h-[26rem]">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted [&_th]:sticky [&_th]:top-0 [&_th]:bg-surface [&_th]:z-10 [&_th]:shadow-[inset_0_-1px_0_var(--line)]">
              <th className="px-4 py-2 font-semibold">{t("dash.col_name")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_entries")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_net")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_shorts")}</th>
              <th className="px-4 py-2 font-semibold text-right">{t("dash.col_scratch")}</th>
            </tr></thead>
            <tbody>
              {a.empRows.map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.entries}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.diff < -0.005 ? "text-neg" : r.diff > 0.005 ? "text-pos" : ""}`}>{r.diff >= 0 ? "+" : ""}{money(r.diff)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${r.shorts ? "text-neg" : ""}`}>{r.shorts}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{money(r.scratch)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
