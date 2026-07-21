"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { watchEntries, watchLocations, watchDrawers, watchItems, watchNotes, watchIncidents, watchSwapBoard, watchRewardEvents, watchCustomers, watchScratchCatalog, watchStockMoves, watchTimeOff, watchMachines, watchGamingCollections } from "@/lib/data";
import { buildStockAlerts } from "@/lib/stock-alerts";
import { featureEnabled, resolveFeatures } from "@/lib/features";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import CashForm from "./CashForm";
import ScratchForm from "./ScratchForm";
import InventoryForm from "./InventoryForm";
import BackroomStock from "./BackroomStock";
import GamingTab from "./GamingTab";
import LogList from "./LogList";
import RewardsPanel from "./RewardsPanel";
import NotesPanel from "./NotesPanel";
import IncidentsPanel from "./IncidentsPanel";
import Dashboard from "./Dashboard";
import PortfolioView from "./PortfolioView";
import AdminPanel from "./AdminPanel";
import TimeClock from "./TimeClock";
import Logo from "./Logo";
import PreferencesMenu from "./PreferencesMenu";
import SetupChecklist from "./SetupChecklist";
import BottomNav from "./BottomNav";
import TabIcon from "./TabIcon";
import Splash from "./Splash";
import EmptyState, { IconStore, IconReceipt, IconBox } from "./EmptyState";
import { setupProgress } from "@/lib/setup-progress";
import { attentionCounts } from "@/lib/attention";
import { resolveShortcut } from "@/lib/shortcuts";
import { PRODUCT } from "@/lib/store";

// Labels resolve through the i18n catalog (t(labelKey)); the icon (TabIcon,
// keyed by tab id) is the language-neutral recognition anchor a clerk learns,
// per the localization spec's icon-forward treatment — the word reinforces it.
const TABS = [
  { id: "dashboard", labelKey: "nav.dashboard" },
  { id: "cash", labelKey: "nav.cash", featureKey: "cash" },
  { id: "scratch", labelKey: "nav.scratch", featureKey: "scratch" },
  { id: "inventory", labelKey: "nav.inventory", featureKey: "inventory" },
  { id: "gaming", labelKey: "nav.gaming", featureKey: "gaming" },
  { id: "rewards", labelKey: "nav.rewards" },
  { id: "log", labelKey: "nav.log", featureKey: "log" },
  { id: "notes", labelKey: "nav.notes", featureKey: "notes" },
  { id: "incidents", labelKey: "nav.incidents", featureKey: "incidents" },
  { id: "time", labelKey: "nav.time", featureKey: "time" },
  { id: "portfolio", labelKey: "nav.portfolio", ownerOnly: true, featureKey: "portfolio" },
  { id: "admin", labelKey: "nav.admin", ownerOnly: true },
];

// Which tabs this person sees. Portfolio's ownerOnly is a product affordance
// (a manager can already read every location via Reports); Admin's is the
// owner's call — store configuration is the owner's room, managers and
// employees never see the tab. A tab with a `featureKey` also drops out when the
// owner has turned that module off (Admin → Features) — hidden for everyone.
const visibleTabs = (isManager, isOwner, vendor) =>
  TABS.filter((t) => (!t.managerOnly || isManager) && (!t.ownerOnly || isOwner)
    && (!t.featureKey || featureEnabled(vendor, t.featureKey)));

