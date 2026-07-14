"use client";
import { useEffect, useMemo, useState } from "react";
import { watchEntries, watchLocations, watchDrawers, watchItems, watchNotes, watchPacks, watchIncidents, watchSwapBoard } from "@/lib/data";
import { useSession } from "./SessionProvider";
import CashForm from "./CashForm";
import ScratchForm from "./ScratchForm";
import InventoryForm from "./InventoryForm";
import LogList from "./LogList";
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
import EmptyState, { IconStore, IconReceipt, IconBox } from "./EmptyState";
import { setupProgress } from "@/lib/setup-progress";
import { attentionCounts } from "@/lib/attention";
import { resolveShortcut } from "@/lib/shortcuts";
import { PRODUCT } from "@/lib/store";

const TABS = [
  { id: "cash", label: "Cash" },
  { id: "scratch", label: "Scratch-offs" },
  { id: "inventory", label: "Inventory" },
  { id: "log", label: "Log" },
  { id: "notes", label: "Notes" },
  { id: "incidents", label: "Incidents" },
  { id: "time", label: "Time" },
  { id: "dashboard", label: "Dashboard" },
  { id: "portfolio", label: "Portfolio", ownerOnly: true },
  { id: "admin", label: "Admin", managerOnly: true },
];

// Which tabs this person sees. ownerOnly is a product affordance, not a new
// security boundary — a manager can already read every location via Reports.
const visibleTabs = (isManager, isOwner) =>
  TABS.filter((t) => (!t.managerOnly || isManager) && (!t.ownerOnly || isOwner));

