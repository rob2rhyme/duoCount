"use client";
import { useEffect, useMemo, useRef, useState, useId } from "react";
import {
  watchStaff, apiCreateStaff, apiUpdateStaff,
  addLocation, updateLocation, addDrawer, updateDrawer,
  addItem, updateItem, updateVendorSettings, apiTestDigest, apiSeedDemo,
  fetchRewardEventsInRange,
} from "@/lib/data";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import { PATTERN_RULES, resolvePatternRules } from "@/lib/patterns";
import { STOCK_ALERTS, resolveStockAlerts } from "@/lib/stock-alerts";
import { FEATURES, FEATURE_KEYS, resolveFeatures, featureEnabled } from "@/lib/features";
import { REWARDS, MAX_TIERS, MAX_VIP_TIERS, MAX_STAMP_CARDS, TIER_TYPES, resolveRewards, effectivePercent, maskPhone } from "@/lib/rewards";
import { money, csvCell, downloadCSV, printCloseHtml } from "@/lib/utils";
import { searchTerms, matchesTerms } from "@/lib/text-match";
import { useModalA11y } from "@/lib/use-modal-a11y";
import { buildStockAlerts } from "@/lib/stock-alerts";
import { translate } from "@/lib/i18n";
import { PIN_LENGTH, isValidNewPin } from "@/lib/pin";
import Avatar from "./Avatar";
import BarcodeScanner from "./BarcodeScanner";
import ImportCard from "./ImportCard";
import ScratchGamesCard from "./ScratchGamesCard";
import MachineRegistryCard from "./MachineRegistryCard";
import SupportCard from "./SupportCard";
import Field from "./Field";
import ShowMore, { usePaged } from "./ShowMore";

// Admin is grouped into a few tabs so it reads as a handful of short pages
// instead of one endless scroll. Each tab renders only its own cards. `owner`
// marks a tab whose cards are all owner-only, so it drops for a non-owner.
const ADMIN_TABS = [
  { id: "store", labelKey: "admin.tab_store" },
  { id: "modules", labelKey: "admin.tab_modules" },
  { id: "settings", labelKey: "admin.tab_settings" },
  { id: "rewards", labelKey: "admin.tab_rewards" },
  { id: "more", labelKey: "admin.tab_more" },
];
// Which tab an at-a-glance overview tile jumps to.
const SECTION_TAB = {
  "adm-staff": "store", "adm-locations": "store", "adm-drawers": "store",
  "adm-items": "store", "adm-engage": "rewards",
};

