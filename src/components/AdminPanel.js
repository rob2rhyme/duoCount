"use client";
import { useEffect, useState } from "react";
import {
  watchStaff, apiCreateStaff, apiUpdateStaff,
  addLocation, updateLocation, addDrawer, updateDrawer,
  addItem, updateItem, updateVendorSettings, apiTestDigest, apiSeedDemo,
} from "@/lib/data";
import { useSession } from "./SessionProvider";
import { PATTERN_RULES, resolvePatternRules } from "@/lib/patterns";
import BarcodeScanner from "./BarcodeScanner";
import PacksCard from "./PacksCard";

export default function AdminPanel({ onToast, locations, drawers, items = [], packs = [], entries = [] }) {
  const { profile, vendor, isOwner, setVendor } = useSession();
  const [staff, setStaff] = useState([]);

  useEffect(() => watchStaff(vendor.id, setStaff), [vendor.id]);

  /* ---- staff ---- */
  const [ns, setNs] = useState({ name: "", pin: "", role: "employee", locationId: "" });
  const [busy, setBusy] = useState(false);
  async function createStaff() {
    setBusy(true);
    try {
      await apiCreateStaff({ ...ns, locationId: ns.locationId || locations.find((l) => l.active !== false)?.id });
      setNs({ name: "", pin: "", role: "employee", locationId: "" });
      onToast?.("Staff member added");
    } catch (e) { onToast?.(e.message); }
    setBusy(false);
  }
  async function patchStaff(userId, patch, okMsg) {
    try { await apiUpdateStaff({ userId, ...patch }); onToast?.(okMsg || "Updated"); }
    catch (e) { onToast?.(e.message); }
  }

  /* ---- locations ---- */
  const [newLoc, setNewLoc] = useState("");
  async function createLoc() {
    if (newLoc.trim().length < 2) return onToast?.("Enter a location name");
    try { await addLocation(vendor.id, newLoc); setNewLoc(""); onToast?.("Location added"); }
    catch (e) { onToast?.("Failed — managers only"); }
  }

  /* ---- drawers ---- */
  const [nd, setNd] = useState({ name: "", locationId: "" });
  async function createDrawer() {
    const loc = nd.locationId || locations.find((l) => l.active !== false)?.id;
    if (nd.name.trim().length < 2) return onToast?.("Enter a drawer name");
    if (!loc) return onToast?.("Add a location first");
    try { await addDrawer(vendor.id, nd.name, loc); setNd({ name: "", locationId: "" }); onToast?.("Drawer added"); }
    catch (e) { onToast?.("Failed — managers only"); }
  }

  /* ---- inventory items ---- */
  const [ni, setNi] = useState({ name: "", category: "", unit: "unit", locationId: "", barcode: "" });
  const [scanOpen, setScanOpen] = useState(false);
  async function createItem() {
    const loc = ni.locationId || locations.find((l) => l.active !== false)?.id;
    if (ni.name.trim().length < 2) return onToast?.("Enter an item name");
    if (!loc) return onToast?.("Add a location first");
    try {
      await addItem(vendor.id, { ...ni, locationId: loc });
      setNi({ name: "", category: "", unit: "unit", locationId: "", barcode: "" });
      onToast?.("Item added");
    } catch (e) { onToast?.("Failed — managers only"); }
  }
  async function editItem(it) {
    const name = prompt("Item name:", it.name);
    if (name === null) return;
    const category = prompt("Category (blank for none):", it.category || "");
    if (category === null) return;
    const barcode = prompt("Barcode (blank for none):", it.barcode || "");
    if (barcode === null) return;
    try {
      await updateItem(vendor.id, it.id, {
        name: name.trim() || it.name,
        category: category.trim() || null,
        barcode: barcode.trim() || null,
      });
      onToast?.("Item updated");
    } catch (e) { onToast?.("Failed — managers only"); }
  }

  /* ---- settings ---- */
  const [settings, setSettings] = useState({
    name: vendor.name, logoUrl: vendor.logoUrl || "", sharingMode: vendor.sharingMode,
    blindCounts: vendor.blindCounts === true,
    varianceThreshold: vendor.varianceThreshold ?? 5,
    digestEnabled: vendor.digest?.enabled === true,
    digestRecipients: (vendor.digest?.recipients || []).join(", "),
    digestTz: vendor.digest?.tz || "America/New_York",
    patternRules: { ...PATTERN_RULES, ...(vendor.patternRules || {}) },
  });
  const setRule = (k) => (e) =>
    setSettings((s) => ({ ...s, patternRules: { ...s.patternRules, [k]: e.target.value } }));
  const [testing, setTesting] = useState(false);
  async function saveSettings() {
    // Parse + validate digest recipients (cap 10, basic format check).
    const recipients = settings.digestRecipients.split(/[\s,;]+/).filter(Boolean);
    if (recipients.length > 10) return onToast?.("Max 10 digest recipients");
    if (recipients.some((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)))
      return onToast?.("Check the digest email addresses");
    const threshold = Number(settings.varianceThreshold);
    if (!(threshold >= 0)) return onToast?.("Variance threshold must be a number");
    const patch = {
      name: settings.name, logoUrl: settings.logoUrl.trim() || null,
      sharingMode: settings.sharingMode,
      blindCounts: settings.blindCounts,
      varianceThreshold: threshold,
      patternRules: resolvePatternRules(settings.patternRules),
      digest: {
        enabled: settings.digestEnabled, recipients, tz: settings.digestTz,
        lastSentDate: vendor.digest?.lastSentDate ?? null, // preserved; cron owns it
      },
    };
    try {
      await updateVendorSettings(vendor.id, patch);
      setVendor({ ...vendor, ...patch });
      onToast?.("Settings saved");
    } catch (e) { onToast?.("Only the owner can change settings"); }
  }
  async function sendTestDigest() {
    setTesting(true);
    try { const r = await apiTestDigest(); onToast?.(r.message || "Test digest sent"); }
    catch (e) { onToast?.(e.message); }
    setTesting(false);
  }

  /* ---- demo data (owner only) ---- */
  const [seedBusy, setSeedBusy] = useState("");
  async function loadDemo() {
    if (!confirm("Load sample data?\n\nThis writes demo staff, drawers, and ~3 weeks of counts into THIS business's log. Meant for a demo or test store, not a live one. Re-loading replaces the previous sample set.")) return;
    setSeedBusy("load");
    try {
      const r = await apiSeedDemo("load");
      const c = r.counts || {};
      onToast?.(`Loaded ${c.entries || 0} counts + demo staff, drawers & items`);
    } catch (e) { onToast?.(e.message); }
    setSeedBusy("");
  }
  async function clearDemo() {
    if (!confirm("Remove all sample data?\n\nDeletes only the demo records tagged as sample data — your real counts are untouched.")) return;
    setSeedBusy("clear");
    try {
      const r = await apiSeedDemo("clear");
      const c = r.counts || {};
      const total = Object.values(c).reduce((s, v) => s + (v || 0), 0);
      onToast?.(total ? `Removed ${total} sample records` : "No sample data to remove");
    } catch (e) { onToast?.(e.message); }
    setSeedBusy("");
  }

  const locName = (id) => locations.find((l) => l.id === id)?.name || "All locations";

  return (
    <div className="space-y-4">
      {/* ---------------- staff ---------------- */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">Staff &amp; roles</h2>
          <p className="text-[13px] text-muted mt-0.5">Employees log counts. Managers also verify. Owners control settings.</p>
        </div>
        <div className="p-4 border-b border-line bg-panel">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="label">Name</label><input className="input" value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} placeholder="Sam K." /></div>
            <div><label className="label">PIN (4–6 digits)</label><input className="input font-mono" inputMode="numeric" maxLength={6} value={ns.pin} onChange={(e) => setNs({ ...ns, pin: e.target.value.replace(/\D/g, "") })} placeholder="4321" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="label">Role</label>
              <select className="input" value={ns.role} onChange={(e) => setNs({ ...ns, role: e.target.value })}>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                {isOwner && <option value="owner">Owner</option>}
              </select></div>
            <div><label className="label">Location</label>
              <select className="input" value={ns.locationId} onChange={(e) => setNs({ ...ns, locationId: e.target.value })}>
                {ns.role !== "employee" && <option value="">All locations</option>}
                {locations.filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
          </div>
          <button className="btn-ghost w-full" disabled={busy} onClick={createStaff}>{busy ? "Adding…" : "Add staff member"}</button>
        </div>
        <div>
          {staff.map((u) => {
            const isMe = u.id === profile.id;
            const active = u.active !== false;
            return (
              <div key={u.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    {u.name}
                    {isMe && <span className="pill bg-subtle text-muted">You</span>}
                    {!active && <span className="pill bg-red-100 text-red-700">Inactive</span>}
                  </div>
                  <div className="text-[13px] text-muted">{locName(u.locationId)}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  <select className="input w-auto py-1.5 text-sm" value={u.role} disabled={isMe || (u.role === "owner" && !isOwner)}
                    onChange={(e) => patchStaff(u.id, { role: e.target.value }, `${u.name} is now ${e.target.value}`)}>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="owner" disabled={!isOwner}>Owner</option>
                  </select>
                  <select className="input w-auto py-1.5 text-sm" value={u.locationId || ""} disabled={isMe}
                    onChange={(e) => patchStaff(u.id, { locationId: e.target.value || null })}>
                    <option value="">All locations</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={isMe}
                    onClick={() => patchStaff(u.id, { active: !active }, active ? "Disabled" : "Enabled")}>
                    {active ? "Disable" : "Enable"}
                  </button>
                  <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={isMe}
                    onClick={() => { const p = prompt(`New PIN for ${u.name} (4–6 digits):`); if (p) patchStaff(u.id, { pin: p }, "PIN reset"); }}>
                    Reset PIN
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- locations ---------------- */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line"><h2 className="font-semibold text-[15px]">Locations</h2></div>
        <div className="p-4 border-b border-line bg-panel flex gap-2">
          <input className="input" value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="Downtown store" />
          <button className="btn-ghost whitespace-nowrap" onClick={createLoc}>Add location</button>
        </div>
        {locations.map((l) => (
          <div key={l.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3">
            <div className="font-medium flex items-center gap-2">
              {l.name}
              {l.active === false && <span className="pill bg-red-100 text-red-700">Inactive</span>}
            </div>
            <button className="btn-ghost text-[13px] px-3 py-1.5"
              onClick={() => updateLocation(vendor.id, l.id, { active: !(l.active !== false) }).then(() => onToast?.("Updated")).catch(() => onToast?.("Failed"))}>
              {l.active !== false ? "Disable" : "Enable"}
            </button>
          </div>
        ))}
      </div>

      {/* ---------------- drawers ---------------- */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">Cash drawers</h2>
          <p className="text-[13px] text-muted mt-0.5">Name each drawer staff count — e.g. POS Cash Drawer, Lottery Cash Drawer, Safe.</p>
        </div>
        <div className="p-4 border-b border-line bg-panel">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="label">Drawer name</label><input className="input" value={nd.name} onChange={(e) => setNd({ ...nd, name: e.target.value })} placeholder="Safe Drawer" /></div>
            <div><label className="label">Location</label>
              <select className="input" value={nd.locationId} onChange={(e) => setNd({ ...nd, locationId: e.target.value })}>
                {locations.filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
          </div>
          <button className="btn-ghost w-full" onClick={createDrawer}>Add drawer</button>
        </div>
        {drawers.map((d) => (
          <div key={d.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                {d.name}
                {d.active === false && <span className="pill bg-red-100 text-red-700">Inactive</span>}
              </div>
              <div className="text-[13px] text-muted">{locName(d.locationId)}</div>
            </div>
            <button className="btn-ghost text-[13px] px-3 py-1.5"
              onClick={() => updateDrawer(vendor.id, d.id, { active: !(d.active !== false) }).then(() => onToast?.("Updated")).catch(() => onToast?.("Failed"))}>
              {d.active !== false ? "Disable" : "Enable"}
            </button>
          </div>
        ))}
      </div>

      {/* ---------------- inventory items ---------------- */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">Inventory items</h2>
          <p className="text-[13px] text-muted mt-0.5">The tracked list staff count each shift — start with your 5–15 highest-shrink items, not the whole store.</p>
        </div>
        <div className="p-4 border-b border-line bg-panel">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="label">Item name</label><input className="input" value={ni.name} onChange={(e) => setNi({ ...ni, name: e.target.value })} placeholder="Marlboro Red carton" /></div>
            <div><label className="label">Category (optional)</label><input className="input" value={ni.category} onChange={(e) => setNi({ ...ni, category: e.target.value })} placeholder="Cigarettes" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className="label">Unit</label>
              <select className="input" value={ni.unit} onChange={(e) => setNi({ ...ni, unit: e.target.value })}>
                <option value="unit">Unit</option>
                <option value="carton">Carton</option>
                <option value="pack">Pack</option>
                <option value="box">Box</option>
                <option value="case">Case</option>
              </select></div>
            <div><label className="label">Location</label>
              <select className="input" value={ni.locationId} onChange={(e) => setNi({ ...ni, locationId: e.target.value })}>
                {locations.filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
          </div>
          <div className="mb-3">
            <label className="label">Barcode (optional)</label>
            <div className="flex gap-2">
              <input className="input font-mono" value={ni.barcode} placeholder="Scan or type"
                onChange={(e) => setNi({ ...ni, barcode: e.target.value })} />
              <button type="button" className="btn-ghost whitespace-nowrap px-3" onClick={() => setScanOpen(true)}>📷 Scan</button>
            </div>
          </div>
          <button className="btn-ghost w-full" onClick={createItem}>Add item</button>
        </div>
        {items.map((it) => (
          <div key={it.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                {it.name}
                {it.category && <span className="pill bg-subtle text-muted">{it.category}</span>}
                {it.active === false && <span className="pill bg-red-100 text-red-700">Inactive</span>}
              </div>
              <div className="text-[13px] text-muted">
                {locName(it.locationId)} · counted in {it.unit || "unit"}s
                {it.barcode && <span className="font-mono"> · ▮▯ {it.barcode}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => editItem(it)}>Edit</button>
              <button className="btn-ghost text-[13px] px-3 py-1.5"
                onClick={() => updateItem(vendor.id, it.id, { active: !(it.active !== false) }).then(() => onToast?.("Updated")).catch(() => onToast?.("Failed"))}>
                {it.active !== false ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ---------------- scratch-off packs ---------------- */}
      <PacksCard onToast={onToast} locations={locations} packs={packs} entries={entries} />

      {/* ---------------- settings (owner) ---------------- */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line">
          <h2 className="font-semibold text-[15px]">Business settings</h2>
          <p className="text-[13px] text-muted mt-0.5">Store code: <b className="font-mono">{vendor.slug}</b> — staff use it to sign in.</p>
        </div>
        <div className="p-4 space-y-3.5">
          <div><label className="label">Business name</label>
            <input className="input" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} disabled={!isOwner} /></div>
          <div><label className="label">Logo URL</label>
            <input className="input" value={settings.logoUrl} onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })} disabled={!isOwner} /></div>
          <div>
            <label className="label">Data sharing</label>
            <select className="input" value={settings.sharingMode} onChange={(e) => setSettings({ ...settings, sharingMode: e.target.value })} disabled={!isOwner}>
              <option value="all-locations">Shared — every location sees all logs</option>
              <option value="per-location">Per location — employees see only their location</option>
            </select>
            <p className="text-xs text-muted mt-1.5 leading-relaxed">
              Managers and owners always see every location. Staff already signed in will pick up a sharing change the next time they sign in.
            </p>
          </div>

          <div className="flex items-start gap-3">
            <input id="blindCounts" type="checkbox" className="mt-1" checked={settings.blindCounts}
              disabled={!isOwner}
              onChange={(e) => setSettings({ ...settings, blindCounts: e.target.checked })} />
            <label htmlFor="blindCounts" className="min-w-0">
              <span className="font-medium text-[14px]">Blind counts</span>
              <p className="text-xs text-muted leading-relaxed">Counters can't see the expected total until after they commit the count. Applies to everyone, managers included.</p>
            </label>
          </div>

          <div>
            <label className="label">Variance threshold ($)</label>
            <input type="number" inputMode="decimal" min="0" step="0.5" className="input"
              value={settings.varianceThreshold} disabled={!isOwner}
              onChange={(e) => setSettings({ ...settings, varianceThreshold: e.target.value })} />
            <p className="text-xs text-muted mt-1.5 leading-relaxed">Counts off by this much or more get flagged for review. Changing it only affects new entries.</p>
          </div>

          <div className="border border-line rounded-xl p-3.5 space-y-3 bg-panel">
            <div>
              <span className="font-medium text-[14px]">Alert sensitivity</span>
              <p className="text-xs text-muted leading-relaxed">Tunes the pattern alerts on the dashboard and in the daily digest. The defaults suit most stores — lower the counts to catch more, raise them to cut noise.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Lookback (days)</label>
                <input type="number" inputMode="numeric" min="1" max="90" step="1" className="input"
                  value={settings.patternRules.windowDays} disabled={!isOwner} onChange={setRule("windowDays")} />
              </div>
              <div>
                <label className="label">Repeat counts to flag</label>
                <input type="number" inputMode="numeric" min="2" max="25" step="1" className="input"
                  value={settings.patternRules.minShorts} disabled={!isOwner} onChange={setRule("minShorts")} />
              </div>
              <div>
                <label className="label">High-severity total ($)</label>
                <input type="number" inputMode="decimal" min="1" step="1" className="input"
                  value={settings.patternRules.highShortDollars} disabled={!isOwner} onChange={setRule("highShortDollars")} />
              </div>
              <div>
                <label className="label">Backlog size to alert</label>
                <input type="number" inputMode="numeric" min="1" max="200" step="1" className="input"
                  value={settings.patternRules.minBacklog} disabled={!isOwner} onChange={setRule("minBacklog")} />
              </div>
              <div>
                <label className="label">Unverified after (hours)</label>
                <input type="number" inputMode="numeric" min="1" max="720" step="1" className="input"
                  value={settings.patternRules.staleHours} disabled={!isOwner} onChange={setRule("staleHours")} />
              </div>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              &ldquo;Repeat counts&rdquo; covers both short and over streaks by one person; &ldquo;backlog&rdquo; and &ldquo;unverified after&rdquo; drive the verification and open-variance alerts. Out-of-range values are clamped on save.
            </p>
          </div>

          <div className="border border-line rounded-xl p-3.5 space-y-3 bg-panel">
            <div className="flex items-start gap-3">
              <input id="digestEnabled" type="checkbox" className="mt-1" checked={settings.digestEnabled}
                disabled={!isOwner}
                onChange={(e) => setSettings({ ...settings, digestEnabled: e.target.checked })} />
              <label htmlFor="digestEnabled" className="min-w-0">
                <span className="font-medium text-[14px]">Daily email digest</span>
                <p className="text-xs text-muted leading-relaxed">One email each morning summarizing yesterday's counts, variances, and disputes.</p>
              </label>
            </div>
            <div>
              <label className="label">Recipients (comma-separated, max 10)</label>
              <input className="input" value={settings.digestRecipients} disabled={!isOwner}
                placeholder="owner@store.com, manager@store.com"
                onChange={(e) => setSettings({ ...settings, digestRecipients: e.target.value })} />
            </div>
            <div>
              <label className="label">Timezone</label>
              <select className="input" value={settings.digestTz} disabled={!isOwner}
                onChange={(e) => setSettings({ ...settings, digestTz: e.target.value })}>
                {["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
                  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "UTC"].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-muted">
                Last sent: <b className="font-mono">{vendor.digest?.lastSentDate || "never"}</b>
              </span>
              {isOwner && (
                <button className="btn-ghost text-[13px] px-3 py-1.5" disabled={testing} onClick={sendTestDigest}>
                  {testing ? "Sending…" : "Send test digest now"}
                </button>
              )}
            </div>
          </div>

          {isOwner
            ? <button className="btn-primary" onClick={saveSettings}>Save settings</button>
            : <p className="text-[13px] text-muted italic">Only the owner can change these settings.</p>}
        </div>
      </div>

      {isOwner && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3.5 border-b border-line">
            <h2 className="font-semibold text-[15px]">Demo data</h2>
            <p className="text-[13px] text-muted mt-0.5">Fill this business with realistic sample counts to explore the Log, Dashboard, and reports — then clear it in one tap.</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={!!seedBusy} onClick={loadDemo}>
                {seedBusy === "load" ? "Loading…" : "Load sample data"}
              </button>
              <button className="btn-ghost flex-1" disabled={!!seedBusy} onClick={clearDemo}>
                {seedBusy === "clear" ? "Clearing…" : "Clear sample data"}
              </button>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Sample records are tagged so <b>Clear</b> removes only them — your real counts are never touched.
              Best used on a demo or test store: the entries land in the permanent, append-only log like any other count.
              Demo staff are illustrative (no sign-in); add real staff above.
            </p>
          </div>
        </div>
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        title="Scan item barcode"
        onDetected={(code) => { setNi((p) => ({ ...p, barcode: code })); setScanOpen(false); onToast?.("Scanned"); }} />
    </div>
  );
}