export default function AppShell() {
  const { profile, vendor, logout, isManager, isOwner } = useSession();
  const { t } = useLang();
  // Restore the last-viewed tab so a refresh (or relaunch) returns you to where
  // you were working, not always the Dashboard. Validated against this user's
  // visible tabs below (permissions can change between sessions).
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    try { return localStorage.getItem("duocount-tab") || "dashboard"; } catch { return "dashboard"; }
  });
  const [entries, setEntries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [drawers, setDrawers] = useState([]);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [rewardEvents, setRewardEvents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [scratchCatalog, setScratchCatalog] = useState(null);
  const [viewLoc, setViewLoc] = useState("all");
  const [toast, setToast] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  // Tracks whether the entries/location/drawer/item snapshots have each landed
  // once, so the onboarding + dashboard empty-states only appear after we truly
  // know the store is empty — never as a flash while an existing vendor's data
  // is still loading. `entries` also gates the boot splash below.
  const [loaded, setLoaded] = useState({ entries: false, locations: false, drawers: false, items: false });

  // First name only for the tiny-screen header pill (full name returns at ≥sm).
  const firstName = (profile.name || "").trim().split(/\s+/)[0] || profile.name;
  const cmdKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘" : "Ctrl";

  // Employees in per-location mode may only read their own location's
  // entries — the query must match the security rules.
  const perLocation = vendor.sharingMode === "per-location";
  const lockedLoc = !isManager && perLocation ? profile.locationId : null;

  useEffect(() => {
    const u1 = watchEntries(vendor.id, lockedLoc, (v) => { setEntries(v); setLoaded((p) => (p.entries ? p : { ...p, entries: true })); });
    const u2 = watchLocations(vendor.id, (v) => { setLocations(v); setLoaded((p) => (p.locations ? p : { ...p, locations: true })); });
    const u3 = watchDrawers(vendor.id, (v) => { setDrawers(v); setLoaded((p) => (p.drawers ? p : { ...p, drawers: true })); });
    const u4 = watchItems(vendor.id, (v) => { setItems(v); setLoaded((p) => (p.items ? p : { ...p, items: true })); });
    const u5 = watchNotes(vendor.id, lockedLoc, setNotes);
    // Write-ups: employees may only query incidents where they're the subject.
    const u6 = watchIncidents(vendor.id, isManager ? null : profile.id, setIncidents);
    // Swap board — only a manager needs it, and only to badge pending approvals.
    const u7 = isManager ? watchSwapBoard(vendor.id, setSwaps) : () => {};
    // Scratch-game catalog: powers the scan name/price fill; every team member
    // reads it (the scratch form uses it), so it's not manager-gated.
    const u8 = watchScratchCatalog(vendor.id, setScratchCatalog);
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); };
  }, [vendor.id, lockedLoc, isManager, profile.id]);

  const rewardsOn = vendor?.rewards?.enabled === true;
  // Customer list: anyone who can see the Rewards tab needs it to serve
  // customers (the register flow), so it isn't manager-gated — the rules allow
  // every member to read customers, and phones are masked in the UI.
  useEffect(() => {
    if (!rewardsOn) { setCustomers([]); return undefined; }
    return watchCustomers(vendor.id, setCustomers);
  }, [vendor.id, rewardsOn]);
  // Rewards AUDIT feed — manager-only and only while the program is on. The
  // ledger window is fixed at 90 days (the pattern-rules lookback maximum);
  // the audit lib re-filters to the store's actual windowDays.
  useEffect(() => {
    if (!isManager || !rewardsOn) { setRewardEvents([]); return undefined; }
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    return watchRewardEvents(vendor.id, since, setRewardEvents);
  }, [vendor.id, isManager, rewardsOn]);
  // Backroom movement log — every member (the Backroom history + flow charts
  // read it; pulls themselves go through the trusted route). 30-day window.
  const [stockMoves, setStockMoves] = useState([]);
  useEffect(() => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    return watchStockMoves(vendor.id, since, setStockMoves);
  }, [vendor.id]);
  // Gaming/amusement-machine module. The registry is member-readable (the entry
  // form needs the machine names); the collection ledger is OWNER-ONLY, so only
  // the owner's oversight view subscribes. Both only while the module is on.
  const gamingOn = featureEnabled(vendor, "gaming");
  const [machines, setMachines] = useState([]);
  const [gamingCollections, setGamingCollections] = useState([]);
  useEffect(() => {
    if (!gamingOn) { setMachines([]); return undefined; }
    return watchMachines(vendor.id, setMachines);
  }, [vendor.id, gamingOn]);
  useEffect(() => {
    if (!gamingOn || !isOwner) { setGamingCollections([]); return undefined; }
    return watchGamingCollections(vendor.id, setGamingCollections);
  }, [vendor.id, gamingOn, isOwner]);
  // Pending time-off requests — managers only, to badge the Time tab (the
  // Time-off panel below subscribes on its own for the full list).
  const [timeOff, setTimeOff] = useState([]);
  useEffect(() => {
    if (!isManager) { setTimeOff([]); return undefined; }
    return watchTimeOff(vendor.id, null, setTimeOff);
  }, [vendor.id, isManager]);

  const activeLocations = locations.filter((l) => l.active !== false);
  const canPickLocation = isManager || !perLocation;
  const locName = (id) => locations.find((l) => l.id === id)?.name || "—";

  const visibleEntries = useMemo(() => {
    if (lockedLoc) return entries;
    if (viewLoc === "all") return entries;
    return entries.filter((e) => e.locationId === viewLoc);
  }, [entries, viewLoc, lockedLoc]);

  // Toast, now with an optional one-tap Undo. Callers pass a second argument
  // { fn } — an async reversal — and the toast holds for 8s with an UNDO
  // button. The spine stays append-only: ledgered actions undo via a NEW
  // compensating signed line; admin edits undo by restoring the prior state.
  const toastTimer = useRef(null);
  function ping(msg, undo) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg ? { msg, undo: undo || null } : "");
    toastTimer.current = setTimeout(() => setToast(""), undo ? 8000 : 2200);
  }
  async function runToastUndo() {
    const u = toast?.undo;
    if (!u) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast("");
    try { await u.fn(); } catch (e) { ping(e?.message || t("common.undo_failed")); }
  }

  // Rewards is a register action, so employees only see the tab once the owner
  // enables the program; managers always see it (its empty state routes them
  // to the Reward settings). Both the strip and the shortcut ids share this.
  const rewardsVisible = vendor?.rewards?.enabled === true || isManager;
  const tabs = visibleTabs(isManager, isOwner, vendor)
    .filter((tb) => tb.id !== "rewards" || rewardsVisible)
    .map((tb) => ({ ...tb, label: t(tb.labelKey) }));
  const showLocFilter = canPickLocation && activeLocations.length > 1 && ["log", "dashboard"].includes(tab);
  // A stable signature of the toggleable modules, so effects re-validate when the
  // owner flips a feature (not on every render's fresh `vendor.features` object).
  const featuresSig = JSON.stringify(resolveFeatures(vendor));

  // Persist the active tab so the next load resumes here. If a restored tab
  // isn't available to this user (permissions changed, a disabled module, or a
  // stale value), fall back to the Dashboard so we never land on a blank tab.
  useEffect(() => {
    try { localStorage.setItem("duocount-tab", tab); } catch { /* storage blocked */ }
  }, [tab]);
  useEffect(() => {
    if (!visibleTabs(isManager, isOwner, vendor).some((tb) => (tb.id !== "rewards" || rewardsVisible) && tb.id === tab)) {
      setTab("dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, isOwner, rewardsVisible, featuresSig]);

  // First-run onboarding: derive what's set up, and only trust "empty" once the
  // relevant snapshots have arrived (so existing stores never flash an empty
  // state). The count tabs fall back to a guiding EmptyState until their
  // prerequisites exist; the checklist banner steers managers to Admin.
  const setup = setupProgress(locations, drawers, items);
  const setupReady = loaded.locations && loaded.drawers && loaded.items;
  const goAdmin = () => setTab("admin");
  // Admin is owner-only, so only the owner gets "go to Admin" call-to-actions.
  const adminAction = isOwner ? { onClick: goAdmin, label: t("setup.go_admin") } : undefined;

  // Ambient "needs attention" badges for managers: unresolved variances/disputes
  // (Log), open write-ups (Incidents), and swaps awaiting approval (Time). Pure
  // tally over data we already watch; employees see none.
  const att = useMemo(
    () => (isManager ? attentionCounts({ entries, incidents, swaps, timeOff }) : null),
    [isManager, entries, incidents, swaps, timeOff]
  );
  // Stock notifications for the owner/managers: items past the low-stock or
  // expiry bars badge the Backroom tab, so a live pull that crosses the line
  // is impossible to miss.
  const stockAttention = useMemo(() => {
    if (!isManager) return 0;
    const a = buildStockAlerts(items, { rules: vendor?.stockAlerts });
    return a.lowStock.length + a.expiring.length;
  }, [isManager, items, vendor?.stockAlerts]);
  const tabAttention = {
    ...(att ? { log: att.log, incidents: att.incidents, time: att.time } : {}),
    ...(stockAttention > 0 ? { inventory: stockAttention } : {}),
  };

  // The mobile bottom nav lives at the foot of the viewport; flag the body so
  // the app-wide scroll-to-top FAB lifts clear of it on small screens.
  useEffect(() => {
    document.body.classList.add("has-bottom-nav");
    return () => document.body.classList.remove("has-bottom-nav");
  }, []);

  // Keyboard shortcuts for desktop power users. Digits jump to a tab, [ / ]
  // step through them, ⌘/Ctrl+Enter saves the visible form, ? toggles help.
  // The decision logic lives in resolveShortcut (unit-tested); this effect only
  // wires it to the DOM.
  useEffect(() => {
    const ids = visibleTabs(isManager, isOwner, vendor)
      .filter((tb) => tb.id !== "rewards" || rewardsVisible)
      .map((tb) => tb.id);
    function onKey(e) {
      const el = e.target;
      const typing = el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
      const action = resolveShortcut(e, { tabIds: ids, currentTab: tab, typing });
      if (!action) return;
      e.preventDefault();
      if (action.type === "tab") setTab(action.id);
      else if (action.type === "toggleHelp") setShowHelp((v) => !v);
      else if (action.type === "closeHelp") setShowHelp(false);
      else if (action.type === "save") document.querySelector("main button.btn-primary:not([disabled])")?.click();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // featuresSig is the stable proxy for vendor's feature map (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, isOwner, tab, rewardsVisible, featuresSig]);

  // Hold the branded splash until the core data has loaded once, so a returning
  // user never sees a "No activity yet" flash before their real counts arrive
  // (with IndexedDB persistence this is near-instant; on a cold cache it covers
  // the network round-trip). A safety timeout reveals the app anyway if a
  // listener stalls, so an offline/blocked cache can never trap the user here.
  const [bootTimedOut, setBootTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setBootTimedOut(true), 6000);
    return () => clearTimeout(id);
  }, []);
  const booted = (loaded.entries && loaded.locations && loaded.drawers && loaded.items) || bootTimedOut;
  if (!booted) return <Splash />;

  return (
    // flex column + flex-1 main = the footer sits at the viewport bottom on
    // short pages and below the content on long ones — never mid-screen.
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-ink text-paper px-4 py-3 pt-safe px-safe flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo src={vendor.logoUrl || "/logo.png"} alt={`${vendor.name} logo`} size={32} />
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate leading-tight">{vendor.name}</h1>
            <p className="text-[11px] text-[#c6dbc8] font-mono leading-tight truncate">{t("shell.code", { slug: vendor.slug })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 max-w-[112px] sm:max-w-[150px]">
            <b className="truncate">
              <span className="sm:hidden">{firstName}</span>
              <span className="hidden sm:inline">{profile.name}</span>
            </b>
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${isManager ? "bg-[#8fd6a8] text-ink" : "bg-brass text-white"} font-bold`}>
              {t(`shell.role_${profile.role === "owner" ? "owner" : profile.role === "manager" ? "manager" : "employee"}`)}
            </span>
          </span>
          <PreferencesMenu onSignOut={logout} />
        </div>
      </header>

      {/* No mobile pb-28 here: the footer below already carries the bottom-nav
          clearance, so padding main too doubled up into a dead band of empty
          space between the last card and the footer. */}
      <main className="max-w-3xl mx-auto px-4 py-4 w-full flex-1">
        <div className="hidden sm:flex gap-1.5 bg-surface border border-line rounded-xl p-1.5 mb-4 shadow-sm overflow-x-auto">
          {tabs.map((tb) => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              className={`flex-1 whitespace-nowrap px-3 py-2 rounded-lg font-semibold text-sm transition inline-flex items-center justify-center gap-1.5 ${tab === tb.id ? "bg-fg text-surface" : "text-muted hover:text-fg"}`}>
              <TabIcon id={tb.id} />
              {tb.label}
              {tabAttention[tb.id] > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-alert text-white text-[10px] font-bold leading-none"
                  aria-label={t("nav.need_attention", { n: tabAttention[tb.id] })}>
                  {tabAttention[tb.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {setupReady && tab !== "admin" && (
          <SetupChecklist locations={locations} drawers={drawers} items={items}
            isManager={isOwner} vendorId={vendor.id} onGoAdmin={goAdmin} />
        )}

        {/* On the Dashboard the picker is passed INTO the component so it can
            share one row with the "Reports & export" button; other tabs keep
            the standalone row. */}
        {showLocFilter && tab !== "dashboard" && (
          <div className="mb-4">
            <select className="input" value={viewLoc} onChange={(e) => setViewLoc(e.target.value)}>
              <option value="all">{t("common.all_locations")}</option>
              {activeLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}

        {tab === "cash" && (
          setupReady && !setup.hasLocation ? (
            <EmptyState icon={<IconStore />} title={t("empty.no_location_title")} action={adminAction}
              subtitle={isOwner ? t("empty.cash_loc_mgr") : t("empty.cash_loc_emp")} />
          ) : setupReady && !setup.hasDrawer ? (
            <EmptyState icon={<IconReceipt />} title={t("empty.no_drawer_title")} action={adminAction}
              subtitle={isOwner ? t("empty.cash_drawer_mgr") : t("empty.cash_drawer_emp")} />
          ) : (
            <CashForm onSaved={ping} locations={activeLocations} drawers={drawers} locName={locName} />
          )
        )}
        {tab === "scratch" && (
          setupReady && !setup.hasLocation ? (
            <EmptyState icon={<IconStore />} title={t("empty.no_location_title")} action={adminAction}
              subtitle={isOwner ? t("empty.scratch_loc_mgr") : t("empty.scratch_loc_emp")} />
          ) : (
            <ScratchForm onSaved={ping} locations={activeLocations} locName={locName} entries={entries} catalog={scratchCatalog} />
          )
        )}
        {tab === "inventory" && (
          setupReady && !setup.hasLocation ? (
            <EmptyState icon={<IconStore />} title={t("empty.no_location_title")} action={adminAction}
              subtitle={isOwner ? t("empty.inv_loc_mgr") : t("empty.inv_loc_emp")} />
          ) : setupReady && !setup.hasItem ? (
            <EmptyState icon={<IconBox />} title={t("empty.no_items_title")} action={adminAction}
              subtitle={isOwner ? t("empty.inv_items_mgr") : t("empty.inv_items_emp")} />
          ) : (
            <div className="space-y-4">
              <BackroomStock onToast={ping} items={items} locations={activeLocations} moves={stockMoves} locName={locName} />
              <InventoryForm onSaved={ping} locations={activeLocations} items={items} entries={entries} locName={locName} />
            </div>
          )
        )}
        {tab === "gaming" && (
          <GamingTab machines={machines} collections={gamingCollections} isOwner={isOwner}
            onToast={ping} onGoAdmin={goAdmin} adminAction={adminAction} />
        )}
        {tab === "rewards" && rewardsVisible && <RewardsPanel onToast={ping} customers={customers} rewardEvents={rewardEvents} />}
        {tab === "log" && <LogList entries={visibleEntries} onToast={ping} locName={locName} showLocation={activeLocations.length > 1} />}
        {tab === "notes" && <NotesPanel notes={notes} locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "incidents" && <IncidentsPanel incidents={incidents} locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "time" && <TimeClock locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "dashboard" && (
          <Dashboard entries={visibleEntries} locations={activeLocations} locName={locName} incidents={incidents}
            items={items} rewardEvents={rewardEvents} customers={customers} stockMoves={stockMoves}
            onOpenLog={featureEnabled(vendor, "log") ? () => setTab("log") : undefined}
            onRecord={featureEnabled(vendor, "cash") ? () => setTab("cash") : undefined} onToast={ping}
            locPicker={showLocFilter ? (
              <select className="input" value={viewLoc} onChange={(e) => setViewLoc(e.target.value)}>
                <option value="all">{t("common.all_locations")}</option>
                {activeLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            ) : null} />
        )}
        {tab === "portfolio" && isOwner && (
          <PortfolioView locations={activeLocations} locName={locName} incidents={incidents} onGoAdmin={goAdmin} onToast={ping} />
        )}
        {tab === "admin" && isOwner && <AdminPanel onToast={ping} locations={locations} drawers={drawers} items={items} entries={entries} customers={customers} rewardEvents={rewardEvents} scratchCatalog={scratchCatalog} machines={machines} />}
      </main>

      <footer className="mt-6 border-t border-line-soft pb-28 sm:pb-0">
        <div className="max-w-3xl mx-auto px-4 px-safe pb-safe pt-6 pb-6">
          {/* Brand lockup centers on the page like every other footer item;
              inside it the wordmark + tagline stay left-aligned beside the logo. */}
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <Logo src="/logo.png" alt="DuoCount" size={28} />
            <div className="text-left leading-tight">
              <p className="text-sm font-semibold text-fg">DuoCount</p>
              <p className="text-[11px] text-muted italic">{PRODUCT.tagline}</p>
            </div>
          </div>

          <p className="text-center text-[12px] text-muted mb-2.5">
            {t("shell.paper_forms")}
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            <a href="/forms/cash-drawer-log.pdf" download
              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full border bg-subtle text-fg hover:border-brass transition"
              style={{ borderColor: "var(--line)" }}
              aria-label={t("shell.form_cash_aria")}>
              <span aria-hidden="true">📄</span> {t("shell.form_cash")}
            </a>
            <a href="/forms/scratch-off-log.pdf" download
              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full border bg-subtle text-fg hover:border-brass transition"
              style={{ borderColor: "var(--line)" }}
              aria-label={t("shell.form_scratch_aria")}>
              <span aria-hidden="true">📄</span> {t("shell.form_scratch")}
            </a>
          </div>

          <p className="text-center text-[11px] text-faint mt-5">{t("shell.built_for")}</p>
          <p className="hidden sm:block text-center text-[11px] text-faint mt-1.5">
            {t("shell.press_help_pre")} <Kbd>?</Kbd> {t("shell.press_help_post")}
          </p>
        </div>
      </footer>

      <BottomNav tabs={tabs} current={tab} onSelect={setTab} attention={tabAttention} />

      {toast && (
        <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 bg-ink text-paper px-4 py-2 rounded-full text-sm font-medium shadow-lg z-50 flex items-center gap-3 max-w-[92vw]">
          <span className="min-w-0 truncate py-1 pl-1">{toast.msg}</span>
          {toast.undo && (
            <button type="button" onClick={runToastUndo}
              className="flex-shrink-0 font-bold uppercase tracking-wide text-[12px] px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 transition">
              {t("common.undo")}
            </button>
          )}
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
          onClick={() => setShowHelp(false)} role="dialog" aria-modal="true" aria-label={t("shell.shortcuts_title")}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[15px]">{t("shell.shortcuts_title")}</h2>
              <button onClick={() => setShowHelp(false)} aria-label={t("shell.close")}
                className="text-muted hover:text-fg text-lg leading-none px-1">✕</button>
            </div>
            <dl className="space-y-3 text-sm">
              {[
                [<span key="k" className="flex items-center gap-1"><Kbd>1</Kbd><span className="text-faint">–</span><Kbd>{tabs.length}</Kbd></span>, t("shell.sc_jump")],
                [<span key="k" className="flex items-center gap-1"><Kbd>[</Kbd><Kbd>]</Kbd></span>, t("shell.sc_prevnext")],
                [<span key="k" className="flex items-center gap-1"><Kbd>{cmdKey}</Kbd><span className="text-faint">+</span><Kbd>Enter</Kbd></span>, t("shell.sc_save")],
                [<Kbd key="k">?</Kbd>, t("shell.sc_toggle")],
                [<Kbd key="k">Esc</Kbd>, t("shell.sc_close")],
              ].map(([keys, desc], i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <dt className="text-muted">{desc}</dt>
                  <dd className="flex-shrink-0">{keys}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.6rem] px-1.5 py-0.5 rounded-md bg-subtle border border-line text-[12px] font-mono font-semibold text-fg">
      {children}
    </kbd>
  );
}
