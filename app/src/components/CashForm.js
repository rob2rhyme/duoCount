"use client";
import { useEffect, useState } from "react";
import { addEntry } from "@/lib/data";
import { money, expectedCash } from "@/lib/utils";
import { useSession } from "./SessionProvider";

const today = () => new Date().toISOString().slice(0, 10);

export default function CashForm({ onSaved, locations, drawers, locName }) {
  const { profile, vendor, isManager } = useSession();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;
  const [f, setF] = useState({
    date: today(), shift: "open", locationId: "", drawerId: "",
    start: "", sales: "", paidout: "", counted: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  // default location: locked one, else first active
  useEffect(() => {
    if (!f.locationId && (lockedLoc || locations[0]))
      setF((p) => ({ ...p, locationId: lockedLoc || locations[0].id }));
  }, [locations, lockedLoc]); // eslint-disable-line

  const locDrawers = drawers.filter((d) => d.active !== false && d.locationId === f.locationId);
  // default drawer: prefer one named like "POS"
  useEffect(() => {
    if (locDrawers.length && !locDrawers.some((d) => d.id === f.drawerId)) {
      const pos = locDrawers.find((d) => /pos/i.test(d.name)) || locDrawers[0];
      setF((p) => ({ ...p, drawerId: pos.id }));
    }
  }, [f.locationId, drawers]); // eslint-disable-line

  const expected = expectedCash(f);
  const diff = (Number(f.counted) || 0) - expected;
  const diffClass = Math.abs(diff) < 0.005 ? "text-ink" : diff > 0 ? "text-green-700" : "text-red-600";
  const drawer = locDrawers.find((d) => d.id === f.drawerId);

  // Blind mode hides the readout for everyone (managers included) until the
  // count is committed; the entry itself is append-only, so the number is
  // locked before the counter sees the target.
  const blind = vendor.blindCounts === true;
  const threshold = Number(vendor.varianceThreshold ?? 5);

  async function save() {
    if (!f.locationId) return onSaved?.("Pick a location first");
    if (!drawer) return onSaved?.("Pick a drawer first");
    if (blind && !confirm("You're committing a blind count. Entries can't be edited after saving.")) return;
    setBusy(true);
    try {
      const flagged = Math.abs(diff) >= threshold;
      await addEntry(vendor.id, {
        kind: "cash", date: f.date, shift: f.shift,
        locationId: f.locationId, locationName: locName(f.locationId),
        drawerId: drawer.id, drawerName: drawer.name,
        start: Number(f.start) || 0, sales: Number(f.sales) || 0,
        paidout: Number(f.paidout) || 0, counted: Number(f.counted) || 0,
        expected, diff, blind,
        flagged, varianceStatus: flagged ? "open" : "none",
        by: profile.name, byId: profile.id, byRole: profile.role,
      });
      setF((p) => ({ ...p, start: "", sales: "", paidout: "", counted: "" }));
      // In blind mode the result is revealed only after the commit.
      const result = Math.abs(diff) < 0.005 ? "balanced"
        : diff > 0 ? `over ${money(diff)}` : `short ${money(Math.abs(diff))}`;
      onSaved?.(blind ? `Saved — ${result}` : "Cash entry signed & saved");
    } catch (e) { console.error(e); onSaved?.("Save failed — check connection"); }
    setBusy(false);
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[#dcd8cc]">
        <h2 className="font-semibold text-[15px]">New drawer count</h2>
      </div>
      <div className="p-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="label">Location</label>
            <select className="input" value={f.locationId} onChange={set("locationId")} disabled={!!lockedLoc}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></div>
          <div><label className="label">Cash drawer</label>
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
          <div><label className="label">Starting drawer</label><input type="number" inputMode="decimal" className="input" value={f.start} onChange={set("start")} placeholder="0.00" /></div>
          <div><label className="label">Cash sales</label><input type="number" inputMode="decimal" className="input" value={f.sales} onChange={set("sales")} placeholder="0.00" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <div><label className="label">Paid out / drops</label><input type="number" inputMode="decimal" className="input" value={f.paidout} onChange={set("paidout")} placeholder="0.00" /></div>
          <div><label className="label">Counted at close</label><input type="number" inputMode="decimal" className="input" value={f.counted} onChange={set("counted")} placeholder="0.00" /></div>
        </div>

        {blind ? (
          <div className="bg-[#faf8f2] border border-dashed border-[#dcd8cc] rounded-xl px-3.5 py-4 text-center">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Blind count</div>
            <div className="text-sm text-neutral-500 mt-1">Result shown after you save</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-[#dcd8cc] rounded-xl overflow-hidden">
            <div className="bg-[#faf8f2] px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Expected in drawer</div>
              <div className="text-xl font-bold font-mono mt-0.5">{money(expected)}</div>
            </div>
            <div className="bg-[#faf8f2] px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">Over / short</div>
              <div className={`text-xl font-bold font-mono mt-0.5 ${diffClass}`}>{diff >= 0 ? "+" : ""}{money(diff)}</div>
            </div>
          </div>
        )}

        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save & sign entry"}</button>
        <p className="text-xs text-neutral-500 leading-relaxed">Expected = start + sales − paid out. Your name, drawer, location, and time stamp attach automatically.</p>
      </div>
    </div>
  );
}
