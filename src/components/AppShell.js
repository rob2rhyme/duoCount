"use client";
import { useEffect, useMemo, useState } from "react";
import { watchEntries, watchLocations, watchDrawers, watchItems, watchNotes, watchIncidents, watchSwapBoard, watchRewardEvents, watchCustomers } from "@/lib/data";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import CashForm from "./CashForm";
import ScratchForm from "./ScratchForm";
import InventoryForm from "./InventoryForm";
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
  { id: "cash", labelKey: "nav.cash" },
  { id: "scratch", labelKey: "nav.scratch" },
  { id: "inventory", labelKey: "nav.inventory" },
  { id: "rewards", labelKey: "nav.rewards" },
  { id: "log", labelKey: "nav.log" },
  { id: "notes", labelKey: "nav.notes" },
  { id: "incidents", labelKey: "nav.incidents" },
  { id: "time", labelKey: "nav.time" },
  { id: "portfolio", labelKey: "nav.portfolio", ownerOnly: true },
  { id: "admin", labelKey: "nav.admin", managerOnly: true },
];

// Which tabs this person sees. ownerOnly is a product affordance, not a new
// security boundary — a manager can already read every location via Reports.
const visibleTabs = (isManager, isOwner) =>
  TABS.filter((t) => (!t.managerOnly || isManager) && (!t.ownerOnly || isOwner));