export default function AdminPanel({ onToast, locations, drawers, items = [], entries = [], customers = [], rewardEvents = [], scratchCatalog = null, machines = [], initialTab = null }) {
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
  // `undoPatch` (the prior values) arms the toast's one-tap Undo.
  async function patchStaff(userId, patch, okMsg, undoPatch) {
    try {
      await apiUpdateStaff({ userId, ...patch });
      onToast?.(okMsg || t("admin.toast_updated"),
        undoPatch ? { fn: () => patchStaff(userId, undoPatch, t("common.undone")) } : undefined);
    } catch (e) { onToast?.(e.message); }
  }
  // Proper dialogs for the PIN-reset and email edits (they were browser
  // prompt()s — functional, but off-brand and awkward on mobile).
  const [staffModal, setStaffModal] = useState(null); // { kind: "pin"|"email", user } | null
  const [staffModalVal, setStaffModalVal] = useState("");
  function openStaffModal(kind, user) {
    setStaffModal({ kind, user });
    setStaffModalVal(kind === "email" ? (user.email || "") : "");
  }
  async function saveStaffModal() {
    const { kind, user } = staffModal;
    if (kind === "pin") {
      const v = staffModalVal.trim();
      if (!isValidNewPin(v)) return onToast?.(t("admin.err_pin", { n: PIN_LENGTH }));
      await patchStaff(user.id, { pin: v }, t("admin.toast_pin_reset"));
    } else {
      await patchStaff(user.id, { email: staffModalVal.trim() }, t("admin.toast_email_updated"));
    }
    setStaffModal(null);
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
  const [scanTarget, setScanTarget] = useState("new"); // "new" (add form) | "edit" (item editor)
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
  // Full item editor (was three chained browser prompt()s that only reached
  // name/category/barcode). Every field the Add form sets is editable, plus
  // the stock-sync fields the alerts read (price, expiry). Quantity is NOT
  // here on purpose — stock only moves through the signed Backroom − / +.
  const [editModal, setEditModal] = useState(null);
  const editPanelRef = useModalA11y(() => setEditModal(null), !!editModal);
  const staffPanelRef = useModalA11y(() => setStaffModal(null), !!staffModal);
  function openEditItem(it) {
    setEditModal({
      id: it.id, name: it.name || "", category: it.category || "",
      unit: it.unit || "unit", locationId: it.locationId || "",
      barcode: it.barcode || "", price: it.price != null ? String(it.price) : "",
      expiresAt: it.expiresAt || "",
    });
  }
  const setEdit = (k) => (e) => setEditModal((p) => ({ ...p, [k]: e.target.value }));
  async function saveEditItem() {
    const m = editModal;
    const name = m.name.trim();
    if (name.length < 2) return onToast?.(t("admin.err_item_name"));
    let price = null;
    if (String(m.price).trim() !== "") {
      const n = Number(m.price);
      if (!Number.isFinite(n) || n < 0) return onToast?.(t("admin.err_item_price"));
      price = n;
    }
    try {
      const prev = items.find((x) => x.id === m.id);
      await updateItem(vendor.id, m.id, {
        name, category: m.category.trim() || null, unit: m.unit || "unit",
        locationId: m.locationId, barcode: m.barcode.trim() || null,
        price, expiresAt: m.expiresAt || null,
      });
      onToast?.(t("admin.toast_item_updated"), prev ? {
        fn: async () => {
          await updateItem(vendor.id, m.id, {
            name: prev.name, category: prev.category ?? null, unit: prev.unit || "unit",
            locationId: prev.locationId, barcode: prev.barcode ?? null,
            price: prev.price ?? null, expiresAt: prev.expiresAt ?? null,
          });
          onToast?.(t("common.undone"));
        },
      } : undefined);
      setEditModal(null);
    } catch (e) { onToast?.(t("admin.toast_failed")); }
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
    features: { ...FEATURES, ...(vendor.features || {}) },
  });
  const setFeature = (k) => (e) =>
    setSettings((s) => ({ ...s, features: { ...s.features, [k]: e.target.checked } }));
  // Appearance (color theme / font / text size, incl. custom-font upload) lives
  // in the ⚙ Settings menu now, not here — it's owner-only and applies instantly.
  const setRule = (k) => (e) =>
    setSettings((s) => ({ ...s, patternRules: { ...s.patternRules, [k]: e.target.value } }));
  const setStockRule = (k) => (e) =>
    setSettings((s) => ({ ...s, stockAlerts: { ...s.stockAlerts, [k]: e.target.value } }));
  const setReward = (k) => (e) =>
    setSettings((s) => ({ ...s, rewards: { ...s.rewards, [k]: k === "enabled" ? e.target.checked : e.target.value } }));
  const setReferral = (k) => (e) =>
    setSettings((s) => ({
      ...s,
      rewards: { ...s.rewards, referral: { ...REWARDS.referral, ...(s.rewards.referral || {}), [k]: e.target.value } },
    }));
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
  // Punch cards — buy-N-get-one stamps beside the points program.
  const stampRows = settings.rewards.stamps || [];
  const addStamp = () =>
    setSettings((s) => {
      const stamps = s.rewards.stamps || [];
      if (stamps.length >= MAX_STAMP_CARDS) return s;
      const id = (globalThis.crypto?.randomUUID?.() || `s${stamps.length}-${settings.name || "x"}`);
      return { ...s, rewards: { ...s.rewards, stamps: [...stamps, { id, name: "", goal: "", reward: "" }] } };
    });
  const setStamp = (i, k) => (e) =>
    setSettings((s) => ({
      ...s,
      rewards: { ...s.rewards, stamps: (s.rewards.stamps || []).map((cd, j) => (j === i ? { ...cd, [k]: e.target.value } : cd)) },
    }));
  const removeStamp = (i) =>
    setSettings((s) => ({ ...s, rewards: { ...s.rewards, stamps: (s.rewards.stamps || []).filter((_, j) => j !== i) } }));
  const [testing, setTesting] = useState(false);
  // Saving-in-flight state: the write awaits the server ack, which on a slow
  // connection takes visible time — without this the Save buttons stayed live
  // and silent, reading as a dead tap (and inviting double-saves).
  const [savingSettings, setSavingSettings] = useState(false);
  async function saveSettings() {
    if (savingSettings) return;
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
      features: resolveFeatures(settings),
      digest: {
        enabled: settings.digestEnabled, recipients, tz: settings.digestTz,
        narrative: settings.digestNarrative, // opt-in AI summary; off by default
        lastSentDate: vendor.digest?.lastSentDate ?? null, // preserved; cron owns it
      },
    };
    // The prior vendor state, captured before the write, arms the Undo.
    const prevVendor = vendor;
    const prevPatch = {
      name: vendor.name, logoUrl: vendor.logoUrl || null, sharingMode: vendor.sharingMode,
      blindCounts: vendor.blindCounts === true,
      varianceThreshold: vendor.varianceThreshold ?? 5,
      invVarianceThreshold: vendor.invVarianceThreshold ?? null,
      fiscalStartMonth: vendor.fiscalStartMonth ?? 1,
      aiSearch: vendor.aiSearch === true, aiInsights: vendor.aiInsights === true,
      patternRules: resolvePatternRules(vendor.patternRules || {}),
      stockAlerts: resolveStockAlerts(vendor.stockAlerts || {}),
      rewards: resolveRewards(vendor.rewards || {}),
      features: resolveFeatures(vendor),
      digest: {
        enabled: vendor.digest?.enabled === true, recipients: vendor.digest?.recipients || [],
        tz: vendor.digest?.tz || "America/New_York", narrative: vendor.digest?.narrative === true,
        lastSentDate: vendor.digest?.lastSentDate ?? null,
      },
    };
    const prevSnap = savedSettingsRef.current;
    setSavingSettings(true);
    try {
      await updateVendorSettings(vendor.id, patch);
      setVendor({ ...vendor, ...patch });
      savedSettingsRef.current = JSON.stringify(settings);
      onToast?.(t("admin.toast_settings_saved"), {
        fn: async () => {
          await updateVendorSettings(prevVendor.id, prevPatch);
          setVendor({ ...prevVendor, ...prevPatch });
          if (prevSnap) { setSettings(JSON.parse(prevSnap)); savedSettingsRef.current = prevSnap; }
          onToast?.(t("common.undone"));
        },
      });
    } catch (e) { onToast?.(t("admin.err_owner_settings")); }
    finally { setSavingSettings(false); }
  }
  // Unsaved-changes detection: the settings card is long, and its Save button
  // lives at the bottom — a sticky pill appears the moment anything differs
  // from the last saved snapshot, so an edited knob can't silently evaporate.
  const savedSettingsRef = useRef(null);
  if (savedSettingsRef.current === null) savedSettingsRef.current = JSON.stringify(settings);
  const settingsDirty = JSON.stringify(settings) !== savedSettingsRef.current;
  // A print-ready counter sign for the rewards program — deliberately
  // BILINGUAL (both catalog languages on one sheet, like a real c-store sign).
  // Values are esc()'d; the print window is the report-print pattern.
  function printRewardsSign() {
    const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
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
        ${R.expiryMonths > 0 ? `<div style="font-size:12px;color:#777;margin-top:8px">${esc(translate(loc, "sign.expiry", { months: R.expiryMonths }))}</div>` : ""}
      </div>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><title>${esc(vendor.name)} — rewards</title>
      <body style="font-family:Helvetica,Arial,sans-serif;color:#1a1c2e;text-align:center;padding:48px 32px">
        ${printCloseHtml(t("common.close"))}
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
  // On-demand range: the live feed covers 90 days; loading a range swaps in a
  // point-in-time snapshot of ANY period (month, quarter, year) until reset.
  const [engageFrom, setEngageFrom] = useState("");
  const [engageTo, setEngageTo] = useState("");
  const [engageLoaded, setEngageLoaded] = useState(null); // { from, to, rows } | null
  const [engageBusy, setEngageBusy] = useState(false);
  async function loadEngageRange() {
    if (engageBusy || !engageFrom || !engageTo || engageFrom > engageTo) return;
    setEngageBusy(true);
    try {
      const rows = await fetchRewardEventsInRange(vendor.id, engageFrom, engageTo);
      setEngageLoaded({ from: engageFrom, to: engageTo, rows });
    } catch {
      onToast?.(t("admin.engage_range_err"));
    }
    setEngageBusy(false);
  }
  const custById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const engageRows = useMemo(() => {
    const q = engageQ.trim().toLowerCase();
    const qDigits = engageQ.replace(/\D/g, "");
    return (engageLoaded ? engageLoaded.rows : rewardEvents)
      .filter((e) => engageKind === "all" || e.kind === engageKind
        || (engageKind === "stamps" && (e.kind === "stamp" || e.kind === "stampRedeem")))
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
  }, [rewardEvents, engageLoaded, custById, engageQ, engageKind]);
  // Reveal the engagement ledger 20 at a time; filter/search resets the view.
  const engagePage = usePaged(engageRows, { resetKey: `${engageKind}|${engageQ}` });
  const engageTotals = useMemo(() => ({
    earned: engageRows.reduce((s, e) => s + (e.kind === "earn" ? Number(e.points) || 0 : 0), 0),
    redeemed: engageRows.reduce((s, e) => s + (e.kind === "redeem" ? Math.abs(Number(e.points) || 0) : 0), 0),
  }), [engageRows]);

  // CSV exports — the "your data is yours" promise in a file. The ledger
  // export honors the on-screen filters (chronological); the customer export
  // (owner-only) is the full take-it-with-you list, real phone numbers and
  // all. Both go through csvCell, so a "=cmd" customer name can't become a
  // spreadsheet formula.
  const stamp = () => new Date().toISOString().slice(0, 10);
  function exportLedgerCsv() {
    const head = ["Date", "Time", "Customer", "Phone", "Action", "Points", "Reward", "Note", "Sale", "Multiplier", "Staff"];
    const lines = [head.join(",")];
    for (const e of [...engageRows].reverse()) {
      const c = custById.get(e.customerId);
      lines.push([
        csvCell(e._d.toISOString().slice(0, 10)), csvCell(e._d.toLocaleTimeString()),
        csvCell(c?.name || ""), csvCell(c ? (isOwner ? c.phone : maskPhone(c.phone)) : ""),
        csvCell(e.kind), csvCell(Number(e.points) || 0),
        csvCell(e.rewardName || ""), csvCell(e.note || ""),
        csvCell(e.saleDollars ?? ""), csvCell(e.multiplier ?? ""),
        csvCell(e.by || ""),
      ].join(","));
    }
    downloadCSV(lines.join("\n"), `rewards-ledger-${stamp()}.csv`);
  }
  function exportCustomersCsv() {
    const iso = (v) => {
      const x = v?.toDate ? v.toDate() : (v ? new Date(v) : null);
      return x && !Number.isNaN(x.getTime()) ? x.toISOString().slice(0, 10) : "";
    };
    const head = ["Name", "Phone", "Points", "Lifetime points", "Current streak", "Longest streak",
      "Last visit", "Email", "Birthday month", "Birthday day", "Address", "Note", "Enrolled"];
    const lines = [head.join(",")];
    for (const c of customers) {
      lines.push([
        csvCell(c.name || ""), csvCell(c.phone || ""),
        csvCell(Number(c.pointsBalance) || 0),
        csvCell(Math.max(Number(c.lifetimePoints) || 0, Number(c.pointsBalance) || 0)),
        csvCell(Number(c.currentStreak) || 0), csvCell(Number(c.longestStreak) || 0),
        csvCell(iso(c.lastEarnAt)), csvCell(c.email || ""),
        csvCell(c.birthdayMonth ?? ""), csvCell(c.birthdayDay ?? ""),
        csvCell(c.address || ""), csvCell(c.note || ""), csvCell(iso(c.createdAt)),
      ].join(","));
    }
    downloadCSV(lines.join("\n"), `rewards-customers-${stamp()}.csv`);
  }

  // The tabs a non-owner can see (the "more" tab is import/demo — owner-only —
  // so it drops). Admin is owner-only today, but keep the guard honest.
  const adminTabs = useMemo(() => ADMIN_TABS.filter((tb) => tb.id !== "more" || isOwner), [isOwner]);
  const [adminTab, setAdminTab] = useState(ADMIN_TABS.some((tb) => tb.id === initialTab) ? initialTab : "store");
  // Switch tab and lift the view back to the tab bar, so a long tab (Settings)
  // doesn't leave the next tab scrolled halfway down.
  const goTab = (id) => {
    setAdminTab(id);
    if (typeof window !== "undefined") document.getElementById("adm-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // At-a-glance strip: live counts, each tile a jump link into its section.
  const [itemQ, setItemQ] = useState("");
  const itemTerms = useMemo(() => searchTerms(itemQ), [itemQ]);
  const shownItems = useMemo(() => {
    const list = itemTerms.length
      ? items.filter((it) => matchesTerms(`${it.name} ${it.category || ""} ${it.barcode || ""}`, itemTerms))
      : items;
    return list;
  }, [items, itemTerms]);
  // Reveal the item catalog 20 at a time; a new search snaps back to the top.
  const itemsPage = usePaged(shownItems, { resetKey: itemQ });
  // Roster/locations/drawers grow with multi-location operators — same net,
  // only visible once any of them passes 25 rows.
  const staffPage = usePaged(staff);
  const locPage = usePaged(locations);
  const drawerPage = usePaged(drawers);
  const stockAlertCount = useMemo(() => {
    const a = buildStockAlerts(items, { rules: vendor?.stockAlerts });
    return a.lowStock.length + a.expiring.length;
  }, [items, vendor?.stockAlerts]);
  const overview = [
    ["adm-staff", "admin.ov_staff", staff.filter((u) => u.active !== false).length, false],
    ["adm-locations", "admin.ov_locations", locations.filter((l) => l.active !== false).length, false],
    ["adm-drawers", "admin.ov_drawers", drawers.filter((d) => d.active !== false).length, false],
    ["adm-items", "admin.ov_items", items.filter((it) => it.active !== false).length, false],
    ["adm-engage", "admin.ov_customers", customers.length, false],
    ["adm-items", "admin.ov_alerts", stockAlertCount, stockAlertCount > 0],
  ];

  return (
    <div className="space-y-4">
      <div id="adm-top" className="scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+56px)]" />
      {/* ---------------- at a glance ---------------- */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {overview.map(([target, key, value, hot], i) => (
          <button key={`${key}-${i}`} type="button" onClick={() => goTab(SECTION_TAB[target] || "store")}
            className={`card rounded-xl px-2.5 py-2.5 text-center transition hover:border-brass active:scale-[.97] ${hot ? "border-neg/50" : ""}`}>
            <span className={`block text-xl font-bold font-mono leading-tight ${hot ? "text-neg" : ""}`}>{value}</span>
            <span className="block text-[10px] uppercase tracking-wide text-muted font-semibold mt-0.5 truncate">{t(key)}</span>
          </button>
        ))}
      </div>

      {/* Grouped tabs — one short page per tab instead of one long scroll. */}
      <nav aria-label={t("admin.nav_aria")} role="tablist"
        className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+45px)] z-10 -mx-4 px-4 py-2 bg-[var(--bg)]/95 backdrop-blur-sm flex gap-1.5 overflow-x-auto">
        {adminTabs.map((tb) => {
          const active = adminTab === tb.id;
          return (
            <button key={tb.id} type="button" role="tab" aria-selected={active} onClick={() => goTab(tb.id)}
              className={`flex-shrink-0 whitespace-nowrap text-[13px] font-semibold px-3.5 py-1.5 rounded-full border transition ${active ? "border-brass bg-highlight text-fg" : "border-line bg-subtle text-muted hover:text-fg hover:border-brass"}`}>
              {t(tb.labelKey)}
            </button>
          );
        })}
      </nav>

      {adminTab === "store" && (<>
      {/* ---------------- staff ---------------- */}
      <div id="adm-staff" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">{t("admin.staff_title")}</h2>
          <p className="text-[13px] text-muted mt-0.5">{t("admin.staff_sub")}</p>
        </div>
        <div className="p-4 border-b border-line bg-panel">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label={t("admin.f_name")}><input className="input" value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} placeholder={t("admin.ph_name")} /></Field>
            <Field label={t("admin.f_pin", { n: PIN_LENGTH })}><input className="input font-mono" type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={PIN_LENGTH} value={ns.pin} onChange={(e) => setNs({ ...ns, pin: e.target.value.replace(/\D/g, "") })} placeholder="123456" /></Field>
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
          {staffPage.visible.map((u) => {
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
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <select className="input w-auto max-w-full min-w-0 py-1.5 text-sm" value={u.role} disabled={isMe || (u.role === "owner" && !isOwner)}
                    aria-label={t("admin.aria_role_for", { name: u.name })}
                    onChange={(e) => patchStaff(u.id, { role: e.target.value }, t("admin.toast_now_role", { name: u.name, role: t(`admin.role_${e.target.value}`) }), { role: u.role })}>
                    <option value="employee">{t("admin.role_employee")}</option>
                    <option value="manager">{t("admin.role_manager")}</option>
                    <option value="owner" disabled={!isOwner}>{t("admin.role_owner")}</option>
                  </select>
                  <select className="input w-auto max-w-full min-w-0 py-1.5 text-sm" value={u.locationId || ""} disabled={isMe}
                    aria-label={t("admin.aria_loc_for", { name: u.name })}
                    onChange={(e) => patchStaff(u.id, { locationId: e.target.value || null }, undefined, { locationId: u.locationId || null })}>
                    <option value="">{t("common.all_locations")}</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={isMe}
                    onClick={() => patchStaff(u.id, { active: !active }, active ? t("admin.toast_disabled") : t("admin.toast_enabled"), { active })}>
                    {active ? t("admin.disable") : t("admin.enable")}
                  </button>
                  <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={isMe}
                    onClick={() => openStaffModal("pin", u)}>
                    {t("admin.reset_pin")}
                  </button>
                  <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={isMe}
                    onClick={() => openStaffModal("email", u)}>
                    {u.email ? t("admin.edit_email") : t("admin.set_email")}
                  </button>
                </div>
              </div>
            );
          })}
          <ShowMore hasMore={staffPage.hasMore} nextStep={staffPage.nextStep} onMore={staffPage.showMore} />
        </div>
      </div>

      {/* ---------------- locations ---------------- */}
      <div id="adm-locations" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
        <div className="px-4 py-3.5 border-b border-line"><h2 className="font-semibold text-[15px]">{t("admin.locations_title")}</h2></div>
        <div className="p-4 border-b border-line bg-panel flex gap-2">
          <input className="input" value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder={t("admin.ph_location")} aria-label={t("admin.aria_loc_name")} />
          <button className="btn-ghost whitespace-nowrap" onClick={createLoc}>{t("admin.add_location")}</button>
        </div>
        {locPage.visible.map((l) => (
          <div key={l.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3">
            <div className="font-medium flex items-center gap-2">
              {l.name}
              {l.active === false && <span className="pill bg-red-100 text-red-700">{t("admin.pill_inactive")}</span>}
            </div>
            <button className="btn-ghost text-[13px] px-3 py-1.5"
              onClick={() => {
                const next = !(l.active !== false);
                updateLocation(vendor.id, l.id, { active: next })
                  .then(() => onToast?.(t("admin.toast_updated"), { fn: () => updateLocation(vendor.id, l.id, { active: !next }).then(() => onToast?.(t("common.undone"))) }))
                  .catch(() => onToast?.(t("admin.toast_failed")));
              }}>
              {l.active !== false ? t("admin.disable") : t("admin.enable")}
            </button>
          </div>
        ))}
        <ShowMore hasMore={locPage.hasMore} nextStep={locPage.nextStep} onMore={locPage.showMore} />
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
        {drawerPage.visible.map((d) => (
          <div key={d.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                {d.name}
                {d.active === false && <span className="pill bg-red-100 text-red-700">{t("admin.pill_inactive")}</span>}
              </div>
              <div className="text-[13px] text-muted">{locName(d.locationId)}</div>
            </div>
            <button className="btn-ghost text-[13px] px-3 py-1.5"
              onClick={() => {
                const next = !(d.active !== false);
                updateDrawer(vendor.id, d.id, { active: next })
                  .then(() => onToast?.(t("admin.toast_updated"), { fn: () => updateDrawer(vendor.id, d.id, { active: !next }).then(() => onToast?.(t("common.undone"))) }))
                  .catch(() => onToast?.(t("admin.toast_failed")));
              }}>
              {d.active !== false ? t("admin.disable") : t("admin.enable")}
            </button>
          </div>
        ))}
        <ShowMore hasMore={drawerPage.hasMore} nextStep={drawerPage.nextStep} onMore={drawerPage.showMore} />
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
              <button type="button" className="btn-ghost whitespace-nowrap px-3" onClick={() => { setScanTarget("new"); setScanOpen(true); }}>{t("admin.scan_btn")}</button>
            </div>
          </div>
          <button className="btn-ghost w-full" onClick={createItem}>{t("admin.add_item")}</button>
        </div>
        {items.length > 8 && (
          <div className="px-4 py-3 border-b border-line">
            <input className="input" value={itemQ} onChange={(e) => setItemQ(e.target.value)}
              placeholder={t("admin.items_search_ph")} aria-label={t("admin.items_search_ph")} />
          </div>
        )}
        {itemsPage.visible.map((it) => (
          <div key={it.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                {it.name}
                {it.category && <span className="pill bg-subtle text-muted">{it.category}</span>}
                {it.active === false && <span className="pill bg-red-100 text-red-700">{t("admin.pill_inactive")}</span>}
              </div>
              <div className="text-[13px] text-muted">
                {locName(it.locationId)} · {t("admin.counted_in", { unit: `${it.unit || "unit"}s` })}
                {Number(it.price) > 0 && <span> · {money(Number(it.price))}</span>}
                {it.expiresAt && <span> · {t("admin.item_exp", { date: it.expiresAt })}</span>}
                {it.barcode && <span className="font-mono"> · ▮▯ {it.barcode}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => openEditItem(it)}>{t("admin.edit")}</button>
              <button className="btn-ghost text-[13px] px-3 py-1.5"
                onClick={() => {
                  const next = !(it.active !== false);
                  updateItem(vendor.id, it.id, { active: next })
                    .then(() => onToast?.(t("admin.toast_updated"), { fn: () => updateItem(vendor.id, it.id, { active: !next }).then(() => onToast?.(t("common.undone"))) }))
                    .catch(() => onToast?.(t("admin.toast_failed")));
                }}>
                {it.active !== false ? t("admin.disable") : t("admin.enable")}
              </button>
            </div>
          </div>
        ))}
        <ShowMore hasMore={itemsPage.hasMore} nextStep={itemsPage.nextStep} onMore={itemsPage.showMore} />
      </div>

      </>)}

      {adminTab === "modules" && (<>
      {/* ---------------- features (owner) ---------------- */}
      <div id="adm-features" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">{t("admin.features_title")}</h2>
          <p className="text-[13px] text-muted mt-0.5">{t("admin.features_sub")}</p>
        </div>
        <div className="p-4 space-y-3">
          {/* One switch per main tab. Turning one off hides its tab, its
              Dashboard card and its attention badge for the whole store. Every
              tab is here EXCEPT the two always-on ways back in — Dashboard and
              Admin — so an owner can never hide the screen that turns modules
              back on. Gaming defaults OFF — a store enables it to get the
              machine registry and the collection ledger. */}
          {FEATURE_KEYS.map((k) => (
            <div key={k} className="flex items-start gap-3 border border-line rounded-xl p-3.5 bg-panel">
              <input id={`feat-${k}`} type="checkbox" className="mt-1" checked={settings.features[k] === true}
                disabled={!isOwner} onChange={setFeature(k)} />
              <label htmlFor={`feat-${k}`} className="min-w-0">
                <span className="font-medium text-[14px]">{t(`admin.feat_${k}`)}</span>
                <p className="text-xs text-muted leading-relaxed">{t(`admin.feat_${k}_hint`)}</p>
              </label>
            </div>
          ))}
          {/* Rewards is toggled here too, but this switch is the SAME flag as the
              on/off in Reward settings (vendor.rewards.enabled) — one source of
              truth, not a second gate. Its economics stay in the Rewards card. */}
          <div className="flex items-start gap-3 border border-line rounded-xl p-3.5 bg-panel">
            <input id="feat-rewards" type="checkbox" className="mt-1" checked={settings.rewards?.enabled === true}
              disabled={!isOwner}
              onChange={(e) => setSettings((s) => ({ ...s, rewards: { ...s.rewards, enabled: e.target.checked } }))} />
            <label htmlFor="feat-rewards" className="min-w-0">
              <span className="font-medium text-[14px]">{t("admin.feat_rewards")}</span>
              <p className="text-xs text-muted leading-relaxed">{t("admin.feat_rewards_hint")}</p>
            </label>
          </div>
          {isOwner
            ? <button className="btn-primary" disabled={savingSettings} onClick={saveSettings}>{savingSettings ? t("common.saving") : t("admin.save_settings")}</button>
            : <p className="text-[13px] text-muted italic">{t("admin.owner_only_note")}</p>}
        </div>
      </div>

      {/* -------- scratch games catalog (owner; only with the scratch module) -------- */}
      {featureEnabled(vendor, "scratch") && (
        <ScratchGamesCard scratchCatalog={scratchCatalog} onToast={onToast} />
      )}

      {/* -------- gaming machine registry (owner; only with the gaming module) -------- */}
      {featureEnabled(vendor, "gaming") && (
        <MachineRegistryCard machines={machines} onToast={onToast} />
      )}

      </>)}

      {adminTab === "settings" && (<>
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

            {/* Store-specific exclusions ON TOP of the legal base above — the
                owner's own list (money orders, phone top-ups, …). Plain text,
                comma-separated; staff see them in the register earn hint. */}
            <div>
              <Field label={t("admin.rw_excl_custom_label")}>
                <input className="input" placeholder={t("admin.rw_excl_custom_ph")}
                  value={Array.isArray(settings.rewards.excludedCategories)
                    ? settings.rewards.excludedCategories.join(", ")
                    : (settings.rewards.excludedCategories ?? "")}
                  disabled={!isOwner} onChange={setReward("excludedCategories")} />
              </Field>
              <p className="text-xs text-muted leading-relaxed mt-1">{t("admin.rw_excl_custom_hint")}</p>
            </div>

            {/* Points expiry — inactivity breakage/liability control. 0 = never.
                Expiry is a signed ledger line, disclosed to the customer. */}
            <div className="flex items-end gap-3">
              <Field label={t("admin.rw_expiry_label")}>
                <input type="number" inputMode="numeric" min="0" max="60" step="1" className="input w-24"
                  value={settings.rewards.expiryMonths ?? REWARDS.expiryMonths} disabled={!isOwner} onChange={setReward("expiryMonths")} />
              </Field>
              <p className="text-xs text-muted leading-relaxed flex-1">{t("admin.rw_expiry_hint")}</p>
            </div>

            {/* Referral bonus: both sides of a "who sent you?" enrollment get
                points as signed referral ledger lines. 0 + 0 turns it off. */}
            <div className="border-t border-line pt-3 space-y-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("admin.rw_ref_title")}</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("admin.rw_ref_referrer")}>
                  <input type="number" inputMode="numeric" min="0" max="10000" step="1" className="input"
                    value={settings.rewards.referral?.referrer ?? REWARDS.referral.referrer}
                    disabled={!isOwner} onChange={setReferral("referrer")} />
                </Field>
                <Field label={t("admin.rw_ref_friend")}>
                  <input type="number" inputMode="numeric" min="0" max="10000" step="1" className="input"
                    value={settings.rewards.referral?.friend ?? REWARDS.referral.friend}
                    disabled={!isOwner} onChange={setReferral("friend")} />
                </Field>
              </div>
              <p className="text-xs text-muted leading-relaxed">{t("admin.rw_ref_hint")}</p>
            </div>

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

            {/* Punch cards — buy-N-get-one stamps, a separate currency from
                points; every stamp/redeem is a signed ledger line. */}
            <div className="border-t border-line pt-3 space-y-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("admin.rw_stamps_title")}</div>
              <p className="text-xs text-muted leading-relaxed">{t("admin.rw_stamps_hint")}</p>
              {stampRows.map((cd, i) => (
                <div key={cd.id || i} className="grid grid-cols-[1fr_4rem_1fr_auto] gap-2 items-center">
                  <input className="input" placeholder={t("admin.rw_stamp_name_ph")} value={cd.name ?? ""} disabled={!isOwner} onChange={setStamp(i, "name")} aria-label={t("admin.rw_stamp_name")} />
                  <input className="input" type="number" inputMode="numeric" min="2" max="50" step="1" placeholder="10" value={cd.goal ?? ""} disabled={!isOwner} onChange={setStamp(i, "goal")} aria-label={t("admin.rw_stamp_goal")} />
                  <input className="input" placeholder={t("admin.rw_stamp_reward_ph")} value={cd.reward ?? ""} disabled={!isOwner} onChange={setStamp(i, "reward")} aria-label={t("admin.rw_stamp_reward")} />
                  <button type="button" className="btn-ghost px-2.5 text-[13px]" disabled={!isOwner} onClick={() => removeStamp(i)} aria-label={t("admin.rw_stamp_remove")}><span aria-hidden="true">✕</span></button>
                </div>
              ))}
              {isOwner && stampRows.length < MAX_STAMP_CARDS && (
                <button type="button" className="btn-ghost text-[13px] px-3 py-1.5" onClick={addStamp}>+ {t("admin.rw_stamp_add")}</button>
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
            ? <button className="btn-primary" disabled={savingSettings} onClick={saveSettings}>{savingSettings ? t("common.saving") : t("admin.save_settings")}</button>
            : <p className="text-[13px] text-muted italic">{t("admin.owner_only_note")}</p>}
        </div>
      </div>

      </>)}

      {adminTab === "rewards" && (<>
      {/* ---------------- customer engagement audit ---------------- */}
      <div id="adm-engage" className="card overflow-hidden scroll-mt-[calc(max(0.75rem,env(safe-area-inset-top))+100px)]">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">{t("admin.engage_title")}</h2>
          <p className="text-[13px] text-muted mt-0.5">{t("admin.engage_sub")}</p>
        </div>
        <div className="p-4 space-y-3">
          <input className="input" value={engageQ} onChange={(e) => setEngageQ(e.target.value)}
            placeholder={t("admin.engage_search_ph")} aria-label={t("admin.engage_search_ph")} />
          {/* Any-period snapshot: pick a range and Load; Reset returns to live. */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[7.5rem]">
              <label className="label">{t("scratch.report_from")}</label>
              <input type="date" className="input" value={engageFrom} max={engageTo || undefined}
                onChange={(e) => setEngageFrom(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[7.5rem]">
              <label className="label">{t("scratch.report_to")}</label>
              <input type="date" className="input" value={engageTo} min={engageFrom || undefined}
                onChange={(e) => setEngageTo(e.target.value)} />
            </div>
            <button type="button" className="btn-ghost w-auto px-3 py-2.5 text-[13px] whitespace-nowrap"
              disabled={engageBusy || !engageFrom || !engageTo || engageFrom > engageTo} onClick={loadEngageRange}>
              {engageBusy ? t("admin.engage_range_busy") : t("admin.engage_range_load")}
            </button>
            {engageLoaded && (
              <button type="button" className="btn-ghost w-auto px-3 py-2.5 text-[13px] whitespace-nowrap"
                onClick={() => { setEngageLoaded(null); setEngageFrom(""); setEngageTo(""); }}>
                {t("admin.engage_range_reset")}
              </button>
            )}
          </div>
          {engageLoaded && (
            <p className="text-[12px] text-muted">{t("admin.engage_range_note", { from: engageLoaded.from, to: engageLoaded.to })}</p>
          )}
          <div className="flex gap-1.5 overflow-x-auto">
            {[["all", "admin.engage_f_all"], ["earn", "admin.engage_f_earn"], ["redeem", "admin.engage_f_redeem"], ["adjust", "admin.engage_f_adjust"], ["referral", "admin.engage_f_referral"], ["stamps", "admin.engage_f_stamps"]].map(([k, key]) => (
              <button key={k} type="button" onClick={() => setEngageKind(k)}
                className={`flex-shrink-0 whitespace-nowrap text-[12px] font-semibold px-3 py-1.5 rounded-full border transition ${engageKind === k ? "border-brass text-fg bg-brass/10" : "border-line bg-subtle text-muted hover:text-fg"}`}>
                {t(key)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={!engageRows.length} onClick={exportLedgerCsv}>
              ⬇ {t("admin.engage_export")}
            </button>
            {isOwner && (
              <button type="button" className="btn-ghost text-[13px] px-3 py-1.5 w-auto" disabled={!customers.length} onClick={exportCustomersCsv}>
                ⬇ {t("admin.engage_export_cust")}
              </button>
            )}
          </div>
          {isOwner && <p className="text-[11px] text-muted leading-relaxed">{t("admin.engage_export_hint")}</p>}
          {engageRows.length === 0 ? (
            <p className="text-[13px] text-muted leading-relaxed">{t("admin.engage_empty")}</p>
          ) : (
            <>
              <p className="text-[12px] text-muted font-semibold">
                {t("admin.engage_totals", { earned: engageTotals.earned, redeemed: engageTotals.redeemed, events: engageRows.length })}
              </p>
              <div className="border border-line rounded-xl overflow-hidden divide-y divide-line-soft">
                {engagePage.visible.map((e) => {
                  const c = custById.get(e.customerId);
                  const pts = Number(e.points) || 0;
                  const green = e.kind === "redeem" || e.kind === "stampRedeem";
                  const label = e.kind === "earn"
                    ? `${t("rw.h_earn")}${e.saleDollars ? ` · ${money(e.saleDollars)}` : ""}${Number(e.multiplier) > 1 ? ` · ×${e.multiplier}` : ""}`
                    : e.kind === "redeem"
                      ? t("rw.h_redeem", { reward: e.rewardName || money(Number(e.value) || 0) })
                      : e.kind === "referral"
                        ? t("rw.h_referral")
                        : e.kind === "stamp"
                          ? t("rw.h_stamp", { card: e.cardName || "", n: e.count, goal: e.goal })
                          : e.kind === "stampRedeem"
                            ? t("rw.h_stamp_redeem", { reward: e.reward || e.cardName || "" })
                            : e.kind === "undo"
                              ? t("rw.h_undo")
                              : e.kind === "expire"
                                ? t("rw.h_expire")
                                : `${t("rw.h_adjust")}${e.note ? ` — ${e.note}` : ""}`;
                  const ptsCell = e.kind === "undo" && pts === 0 ? "↩"
                    : e.kind === "stamp" ? "⬤" : e.kind === "stampRedeem" ? "🎁"
                      : `${pts > 0 ? `+${pts}` : pts} ${t("rw.pts")}`;
                  return (
                    <div key={e.id} className={`px-3 py-2.5 flex items-start gap-3 ${e.reversedBy ? "opacity-50" : ""}`}>
                      <div className="flex-shrink-0 w-[4.4rem] text-right text-[11px] text-muted font-mono leading-snug">
                        <div>{e._d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                        <div>{e._d.toLocaleDateString()}</div>
                      </div>
                      <div className="min-w-0 flex-1 leading-snug">
                        <span className="block text-[13px] font-medium truncate">{c?.name || (c ? maskPhone(c.phone) : t("admin.engage_unknown"))}</span>
                        <span className={`block text-[12px] ${green ? "text-pos font-semibold" : "text-muted"}`}>
                          <span className={e.reversedBy ? "line-through" : ""}>{label}</span>
                          {e.reversedBy && <span className="text-[11px] text-muted"> {t("rw.h_undone_mark")}</span>}
                        </span>
                        {e.by && <span className="block text-[11px] text-muted">{t("rw.h_by", { name: e.by })}</span>}
                      </div>
                      <div className={`flex-shrink-0 font-mono font-bold text-[13px] ${green ? "text-pos" : pts < 0 ? "text-neg" : ""}`}>
                        {ptsCell}
                      </div>
                    </div>
                  );
                })}
                <ShowMore hasMore={engagePage.hasMore} nextStep={engagePage.nextStep} onMore={engagePage.showMore} />
              </div>
            </>
          )}
        </div>
      </div>

      </>)}

      {adminTab === "more" && (<>
      <SupportCard />

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
      </>)}

      {/* Full item editor — every Add-form field plus price & expiry. */}
      {editModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditModal(null)}>
          <div ref={editPanelRef} tabIndex={-1} role="dialog" aria-modal="true" className="bg-surface rounded-2xl shadow-xl w-full max-w-sm overflow-hidden max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
              <h2 className="font-semibold text-[15px] min-w-0 truncate">{t("admin.edit_item_title", { name: editModal.name || "—" })}</h2>
              <button className="btn-ghost text-[13px] px-2.5 py-1 flex-shrink-0" onClick={() => setEditModal(null)} aria-label={t("shell.close")}><span aria-hidden="true">✕</span></button>
            </div>
            <div className="p-4 space-y-3">
              <Field label={t("admin.f_item_name")}>
                <input className="input" value={editModal.name} onChange={setEdit("name")} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("admin.f_category_opt")}>
                  <input className="input" value={editModal.category} onChange={setEdit("category")} placeholder={t("admin.ph_category")} />
                </Field>
                <Field label={t("admin.f_unit")}>
                  <select className="input" value={editModal.unit} onChange={setEdit("unit")}>
                    <option value="unit">{t("admin.unit_unit")}</option>
                    <option value="carton">{t("admin.unit_carton")}</option>
                    <option value="pack">{t("admin.unit_pack")}</option>
                    <option value="box">{t("admin.unit_box")}</option>
                    <option value="case">{t("admin.unit_case")}</option>
                  </select>
                </Field>
              </div>
              <Field label={t("common.location")}>
                <select className="input" value={editModal.locationId} onChange={setEdit("locationId")}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <div>
                <span className="label">{t("admin.f_barcode_opt")}</span>
                <div className="flex gap-2">
                  <input className="input font-mono min-w-0" value={editModal.barcode} onChange={setEdit("barcode")} placeholder={t("admin.ph_scan_type")} />
                  <button type="button" className="btn-ghost whitespace-nowrap px-3 flex-shrink-0"
                    onClick={() => { setScanTarget("edit"); setScanOpen(true); }}>{t("admin.scan_btn")}</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("admin.f_price_opt")}>
                  <input className="input font-mono" type="number" inputMode="decimal" min="0" step="0.01"
                    value={editModal.price} onChange={setEdit("price")} placeholder="0.00" />
                </Field>
                <Field label={t("admin.f_expiry_opt")}>
                  <input className="input" type="date" value={editModal.expiresAt} onChange={setEdit("expiresAt")} />
                </Field>
              </div>
              <p className="text-xs text-muted leading-relaxed">{t("admin.edit_item_hint")}</p>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={saveEditItem}>{t("admin.modal_save")}</button>
                <button className="btn-ghost w-auto px-4" onClick={() => setEditModal(null)}>{t("admin.modal_cancel")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIN-reset / email dialog — replaces the old browser prompt()s. */}
      {staffModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setStaffModal(null)}>
          <div ref={staffPanelRef} tabIndex={-1} role="dialog" aria-modal="true" className="bg-surface rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
              <h2 className="font-semibold text-[15px] min-w-0">
                {staffModal.kind === "pin"
                  ? t("admin.prompt_reset_pin", { name: staffModal.user.name, n: PIN_LENGTH })
                  : t("admin.modal_email_title", { name: staffModal.user.name })}
              </h2>
              <button className="btn-ghost text-[13px] px-2.5 py-1 flex-shrink-0" onClick={() => setStaffModal(null)} aria-label={t("shell.close")}><span aria-hidden="true">✕</span></button>
            </div>
            <div className="p-4 space-y-3">
              {staffModal.kind === "pin" ? (
                <input className="input font-mono" type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={PIN_LENGTH} autoFocus
                  value={staffModalVal} placeholder="123456"
                  onChange={(e) => setStaffModalVal(e.target.value.replace(/\D/g, ""))} />
              ) : (
                <input className="input" type="email" inputMode="email" autoFocus value={staffModalVal}
                  placeholder={t("admin.ph_email")} onChange={(e) => setStaffModalVal(e.target.value)} />
              )}
              {staffModal.kind === "email" && <p className="text-xs text-muted">{t("admin.modal_email_hint")}</p>}
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={saveStaffModal}
                  disabled={staffModal.kind === "pin" && !isValidNewPin(staffModalVal.trim())}>
                  {t("admin.modal_save")}
                </button>
                <button className="btn-ghost w-auto px-4" onClick={() => setStaffModal(null)}>{t("admin.modal_cancel")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky unsaved-changes pill: the settings card is long and its Save
          button lives at the bottom — this follows the owner until they save. */}
      {isOwner && settingsDirty && (
        <div className="fixed inset-x-0 bottom-20 sm:bottom-4 z-30 px-4 pointer-events-none">
          <div className="max-w-3xl mx-auto flex justify-end">
            <div className="pointer-events-auto flex items-center gap-3 bg-surface border border-brass rounded-full shadow-lg pl-4 pr-1.5 py-1.5">
              <span className="text-[13px] font-semibold">{t("admin.unsaved")}</span>
              <button type="button" className="btn-primary w-auto px-4 py-2 text-[13px] rounded-full" disabled={savingSettings} onClick={saveSettings}>
                {savingSettings ? t("common.saving") : t("admin.save_settings")}
              </button>
            </div>
          </div>
        </div>
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        title={t("admin.scan_item_title")}
        hint={t("admin.scan_item_hint")}
        onDetected={(code) => {
          if (scanTarget === "edit") setEditModal((p) => (p ? { ...p, barcode: code } : p));
          else setNi((p) => ({ ...p, barcode: code }));
          setScanOpen(false);
          onToast?.(t("admin.toast_scanned"));
        }} />
    </div>
  );
}
