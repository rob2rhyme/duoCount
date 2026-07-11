"use client";
import { useEffect, useMemo, useState } from "react";
import { watchEntries, watchLocations, watchDrawers, watchItems, watchNotes, watchPacks, watchIncidents } from "@/lib/data";
import { useSession } from "./SessionProvider";
import CashForm from "./CashForm";
import ScratchForm from "./ScratchForm";
import InventoryForm from "./InventoryForm";
import LogList from "./LogList";
import NotesPanel from "./NotesPanel";
import IncidentsPanel from "./IncidentsPanel";
import Dashboard from "./Dashboard";
import AdminPanel from "./AdminPanel";
import Logo from "./Logo";
import PreferencesMenu from "./PreferencesMenu";

const TABS = [
  { id: "cash", label: "Cash" },
  { id: "scratch", label: "Scratch-offs" },
  { id: "inventory", label: "Inventory" },
  { id: "log", label: "Log" },
  { id: "notes", label: "Notes" },
  { id: "incidents", label: "Incidents" },
  { id: "dashboard", label: "Dashboard" },
  { id: "admin", label: "Admin", managerOnly: true },
];

export default function AppShell() {
  const { profile, vendor, logout, isManager } = useSession();
  const [tab, setTab] = useState("cash");
  const [entries, setEntries] = useState([]);
  const [locations, setLocations] = useState([]);
  const [drawers, setDrawers] = useState([]);
  const [items, setItems] = useState([]);
  const [packs, setPacks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [viewLoc, setViewLoc] = useState("all");
  const [toast, setToast] = useState("");

  // Employees in per-location mode may only read their own location's
  // entries — the query must match the security rules.
  const perLocation = vendor.sharingMode === "per-location";
  const lockedLoc = !isManager && perLocation ? profile.locationId : null;

  useEffect(() => {
    const u1 = watchEntries(vendor.id, lockedLoc, setEntries);
    const u2 = watchLocations(vendor.id, setLocations);
    const u3 = watchDrawers(vendor.id, setDrawers);
    const u4 = watchItems(vendor.id, setItems);
    const u5 = watchNotes(vendor.id, lockedLoc, setNotes);
    const u6 = watchPacks(vendor.id, setPacks);
    // Write-ups: employees may only query incidents where they're the subject.
    const u7 = watchIncidents(vendor.id, isManager ? null : profile.id, setIncidents);
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); };
  }, [vendor.id, lockedLoc, isManager, profile.id]);

  const activeLocations = locations.filter((l) => l.active !== false);
  const canPickLocation = isManager || !perLocation;
  const locName = (id) => locations.find((l) => l.id === id)?.name || "—";

  const visibleEntries = useMemo(() => {
    if (lockedLoc) return entries;
    if (viewLoc === "all") return entries;
    return entries.filter((e) => e.locationId === viewLoc);
  }, [entries, viewLoc, lockedLoc]);

  function ping(msg) { setToast(msg); setTimeout(() => setToast(""), 2200); }

  const tabs = TABS.filter((t) => !t.managerOnly || isManager);
  const showLocFilter = canPickLocation && activeLocations.length > 1 && ["log", "dashboard"].includes(tab);

  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-20 bg-ink text-paper px-4 py-3 pt-safe px-safe flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Logo src={vendor.logoUrl} alt={`${vendor.name} logo`} size={32} />
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate leading-tight">{vendor.name}</h1>
            <p className="text-[11px] text-[#c9c6bd] font-mono leading-tight truncate">code: {vendor.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 max-w-[112px] sm:max-w-[150px]">
            <b className="truncate">{profile.name}</b>
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${isManager ? "bg-[#c9a25a]" : "bg-brass"} text-ink font-bold`}>
              {profile.role === "owner" ? "Own" : profile.role === "manager" ? "Mgr" : "Emp"}
            </span>
          </span>
          <PreferencesMenu onSignOut={logout} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex gap-1.5 bg-surface border border-line rounded-xl p-1.5 mb-4 shadow-sm overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 whitespace-nowrap px-3 py-2 rounded-lg font-semibold text-sm transition ${tab === t.id ? "bg-fg text-surface" : "text-muted hover:text-fg"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {showLocFilter && (
          <div className="mb-4">
            <select className="input" value={viewLoc} onChange={(e) => setViewLoc(e.target.value)}>
              <option value="all">All locations</option>
              {activeLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}

        {tab === "cash" && (
          <CashForm onSaved={ping} locations={activeLocations} drawers={drawers} locName={locName} />
        )}
        {tab === "scratch" && (
          <ScratchForm onSaved={ping} locations={activeLocations} drawers={drawers} locName={locName} entries={entries} packs={packs} />
        )}
        {tab === "inventory" && (
          <InventoryForm onSaved={ping} locations={activeLocations} items={items} entries={entries} locName={locName} />
        )}
        {tab === "log" && <LogList entries={visibleEntries} onToast={ping} locName={locName} showLocation={activeLocations.length > 1} />}
        {tab === "notes" && <NotesPanel notes={notes} locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "incidents" && <IncidentsPanel incidents={incidents} locations={activeLocations} locName={locName} onToast={ping} />}
        {tab === "dashboard" && (
          <Dashboard entries={visibleEntries} locations={activeLocations} locName={locName}
            onOpenLog={() => setTab("log")} onToast={ping} />
        )}
        {tab === "admin" && isManager && <AdminPanel onToast={ping} locations={locations} drawers={drawers} items={items} packs={packs} entries={entries} />}
      </main>

      <footer className="max-w-3xl mx-auto px-4 pt-2 text-center text-[12px] text-muted">
        <p className="mb-1.5">Paper backup forms — print a stack for the register in case a phone isn&apos;t handy:</p>
        <div className="flex justify-center gap-4 flex-wrap">
          <a href="/forms/cash-drawer-log.pdf" download
            className="underline underline-offset-2 font-medium"
            aria-label="Download the cash drawer log PDF form">📄 Cash drawer log</a>
          <a href="/forms/scratch-off-log.pdf" download
            className="underline underline-offset-2 font-medium"
            aria-label="Download the scratch-off log PDF form">📄 Scratch-off log</a>
        </div>
      </footer>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-paper px-5 py-3 rounded-full text-sm font-medium shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
