"use client";
import { useMemo, useState, useId } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { apiStockMove } from "@/lib/data";
import { money } from "@/lib/utils";
import { searchTerms, matchesTerms } from "@/lib/text-match";
import { buildStockAlerts } from "@/lib/stock-alerts";
import { buildStockFlow, flowShare } from "@/lib/stock-flow";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import { useTheme } from "./ThemeProvider";
import TabIcon from "./TabIcon";
import BarcodeScanner from "./BarcodeScanner";

// Live backroom stock — the "pulled a Geekbar to the front" screen. Every
// member sees the location's live list (search, filters, expiry/low badges)
// and moves stock with one tap: − pull / + restock. The tap goes through the
// trusted /api/stock-move route, which updates the item's quantity and writes
// a SIGNED movement line in one transaction — instant on every device via the
// items subscription, append-only in the history below. Crossing the owner's
// low-stock bar (< N units) or expiry window (≤ N days) lights the row, the
// Backroom tab badge (managers), the Dashboard Stock attention card, and the
// digest — the existing alert spine, now fed by live pulls.
//
// Flow analysis (managers): the last 30 days of movements as a top-movers bar
// (magnitude → ONE hue) and a share-of-outflow donut (identity → fixed-order
// categorical palette, top 5 + Other). Palettes validated for both themes
// (CVD-safe); the legend carries names + units so identity never rides on
// color alone.

const HISTORY_CAP = 40;
const BAR_CAP = 8;

// Validated categorical palettes (dataviz six checks, light on #fff / dark on
// #19211a). Fixed order — a 6th product folds into "Other", never a new hue.
const CAT = {
  light: ["#298050", "#3873c0", "#b07822", "#8961c9", "#c05577"],
  dark: ["#2f9e63", "#4487d9", "#bd8428", "#9668dd", "#d9547a"],
};
const OTHER = { light: "#7c857e", dark: "#98a29a" };
const CHART = {
  light: { axis: "#7f8b80", grid: "#e1e9dc", tipBg: "#ffffff", tipBorder: "#d4ded0", tipText: "#1a241c", surface: "#ffffff" },
  dark: { axis: "#6e7d70", grid: "#29322a", tipBg: "#19211a", tipBorder: "#324034", tipText: "#e8eee9", surface: "#19211a" },
};

