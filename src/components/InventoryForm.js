"use client";
import { useEffect, useMemo, useState } from "react";
import { addEntry } from "@/lib/data";
import { expectedStock } from "@/lib/utils";
import { useSession } from "./SessionProvider";
import BarcodeScanner from "./BarcodeScanner";

const today = () => new Date().toISOString().slice(0, 10);

export default function InventoryForm({ onSaved, locations, items, entries, locName }) {
  const { profile, vendor, isManager } = useSession();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;
  const [f, setF] = useState({
    date: today(), shift: "open", locationId: "", itemId: "",
    startQty: "", received: "", removed: "", soldQty: "", counted: "",
  });
  const [busy, setBusy] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  // default location: locked one, else first active
  useEffect(() => {
    if (!f.locationId && (lockedLoc || locations[0]))
      setF((p) => ({ ...p, locationId: lockedLoc || locations[0].id }));
  }, [locations, lockedLoc]); // eslint-disable-line

  const locItems = useMemo(
    () => items.filter((i) => i.active !== false && i.locationId === f.locationId),
    [items, f.locationId]
  );
  const searchable = locItems.length > 15;
  const shownItems = searchable && itemSearch.trim()
    ? locItems.filter((i) =>
        `${i.name} ${i.category || ""}`.toLowerCase().includes(itemSearch.trim().toLowerCase()))
    : locItems;

  // default item: first available at this location
  useEffect(() => {
    if (locItems.length && !locItems.some((i) => i.id === f.itemId))
      setF((p) => ({ ...p, itemId: locItems[0].id }));
  }, [f.locationId, items]); // eslint-disable-line

  // Prefill startQty from the most recent counted qty for this item+location
  // (entries arrive newest-first from watchEntries). Stays editable.
  useEffect(() => {
    if (!f.itemId || !f.locationId) return;
    const last = entries.find(
      (e) => e.kind === "inventory" && e.itemId === f.itemId && e.locationId === f.locationId
    );
    setF((p) => ({ ...p, startQty: last ? String(last.counted ?? "") : "" }));
  }, [f.itemId, f.locationId]); // eslint-disable-line

  const item = locItems.find((i) => i.id === f.itemId);
  const unit = item?.unit || "unit";
  const expected = expectedStock(f);
  const diff = (Number(f.counted) || 0) - expected;
  const diffClass = diff === 0 ? "text-fg" : diff > 0 ? "text-pos" : "text-neg";

  async function save() {
    if (!f.locationId) return onSaved?.("Pick a location first");
    if (!item) return onSaved?.("Pick an item first — add items in Admin");
    setBusy(true);
    try {
      await addEntry(vendor.id, {
        kind: "inventory", date: f.date, shift: f.shift,
        locationId: f.locationId, locationName: locName(f.locationId),
        itemId: item.id, itemName: item.name, unit,
        startQty: Number(f.startQty) || 0, received: Number(f.received) || 0,
        removed: Number(f.removed) || 0, soldQty: Number(f.soldQty) || 0,
        counted: Number(f.counted) || 0,
        expected, diff, by: profile.name, byId: profile.id, byRole: profile.role,
      });
      setF((p) => ({ ...p, startQty: String(Number(p.counted) || 0), received: "", removed: "", soldQty: "", counted: "" }));
      onSaved?.("Inventory count signed & saved");
    } catch (e) { console.error(e); onSaved?.("Save failed — check connection"); }
    setBusy(false);
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px]">Inventory count</h2>
      </div>
      <div className="p-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="label">Location</label>
            <select className="input" value={f.locationId} onChange={set("locationId")} disabled={!!lockedLoc}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></div>
          <div><label className="label">Item</label>
            <div className="flex gap-2">
              <select className="input min-w-0" value={f.itemId} onChange={set("itemId")}>
                {locItems.length === 0 && <option value="">No items — add in Admin</option>}
                {shownItems.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}{i.category ? ` · ${i.category}` : ""}</option>
                ))}
              </select>
              <button type="button" className="btn-ghost px-2.5 flex-shrink-0" title="Scan item barcode"
                onClick={() => setScanOpen(true)}>📷</button>
            </div></div>
        </div>
        {searchable && (
          <input className="input" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)}
            placeholder={`Search ${locItems.length} items…`} />
        )}
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="label">Date</label><input type="date" className="input" value={f.date} onChange={set("date")} /></div>
          <div><label className="label">Shift</label>
            <select className="input" value={f.shift} onChange={set("shift")}>
              <option value="open">Opening</option><option value="close">Closing</option>
            </select></div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="label">Start qty (last count)</label><input type="number" inputMode="numeric" className="input" value={f.startQty} onChange={set("startQty")} placeholder="0" /></div>
          <div><label className="label">Received (deliveries)</label><input type="number" inputMode="numeric" className="input" value={f.received} onChange={set("received")} placeholder="0" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="label">Sold since last count</label><input type="number" inputMode="numeric" className="input" value={f.soldQty} onChange={set("soldQty")} placeholder="0" /></div>
          <div><label className="label">Removed (damage/returns)</label><input type="number" inputMode="numeric" className="input" value={f.removed} onChange={set("removed")} placeholder="0" /></div>
        </div>
        <div><label className="label">Counted on hand</label><input type="number" inputMode="numeric" className="input" value={f.counted} onChange={set("counted")} placeholder="0" /></div>

        <div className="grid grid-cols-2 gap-px bg-line rounded-xl overflow-hidden">
          <div className="bg-panel px-3.5 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Expected on hand</div>
            <div className="text-xl font-bold font-mono mt-0.5">{expected} <span className="text-sm font-normal text-muted">{unit}s</span></div>
          </div>
          <div className="bg-panel px-3.5 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Over / short</div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${diffClass}`}>{diff >= 0 ? "+" : ""}{diff} <span className="text-sm font-normal text-muted">{unit}s</span></div>
          </div>
        </div>

        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save & sign entry"}</button>
        <p className="text-xs text-muted leading-relaxed">Expected = start + received − sold − removed. Negative over/short means missing stock. Your name, item, location, and time stamp attach automatically.</p>
      </div>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        title="Scan to select item"
        onDetected={(code) => {
          setScanOpen(false);
          const match = locItems.find((i) => i.barcode && i.barcode === code);
          if (match) {
            setF((p) => ({ ...p, itemId: match.id }));
            onSaved?.(`Selected ${match.name}`);
          } else {
            onSaved?.("No item with this barcode here — add it in Admin");
          }
        }} />
    </div>
  );
}
