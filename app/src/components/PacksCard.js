"use client";
import { useState } from "react";
import { addPack, updatePack } from "@/lib/data";
import { money, toDate } from "@/lib/utils";
import { useSession } from "./SessionProvider";
import BarcodeScanner from "./BarcodeScanner";

const STATUS_PILL = {
  received: "bg-neutral-200 text-neutral-600",
  active: "bg-green-100 text-green-700",
  settled: "bg-[#eceae2] text-neutral-600",
  returned: "bg-amber-100 text-amber-700",
};

// Sold so far = counts are the source of truth (entries matched by pack #).
const soldFor = (p, entries) => entries
  .filter((e) => e.kind === "scratch" && e.locationId === p.locationId && (e.pack || "") === p.packNumber)
  .reduce((s, e) => s + (e.sold || 0), 0);

export default function PacksCard({ onToast, locations, packs, entries }) {
  const { profile, vendor } = useSession();
  const [np, setNp] = useState({ game: "", packNumber: "", price: "", ticketCount: "", locationId: "", bin: "", barcode: "" });
  const [scanOpen, setScanOpen] = useState(false);
  const [filter, setFilter] = useState("open"); // open = received + active

  async function create() {
    const loc = np.locationId || locations.find((l) => l.active !== false)?.id;
    if (np.game.trim().length < 2) return onToast?.("Enter the game name");
    if (!np.packNumber.trim()) return onToast?.("Enter the pack / book #");
    if (!(Number(np.price) > 0)) return onToast?.("Enter the ticket price");
    if (!(Number(np.ticketCount) > 0)) return onToast?.("Enter tickets per pack");
    if (!loc) return onToast?.("Add a location first");
    try {
      await addPack(vendor.id, {
        game: np.game.trim(), packNumber: np.packNumber.trim(),
        price: Number(np.price), ticketCount: Number(np.ticketCount),
        barcode: np.barcode.trim() || null,
        locationId: loc, locationName: locations.find((l) => l.id === loc)?.name || "—",
        bin: np.bin.trim() || null,
        status: "received", receivedBy: profile.name,
        activatedAt: null, activatedBy: null, settledAt: null, settledBy: null,
        returnedAt: null, returnedBy: null, returnNote: null,
        soldAtSettle: null, shortAtSettle: null,
      });
      setNp({ game: "", packNumber: "", price: "", ticketCount: "", locationId: "", bin: "", barcode: "" });
      onToast?.("Pack received");
    } catch (e) { console.error(e); onToast?.("Failed — managers only"); }
  }

  async function activate(p) {
    const bin = prompt("Bin / display slot #:", p.bin || "");
    if (bin === null) return;
    try {
      await updatePack(vendor.id, p.id, {
        status: "active", bin: bin.trim() || null,
        activatedAt: new Date(), activatedBy: profile.name,
      });
      onToast?.("Pack activated");
    } catch (e) { onToast?.("Failed — managers only"); }
  }

  async function settle(p) {
    const sold = soldFor(p, entries);
    const short = (p.ticketCount || 0) - sold;
    const msg = `Settle ${p.game} pack ${p.packNumber}?\n\n` +
      `${sold} of ${p.ticketCount} tickets counted sold` +
      (short > 0 ? ` — ${short} unaccounted (${money(short * (p.price || 0))}).`
        : short < 0 ? ` — ${-short} more than pack size; check for duplicate counts.` : " — exact.") +
      `\n\nThis is permanent: settled packs never reopen.`;
    if (!confirm(msg)) return;
    try {
      await updatePack(vendor.id, p.id, {
        status: "settled", settledAt: new Date(), settledBy: profile.name,
        soldAtSettle: sold, shortAtSettle: short,
      });
      onToast?.("Pack settled");
    } catch (e) { onToast?.("Failed — managers only"); }
  }

  async function ret(p) {
    const note = prompt("Return reason (game ended, damaged, …):", "");
    if (note === null) return;
    try {
      await updatePack(vendor.id, p.id, {
        status: "returned", returnedAt: new Date(), returnedBy: profile.name,
        returnNote: note.trim() || null,
      });
      onToast?.("Pack returned");
    } catch (e) { onToast?.("Failed — managers only"); }
  }

  const shown = packs.filter((p) =>
    filter === "all" ? true : filter === "open" ? ["received", "active"].includes(p.status) : p.status === filter);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[#dcd8cc]">
        <h2 className="font-semibold text-[15px]">Scratch-off packs</h2>
        <p className="text-[13px] text-neutral-500 mt-0.5">Track each book from the safe to the last ticket: receive → activate → settle or return. Settling freezes sold-vs-size — per-pack shrink, on the record.</p>
      </div>

      {/* add form */}
      <div className="p-4 border-b border-[#dcd8cc] bg-[#faf8f2]">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="label">Game</label><input className="input" value={np.game} onChange={(e) => setNp({ ...np, game: e.target.value })} placeholder="Lucky 7s" /></div>
          <div><label className="label">Pack / book #</label><input className="input font-mono" value={np.packNumber} onChange={(e) => setNp({ ...np, packNumber: e.target.value })} placeholder="0000000" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="label">Ticket price</label><input type="number" inputMode="decimal" className="input" value={np.price} onChange={(e) => setNp({ ...np, price: e.target.value })} placeholder="5.00" /></div>
          <div><label className="label">Tickets per pack</label><input type="number" inputMode="numeric" className="input" value={np.ticketCount} onChange={(e) => setNp({ ...np, ticketCount: e.target.value })} placeholder="60" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="label">Location</label>
            <select className="input" value={np.locationId} onChange={(e) => setNp({ ...np, locationId: e.target.value })}>
              {locations.filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></div>
          <div><label className="label">Barcode (optional)</label>
            <div className="flex gap-2">
              <input className="input font-mono min-w-0" value={np.barcode} placeholder="Scan or type"
                onChange={(e) => setNp({ ...np, barcode: e.target.value })} />
              <button type="button" className="btn-ghost px-2.5 flex-shrink-0" onClick={() => setScanOpen(true)}>📷</button>
            </div></div>
        </div>
        <button className="btn-ghost w-full" onClick={create}>Receive pack</button>
      </div>

      {/* filter */}
      <div className="px-4 py-2.5 border-b border-[#dcd8cc]">
        <select className="input w-auto py-1.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="open">Received & active</option>
          <option value="settled">Settled</option>
          <option value="returned">Returned</option>
          <option value="all">All packs</option>
        </select>
      </div>

      {/* list */}
      {shown.length === 0 ? (
        <div className="text-center py-10 px-5 text-neutral-500 text-sm">No packs here yet.</div>
      ) : shown.map((p) => {
        const sold = soldFor(p, entries);
        const value = (p.price || 0) * (p.ticketCount || 0);
        return (
          <div key={p.id} className="px-4 py-3 border-b border-[#dcd8cc] last:border-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {p.game} <span className="font-mono text-[13px] text-neutral-500">#{p.packNumber}</span>
                  <span className={`pill ${STATUS_PILL[p.status] || ""}`}>{p.status}</span>
                  {p.bin && <span className="pill bg-[#fbf6ec] text-brass-dk border border-brass/30">bin {p.bin}</span>}
                </div>
                <div className="text-[13px] text-neutral-500">
                  {p.locationName} · {money(p.price)} × {p.ticketCount} = {money(value)}
                  {p.status === "settled"
                    ? <> · settled by {p.settledBy}: {p.soldAtSettle}/{p.ticketCount} sold{p.shortAtSettle > 0 && <b className="text-red-600"> — {p.shortAtSettle} unaccounted</b>}</>
                    : p.status === "returned"
                      ? <> · returned by {p.returnedBy}{p.returnNote ? ` — ${p.returnNote}` : ""}</>
                      : <> · {sold} sold so far</>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {p.status === "received" && (
                  <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => activate(p)}>Activate</button>
                )}
                {p.status === "active" && (<>
                  <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => settle(p)}>Settle</button>
                  <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => ret(p)}>Return</button>
                </>)}
              </div>
            </div>
          </div>
        );
      })}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        title="Scan pack barcode"
        onDetected={(code) => { setNp((prev) => ({ ...prev, barcode: code })); setScanOpen(false); onToast?.("Scanned"); }} />
    </div>
  );
}
