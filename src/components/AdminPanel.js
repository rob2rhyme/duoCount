"use client";
import { useEffect, useState, useId } from "react";
import {
  watchStaff, apiCreateStaff, apiUpdateStaff,
  addLocation, updateLocation, addDrawer, updateDrawer,
  addItem, updateItem, updateVendorSettings, apiTestDigest, apiSeedDemo,
} from "@/lib/data";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import { PATTERN_RULES, resolvePatternRules } from "@/lib/patterns";
import { STOCK_ALERTS, resolveStockAlerts } from "@/lib/stock-alerts";
import { PIN_LENGTH, isValidNewPin } from "@/lib/pin";
import Avatar from "./Avatar";
import BarcodeScanner from "./BarcodeScanner";
import ImportCard from "./ImportCard";
import Field from "./Field";

export default function AdminPanel({ onToast, locations, drawers, items = [], entries = [] }) {
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
  });
  const setRule = (k) => (e) =>
    setSettings((s) => ({ ...s, patternRules: { ...s.patternRules, [k]: e.target.value } }));
  const setStockRule = (k) => (e) =>
    setSettings((s) => ({ ...s, stockAlerts: { ...s.stockAlerts, [k]: e.target.value } }));
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

  return (
    <div className="space-y-4">
      {/* ---------------- staff ---------------- */}
      <div className="card overflow-hidden">
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
      <div className="card overflow-hidden">
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
      <div className="card overflow-hidden">
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
      <div className="card overflow-hidden">
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
      <div className="card overflow-hidden">
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

      {isOwner && <ImportCard locations={locations} items={items} staff={staff} entries={entries} onToast={onToast} />}

      {isOwner && (
        <div className="card overflow-hidden">
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
