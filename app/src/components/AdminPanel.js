"use client";
import { useEffect, useState } from "react";
import {
  watchStaff, apiCreateStaff, apiUpdateStaff,
  addLocation, updateLocation, addDrawer, updateDrawer, updateVendorSettings,
} from "@/lib/data";
import { useSession } from "./SessionProvider";

export default function AdminPanel({ onToast, locations, drawers }) {
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

  /* ---- settings ---- */
  const [settings, setSettings] = useState({ name: vendor.name, logoUrl: vendor.logoUrl || "", sharingMode: vendor.sharingMode });
  async function saveSettings() {
    try {
      await updateVendorSettings(vendor.id, { ...settings, logoUrl: settings.logoUrl.trim() || null });
      setVendor({ ...vendor, ...settings, logoUrl: settings.logoUrl.trim() || null });
      onToast?.("Settings saved");
    } catch (e) { onToast?.("Only the owner can change settings"); }
  }

  const locName = (id) => locations.find((l) => l.id === id)?.name || "All locations";

  return (
    <div className="space-y-4">
      {/* ---------------- staff ---------------- */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#dcd8cc]">
          <h2 className="font-semibold text-[15px]">Staff &amp; roles</h2>
          <p className="text-[13px] text-neutral-500 mt-0.5">Employees log counts. Managers also verify. Owners control settings.</p>
        </div>
        <div className="p-4 border-b border-[#dcd8cc] bg-[#faf8f2]">
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
              <div key={u.id} className="px-4 py-3 border-b border-[#dcd8cc] last:border-0 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    {u.name}
                    {isMe && <span className="pill bg-neutral-200 text-neutral-600">You</span>}
                    {!active && <span className="pill bg-red-100 text-red-600">Inactive</span>}
                  </div>
                  <div className="text-[13px] text-neutral-500">{locName(u.locationId)}</div>
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
        <div className="px-4 py-3.5 border-b border-[#dcd8cc]"><h2 className="font-semibold text-[15px]">Locations</h2></div>
        <div className="p-4 border-b border-[#dcd8cc] bg-[#faf8f2] flex gap-2">
          <input className="input" value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="Downtown store" />
          <button className="btn-ghost whitespace-nowrap" onClick={createLoc}>Add location</button>
        </div>
        {locations.map((l) => (
          <div key={l.id} className="px-4 py-3 border-b border-[#dcd8cc] last:border-0 flex items-center justify-between gap-3">
            <div className="font-medium flex items-center gap-2">
              {l.name}
              {l.active === false && <span className="pill bg-red-100 text-red-600">Inactive</span>}
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
        <div className="px-4 py-3.5 border-b border-[#dcd8cc]">
          <h2 className="font-semibold text-[15px]">Cash drawers</h2>
          <p className="text-[13px] text-neutral-500 mt-0.5">Name each drawer staff count — e.g. POS Cash Drawer, Lottery Cash Drawer, Safe.</p>
        </div>
        <div className="p-4 border-b border-[#dcd8cc] bg-[#faf8f2]">
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
          <div key={d.id} className="px-4 py-3 border-b border-[#dcd8cc] last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                {d.name}
                {d.active === false && <span className="pill bg-red-100 text-red-600">Inactive</span>}
              </div>
              <div className="text-[13px] text-neutral-500">{locName(d.locationId)}</div>
            </div>
            <button className="btn-ghost text-[13px] px-3 py-1.5"
              onClick={() => updateDrawer(vendor.id, d.id, { active: !(d.active !== false) }).then(() => onToast?.("Updated")).catch(() => onToast?.("Failed"))}>
              {d.active !== false ? "Disable" : "Enable"}
            </button>
          </div>
        ))}
      </div>

      {/* ---------------- settings (owner) ---------------- */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#dcd8cc]">
          <h2 className="font-semibold text-[15px]">Business settings</h2>
          <p className="text-[13px] text-neutral-500 mt-0.5">Store code: <b className="font-mono">{vendor.slug}</b> — staff use it to sign in.</p>
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
            <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
              Managers and owners always see every location. Staff already signed in will pick up a sharing change the next time they sign in.
            </p>
          </div>
          {isOwner
            ? <button className="btn-primary" onClick={saveSettings}>Save settings</button>
            : <p className="text-[13px] text-neutral-400 italic">Only the owner can change these settings.</p>}
        </div>
      </div>
    </div>
  );
}
