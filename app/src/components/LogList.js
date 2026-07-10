"use client";
import { useMemo, useState } from "react";
import { verifyEntry } from "@/lib/data";
import { money, toDate, exportCSV } from "@/lib/utils";
import { useSession } from "./SessionProvider";

export default function LogList({ entries, onToast, locName, showLocation }) {
  const { profile, vendor, isManager } = useSession();
  const [fType, setFType] = useState("all");
  const [fWho, setFWho] = useState("all");
  const [fDrawer, setFDrawer] = useState("all");

  const names = useMemo(() => [...new Set(entries.map((e) => e.by))].sort(), [entries]);
  const drawerNames = useMemo(() => [...new Set(entries.map((e) => e.drawerName).filter(Boolean))].sort(), [entries]);
  const rows = entries.filter((e) =>
    (fType === "all" || e.kind === fType) &&
    (fWho === "all" || e.by === fWho) &&
    (fDrawer === "all" || e.drawerName === fDrawer));

  async function doVerify(e) {
    if (!isManager) return onToast?.("Managers only");
    if (e.byId === profile.id) return onToast?.("Can't verify your own entry");
    try { await verifyEntry(vendor.id, e.id, profile.name); onToast?.("Verified"); }
    catch (err) { console.error(err); onToast?.("Verify failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <select className="input w-auto flex-1 min-w-[110px]" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="all">All entries</option>
          <option value="cash">Cash only</option>
          <option value="scratch">Scratch-offs only</option>
          <option value="inventory">Inventory only</option>
        </select>
        <select className="input w-auto flex-1 min-w-[110px]" value={fWho} onChange={(e) => setFWho(e.target.value)}>
          <option value="all">Everyone</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {drawerNames.length > 1 && (
          <select className="input w-auto flex-1 min-w-[110px]" value={fDrawer} onChange={(e) => setFDrawer(e.target.value)}>
            <option value="all">All drawers</option>
            {drawerNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <button className="btn-ghost" onClick={() => exportCSV(entries)}>Export CSV</button>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-12 px-5 text-neutral-500">No entries yet. Saved counts show up here for your team.</div>
        ) : rows.map((e) => {
          const t = toDate(e.ts);
          const stamp = `${e.by} · ${t ? t.toLocaleDateString() : "…"} ${t ? t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`;
          const locChip = showLocation && e.locationName
            ? <span className="pill bg-[#eceae2] text-neutral-600">{e.locationName}</span> : null;
          const drawerChip = e.drawerName
            ? <span className="pill bg-[#fbf6ec] text-brass-dk border border-brass/30">{e.drawerName}</span> : null;
          return (
            <div key={e.id} className="px-4 py-3.5 border-b border-[#dcd8cc] last:border-0">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  {e.kind === "cash" ? (
                    <>
                      <div className="font-semibold text-[15px]">{e.drawerName || "Drawer"} — {e.shift === "open" ? "Opening" : "Closing"}</div>
                      <div className="text-[13px] text-neutral-500 font-mono mt-0.5">{stamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {Math.abs(e.diff) < 0.005
                          ? <span className="pill bg-neutral-200 text-neutral-600">Balanced</span>
                          : e.diff > 0
                            ? <span className="pill bg-green-100 text-green-700">Over {money(e.diff)}</span>
                            : <span className="pill bg-red-100 text-red-600">Short {money(Math.abs(e.diff))}</span>}
                        {locChip}
                      </div>
                    </>
                  ) : e.kind === "inventory" ? (
                    <>
                      <div className="font-semibold text-[15px]">{e.itemName || "Item"} — {e.shift === "open" ? "Opening" : "Closing"}</div>
                      <div className="text-[13px] text-neutral-500 font-mono mt-0.5">{stamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {e.diff === 0
                          ? <span className="pill bg-neutral-200 text-neutral-600">Exact count</span>
                          : e.diff > 0
                            ? <span className="pill bg-green-100 text-green-700">Over {e.diff}</span>
                            : <span className="pill bg-red-100 text-red-600">Missing {Math.abs(e.diff)}</span>}
                        <span className="pill bg-[#fbf6ec] text-brass-dk border border-brass/30">{e.unit || "unit"}s</span>
                        {locChip}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-[15px]">{e.game} · ${e.price} tickets</div>
                      <div className="text-[13px] text-neutral-500 font-mono mt-0.5">Pack {e.pack || "—"} · #{e.startno}→{e.endno}</div>
                      <div className="text-[13px] text-neutral-500 font-mono">{stamp}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        <span className="pill bg-neutral-200 text-neutral-600">{e.sold} sold</span>
                        {drawerChip}{locChip}
                      </div>
                    </>
                  )}
                </div>
                <div className="text-right font-mono font-bold whitespace-nowrap">
                  {e.kind === "cash" ? (
                    <>{money(e.counted)}<br /><span className="text-xs text-neutral-500 font-normal">exp {money(e.expected)}</span></>
                  ) : e.kind === "inventory" ? (
                    <>{e.counted}<br /><span className="text-xs text-neutral-500 font-normal">exp {e.expected}</span></>
                  ) : money(e.dollars)}
                </div>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-dashed border-[#dcd8cc]">
                {e.verifiedBy ? (
                  <span className="text-[13px] text-green-700 font-semibold">✓ Verified by {e.verifiedBy}</span>
                ) : isManager && e.byId !== profile.id ? (
                  <button className="btn-ghost text-[13px] px-3 py-1.5" onClick={() => doVerify(e)}>Verify count</button>
                ) : (
                  <span className="text-[13px] text-neutral-400 italic">Awaiting manager verification</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