export default function BackroomStock({ onToast, items = [], locations = [], moves = [], locName }) {
  const { profile, vendor, isManager } = useSession();
  const { t } = useLang();
  const { theme } = useTheme();
  const ch = CHART[theme] || CHART.light;
  const cat = CAT[theme] || CAT.light;
  const other = OTHER[theme] || OTHER.light;
  const searchId = useId();

  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;
  const [locationId, setLocationId] = useState(lockedLoc || locations[0]?.id || "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | low | exp
  const [scanOpen, setScanOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [histOpen, setHistOpen] = useState(false);
  const [focusId, setFocusId] = useState("");

  const locItems = useMemo(
    () => items.filter((i) => i.active !== false && i.locationId === locationId),
    [items, locationId]
  );

  // The owner's alert thresholds, applied to the live list — badge sets.
  const alerts = useMemo(
    () => buildStockAlerts(locItems, { rules: vendor?.stockAlerts }),
    [locItems, vendor?.stockAlerts]
  );
  const lowIds = useMemo(() => new Set(alerts.lowStock.map((a) => a.item.id)), [alerts]);
  const expById = useMemo(() => new Map(alerts.expiring.map((a) => [a.item.id, a.daysLeft])), [alerts]);

  const terms = useMemo(() => searchTerms(query), [query]);
  const rows = useMemo(() => {
    let list = locItems;
    if (filter === "low") list = list.filter((i) => lowIds.has(i.id));
    if (filter === "exp") list = list.filter((i) => expById.has(i.id));
    if (terms.length) list = list.filter((i) => matchesTerms(`${i.name} ${i.category || ""} ${i.barcode || ""}`, terms));
    // Attention first (emptiest / most-expired at the top), then A→Z.
    return [...list].sort((a, b) => {
      const aa = (lowIds.has(a.id) || expById.has(a.id)) ? 0 : 1;
      const bb = (lowIds.has(b.id) || expById.has(b.id)) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return String(a.name).localeCompare(String(b.name));
    });
  }, [locItems, filter, terms, lowIds, expById]);

  const qtyOf = (i) => (Number.isFinite(Number(i.quantity)) ? Number(i.quantity) : null);

  async function move(item, delta) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const r = await apiStockMove({ itemId: item.id, delta });
      const low = r.quantity < alerts.rules.lowStockUnits;
      // Undo = a NEW compensating signed move (the ledger stays append-only;
      // both the mistake and the correction are permanent lines).
      const undo = {
        fn: async () => {
          const u = await apiStockMove({ itemId: item.id, delta: -r.applied, note: "undo" });
          onToast?.(t("br.toast_undone", { name: item.name, q: u.quantity }));
        },
      };
      onToast?.(low && delta < 0
        ? t("br.toast_low", { name: item.name, n: r.quantity })
        : t(delta < 0 ? "br.toast_pulled" : "br.toast_restocked", { name: item.name, n: Math.abs(r.applied), q: r.quantity }), undo);
    } catch (e) {
      onToast?.(e?.code === "stock_empty" ? t("br.err_empty", { name: item.name }) : (e?.message || t("br.err_move")));
    }
    setBusyId("");
  }

  // Scan a product barcode → jump straight to its row (highlighted), ready
  // for the − / + tap. Unknown barcode → say so, nothing changes.
  function onScanned(code) {
    setScanOpen(false);
    const hit = locItems.find((i) => i.barcode && String(i.barcode) === String(code).trim());
    if (!hit) { onToast?.(t("toast.barcode_no_match")); return; }
    setQuery(hit.name);
    setFilter("all");
    setFocusId(hit.id);
    onToast?.(t("br.toast_found", { name: hit.name }));
  }

  // Movement history (this location, newest first) — the on-page audit log.
  const history = useMemo(
    () => moves.filter((m) => m.locationId === locationId).slice(0, HISTORY_CAP),
    [moves, locationId]
  );

  // 30-day flow (managers): top movers + share of outflow.
  const flow = useMemo(
    () => buildStockFlow(moves, { days: 30, locationId }),
    [moves, locationId]
  );
  const barData = flow.rows.slice(0, BAR_CAP).map((r) => ({ name: r.name, out: r.out }));
  const pieData = flowShare(flow.rows, 5).map((s, i) => ({
    ...s, label: s.other ? t("br.flow_other") : s.name, fill: s.other ? other : cat[i],
  }));
  const pieTotal = pieData.reduce((s, p) => s + p.value, 0);

  const tsOf = (m) => (m.ts?.toDate ? m.ts.toDate() : (m.ts ? new Date(m.ts) : null));

  const chip = (id, label, count) => (
    <button key={id} type="button" onClick={() => setFilter(id)}
      className={`flex-shrink-0 whitespace-nowrap text-[12px] font-semibold px-3 py-1.5 rounded-full border transition ${filter === id ? "border-brass text-fg bg-brass/10" : "border-line bg-subtle text-muted hover:text-fg"}`}>
      {label}{count > 0 ? ` · ${count}` : ""}
    </button>
  );

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px] flex items-center gap-2"><TabIcon id="inventory" size={18} className="text-gold" /> {t("br.title")}</h2>
        <p className="text-[13px] text-muted mt-0.5">{t("br.sub", { low: alerts.rules.lowStockUnits, exp: alerts.rules.expiryDays })}</p>
      </div>

      <div className="p-4 space-y-3.5">
        {!lockedLoc && locations.length > 1 && (
          <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label={t("common.location")}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}

        {/* Search + scan on one row */}
        <div>
          <label htmlFor={searchId} className="label">{t("br.search_label")}</label>
          <div className="flex gap-2">
            <input id={searchId} className="input min-w-0" value={query} placeholder={t("br.search_ph")}
              onChange={(e) => { setQuery(e.target.value); setFocusId(""); }} />
            <button type="button" className="btn-ghost min-h-[44px] w-11 px-0 flex-shrink-0 text-lg"
              title={t("br.scan")} aria-label={t("br.scan")} onClick={() => setScanOpen(true)}>📷</button>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto">
          {chip("all", t("br.f_all"), 0)}
          {chip("low", t("br.f_low"), alerts.lowStock.length)}
          {chip("exp", t("br.f_exp"), alerts.expiring.length)}
        </div>

        {/* ---- the live list ---- */}
        {locItems.length === 0 ? (
          <p className="text-[13px] text-muted leading-relaxed">{t("br.empty")}</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-muted">{t("br.no_match")}</p>
        ) : (
          <div className="border border-line rounded-xl overflow-hidden divide-y divide-line-soft">
            {rows.map((i) => {
              const qty = qtyOf(i);
              const low = lowIds.has(i.id);
              const expDays = expById.get(i.id);
              const busy = busyId === i.id;
              return (
                <div key={i.id} className={`px-3 py-2.5 flex items-center gap-2.5 transition ${focusId === i.id ? "bg-brass/10" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{i.name}</div>
                    <div className="text-[11px] text-muted truncate">
                      {[i.category, Number(i.price) > 0 ? money(Number(i.price)) : ""].filter(Boolean).join(" · ")}
                    </div>
                    <div className="flex gap-1.5 mt-0.5">
                      {low && <span className="text-[9px] uppercase tracking-wide font-bold text-neg border border-neg/50 rounded px-1 py-px">{t("br.badge_low")}</span>}
                      {expDays !== undefined && (
                        <span className="text-[9px] uppercase tracking-wide font-bold text-neg border border-neg/50 rounded px-1 py-px">
                          {expDays < 0 ? t("br.badge_expired") : t("br.badge_exp", { n: expDays })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`w-10 text-right font-mono font-bold text-[15px] flex-shrink-0 ${low ? "text-neg" : ""}`}>
                    {qty ?? "—"}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button type="button" className="btn-ghost w-11 min-h-[40px] px-0 text-lg font-bold" disabled={busy || qty === null || qty <= 0}
                      onClick={() => move(i, -1)} aria-label={t("br.pull_aria", { name: i.name })}>−</button>
                    <button type="button" className="btn-ghost w-11 min-h-[40px] px-0 text-lg font-bold" disabled={busy}
                      onClick={() => move(i, +1)} aria-label={t("br.restock_aria", { name: i.name })}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted leading-relaxed">{t("br.helper")}</p>

        {/* ---- movement history: the on-page audit log ---- */}
        <div className="border border-line rounded-xl overflow-hidden">
          <button type="button" onClick={() => setHistOpen((v) => !v)} aria-expanded={histOpen}
            className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-[13px] font-semibold hover:bg-subtle transition">
            <span>{t("br.hist_title", { n: history.length })}</span>
            <span aria-hidden="true" className={`text-muted transition-transform ${histOpen ? "rotate-180" : ""}`}>⌄</span>
          </button>
          {histOpen && (
            history.length === 0 ? (
              <p className="px-3.5 py-3 text-[12px] text-muted border-t border-line">{t("br.hist_empty")}</p>
            ) : (
              <div className="divide-y divide-line-soft border-t border-line">
                {history.map((m) => {
                  const d = tsOf(m);
                  const out = Number(m.delta) < 0;
                  return (
                    <div key={m.id} className="px-3 py-2 flex items-center gap-3 text-[12px]">
                      <div className="flex-shrink-0 w-[4.4rem] text-right text-[11px] text-muted font-mono leading-snug">
                        <div>{d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</div>
                        <div>{d ? d.toLocaleDateString() : ""}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block font-medium truncate text-[13px]">{m.itemName}</span>
                        <span className="block text-[11px] text-muted">{t("br.hist_by", { name: m.by || "—" })}</span>
                      </div>
                      <div className={`flex-shrink-0 font-mono font-bold ${out ? "text-neg" : "text-pos"}`}>
                        {out ? m.delta : `+${m.delta}`} <span className="text-muted font-normal">→ {m.newQty}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* ---- 30-day flow analysis (managers) ---- */}
        {isManager && flow.totals.moves > 0 && (
          <div className="space-y-3.5">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("br.flow_title")}</div>

            {barData.length > 0 && (
              <div className="border border-line rounded-xl p-3.5 bg-panel">
                <div className="text-[13px] font-semibold mb-0.5">{t("br.flow_bar_title")}</div>
                <p className="text-[11px] text-muted mb-2">{t("br.flow_bar_sub")}</p>
                <div style={{ height: Math.max(120, barData.length * 34) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                      <XAxis type="number" allowDecimals={false} stroke={ch.axis} tick={{ fontSize: 10, fill: ch.axis }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={110} stroke={ch.axis}
                        tick={{ fontSize: 11, fill: ch.tipText }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: ch.grid, opacity: 0.4 }}
                        contentStyle={{ background: ch.tipBg, border: `1px solid ${ch.tipBorder}`, borderRadius: 10, color: ch.tipText, fontSize: 12 }}
                        formatter={(v) => [t("br.flow_units", { n: v }), null]} />
                      <Bar dataKey="out" fill={cat[0]} radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {pieData.length > 1 && (
              <div className="border border-line rounded-xl p-3.5 bg-panel">
                <div className="text-[13px] font-semibold mb-0.5">{t("br.flow_pie_title")}</div>
                <p className="text-[11px] text-muted mb-2">{t("br.flow_pie_sub")}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-40 h-40 flex-shrink-0 mx-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="95%"
                          stroke={ch.surface} strokeWidth={2} isAnimationActive={false}>
                          {pieData.map((p, i) => <Cell key={i} fill={p.fill} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: ch.tipBg, border: `1px solid ${ch.tipBorder}`, borderRadius: 10, color: ch.tipText, fontSize: 12 }}
                          formatter={(v, n) => [t("br.flow_units", { n: v }), n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legend carries identity in text — never color alone. */}
                  <ul className="flex-1 min-w-[10rem] space-y-1.5">
                    {pieData.map((p, i) => (
                      <li key={i} className="flex items-center gap-2 text-[12px]">
                        <span aria-hidden="true" className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
                        <span className="min-w-0 flex-1 truncate">{p.label}</span>
                        <span className="font-mono font-semibold flex-shrink-0">
                          {p.value} <span className="text-muted font-normal">({pieTotal ? Math.round((p.value / pieTotal) * 100) : 0}%)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted leading-relaxed">{t("br.flow_hint")}</p>
          </div>
        )}
      </div>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        title={t("br.scan")} hint={t("br.scan_hint")} onDetected={onScanned} />
    </div>
  );
}
