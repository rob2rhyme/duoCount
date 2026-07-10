"use client";
import { useEffect, useState } from "react";
import { addEntry } from "@/lib/data";
import { money, ticketsSold } from "@/lib/utils";
import { useSession } from "./SessionProvider";

const today = () => new Date().toISOString().slice(0, 10);

export default function ScratchForm({ onSaved, locations, drawers, locName }) {
  const { profile, vendor, isManager } = useSession();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;
  const [f, setF] = useState({
    date: today(), shift: "open", locationId: "", drawerId: "",
    game: "", pack: "", price: "", startno: "", endno: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (!f.locationId && (lockedLoc || locations[0]))
      setF((p) => ({ ...p, locationId: lockedLoc || locations[0].id }));
  }, [locations, lockedLoc]); // eslint-disable-line

  const locDrawers = drawers.filter((d) => d.active !== false && d.locationId === f.locationId);
  // default drawer: prefer one named like "Lottery"
  useEffect(() => {
    if (locDrawers.length && !locDrawers.some((d) => d.id === f.drawerId)) {
      const lot = locDrawers.find((d) => /lott/i.test(d.name)) || locDrawers[0];
      setF((p) => ({ ...p, drawerId: lot.id }));
    }
  }, [f.locationId, drawers]); // eslint-disable-line

  const sold = ticketsSold(f.startno, f.endno);
  const dollars = sold * (Number(f.price) || 0);
  const drawer = locDrawers.find((d) => d.id === f.drawerId);

  async function save() {
    if (!f.locationId) return onSaved?.("Pick a location first");
    if (!drawer) return onSaved?.("Pick a drawer first");
    setBusy(true);
    try {
      await addEntry(vendor.id, {
        kind: "scratch", date: f.date, shift: f.shift,
        locationId: f.locationId, locationName: locName(f.locationId),
        drawerId: drawer.id, drawerName: drawer.name,
        game: f.game.trim() || "Game", pack: f.pack.trim(),
        price: Number(f.price) || 0, startno: Number(f.startno) || 0, endno: Number(f.endno) || 0,
        sold, dollars, by: profile.name, byId: profile.id, byRole: profile.role,
      });
      setF((p) => ({ ...p, pack: "", startno: "", endno: "" }));
      onSaved?.("Scratch-off entry signed & saved");
    } catch (e) { console.error(e); onSaved?.("Save failed — check connection"); }
    setBusy(false);
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[#dcd8cc]">
        <h2 className="font-semibold text-[15px]">Scratch-off pack count</h2>
      </div>
      <div className="p-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="label">Location</label>
            <select className="input" value={f.locationId} onChange={set("locationId")} disabled={!!lockedLoc}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></div>
          <div><label className="label">Drawer</label>
            <select className="input" value={f.drawerId} onChange={set("drawerId")}>
              {locDrawers.length === 0 && <option value="">No drawers — add in Admin</option>}
              {locDrawers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="label">Date</label><input type="date" className="input" value={f.date} onChange={set("date")} /></div>
          <div><label className="label">Shift</label>
            <select className="input" value={f.shift} onChange={set("shift")}>
              <option value="open">Opening</option><option value="close">Closing</option>
            </select></div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="label">Game name</label><input className="input" value={f.game} onChange={set("game")} placeholder="Lucky 7s" /></div>
          <div><label className="label">Pack / book #</label><input className="input" value={f.pack} onChange={set("pack")} placeholder="0000000" /></div>
        </div>
        <div><label className="label">Ticket price</label><input type="number" inputMode="decimal" className="input" value={f.price} onChange={set("price")} placeholder="0.00" /></div>
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="label">Start ticket #</label><input type="number" inputMode="numeric" className="input" value={f.startno} onChange={set("startno")} placeholder="0" /></div>
          <div><label className="label">End ticket #</label><input type="number" inputMode="numeric" className="input" value={f.endno} onChange={set("endno")} placeholder="0" /></div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[#dcd8cc] rounded-xl overflow-hidden">
          <div className="bg-[#faf8f2] px-3.5 py-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Tickets sold</div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${sold > 0 ? "text-green-700" : "text-ink"}`}>{sold}</div>
          </div>
          <div className="bg-[#faf8f2] px-3.5 py-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Dollars sold</div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${sold > 0 ? "text-green-700" : "text-ink"}`}>{money(dollars)}</div>
          </div>
        </div>

        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save & sign entry"}</button>
        <p className="text-xs text-neutral-500 leading-relaxed">End # − start # = tickets sold. That × price must match the drawer — this makes the log self-auditing.</p>
      </div>
    </div>
  );
}
