"use client";
import { useEffect, useMemo, useState, useId } from "react";
import {
  watchStaff, apiCreateStaff, apiUpdateStaff,
  addLocation, updateLocation, addDrawer, updateDrawer,
  addItem, updateItem, updateVendorSettings, apiTestDigest, apiSeedDemo,
} from "@/lib/data";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import { PATTERN_RULES, resolvePatternRules } from "@/lib/patterns";
import { STOCK_ALERTS, resolveStockAlerts } from "@/lib/stock-alerts";
import { REWARDS, MAX_TIERS, MAX_VIP_TIERS, TIER_TYPES, resolveRewards, effectivePercent, maskPhone } from "@/lib/rewards";
import { money } from "@/lib/utils";
import { translate } from "@/lib/i18n";
import { PIN_LENGTH, isValidNewPin } from "@/lib/pin";
import Avatar from "./Avatar";
import BarcodeScanner from "./BarcodeScanner";
import ImportCard from "./ImportCard";
import Field from "./Field";

export default function AdminPanel({ onToast, locations, drawers, items = [], entries = [], customers = [], rewardEvents = [], scratchCatalog = null }) {
  const { profile, vendor, isOwner, setVendor } = useSession();
  const { t, lang } = useLang();
  const [staff, setStaff] = useState([]);
  const barcodeFieldId = useId();
  const sharingId = useId();
  const varianceId = useId();
  const invVarianceId = useId();
  const fiscalId = useId();

  useEffect(() => watchStaff(vendor.id, setStaff), [vendor.id]);

  /* ---- staff ---- */
  const [ns, setNs] = useState({ name: "", pin: "", role: "employee", locationId: "", email: "" });
  const [busy, setBusy] = useState(false);
  async function createStaff() {
    if (!ns.name.trim()) return onToast?.(t("admin.err_staff_name"));
    if (!isValidNewPin(ns.pin)) return onToast?.(t("admin.err_pin", { n: PIN_LENGTH }));
    setBusy(true);
    try {
      await apiCreateStaff({ ...ns, locationId: ns.locationId || locations.find((l) => l.active !== false)?.id });
      setNs({ name: "", pin: "", role: "employee", locationId: "", email: "" });
      onToast?.(t("admin.toast_staff_added"));
    } catch (e) { onToast?.(e.message); }
    setBusy(false);
  }
  async function patchStaff(userId, patch, okMsg) {
    try { await apiUpdateStaff({ userId, ...patch }); onToast?.(okMsg || t("admin.toast_updated")); }
    catch (e) { onToast?.(e.message); }
  }

  /* ---- locations ---- */
  const [newLoc, setNewLoc] = useState("");
  async function createLoc() {
    if (newLoc.trim().length < 2) return onToast?.(t("admin.err_loc_name"));
    try { await addLocation(vendor.id, newLoc); setNewLoc(""); onToast?.(t("admin.toast_loc_added")); }
    catch (e) { onToast?.(t("admin.err_managers_only")); }
  }

  /* ---- drawers ---- */
  const [nd, setNd] = useState({ name: "", locationId: "" });
  async function createDrawer() {
    const loc = nd.locationId || locations.find((l) => l.active !== false)?.id;
    if (nd.name.trim().length < 2) return onToast?.(t("admin.err_drawer_name"));
    if (!loc) return onToast?.(t("admin.err_add_loc_first"));
    try { await addDrawer(vendor.id, nd.name, loc); setNd({ name: "", locationId: "" }); onToast?.(t("admin.toast_drawer_added")); }
    catch (e) { onToast?.(t("admin.err_managers_only")); }
  }

  /* ---- inventory items ---- */
  const [ni, setNi] = useState({ name: "", category: "", unit: "unit", locationId: "", barcode: "" });
  const [scanOpen, setScanOpen] = useState(false);
  async function createItem() {
    const loc = ni.locationId || locations.find((l) => l.active !== false)?.id;
    if (ni.name.trim().length < 2) return onToast?.(t("admin.err_item_name"));
    if (!loc) return onToast?.(t("admin.err_add_loc_first"));
    try {
      await addItem(vendor.id, { ...ni, locationId: loc });
      setNi({ name: "", category: "", unit: "unit", locationId: "", barcode: "" });
      onToast?.(t("admin.toast_item_added"));
    } catch (e) { onToast?.(t("admin.err_managers_only")); }
  }
  async function editItem(it) {
    const name = prompt(t("admin.prompt_item_name"), it.name);
    if (name === null) return;
    const category = prompt(t("admin.prompt_item_cat"), it.category || "");
    if (category === null) return;
    const barcode = prompt(t("admin.prompt_item_barcode"), it.barcode || "");
    if (barcode === null) return;
    try {
      await updateItem(vendor.id, it.id, {
        name: name.trim() || it.name,
        category: category.trim() || null,
        barcode: barcode.trim() || null,
      });
      onToast?.(t("admin.toast_item_updated"));
    } catch (e) { onToast?.(t("admin.err_managers_only")); }
  }

  /* ---- settings ---- */
  const [settings, setSettings] = useState({
    name: vendor.name, logoUrl: vendor.logoUrl || "", sharingMode: vendor.sharingMode,
    blindCounts: vendor.blindCounts === true,
    varianceThreshold: vendor.varianceThreshold ?? 5,
    invVarianceThreshold: vendor.invVarianceThreshold ?? "",
    fiscalStartMonth: vendor.fiscalStartMonth ?? 1,
    aiSearch: vendor.aiSearch === true,
    aiInsights: vendor.aiInsights === true,
    digestEnabled: vendor.digest?.enabled === true,
    digestNarrative: vendor.digest?.narrative === true,
    digestRecipients: (vendor.digest?.recipients || []).join(", "),
    digestTz: vendor.digest?.tz || "America/New_York",
    patternRules: { ...PATTERN_RULES, ...(vendor.patternRules || {}) },
    stockAlerts: { ...STOCK_ALERTS, ...(vendor.stockAlerts || {}) },
    rewards: { ...REWARDS, ...(vendor.rewards || {}) },
  });
  const setRule = (k) => (e) =>
    setSettings((s) => ({ ...s, patternRules: { ...s.patternRules, [k]: e.target.value } }));
  const setStockRule = (k) => (e) =>
    setSettings((s) => ({ ...s, stockAlerts: { ...s.stockAlerts, [k]: e.target.value } }));
  const setReward = (k) => (e) =>
    setSettings((s) => ({ ...s, rewards: { ...s.rewards, [k]: k === "enabled" ? e.target.checked : e.target.value } }));
  // Named reward tiers (optional). Each has a stable id so the ledger can record
  // which reward was redeemed; blank leaves the single base reward in effect.
  const rewardTierRows = settings.rewards.tiers || [];
  const addTier = () =>
    setSettings((s) => {
      const tiers = s.rewards.tiers || [];
      if (tiers.length >= MAX_TIERS) return s;
      const id = (globalThis.crypto?.randomUUID?.() || `t${tiers.length}-${settings.name || "x"}`);
      return { ...s, rewards: { ...s.rewards, tiers: [...tiers, { id, name: "", points: "", value: "" }] } };
    });
  const patchTier = (i, patch) =>
    setSettings((s) => ({
      ...s,
      rewards: { ...s.rewards, tiers: (s.rewards.tiers || []).map((tt, j) => (j === i ? { ...tt, ...patch } : tt)) },
    }));
  const setTier = (i, k) => (e) => patchTier(i, { [k]: e.target.value });
  const removeTier = (i) =>
    setSettings((s) => ({ ...s, rewards: { ...s.rewards, tiers: (s.rewards.tiers || []).filter((_, j) => j !== i) } }));
  // VIP status tiers (lifetime-points milestones with an earn multiplier).
  const vipRows = settings.rewards.vip || [];
  const addVip = () =>
    setSettings((s) => {
      const vip = s.rewards.vip || [];
      if (vip.length >= MAX_VIP_TIERS) return s;
      const id = (globalThis.crypto?.randomUUID?.() || `v${vip.length}-${settings.name || "x"}`);
      return { ...s, rewards: { ...s.rewards, vip: [...vip, { id, name: "", threshold: "", multiplier: "" }] } };
    });
  const setVip = (i, k) => (e) =>
    setSettings((s) => ({
      ...s,
      rewards: { ...s.rewards, vip: (s.rewards.vip || []).map((v, j) => (j === i ? { ...v, [k]: e.target.value } : v)) },
    }));
  const removeVip = (i) =>
    setSettings((s) => ({ ...s, rewards: { ...s.rewards, vip: (s.rewards.vip || []).filter((_, j) => j !== i) } }));
  const [testing, setTesting] = useState(false);
  async function saveSettings() {
    // Parse + validate digest recipients (cap 10, basic format check).
    const recipients = settings.digestRecipients.split(/[\s,;]+/).filter(Boolean);
    if (recipients.length > 10) return onToast?.(t("admin.err_max_recipients"));
    if (recipients.some((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)))
      return onToast?.(t("admin.err_bad_emails"));
    const threshold = Number(settings.varianceThreshold);
    if (!(threshold >= 0)) return onToast?.(t("admin.err_variance_num"));
    // Inventory threshold is opt-in: blank turns inventory auto-flagging off.
    const invRaw = String(settings.invVarianceThreshold ?? "").trim();
    let invThreshold = null;
    if (invRaw !== "") {
      const n = Number(invRaw);
      if (!(n >= 0)) return onToast?.(t("admin.err_inv_variance_num"));
      invThreshold = n;
    }
    // Fiscal-year start month: 1–12 (1 = plain calendar year).
    const fiscalStartMonth = Number(settings.fiscalStartMonth);
    if (!Number.isInteger(fiscalStartMonth) || fiscalStartMonth < 1 || fiscalStartMonth > 12)
      return onToast?.(t("admin.err_fiscal_month"));
    const patch = {
      name: settings.name, logoUrl: settings.logoUrl.trim() || null,
      sharingMode: settings.sharingMode,
      blindCounts: settings.blindCounts,
      varianceThreshold: threshold,
      invVarianceThreshold: invThreshold,
      fiscalStartMonth,
      aiSearch: settings.aiSearch, // opt-in NL log search; off by default
      aiInsights: settings.aiInsights, // opt-in Dashboard AI insight; off by default
      patternRules: resolvePatternRules(settings.patternRules),
      stockAlerts: resolveStockAlerts(settings.stockAlerts),
      rewards: resolveRewards(settings.rewards),
      digest: {
        enabled: settings.digestEnabled, recipients, tz: settings.digestTz,
        narrative: settings.digestNarrative, // opt-in AI summary; off by default
        lastSentDate: vendor.digest?.lastSentDate ?? null, // preserved; cron owns it
      },
    };
    try {
      await updateVendorSettings(vendor.id, patch);
      setVendor({ ...vendor, ...patch });
      onToast?.(t("admin.toast_settings_saved"));
    } catch (e) { onToast?.(t("admin.err_owner_settings")); }
  }
  // A print-ready counter sign for the rewards program — deliberately
  // BILINGUAL (both catalog languages on one sheet, like a real c-store sign).
  // Values are esc()'d; the print window is the report-print pattern.
  function printRewardsSign() {
    const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const R = resolveRewards(settings.rewards);
    const url = `${window.location.origin}/rewards`;
    const vars = {
      earn: R.earnPerDollar, goal: R.redeemPoints,
      value: `$${R.redeemValue.toFixed(2)}`, url, slug: vendor.slug,
    };
    const block = (loc) => `
      <div style="margin-top:26px">
        <div style="font-size:30px;font-weight:800">${esc(translate(loc, "sign.join"))}</div>
        <div style="font-size:22px;margin-top:10px">${esc(translate(loc, "sign.line", vars))}</div>
        <div style="font-size:16px;color:#444;margin-top:10px">${esc(translate(loc, "sign.how"))}</div>
        <div style="font-size:14px;color:#444;margin-top:8px">${esc(translate(loc, "sign.check", vars))}</div>
      </div>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><title>${esc(vendor.name)} — rewards</title>
      <body style="font-family:Helvetica,Arial,sans-serif;color:#1a1c2e;text-align:center;padding:48px 32px">
        <div style="font-size:38px;font-weight:800">${esc(vendor.name)}</div>
        ${block("en")}
        <hr style="margin:30px auto;width:60%;border:none;border-top:1px solid #ddd" />
        ${block("es")}
      </body>`);
    w.document.close();
    w.print();
  }

  async function sendTestDigest() {
    setTesting(true);
    try { const r = await apiTestDigest(); onToast?.(r.message || t("admin.toast_test_sent")); }
    catch (e) { onToast?.(e.message); }
    setTesting(false);
  }

  /* ---- demo data (owner only) ---- */
  const [seedBusy, setSeedBusy] = useState("");
  async function loadDemo() {
    if (!confirm(t("admin.confirm_load_demo"))) return;
    setSeedBusy("load");
    try {
      const r = await apiSeedDemo("load");
      const c = r.counts || {};
      onToast?.(t("admin.toast_demo_loaded", { n: c.entries || 0 }));
    } catch (e) { onToast?.(e.message); }
    setSeedBusy("");
  }
  async function clearDemo() {
    if (!confirm(t("admin.confirm_clear_demo"))) return;
    setSeedBusy("clear");
    try {
      const r = await apiSeedDemo("clear");
      const c = r.counts || {};
      const total = Object.values(c).reduce((s, v) => s + (v || 0), 0);
      onToast?.(total ? t("admin.toast_demo_removed", { n: total }) : t("admin.toast_demo_none"));
    } catch (e) { onToast?.(e.message); }
    setSeedBusy("");
  }

  const locName = (id) => locations.find((l) => l.id === id)?.name || t("common.all_locations");

  // Sticky in-page section nav — the Admin page is long; chips jump to each
  // card. Sits just below the sticky app header (whose height is its safe-area
  // top padding + ~45px of content); scroll-mt on the cards keeps headings
  // clear of both bars after the jump.
  /* ---- customer engagement audit: the raw signed rewards ledger,
         filterable by kind and customer (last 90 days — the feed window) ---- */
  const [engageQ, setEngageQ] = useState("");
  const [engageKind, setEngageKind] = useState("all");
  const custById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const engageRows = useMemo(() => {
    const q = engageQ.trim().toLowerCase();
    const qDigits = engageQ.replace(/\D/g, "");
    return rewardEvents
      .filter((e) => engageKind === "all" || e.kind === engageKind)
      .filter((e) => {
        if (!q) return true;
        const c = custById.get(e.customerId);
        const nameHit = c?.name && c.name.toLowerCase().includes(q);
        const phoneHit = qDigits && String(c?.phone || "").includes(qDigits);
        return nameHit || phoneHit;
      })
      .map((e) => ({ ...e, _d: e.ts?.toDate ? e.ts.toDate() : (e.ts ? new Date(e.ts) : null) }))
      .filter((e) => e._d && !Number.isNaN(e._d.getTime()))
      .sort((a, b) => b._d - a._d);
  }, [rewardEvents, custById, engageQ, engageKind]);
  const engageTotals = useMemo(() => ({
    earned: engageRows.reduce((s, e) => s + (e.kind === "earn" ? Number(e.points) || 0 : 0), 0),
    redeemed: engageRows.reduce((s, e) => s + (e.kind === "redeem" ? Math.abs(Number(e.points) || 0) : 0), 0),
  }), [engageRows]);

  const NAV_SECTIONS = [
    ["adm-staff", "admin.staff_title"],
    ["adm-locations", "admin.locations_title"],
    ["adm-drawers", "admin.drawers_title"],
    ["adm-items", "admin.items_title"],
    ["adm-settings", "admin.settings_title"],
    ["adm-rewards", "admin.rw_title"],
    ["adm-engage", "admin.engage_nav"],
    ...(isOwner ? [["adm-import", "imp.title"], ["adm-demo", "admin.demo_title"]] : []),
  ];
  const jumpTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-4">
      <nav aria-label={t("admin.nav_aria")}
        className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+45px)] z-10 -mx-4 px-4 py-2 bg-[var(--bg)]/95 backdrop-blur-sm flex gap-1.5 overflow-x-auto">
        {NAV_SECTIONS.map(([id, key]) => (
          <button key={id} type="button" onClick={() => jumpTo(id)}
            className="flex-shrink-0 whitespace-nowrap text-[12px] font-semibold px-3 py-1.5 rounded-full border border-line bg-subtle text-muted hover:text-fg hover:border-brass transition">
            {t(key)}
          </button>
        ))}
      </nav>

      {/* ---------------- staff ---------------- */}
      <div id="adm-staff" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">{t("admin.staff_title")}</h2>
          <p className="text-[13px] text-muted mt-0.5">{t("admin.staff_sub")}</p>
        </div>
        <div className="p-4 border-b border-line bg-panel">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label={t("admin.f_name")}><input className="input" value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} placeholder={t("admin.ph_name")} /></Field>
            <Field label={t("admin.f_pin", { n: PIN_LENGTH })}><input className="input font-mono" inputMode="numeric" maxLength={PIN_LENGTH} value={ns.pin} onChange={(e) => setNs({ ...ns, pin: e.target.value.replace(/\D/g, "") })} placeholder="123456" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label={t("admin.f_role")}>
              <select className="input" value={ns.role} onChange={(e) => setNs({ ...ns, role: e.target.value })}>
                <option value="employee">{t("admin.role_employee")}</option>
                <option value="manager">{t("admin.role_manager")}</option>
                {isOwner && <option value="owner">{t("admin.role_owner")}</option>}
              </select></Field>
            <Field label={t("common.location")}>
              <select className="input" value={ns.locationId} onChange={(e) => setNs({ ...ns, locationId: e.target.value })}>
                {ns.role !== "employee" && <option value="">{t("common.all_locations")}</option>}
                {locations.filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></Field>
          </div>
          <Field className="mb-3" label={t("admin.f_email_sched")}>
            <input className="input" type="email" inputMode="email" value={ns.email}
              onChange={(e) => setNs({ ...ns, email: e.target.value })} placeholder={t("admin.ph_email")} />
          </Field>
          <button className="btn-ghost w-full" disabled={busy} onClick={createStaff}>{busy ? t("admin.adding") : t("admin.add_staff")}</button>
        </div>
        <div>
          {staff.map((u) => {
            const isMe = u.id === profile.id;
            const active = u.active !== false;
            return (
              <div key={u.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <Avatar name={u.name} inactive={!active} className="mb-1.5" />
                  <div className="font-medium flex items-center gap-2">
                    {u.name}
                    {isMe && <span className="pill bg-subtle text-muted">{t("admin.pill_you")}</span>}
                    {!active && <span className="pill bg-red-100 text-red-700">{t("admin.pill_inactive")}</span>}
                  </div>
                  <div className="text-[13px] text-muted">{locName(u.locationId)}{u.email ? ` · ${u.email}` : ""}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  <select className="input w-auto py-1.5 text-sm" value={u.role} disabled={isMe || (u.role === "owner" && !isOwner)}
                    aria-label={t("admin.aria_role_for", { name: u.name })}
                    onChange={(e) => patchStaff(u.id, { role: e.target.value }, t("admin.toast_now_role", { name: u.name, role: t(`admin.role_${e.target.value}`) }))}>
                    <option value="employee">{t("admin.role_employee")}</option>
                    <option value="manager">{t("admin.role_manager")}</option>
                    <option value="owner" disabled={!isOwner}>{t("admin.role_owner")}</option>
                  </select>
                  <select className="input w-auto py-1.5 text-sm" value={u.locationId || ""} disabled={isMe}
                    aria-label={t("admin.aria_loc_for", { name: u.name })}
                    onChange={(e) => patchStaff(u.id, { locationId: e.target.value || null })}>
                    <option value="">{t("common.all_locations")}</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={isMe}
                    onClick={() => patchStaff(u.id, { active: !active }, active ? t("admin.toast_disabled") : t("admin.toast_enabled"))}>
                    {active ? t("admin.disable") : t("admin.enable")}
                  </button>
                  <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={isMe}
                    onClick={() => {
                      const p = prompt(t("admin.prompt_reset_pin", { name: u.name, n: PIN_LENGTH }));
                      if (p == null) return;
                      const v = p.trim();
                      if (!isValidNewPin(v)) return onToast?.(t("admin.err_pin", { n: PIN_LENGTH }));
                      patchStaff(u.id, { pin: v }, t("admin.toast_pin_reset"));
                    }}>
                    {t("admin.reset_pin")}
                  </button>
                  <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={isMe}
                    onClick={() => {
                      const p = prompt(t("admin.prompt_email", { name: u.name }), u.email || "");
                      if (p == null) return;
                      patchStaff(u.id, { email: p.trim() }, t("admin.toast_email_updated"));
                    }}>
                    {u.email ? t("admin.edit_email") : t("admin.set_email")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- locations ---------------- */}
      <div id="adm-locations" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
        <div className="px-4 py-3.5 border-b border-line"><h2 className="font-semibold text-[15px]">{t("admin.locations_title")}</h2></div>
        <div className="p-4 border-b border-line bg-panel flex gap-2">
          <input className="input" value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder={t("admin.ph_location")} aria-label={t("admin.aria_loc_name")} />
          <button className="btn-ghost whitespace-nowrap" onClick={createLoc}>{t("admin.add_location")}</button>
        </div>
        {locations.map((l) => (
          <div key={l.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3">
            <div className="font-medium flex items-center gap-2">
              {l.name}
              {l.active === false && <span className="pill bg-red-100 text-red-700">{t("admin.pill_inactive")}</span>}
            </div>
            <button className="btn-ghost text-[13px] px-3 py-1.5"
              onClick={() => updateLocation(vendor.id, l.id, { active: !(l.active !== false) }).then(() => onToast?.(t("admin.toast_updated"))).catch(() => onToast?.(t("admin.toast_failed")))}>
              {l.active !== false ? t("admin.disable") : t("admin.enable")}
            </button>
          </div>
        ))}
      </div>

      {/* ---------------- drawers ---------------- */}
      <div id="adm-drawers" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">{t("admin.drawers_title")}</h2>
          <p className="text-[13px] text-muted mt-0.5">{t("admin.drawers_sub")}</p>
        </div>
        <div className="p-4 border-b border-line bg-panel">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label={t("admin.f_drawer_name")}><input className="input" value={nd.name} onChange={(e) => setNd({ ...nd, name: e.target.value })} placeholder={t("admin.ph_drawer")} /></Field>
            <Field label={t("common.location")}>
              <select className="input" value={nd.locationId} onChange={(e) => setNd({ ...nd, locationId: e.target.value })}>
                {locations.filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></Field>
          </div>
          <button className="btn-ghost w-full" onClick={createDrawer}>{t("admin.add_drawer")}</button>
        </div>
        {drawers.map((d) => (
          <div key={d.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                {d.name}
                {d.active === false && <span className="pill bg-red-100 text-red-700">{t("admin.pill_inactive")}</span>}
              </div>
              <div className="text-[13px] text-muted">{locName(d.locationId)}</div>
            </div>
            <button className="btn-ghost text-[13px] px-3 py-1.5"
              onClick={() => updateDrawer(vendor.id, d.id, { active: !(d.active !== false) }).then(() => onToast?.(t("admin.toast_updated"))).catch(() => onToast?.(t("admin.toast_failed")))}>
              {d.active !== false ? t("admin.disable") : t("admin.enable")}
            </button>
          </div>
        ))}
      </div>

      {/* ---------------- inventory items ---------------- */}
      <div id="adm-items" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">{t("admin.items_title")}</h2>
          <p className="text-[13px] text-muted mt-0.5">{t("admin.items_sub")}</p>
        </div>
        <div className="p-4 border-b border-line bg-panel">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label={t("admin.f_item_name")}><input className="input" value={ni.name} onChange={(e) => setNi({ ...ni, name: e.target.value })} placeholder={t("admin.ph_item")} /></Field>
            <Field label={t("admin.f_category_opt")}><input className="input" value={ni.category} onChange={(e) => setNi({ ...ni, category: e.target.value })} placeholder={t("admin.ph_category")} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label={t("admin.f_unit")}>
              <select className="input" value={ni.unit} onChange={(e) => setNi({ ...ni, unit: e.target.value })}>
                <option value="unit">{t("admin.unit_unit")}</option>
                <option value="carton">{t("admin.unit_carton")}</option>
                <option value="pack">{t("admin.unit_pack")}</option>
                <option value="box">{t("admin.unit_box")}</option>
                <option value="case">{t("admin.unit_case")}</option>
              </select></Field>
            <Field label={t("common.location")}>
              <select className="input" value={ni.locationId} onChange={(e) => setNi({ ...ni, locationId: e.target.value })}>
                {locations.filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></Field>
          </div>
          <div className="mb-3">
            <label htmlFor={barcodeFieldId} className="label">{t("admin.f_barcode_opt")}</label>
            <div className="flex gap-2">
              <input id={barcodeFieldId} className="input font-mono" value={ni.barcode} placeholder={t("admin.ph_scan_type")}
                onChange={(e) => setNi({ ...ni, barcode: e.target.value })} />
              <button type="button" className="btn-ghost whitespace-nowrap px-3" onClick={() => setScanOpen(true)}>{t("admin.scan_btn")}</button>
            </div>
          </div>
          <button className="btn-ghost w-full" onClick={createItem}>{t("admin.add_item")}</button>
        </div>
        {items.map((it) => (
          <div key={it.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                {it.name}
                {it.category && <span className="pill bg-subtle text-muted">{it.category}</span>}
                {it.active === false && <span className="pill bg-red-100 text-red-700">{t("admin.pill_inactive")}</span>}
              </div>
              <div className="text-[13px] text-muted">
                {locName(it.locationId)} · {t("admin.counted_in", { unit: `${it.unit || "unit"}s` })}
                {it.barcode && <span className="font-mono"> · ▮▯ {it.barcode}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => editItem(it)}>{t("admin.edit")}</button>
              <button className="btn-ghost text-[13px] px-3 py-1.5"
                onClick={() => updateItem(vendor.id, it.id, { active: !(it.active !== false) }).then(() => onToast?.(t("admin.toast_updated"))).catch(() => onToast?.(t("admin.toast_failed")))}>
                {it.active !== false ? t("admin.disable") : t("admin.enable")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ---------------- settings (owner) ---------------- */}
      <div id="adm-settings" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">{t("admin.settings_title")}</h2>
          <p className="text-[13px] text-muted mt-0.5">{t("admin.store_code_label")}: <b className="font-mono">{vendor.slug}</b> {t("admin.store_code_hint")}</p>
        </div>
        <div className="p-4 space-y-3.5">
          <Field label={t("admin.f_biz_name")}>
            <input className="input" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} disabled={!isOwner} /></Field>
          <Field label={t("admin.f_logo_url")}>
            <input className="input" value={settings.logoUrl} onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })} disabled={!isOwner} /></Field>
          <div>
            <label htmlFor={sharingId} className="label">{t("admin.data_sharing")}</label>
            <select id={sharingId} className="input" value={settings.sharingMode} onChange={(e) => setSettings({ ...settings, sharingMode: e.target.value })} disabled={!isOwner}>
              <option value="all-locations">{t("admin.sharing_all")}</option>
              <option value="per-location">{t("admin.sharing_per")}</option>
            </select>
            <p className="text-xs text-muted mt-1.5 leading-relaxed">{t("admin.sharing_hint")}</p>
          </div>

          <div className="flex items-start gap-3">
            <input id="blindCounts" type="checkbox" className="mt-1" checked={settings.blindCounts}
              disabled={!isOwner}
              onChange={(e) => setSettings({ ...settings, blindCounts: e.target.checked })} />
            <label htmlFor="blindCounts" className="min-w-0">
              <span className="font-medium text-[14px]">{t("admin.blind_title")}</span>
              <p className="text-xs text-muted leading-relaxed">{t("admin.blind_hint")}</p>
            </label>
          </div>

          <div>
            <label htmlFor={varianceId} className="label">{t("admin.variance_label")}</label>
            <input id={varianceId} type="number" inputMode="decimal" min="0" step="0.5" className="input"
              value={settings.varianceThreshold} disabled={!isOwner}
              onChange={(e) => setSettings({ ...settings, varianceThreshold: e.target.value })} />
            <p className="text-xs text-muted mt-1.5 leading-relaxed">{t("admin.variance_hint")}</p>
          </div>

          <div>
            <label htmlFor={invVarianceId} className="label">{t("admin.inv_variance_label")}</label>
            <input id={invVarianceId} type="number" inputMode="numeric" min="0" step="1" className="input"
              value={settings.invVarianceThreshold} disabled={!isOwner} placeholder={t("admin.inv_variance_ph")}
              onChange={(e) => setSettings({ ...settings, invVarianceThreshold: e.target.value })} />
            <p className="text-xs text-muted mt-1.5 leading-relaxed">{t("admin.inv_variance_hint")}</p>
          </div>

          <div>
            <label htmlFor={fiscalId} className="label">{t("admin.fiscal_label")}</label>
            <select id={fiscalId} className="input" value={settings.fiscalStartMonth} disabled={!isOwner}
              onChange={(e) => setSettings({ ...settings, fiscalStartMonth: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>{new Date(2000, i, 1).toLocaleDateString(lang, { month: "long" })}</option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1.5 leading-relaxed">{t("admin.fiscal_hint")}</p>
          </div>

          <div className="border border-line rounded-xl p-3.5 space-y-3 bg-panel">
            <div>
              <span className="font-medium text-[14px]">{t("admin.alert_sens_title")}</span>
              <p className="text-xs text-muted leading-relaxed">{t("admin.alert_sens_hint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("admin.rule_lookback")}>
                <input type="number" inputMode="numeric" min="1" max="90" step="1" className="input"
                  value={settings.patternRules.windowDays} disabled={!isOwner} onChange={setRule("windowDays")} />
              </Field>
              <Field label={t("admin.rule_repeat")}>
                <input type="number" inputMode="numeric" min="2" max="25" step="1" className="input"
                  value={settings.patternRules.minShorts} disabled={!isOwner} onChange={setRule("minShorts")} />
              </Field>
              <Field label={t("admin.rule_high")}>
                <input type="number" inputMode="decimal" min="1" step="1" className="input"
                  value={settings.patternRules.highShortDollars} disabled={!isOwner} onChange={setRule("highShortDollars")} />
              </Field>
              <Field label={t("admin.rule_backlog")}>
                <input type="number" inputMode="numeric" min="1" max="200" step="1" className="input"
                  value={settings.patternRules.minBacklog} disabled={!isOwner} onChange={setRule("minBacklog")} />
              </Field>
              <Field label={t("admin.rule_unverified")}>
                <input type="number" inputMode="numeric" min="1" max="720" step="1" className="input"
                  value={settings.patternRules.staleHours} disabled={!isOwner} onChange={setRule("staleHours")} />
              </Field>
            </div>
            <p className="text-xs text-muted leading-relaxed">{t("admin.alert_sens_foot")}</p>
          </div>

          <div className="border border-line rounded-xl p-3.5 space-y-3 bg-panel">
            <div>
              <span className="font-medium text-[14px]">{t("admin.stock_title")}</span>
              <p className="text-xs text-muted leading-relaxed">{t("admin.stock_hint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("admin.stock_expiry_label")}>
                <input type="number" inputMode="numeric" min="1" max="365" step="1" className="input"
                  value={settings.stockAlerts.expiryDays} disabled={!isOwner} onChange={setStockRule("expiryDays")} />
              </Field>
              <Field label={t("admin.stock_low_label")}>
                <input type="number" inputMode="numeric" min="0" max="999" step="1" className="input"
                  value={settings.stockAlerts.lowStockUnits} disabled={!isOwner} onChange={setStockRule("lowStockUnits")} />
              </Field>
            </div>
            <p className="text-xs text-muted leading-relaxed">{t("admin.stock_foot")}</p>
          </div>

          <div id="adm-rewards" className="border border-line rounded-xl p-3.5 space-y-3 bg-panel scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
            <div className="flex items-start gap-3">
              <input id="rewardsEnabled" type="checkbox" className="mt-1" checked={settings.rewards.enabled === true}
                disabled={!isOwner} onChange={setReward("enabled")} />
              <label htmlFor="rewardsEnabled" className="min-w-0">
                <span className="font-medium text-[14px]">{t("admin.rw_title")} <span className="text-muted font-normal">{t("admin.off_by_default")}</span></span>
                <p className="text-xs text-muted leading-relaxed">{t("admin.rw_hint")}</p>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("admin.rw_earn_label")}>
                <input type="number" inputMode="decimal" min="0.1" max="100" step="0.1" className="input"
                  value={settings.rewards.earnPerDollar} disabled={!isOwner} onChange={setReward("earnPerDollar")} />
              </Field>
              <Field label={t("admin.rw_goal_label")}>
                <input type="number" inputMode="numeric" min="10" max="100000" step="1" className="input"
                  value={settings.rewards.redeemPoints} disabled={!isOwner} onChange={setReward("redeemPoints")} />
              </Field>
              <Field label={t("admin.rw_value_label")}>
                <input type="number" inputMode="decimal" min="0.5" max="1000" step="0.5" className="input"
                  value={settings.rewards.redeemValue} disabled={!isOwner} onChange={setReward("redeemValue")} />
              </Field>
            </div>
            <p className="text-xs leading-relaxed">
              <span className="font-semibold">{t("admin.rw_effective", { pct: effectivePercent(settings.rewards) })}</span>
              {effectivePercent(settings.rewards) > 2 && (
                <span className="text-neg"> {t("admin.rw_effective_warn")}</span>
              )}
            </p>
            <p className="text-xs text-muted leading-relaxed">{t("admin.rw_exclusions")}</p>

            {/* Optional named reward tiers — a menu of rewards at different point
                levels. Empty leaves the single base reward above in effect. */}
            <div className="border-t border-line pt-3 space-y-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("admin.rw_tiers_title")}</div>
              <p className="text-xs text-muted leading-relaxed">{t("admin.rw_tiers_hint")}</p>
              {rewardTierRows.map((tier, i) => {
                const type = TIER_TYPES.includes(tier.type) ? tier.type : "cash";
                return (
                  <div key={tier.id || i} className="border border-line rounded-lg p-2.5 space-y-2">
                    <div className="grid grid-cols-[1fr_4.5rem_auto] gap-2 items-center">
                      <input className="input" placeholder={t("admin.rw_tier_name_ph")} value={tier.name ?? ""} disabled={!isOwner} onChange={setTier(i, "name")} aria-label={t("admin.rw_tier_name")} />
                      <input className="input" type="number" inputMode="numeric" min="10" step="1" placeholder="100" value={tier.points ?? ""} disabled={!isOwner} onChange={setTier(i, "points")} aria-label={t("admin.rw_tier_points")} />
                      <button type="button" className="btn-ghost px-2.5 text-[13px]" disabled={!isOwner} onClick={() => removeTier(i)} aria-label={t("admin.rw_tier_remove")}><span aria-hidden="true">✕</span></button>
                    </div>
                    <div className="grid grid-cols-[8rem_1fr] gap-2 items-center">
                      <select className="input" value={type} disabled={!isOwner} onChange={setTier(i, "type")} aria-label={t("admin.rw_tier_type")}>
                        {TIER_TYPES.map((tt) => <option key={tt} value={tt}>{t(`admin.rw_type_${tt}`)}</option>)}
                      </select>
                      {type === "cash" && (
                        <input className="input" type="number" inputMode="decimal" min="0" step="0.5" placeholder="5" value={tier.value ?? ""} disabled={!isOwner} onChange={setTier(i, "value")} aria-label={t("admin.rw_tier_value")} />
                      )}
                      {type === "percent" && (
                        <div className="flex gap-2 min-w-0">
                          <input className="input min-w-0" type="number" inputMode="numeric" min="1" max="100" step="1" placeholder="10" value={tier.percent ?? ""} disabled={!isOwner} onChange={setTier(i, "percent")} aria-label={t("admin.rw_tier_percent")} />
                          <input className="input min-w-0" type="number" inputMode="decimal" min="0.5" step="0.5" placeholder={t("admin.rw_tier_cap_ph")} value={tier.cap ?? ""} disabled={!isOwner} onChange={setTier(i, "cap")} aria-label={t("admin.rw_tier_cap")} title={t("admin.rw_tier_cap")} />
                        </div>
                      )}
                      {type === "item" && (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input className="input min-w-0 w-24" type="number" inputMode="decimal" min="0" step="0.5" placeholder="3" value={tier.value ?? ""} disabled={!isOwner} onChange={setTier(i, "value")} aria-label={t("admin.rw_tier_value")} title={t("admin.rw_tier_value")} />
                          <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer whitespace-nowrap">
                            <input type="checkbox" checked={tier.withPurchase === true} disabled={!isOwner}
                              onChange={(e) => patchTier(i, { withPurchase: e.target.checked })} />
                            {t("admin.rw_tier_withpurchase")}
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isOwner && rewardTierRows.length < MAX_TIERS && (
                <button type="button" className="btn-ghost text-[13px] px-3 py-1.5" onClick={addTier}>+ {t("admin.rw_tier_add")}</button>
              )}
            </div>

            {/* VIP status tiers — lifetime-points milestones with an earn
                multiplier. Status only ever climbs (lifetime is monotonic). */}
            <div className="border-t border-line pt-3 space-y-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("admin.rw_vip_title")}</div>
              <p className="text-xs text-muted leading-relaxed">{t("admin.rw_vip_hint")}</p>
              {vipRows.length > 0 && (
                <div className="grid grid-cols-[1fr_6rem_4.5rem_auto] gap-2 items-center text-[11px] uppercase tracking-wide text-muted font-semibold">
                  <span>{t("admin.rw_vip_name")}</span><span>{t("admin.rw_vip_threshold")}</span><span>{t("admin.rw_vip_mult")}</span><span />
                </div>
              )}
              {vipRows.map((v, i) => (
                <div key={v.id || i} className="grid grid-cols-[1fr_6rem_4.5rem_auto] gap-2 items-center">
                  <input className="input" placeholder={t("admin.rw_vip_name_ph")} value={v.name ?? ""} disabled={!isOwner} onChange={setVip(i, "name")} aria-label={t("admin.rw_vip_name")} />
                  <input className="input" type="number" inputMode="numeric" min="1" step="1" placeholder="500" value={v.threshold ?? ""} disabled={!isOwner} onChange={setVip(i, "threshold")} aria-label={t("admin.rw_vip_threshold")} />
                  <input className="input" type="number" inputMode="decimal" min="1" max="10" step="0.1" placeholder="1.5" value={v.multiplier ?? ""} disabled={!isOwner} onChange={setVip(i, "multiplier")} aria-label={t("admin.rw_vip_mult")} />
                  <button type="button" className="btn-ghost px-2.5 text-[13px]" disabled={!isOwner} onClick={() => removeVip(i)} aria-label={t("admin.rw_vip_remove")}><span aria-hidden="true">✕</span></button>
                </div>
              ))}
              {isOwner && vipRows.length < MAX_VIP_TIERS && (
                <button type="button" className="btn-ghost text-[13px] px-3 py-1.5" onClick={addVip}>+ {t("admin.rw_vip_add")}</button>
              )}
            </div>

            <p className="text-xs text-muted leading-relaxed">{t("admin.rw_bulk_hint")}</p>
            <div className="flex items-center justify-between gap-3 flex-wrap border-t border-line pt-3">
              <span className="text-xs text-muted">{t("admin.rw_balance_url")}</span>
              <button type="button" className="btn-ghost text-[13px] px-3 py-1.5"
                disabled={settings.rewards.enabled !== true} onClick={printRewardsSign}>
                {t("admin.rw_print_sign")}
              </button>
            </div>
          </div>

          <div className="border border-line rounded-xl p-3.5 space-y-3 bg-panel">
            <div className="flex items-start gap-3">
              <input id="digestEnabled" type="checkbox" className="mt-1" checked={settings.digestEnabled}
                disabled={!isOwner}
                onChange={(e) => setSettings({ ...settings, digestEnabled: e.target.checked })} />
              <label htmlFor="digestEnabled" className="min-w-0">
                <span className="font-medium text-[14px]">{t("admin.digest_title")}</span>
                <p className="text-xs text-muted leading-relaxed">{t("admin.digest_hint")}</p>
              </label>
            </div>
            <Field label={t("admin.digest_recipients")}>
              <input className="input" value={settings.digestRecipients} disabled={!isOwner}
                placeholder={t("admin.ph_recipients")}
                onChange={(e) => setSettings({ ...settings, digestRecipients: e.target.value })} />
            </Field>
            <Field label={t("admin.timezone")}>
              <select className="input" value={settings.digestTz} disabled={!isOwner}
                onChange={(e) => setSettings({ ...settings, digestTz: e.target.value })}>
                {["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
                  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "UTC"].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </Field>
            <div className="flex items-start gap-3 border-t border-line pt-3">
              <input id="digestNarrative" type="checkbox" className="mt-1" checked={settings.digestNarrative}
                disabled={!isOwner}
                onChange={(e) => setSettings({ ...settings, digestNarrative: e.target.checked })} />
              <label htmlFor="digestNarrative" className="min-w-0">
                <span className="font-medium text-[14px]">{t("admin.digest_ai_title")} <span className="text-muted font-normal">{t("admin.off_by_default")}</span></span>
                <p className="text-xs text-muted leading-relaxed">{t("admin.digest_ai_hint")}</p>
              </label>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-muted">
                {t("admin.last_sent")} <b className="font-mono">{vendor.digest?.lastSentDate || t("admin.never")}</b>
              </span>
              {isOwner && (
                <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={testing} onClick={sendTestDigest}>
                  {testing ? t("admin.sending") : t("admin.send_test")}
                </button>
              )}
            </div>
          </div>

          <div className="border border-line rounded-xl p-3.5 bg-panel">
            <div className="flex items-start gap-3">
              <input id="aiSearch" type="checkbox" className="mt-1" checked={settings.aiSearch}
                disabled={!isOwner}
                onChange={(e) => setSettings({ ...settings, aiSearch: e.target.checked })} />
              <label htmlFor="aiSearch" className="min-w-0">
                <span className="font-medium text-[14px]">{t("admin.ai_search_title")} <span className="text-muted font-normal">{t("admin.off_by_default")}</span></span>
                <p className="text-xs text-muted leading-relaxed">{t("admin.ai_search_hint")}</p>
              </label>
            </div>
          </div>

          <div className="border border-line rounded-xl p-3.5 bg-panel">
            <div className="flex items-start gap-3">
              <input id="aiInsights" type="checkbox" className="mt-1" checked={settings.aiInsights}
                disabled={!isOwner}
                onChange={(e) => setSettings({ ...settings, aiInsights: e.target.checked })} />
              <label htmlFor="aiInsights" className="min-w-0">
                <span className="font-medium text-[14px]">{t("admin.ai_insight_title")} <span className="text-muted font-normal">{t("admin.off_by_default")}</span></span>
                <p className="text-xs text-muted leading-relaxed">{t("admin.ai_insight_hint")}</p>
              </label>
            </div>
          </div>

          {isOwner
            ? <button className="btn-primary" onClick={saveSettings}>{t("admin.save_settings")}</button>
            : <p className="text-[13px] text-muted italic">{t("admin.owner_only_note")}</p>}
        </div>
      </div>

      {/* ---------------- customer engagement audit ---------------- */}
      <div id="adm-engage" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">{t("admin.engage_title")}</h2>
          <p className="text-[13px] text-muted mt-0.5">{t("admin.engage_sub")}</p>
        </div>
        <div className="p-4 space-y-3">
          <input className="input" value={engageQ} onChange={(e) => setEngageQ(e.target.value)}
            placeholder={t("admin.engage_search_ph")} aria-label={t("admin.engage_search_ph")} />
          <div className="flex gap-1.5 overflow-x-auto">
            {[["all", "admin.engage_f_all"], ["earn", "admin.engage_f_earn"], ["redeem", "admin.engage_f_redeem"], ["adjust", "admin.engage_f_adjust"]].map(([k, key]) => (
              <button key={k} type="button" onClick={() => setEngageKind(k)}
                className={`flex-shrink-0 whitespace-nowrap text-[12px] font-semibold px-3 py-1.5 rounded-full border transition ${engageKind === k ? "border-brass text-fg bg-brass/10" : "border-line bg-subtle text-muted hover:text-fg"}`}>
                {t(key)}
              </button>
            ))}
          </div>
          {engageRows.length === 0 ? (
            <p className="text-[13px] text-muted leading-relaxed">{t("admin.engage_empty")}</p>
          ) : (
            <>
              <p className="text-[12px] text-muted font-semibold">
                {t("admin.engage_totals", { earned: engageTotals.earned, redeemed: engageTotals.redeemed, events: engageRows.length })}
              </p>
              <div className="border border-line rounded-xl overflow-hidden divide-y divide-line-soft max-h-[30rem] overflow-y-auto">
                {engageRows.slice(0, 150).map((e) => {
                  const c = custById.get(e.customerId);
                  const pts = Number(e.points) || 0;
                  const isRedeem = e.kind === "redeem";
                  const label = e.kind === "earn"
                    ? `${t("rw.h_earn")}${e.saleDollars ? ` · ${money(e.saleDollars)}` : ""}${Number(e.multiplier) > 1 ? ` · ×${e.multiplier}` : ""}`
                    : isRedeem
                      ? t("rw.h_redeem", { reward: e.rewardName || money(Number(e.value) || 0) })
                      : `${t("rw.h_adjust")}${e.note ? ` — ${e.note}` : ""}`;
                  return (
                    <div key={e.id} className="px-3 py-2.5 flex items-start gap-3">
                      <div className="flex-shrink-0 w-[4.4rem] text-right text-[11px] text-muted font-mono leading-snug">
                        <div>{e._d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                        <div>{e._d.toLocaleDateString()}</div>
                      </div>
                      <div className="min-w-0 flex-1 leading-snug">
                        <span className="block text-[13px] font-medium truncate">{c?.name || (c ? maskPhone(c.phone) : t("admin.engage_unknown"))}</span>
                        <span className={`block text-[12px] ${isRedeem ? "text-pos font-semibold" : "text-muted"}`}>{label}</span>
                        {e.by && <span className="block text-[11px] text-muted">{t("rw.h_by", { name: e.by })}</span>}
                      </div>
                      <div className={`flex-shrink-0 font-mono font-bold text-[13px] ${isRedeem ? "text-pos" : pts < 0 ? "text-neg" : ""}`}>
                        {pts > 0 ? `+${pts}` : pts} {t("rw.pts")}
                      </div>
                    </div>
                  );
                })}
              </div>
              {engageRows.length > 150 && (
                <p className="text-[12px] text-muted">{t("admin.engage_more", { shown: 150, total: engageRows.length })}</p>
              )}
            </>
          )}
        </div>
      </div>

      {isOwner && (
        <div id="adm-import" className="scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
          <ImportCard locations={locations} items={items} staff={staff} entries={entries} customers={customers} scratchCatalog={scratchCatalog} onToast={onToast} />
        </div>
      )}

      {isOwner && (
        <div id="adm-demo" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
          <div className="px-4 py-3.5 border-b border-line">
            <h2 className="font-semibold text-[15px]">{t("admin.demo_title")}</h2>
            <p className="text-[13px] text-muted mt-0.5">{t("admin.demo_sub")}</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={!!seedBusy} onClick={loadDemo}>
                {seedBusy === "load" ? t("admin.loading") : t("admin.load_demo")}
              </button>
              <button className="btn-ghost flex-1" disabled={!!seedBusy} onClick={clearDemo}>
                {seedBusy === "clear" ? t("admin.clearing") : t("admin.clear_demo")}
              </button>
            </div>
            <p className="text-xs text-muted leading-relaxed">{t("admin.demo_foot")}</p>
          </div>
        </div>
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        title={t("admin.scan_item_title")}
        hint={t("admin.scan_item_hint")}
        onDetected={(code) => { setNi((p) => ({ ...p, barcode: code })); setScanOpen(false); onToast?.(t("admin.toast_scanned")); }} />
    </div>
  );
}