export default function AppShell() {
  const { profile, vendor, logout, isManager, isOwner } = useSession();
  const [tab, setTab] = useState("cash");
  const [entries, setEntries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [drawers, setDrawers] = useState([]);
  const [items, setItems] = useState([]);
  const [packs, setPacks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [swaps, setSwaps] = useState([]);
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
    const u6 = watchPacks(vendor.id, setPacks);
    // Write-ups: employees may only query incidents where they're the subject.
    const u7 = watchIncidents(vendor.id, isManager ? null : profile.id, setIncidents);
    // Swap board — only a manager needs it, and only to badge pending approvals.
    const u8 = isManager ? watchSwapBoard(vendor.id, setSwaps) : () => {};
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); };
  }, [vendor.id, lockedLoc, isManager, profile.id]);

  const activeLocations = locations.filter((l) => l.active !== false);
  const canPickLocation = isManager || !perLocation;
  const locName = (id) => locations.find((l) => l.id === id)?.name || "—";

  const visibleEntries = useMemo(() => {
    if (lockedLoc) return entries;
    if (viewLoc === "all") return entries;
    return entries.filter((e) => e.locationId === viewLoc);
  }, [entries, viewLoc, lockedLoc]);

  // Packs scoped to the same view as the entries, so the Dashboard's scratch
  // settle-shortfall signal matches the location the manager is looking at.
  const visiblePacks = useMemo(() => {
    const loc = lockedLoc || (viewLoc === "all" ? null : viewLoc);
    return loc ? packs.filter((p) => p.locationId === loc) : packs;
  }, [packs, viewLoc, lockedLoc]);

  function ping(msg) { setToast(msg); setTimeout(() => setToast(""), 2200); }

  const tabs = visibleTabs(isManager, isOwner);
  const showLocFilter = canPickLocation && activeLocations.length > 1 && ["log", "dashboard"].includes(tab);

  // First-run onboarding: derive what's set up, and only trust "empty" once the
  // relevant snapshots have arrived (so existing stores never flash an empty
  // state). The count tabs fall back to a guiding EmptyState until their
  // prerequisites exist; the checklist banner steers managers to Admin.
  const setup = setupProgress(locations, drawers, items);
  const setupReady = loaded.locations && loaded.drawers && loaded.items;
  const goAdmin = () => setTab("admin");
  const adminAction = isManager ? { onClick: goAdmin, label: "Set up in Admin →" } : undefined;

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
    const ids = visibleTabs(isManager, isOwner).map((t) => t.id);
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
  }, [isManager, isOwner, tab]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-ink text-paper px-4 py-3 pt-safe px-safe flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo src={vendor.logoUrl || "/logo.png"} alt={`${vendor.name} logo`} size={32} />
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate leading-tight">{vendor.name}</h1>
            <p className="text-[11px] text-[#c9c6bd] font-mono leading-tight truncate">code: {vendor.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 max-w-[112px] sm:max-w-[150px]">
            <b className="truncate">
              <span className="sm:hidden">{firstName}</span>
              <span className="hidden sm:inline">{profile.name}</span>
            </b>
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${isManager ? "bg-[#c9a25a]" : "bg-brass"} text-ink font-bold`}>
              {profile.role === "owner" ? "Own" : profile.role === "manager" ? "Mgr" : "Emp"}
            </span>
          </span>
          <PreferencesMenu onSignOut={logout} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 pb-28 sm:pb-4">
        <div className="hidden sm:flex gap-1.5 bg-surface border border-line rounded-xl p-1.5 mb-4 shadow-sm overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 whitespace-nowrap px-3 py-2 rounded-lg font-semibold text-sm transition inline-flex items-center justify-center gap-1.5 ${tab === t.id ? "bg-fg text-surface" : "text-muted hover:text-fg"}`}>
              {t.label}
              {tabAttention[t.id] > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brass text-ink text-[10px] font-bold leading-none"
                  aria-label={`${tabAttention[t.id]} need attention`}>
                  {tabAttention[t.id]}
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
              <option value="all">All locations</option>
              {activeLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}

        {tab === "cash" && (
          setupReady && !setup.hasLocation ? (
            <EmptyState icon={<IconStore />} title="No store location yet" action={adminAction}
              subtitle={isManager
                ? "Add your first store location in Admin, then a cash drawer — then your team can start counting."
                : "Your manager is still setting up this store. Counting opens up once a location and drawer exist."} />
          ) : setupReady && !setup.hasDrawer ? (
            <EmptyState icon={<IconReceipt />} title="No cash drawer yet" action={adminAction}
              subtitle={isManager
                ? "Add a cash drawer or register in Admin, then you can record the open and close counts."
                : "Your manager needs to add a cash drawer before counts can be recorded here."} />
          ) : (
            <CashForm onSaved={ping} locations={activeLocations} drawers={drawers} locName={locName} />
          )
        )}
        {tab === "scratch" && (
          setupReady && !setup.hasLocation ? (
            <EmptyState icon={<IconStore />} title="No store location yet" action={adminAction}
              subtitle={isManager
                ? "Add a store location and a drawer in Admin, then you can log scratch-off packs here."
                : "Your manager is still setting up this store. Scratch-off logging opens up once a location and drawer exist."} />
          ) : setupReady && !setup.hasDrawer ? (
            <EmptyState icon={<IconReceipt />} title="No drawer yet" action={adminAction}
              subtitle={isManager
                ? "Add a drawer or register in Admin (a lottery drawer works well), then you can log packs."
                : "Your manager needs to add a drawer before scratch-off packs can be logged."} />
          ) : (
            <ScratchForm onSaved={ping} locations={activeLocations} drawers={drawers} locName={locName} entries={entries} packs={packs} />
          )
        )}
        {tab === "inventory" && (
          setupReady && !setup.hasLocation ? (
            <EmptyState icon={<IconStore />} title="No store location yet" action={adminAction}
              subtitle={isManager
                ? "Add a store location in Admin, then add the items you want to track."
                : "Your manager is still setting up this store. Inventory counts open up once items are added."} />
          ) : setupReady && !setup.hasItem ? (
            <EmptyState icon={<IconBox />} title="No items to track yet" action={adminAction}
              subtitle={isManager
                ? "Add the stock you want to watch — cigarettes, vapes, anything high-shrink — in Admin."
                : "Your manager hasn't added any inventory items to track yet."} />
          ) : (
            <InventoryForm onSaved={ping} locations={activeLocations} items={items} entries={entries} locName={locName} />
          )
        )}
        {tab === "log" && <LogList entries={visibleEntries} onToast={ping} locName={locName} showLocation={activeLocations.length > 1} />}
        {tab === "notes" && <NotesPanel notes={notes} locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "incidents" && <IncidentsPanel incidents={incidents} locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "time" && <TimeClock locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "dashboard" && (
          <Dashboard entries={visibleEntries} packs={visiblePacks} locations={activeLocations} locName={locName} incidents={incidents}
            onOpenLog={() => setTab("log")} onRecord={() => setTab("cash")} onToast={ping} />
        )}
        {tab === "portfolio" && isOwner && (
          <PortfolioView locations={activeLocations} locName={locName} incidents={incidents} onGoAdmin={goAdmin} />
        )}
        {tab === "admin" && isManager && <AdminPanel onToast={ping} locations={locations} drawers={drawers} items={items} packs={packs} entries={entries} />}
      </main>

      <footer className="mt-10 border-t border-line-soft pb-28 sm:pb-0">
        <div className="max-w-3xl mx-auto px-4 px-safe pb-safe pt-6 pb-6">
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <Logo src="/logo.png" alt="DuoCount" size={28} />
            <div className="text-center leading-tight">
              <p className="text-sm font-semibold text-fg">DuoCount</p>
              <p className="text-[11px] text-muted italic">{PRODUCT.tagline}</p>
            </div>
          </div>

          <p className="text-center text-[12px] text-muted mb-2.5">
            Paper backup forms — print a stack for the register in case a phone isn&apos;t handy
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            <a href="/forms/cash-drawer-log.pdf" download
              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full border bg-subtle text-fg hover:border-brass transition"
              style={{ borderColor: "var(--line)" }}
              aria-label="Download the cash drawer log PDF form">
              <span aria-hidden="true">📄</span> Cash drawer log
            </a>
            <a href="/forms/scratch-off-log.pdf" download
              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full border bg-subtle text-fg hover:border-brass transition"
              style={{ borderColor: "var(--line)" }}
              aria-label="Download the scratch-off log PDF form">
              <span aria-hidden="true">📄</span> Scratch-off log
            </a>
          </div>

          <p className="text-center text-[11px] text-faint mt-5">Built for the register · Works offline</p>
          <p className="hidden sm:block text-center text-[11px] text-faint mt-1.5">
            Press <Kbd>?</Kbd> for keyboard shortcuts
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
          onClick={() => setShowHelp(false)} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[15px]">Keyboard shortcuts</h2>
              <button onClick={() => setShowHelp(false)} aria-label="Close"
                className="text-muted hover:text-fg text-lg leading-none px-1">✕</button>
            </div>
            <dl className="space-y-3 text-sm">
              {[
                [<span key="k" className="flex items-center gap-1"><Kbd>1</Kbd><span className="text-faint">–</span><Kbd>{tabs.length}</Kbd></span>, "Jump to a tab"],
                [<span key="k" className="flex items-center gap-1"><Kbd>[</Kbd><Kbd>]</Kbd></span>, "Previous / next tab"],
                [<span key="k" className="flex items-center gap-1"><Kbd>{cmdKey}</Kbd><span className="text-faint">+</span><Kbd>Enter</Kbd></span>, "Save the current form"],
                [<Kbd key="k">?</Kbd>, "Toggle this help"],
                [<Kbd key="k">Esc</Kbd>, "Close"],
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