export default function AppShell() {
  const { profile, vendor, logout, isManager, isOwner } = useSession();
  const { t } = useLang();
  const [tab, setTab] = useState("dashboard");
  const [entries, setEntries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [drawers, setDrawers] = useState([]);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [rewardEvents, setRewardEvents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [viewLoc, setViewLoc] = useState("all");
  const [toast, setToast] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  // Tracks whether the location/drawer/item snapshots have each landed once, so
  // the onboarding empty-states only appear after we truly know the store is
  // empty — never as a flash while an existing vendor's data is still loading.
  const [loaded, setLoaded] = useState({ locations: false, drawers: false, items: false });

  // First name only for the tiny-screen header pill (full name returns at ≥sm).
  const firstName = (profile.name || "").trim().split(/\s+/)[0] || profile.name;
  const cmdKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘" : "Ctrl";

  // Employees in per-location mode may only read their own location's
  // entries — the query must match the security rules.
  const perLocation = vendor.sharingMode === "per-location";
  const lockedLoc = !isManager && perLocation ? profile.locationId : null;

  useEffect(() => {
    const u1 = watchEntries(vendor.id, lockedLoc, setEntries);
    const u2 = watchLocations(vendor.id, (v) => { setLocations(v); setLoaded((p) => (p.locations ? p : { ...p, locations: true })); });
    const u3 = watchDrawers(vendor.id, (v) => { setDrawers(v); setLoaded((p) => (p.drawers ? p : { ...p, drawers: true })); });
    const u4 = watchItems(vendor.id, (v) => { setItems(v); setLoaded((p) => (p.items ? p : { ...p, items: true })); });
    const u5 = watchNotes(vendor.id, lockedLoc, setNotes);
    // Write-ups: employees may only query incidents where they're the subject.
    const u6 = watchIncidents(vendor.id, isManager ? null : profile.id, setIncidents);
    // Swap board — only a manager needs it, and only to badge pending approvals.
    const u7 = isManager ? watchSwapBoard(vendor.id, setSwaps) : () => {};
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); };
  }, [vendor.id, lockedLoc, isManager, profile.id]);

  // Rewards audit feeds — manager-only and only while the program is on. The
  // ledger window is fixed at 90 days (the pattern-rules lookback maximum);
  // the audit lib re-filters to the store's actual windowDays.
  const rewardsOn = vendor?.rewards?.enabled === true;
  useEffect(() => {
    if (!isManager || !rewardsOn) { setRewardEvents([]); setCustomers([]); return undefined; }
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const u1 = watchRewardEvents(vendor.id, since, setRewardEvents);
    const u2 = watchCustomers(vendor.id, setCustomers);
    return () => { u1(); u2(); };
  }, [vendor.id, isManager, rewardsOn]);

  const activeLocations = locations.filter((l) => l.active !== false);
  const canPickLocation = isManager || !perLocation;
  const locName = (id) => locations.find((l) => l.id === id)?.name || "—";

  const visibleEntries = useMemo(() => {
    if (lockedLoc) return entries;
    if (viewLoc === "all") return entries;
    return entries.filter((e) => e.locationId === viewLoc);
  }, [entries, viewLoc, lockedLoc]);

  function ping(msg) { setToast(msg); setTimeout(() => setToast(""), 2200); }

  // Rewards is a register action, so employees only see the tab once the owner
  // enables the program; managers always see it (its empty state routes them
  // to the Reward settings). Both the strip and the shortcut ids share this.
  const rewardsVisible = vendor?.rewards?.enabled === true || isManager;
  const tabs = visibleTabs(isManager, isOwner)
    .filter((tb) => tb.id !== "rewards" || rewardsVisible)
    .map((tb) => ({ ...tb, label: t(tb.labelKey) }));
  const showLocFilter = canPickLocation && activeLocations.length > 1 && ["log", "dashboard"].includes(tab);

  // First-run onboarding: derive what's set up, and only trust "empty" once the
  // relevant snapshots have arrived (so existing stores never flash an empty
  // state). The count tabs fall back to a guiding EmptyState until their
  // prerequisites exist; the checklist banner steers managers to Admin.
  const setup = setupProgress(locations, drawers, items);
  const setupReady = loaded.locations && loaded.drawers && loaded.items;
  const goAdmin = () => setTab("admin");
  const adminAction = isManager ? { onClick: goAdmin, label: t("setup.go_admin") } : undefined;

  // Ambient "needs attention" badges for managers: unresolved variances/disputes
  // (Log), open write-ups (Incidents), and swaps awaiting approval (Time). Pure
  // tally over data we already watch; employees see none.
  const att = useMemo(
    () => (isManager ? attentionCounts({ entries, incidents, swaps }) : null),
    [isManager, entries, incidents, swaps]
  );
  const tabAttention = att ? { log: att.log, incidents: att.incidents, time: att.time } : {};

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
    const ids = visibleTabs(isManager, isOwner)
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
  }, [isManager, isOwner, tab, rewardsVisible]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-ink text-paper px-4 py-3 pt-safe px-safe flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo src={vendor.logoUrl || "/logo.png"} alt={`${vendor.name} logo`} size={32} />
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate leading-tight">{vendor.name}</h1>
            <p className="text-[11px] text-[#c9c6bd] font-mono leading-tight truncate">{t("shell.code", { slug: vendor.slug })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 max-w-[112px] sm:max-w-[150px]">
            <b className="truncate">
              <span className="sm:hidden">{firstName}</span>
              <span className="hidden sm:inline">{profile.name}</span>
            </b>
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${isManager ? "bg-[#c9a25a]" : "bg-brass"} text-ink font-bold`}>
              {t(`shell.role_${profile.role === "owner" ? "owner" : profile.role === "manager" ? "manager" : "employee"}`)}
            </span>
          </span>
          <PreferencesMenu onSignOut={logout} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 pb-28 sm:pb-4">
        <div className="hidden sm:flex gap-1.5 bg-surface border border-line rounded-xl p-1.5 mb-4 shadow-sm overflow-x-auto">
          {tabs.map((tb) => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              className={`flex-1 whitespace-nowrap px-3 py-2 rounded-lg font-semibold text-sm transition inline-flex items-center justify-center gap-1.5 ${tab === tb.id ? "bg-fg text-surface" : "text-muted hover:text-fg"}`}>
              <TabIcon id={tb.id} />
              {tb.label}
              {tabAttention[tb.id] > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brass text-ink text-[10px] font-bold leading-none"
                  aria-label={t("nav.need_attention", { n: tabAttention[tb.id] })}>
                  {tabAttention[tb.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {setupReady && tab !== "admin" && (
          <SetupChecklist locations={locations} drawers={drawers} items={items}
            isManager={isManager} vendorId={vendor.id} onGoAdmin={goAdmin} />
        )}

        {showLocFilter && (
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
              subtitle={isManager ? t("empty.cash_loc_mgr") : t("empty.cash_loc_emp")} />
          ) : setupReady && !setup.hasDrawer ? (
            <EmptyState icon={<IconReceipt />} title={t("empty.no_drawer_title")} action={adminAction}
              subtitle={isManager ? t("empty.cash_drawer_mgr") : t("empty.cash_drawer_emp")} />
          ) : (
            <CashForm onSaved={ping} locations={activeLocations} drawers={drawers} locName={locName} />
          )
        )}
        {tab === "scratch" && (
          setupReady && !setup.hasLocation ? (
            <EmptyState icon={<IconStore />} title={t("empty.no_location_title")} action={adminAction}
              subtitle={isManager ? t("empty.scratch_loc_mgr") : t("empty.scratch_loc_emp")} />
          ) : setupReady && !setup.hasDrawer ? (
            <EmptyState icon={<IconReceipt />} title={t("empty.no_drawer_title_scratch")} action={adminAction}
              subtitle={isManager ? t("empty.scratch_drawer_mgr") : t("empty.scratch_drawer_emp")} />
          ) : (
            <ScratchForm onSaved={ping} locations={activeLocations} drawers={drawers} locName={locName} entries={entries} />
          )
        )}
        {tab === "inventory" && (
          setupReady && !setup.hasLocation ? (
            <EmptyState icon={<IconStore />} title={t("empty.no_location_title")} action={adminAction}
              subtitle={isManager ? t("empty.inv_loc_mgr") : t("empty.inv_loc_emp")} />
          ) : setupReady && !setup.hasItem ? (
            <EmptyState icon={<IconBox />} title={t("empty.no_items_title")} action={adminAction}
              subtitle={isManager ? t("empty.inv_items_mgr") : t("empty.inv_items_emp")} />
          ) : (
            <InventoryForm onSaved={ping} locations={activeLocations} items={items} entries={entries} locName={locName} />
          )
        )}
        {tab === "rewards" && rewardsVisible && <RewardsPanel onToast={ping} />}
        {tab === "log" && <LogList entries={visibleEntries} onToast={ping} locName={locName} showLocation={activeLocations.length > 1} />}
        {tab === "notes" && <NotesPanel notes={notes} locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "incidents" && <IncidentsPanel incidents={incidents} locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "time" && <TimeClock locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "dashboard" && (
          <Dashboard entries={visibleEntries} locations={activeLocations} locName={locName} incidents={incidents}
            items={items} rewardEvents={rewardEvents} customers={customers}
            onOpenLog={() => setTab("log")} onRecord={() => setTab("cash")} onToast={ping} />
        )}
        {tab === "portfolio" && isOwner && (
          <PortfolioView locations={activeLocations} locName={locName} incidents={incidents} onGoAdmin={goAdmin} onToast={ping} />
        )}
        {tab === "admin" && isManager && <AdminPanel onToast={ping} locations={locations} drawers={drawers} items={items} entries={entries} customers={customers} />}
      </main>

      <footer className="mt-10 border-t border-line-soft pb-28 sm:pb-0">
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
        <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 bg-ink text-paper px-5 py-3 rounded-full text-sm font-medium shadow-lg z-50">
          {toast}
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
