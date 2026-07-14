"use client";
import { useEffect, useState, useId } from "react";
import { addEntry } from "@/lib/data";
import { money, ticketsSold } from "@/lib/utils";
import { validateScratch } from "@/lib/count-validation";
import { defaultShift, pickRemembered, loadContext, saveContext } from "@/lib/count-context";
import { useSaveState } from "@/lib/use-save-state";
import { useSession } from "./SessionProvider";
import SaveError from "./SaveError";
import Field from "./Field";
import BarcodeScanner from "./BarcodeScanner";

const today = () => new Date().toISOString().slice(0, 10);

export default function ScratchForm({ onSaved, locations, drawers, locName, entries = [], packs = [] }) {
  const { profile, vendor, isManager } = useSession();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;
  const [f, setF] = useState({
    date: today(), shift: defaultShift(new Date().getHours()), locationId: "", drawerId: "",
    game: "", pack: "", price: "", startno: "", endno: "",
  });
  const { busy, error, run } = useSaveState();
  const [scanOpen, setScanOpen] = useState(false);
  const packId = useId();
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (f.locationId || !(lockedLoc || locations[0])) return;
    const remembered = lockedLoc || pickRemembered(loadContext(vendor.id, profile.id).locationId, locations);
    setF((p) => ({ ...p, locationId: remembered }));
  }, [locations, lockedLoc]); // eslint-disable-line

  // Last-count prefill: when the pack (scanned or typed) matches an earlier
  // scratch entry at this location, prefill the game and price, and chain
  // start # from that entry's end # — yesterday's closing number is today's
  // opening number. Fires only on pack/location change, so it never clobbers
  // the counter's later edits; entries arrive newest-first, so find() = latest.
  useEffect(() => {
    const pack = f.pack.trim();
    if (!pack) return;
    const prev = entries.find((e) =>
      e.kind === "scratch" && e.locationId === f.locationId && (e.pack || "") === pack);
    if (prev) {
      setF((p) => ({
        ...p,
        game: prev.game || p.game,
        price: prev.price != null ? String(prev.price) : p.price,
        startno: prev.endno != null ? String(prev.endno) : p.startno,
      }));
      onSaved?.(`Pack recognized — start # carried from last count`);
    }
  }, [f.pack, f.locationId]); // eslint-disable-line

  const locDrawers = drawers.filter((d) => d.active !== false && d.locationId === f.locationId);
  // default drawer: the one last used for scratch here if valid, else one named like "Lottery"
  useEffect(() => {
    if (locDrawers.length && !locDrawers.some((d) => d.id === f.drawerId)) {
      const rememberedId = loadContext(vendor.id, profile.id).scratchDrawerId;
      const pick = locDrawers.find((d) => d.id === rememberedId)
        || locDrawers.find((d) => /lott/i.test(d.name)) || locDrawers[0];
      setF((p) => ({ ...p, drawerId: pick.id }));
    }
  }, [f.locationId, drawers]); // eslint-disable-line

  const sold = ticketsSold(f.startno, f.endno);
  const dollars = sold * (Number(f.price) || 0);
  const drawer = locDrawers.find((d) => d.id === f.drawerId);

  const valid = validateScratch(f);

  // Throws on failure so useSaveState can hold a persistent, retryable error
  // instead of a toast that could vanish before the clerk sees the save failed.
  async function save() {
    await addEntry(vendor.id, {
      kind: "scratch", date: f.date, shift: f.shift,
      locationId: f.locationId, locationName: locName(f.locationId),
      drawerId: drawer.id, drawerName: drawer.name,
      game: f.game.trim() || "Game", pack: f.pack.trim(),
      price: Number(f.price) || 0, startno: Number(f.startno) || 0, endno: Number(f.endno) || 0,
      sold, dollars, by: profile.name, byId: profile.id, byRole: profile.role,
    });
    saveContext(vendor.id, profile.id, { locationId: f.locationId, scratchDrawerId: drawer.id });
    setF((p) => ({ ...p, pack: "", startno: "", endno: "" }));
    onSaved?.("Scratch-off entry signed & saved");
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px]">Scratch-off pack count</h2>
      </div>
      <div className="p-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={"Location"}>
            <select className="input" value={f.locationId} onChange={set("locationId")} disabled={!!lockedLoc}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></Field>
          <Field label={"Drawer"}>
            <select className="input" value={f.drawerId} onChange={set("drawerId")}>
              {locDrawers.length === 0 && <option value="">No drawers — add in Admin</option>}
              {locDrawers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={"Date"}><input type="date" className="input" value={f.date} onChange={set("date")} /></Field>
          <Field label={"Shift"}>
            <select className="input" value={f.shift} onChange={set("shift")}>
              <option value="open">Opening</option><option value="close">Closing</option>
            </select></Field>
        </div>
        {packs.some((p) => p.status === "active" && p.locationId === f.locationId) && (
          <Field label={<>Active pack (fills game, price &amp; pack #)</>}>
            <select className="input" value=""
              onChange={(e) => {
                const p = packs.find((x) => x.id === e.target.value);
                if (p) setF((prev) => ({ ...prev, pack: p.packNumber, game: p.game, price: String(p.price ?? "") }));
              }}>
              <option value="">Pick a pack…</option>
              {packs.filter((p) => p.status === "active" && p.locationId === f.locationId).map((p) => (
                <option key={p.id} value={p.id}>{p.game} · #{p.packNumber}{p.bin ? ` · bin ${p.bin}` : ""}</option>
              ))}
            </select></Field>
        )}

        <div className="grid grid-cols-2 gap-3.5">
          <Field label={"Game name"}><input className="input" value={f.game} onChange={set("game")} placeholder="Lucky 7s" /></Field>
          <div><label htmlFor={packId} className="label">Pack / book #</label>
            <div className="flex gap-2">
              <input id={packId} className="input min-w-0" value={f.pack} onChange={set("pack")} placeholder="0000000" />
              <button type="button" className="btn-ghost min-h-[44px] w-11 px-0 flex-shrink-0 text-lg" title="Scan pack barcode"
                aria-label="Scan pack barcode" onClick={() => setScanOpen(true)}>📷</button>
            </div></div>
        </div>
        <Field label={"Ticket price"}><input type="number" inputMode="decimal" className="input" value={f.price} onChange={set("price")} placeholder="0.00" /></Field>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={"Start ticket #"}><input type="number" inputMode="numeric" className="input" value={f.startno} onChange={set("startno")} placeholder="0" /></Field>
          <Field label={"End ticket #"}><input type="number" inputMode="numeric" className="input" value={f.endno} onChange={set("endno")} placeholder="0" /></Field>
        </div>

        <div className="grid grid-cols-2 gap-px bg-line rounded-xl overflow-hidden">
          <div className="bg-panel px-3.5 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Tickets sold</div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${sold > 0 ? "text-pos" : "text-fg"}`}>{sold}</div>
          </div>
          <div className="bg-panel px-3.5 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Dollars sold</div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${sold > 0 ? "text-pos" : "text-fg"}`}>{money(dollars)}</div>
          </div>
        </div>

        <SaveError message={error} onRetry={() => run(save)} busy={busy} />
        <button className="btn-primary" disabled={busy || !valid.ok || !drawer} onClick={() => run(save)}>{busy ? "Saving…" : "Save & sign entry"}</button>
        {!valid.ok && <p className="text-[12px] text-muted -mt-1.5">{valid.message}</p>}
        <p className="text-xs text-muted leading-relaxed">End # − start # = tickets sold. That × price must match the drawer — this makes the log self-auditing.</p>
      </div>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        title="Scan pack barcode"
        hint="The scan fills the pack — nothing saves until you save & sign the count."
        onDetected={(code) => {
          setScanOpen(false);
          setF((p) => ({ ...p, pack: code }));
          onSaved?.("Pack scanned");
        }} />
    </div>
  );
}
