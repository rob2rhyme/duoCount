"use client";
import { useEffect, useState } from "react";
import { addEntry } from "@/lib/data";
import { money, expectedCash } from "@/lib/utils";
import { useSession } from "./SessionProvider";

const today = () => new Date().toISOString().slice(0, 10);

// Bill denominations a US drawer is counted in, largest first. Coins are
// entered as a single dollar value so the drawer total stays accurate without
// four extra rows.
const DENOMS = [100, 50, 20, 10, 5, 1];
const emptyDenoms = () => ({ 100: "", 50: "", 20: "", 10: "", 5: "", 1: "" });

export default function CashForm({ onSaved, locations, drawers, locName }) {
  const { profile, vendor, isManager } = useSession();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;
  const [f, setF] = useState({
    date: today(), shift: "open", locationId: "", drawerId: "",
    start: "", sales: "", paidout: "", counted: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  // Denomination counter — counts of each bill + a coins dollar value. The
  // running total drives "Counted at close" while it's switched on.
  const [useCounter, setUseCounter] = useState(false);
  const [denoms, setDenoms] = useState(emptyDenoms());
  const [coins, setCoins] = useState("");
  const setDenom = (d) => (e) =>
    setDenoms((p) => ({ ...p, [d]: e.target.value.replace(/[^\d]/g, "") }));
  const coinValue = Math.max(0, Number(coins) || 0);
  const denomTotal =
    DENOMS.reduce((s, d) => s + d * (parseInt(denoms[d], 10) || 0), 0) + coinValue;

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
  // When the counter is on, the tallied denominations are the counted amount.
  const countedValue = useCounter ? denomTotal : (Number(f.counted) || 0);
  const diff = countedValue - expected;
  const diffClass = Math.abs(diff) < 0.005 ? "text-fg" : diff > 0 ? "text-green-700" : "text-red-600";
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
        paidout: Number(f.paidout) || 0, counted: countedValue,
        expected, diff, blind,
        flagged, varianceStatus: flagged ? "open" : "none",
        by: profile.name, byId: profile.id, byRole: profile.role,
      });
      setF((p) => ({ ...p, start: "", sales: "", paidout: "", counted: "" }));
      setDenoms(emptyDenoms());
      setCoins("");
      // In blind mode the result is revealed only after the commit.
      const result = Math.abs(diff) < 0.005 ? "balanced"
        : diff > 0 ? `over ${money(diff)}` : `short ${money(Math.abs(diff))}`;
      onSaved?.(blind ? `Saved — ${result}` : "Cash entry signed & saved");
    } catch (e) { console.error(e); onSaved?.("Save failed — check connection"); }
    setBusy(false);
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
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
          <div>
            <label className="label">Counted at close</label>
            {useCounter ? (
              <div className="input flex items-center justify-between font-mono font-semibold" aria-live="polite">
                <span>{money(denomTotal)}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted font-sans">from counter</span>
              </div>
            ) : (
              <input type="number" inputMode="decimal" className="input" value={f.counted} onChange={set("counted")} placeholder="0.00" />
            )}
          </div>
        </div>

        <div>
          <button type="button" onClick={() => setUseCounter((v) => !v)}
            className="text-[12px] font-semibold text-gold hover:underline inline-flex items-center gap-1.5">
            {useCounter ? "↔ Enter a single total instead" : "🧮 Count cash by denomination"}
          </button>
        </div>

        {useCounter && (
          <div className="bg-panel border border-line rounded-xl p-3.5 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Count by denomination</div>
            {DENOMS.map((d) => {
              const n = parseInt(denoms[d], 10) || 0;
              return (
                <div key={d} className="flex items-center gap-2.5">
                  <span className="w-12 text-sm font-semibold font-mono text-right">${d}</span>
                  <span className="text-muted text-sm">×</span>
                  <input type="number" inputMode="numeric" min="0" step="1"
                    className="input py-1.5 w-24" value={denoms[d]} onChange={setDenom(d)} placeholder="0"
                    aria-label={`Number of $${d} bills`} />
                  <span className="ml-auto font-mono text-sm tabular-nums text-muted">{money(d * n)}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2.5">
              <span className="w-12 text-sm font-semibold font-mono text-right">Coins</span>
              <span className="text-muted text-sm">$</span>
              <input type="number" inputMode="decimal" min="0" step="0.01"
                className="input py-1.5 w-24" value={coins}
                onChange={(e) => setCoins(e.target.value)} placeholder="0.00"
                aria-label="Coins total in dollars" />
              <span className="ml-auto font-mono text-sm tabular-nums text-muted">{money(coinValue)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-2.5 mt-1">
              <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">Counter total</span>
              <span className="font-mono font-bold text-lg">{money(denomTotal)}</span>
            </div>
          </div>
        )}

        {blind ? (
          <div className="bg-panel border border-dashed border-line rounded-xl px-3.5 py-4 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Blind count</div>
            <div className="text-sm text-muted mt-1">Result shown after you save</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-line rounded-xl overflow-hidden">
            <div className="bg-panel px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Expected in drawer</div>
              <div className="text-xl font-bold font-mono mt-0.5">{money(expected)}</div>
            </div>
            <div className="bg-panel px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Over / short</div>
              <div className={`text-xl font-bold font-mono mt-0.5 ${diffClass}`}>{diff >= 0 ? "+" : ""}{money(diff)}</div>
            </div>
          </div>
        )}

        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save & sign entry"}</button>
        <p className="text-xs text-muted leading-relaxed">Expected = start + sales − paid out. Your name, drawer, location, and time stamp attach automatically.</p>
      </div>
    </div>
  );
}
