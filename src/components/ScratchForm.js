"use client";
import { useEffect, useMemo, useState, useId } from "react";
import { addEntry, fetchEntriesInRange } from "@/lib/data";
import { money, ticketsSold } from "@/lib/utils";
import { parseScratchBarcode, packGameKey } from "@/lib/scratch-barcode";
import { resolveCatalogGame } from "@/lib/scratch-catalog";
import { buildPackFlow } from "@/lib/scratch-report";
import { validateScratch } from "@/lib/count-validation";
import { defaultShift, pickRemembered, loadContext, saveContext } from "@/lib/count-context";
import { useSaveState } from "@/lib/use-save-state";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import SaveError from "./SaveError";
import Field from "./Field";
import TabIcon from "./TabIcon";
import BarcodeScanner from "./BarcodeScanner";

const today = () => new Date().toISOString().slice(0, 10);

export default function ScratchForm({ onSaved, locations, drawers, locName, entries = [], catalog = null }) {
  const { profile, vendor, isManager } = useSession();
  const { t } = useLang();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;
  const [f, setF] = useState({
    date: today(), shift: defaultShift(new Date().getHours()), locationId: "", drawerId: "",
    game: "", pack: "", price: "", startno: "", endno: "",
  });
  const { busy, error, run } = useSaveState();
  const [scanOpen, setScanOpen] = useState(false);
  const packId = useId();
  const gameListId = useId();
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  // ---- Shelf walk: scan the whole display, one row per pack, sign once ----
  const [walk, setWalk] = useState([]);        // [{ pack, game, price, startno, endno, isNew }]
  const [walkOpen, setWalkOpen] = useState(false);
  const [walkBusy, setWalkBusy] = useState(false);
  const [walkErr, setWalkErr] = useState("");
  const [lastScan, setLastScan] = useState("");
  const [showMissing, setShowMissing] = useState(false);
  // ---- Printable pack-flow report over an on-demand range (manager) ----
  const [rptOpen, setRptOpen] = useState(false);
  const [rptBusy, setRptBusy] = useState(false);
  const [rptErr, setRptErr] = useState("");
  const [rpt, setRpt] = useState(() => ({
    from: new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
    to: today(), locationId: "",
  }));

  // Games sold before, newest first (entries arrive newest-first), deduped by
  // name — powers the game-name quick-pick and its remembered price, so a brand
  // new pack of a game with no scan-derived match is still a two-tap entry.
  const knownGames = useMemo(() => {
    const seen = new Map();
    for (const e of entries) {
      if (e.kind !== "scratch") continue;
      const name = (e.game || "").trim();
      if (!name || seen.has(name)) continue;
      seen.set(name, { game: name, price: Number(e.price) || 0 });
    }
    return [...seen.values()];
  }, [entries]);

  // Picking (or typing) a known game name fills its usual price when price is
  // still blank — never clobbering a price the clerk already set.
  const onGame = (e) => {
    const name = e.target.value;
    setF((p) => {
      const hit = knownGames.find((g) => g.game === name);
      return { ...p, game: name, price: p.price === "" && hit ? String(hit.price) : p.price };
    });
  };

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
  //
  // If the exact book was never counted here but ANOTHER book of the same game
  // was (same game key, different book #), carry that game's name + price
  // forward — but NOT the start #, since a fresh book starts at its own ticket,
  // not the last book's close. The barcode carries no name/price text, so this
  // sibling match is the only way a brand-new pack of a known game auto-fills.
  //
  // Failing both, look the game number up in the bundled lottery catalog: a game
  // never sold here before still fills its name + price from the pack's game #.
  // Precedence is store history first (the real prices this store charges), then
  // the catalog as the broad fallback. None of these touch the audited start/end.
  useEffect(() => {
    const pack = f.pack.trim();
    if (!pack) return;
    const here = (e) => e.kind === "scratch" && e.locationId === f.locationId;
    const prev = entries.find((e) => here(e) && (e.pack || "") === pack);
    if (prev) {
      setF((p) => ({
        ...p,
        game: prev.game || p.game,
        price: prev.price != null ? String(prev.price) : p.price,
        startno: prev.endno != null ? String(prev.endno) : p.startno,
      }));
      onSaved?.(t("toast.pack_recognized"));
      return;
    }
    const key = packGameKey(pack);
    const sib = key && entries.find((e) => here(e) && e.game && packGameKey(e.pack || "") === key);
    if (sib) {
      setF((p) => ({
        ...p,
        game: sib.game || p.game,
        price: sib.price != null ? String(sib.price) : p.price,
      }));
      onSaved?.(t("toast.game_recognized"));
      return;
    }
    const cat = resolveCatalogGame(pack, catalog || undefined);
    if (cat) {
      setF((p) => ({ ...p, game: cat.name, price: String(cat.price) }));
      onSaved?.(t("toast.game_catalog"));
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

  // Resolve a scanned pack the same way the single-pack prefill does: exact
  // pack history first (chains start # from the last end #), then a sibling
  // book of the same game, then the lottery catalog. Pure lookup — no state.
  function resolvePack(packNo, ticket) {
    const here = (e) => e.kind === "scratch" && e.locationId === f.locationId;
    const prev = entries.find((e) => here(e) && (e.pack || "") === packNo);
    if (prev) {
      return {
        game: prev.game || "", price: prev.price != null ? String(prev.price) : "",
        startno: prev.endno != null ? String(prev.endno) : (ticket != null ? String(ticket) : ""),
        isNew: false,
      };
    }
    const key = packGameKey(packNo);
    const sib = key && entries.find((e) => here(e) && e.game && packGameKey(e.pack || "") === key);
    if (sib) {
      return {
        game: sib.game || "", price: sib.price != null ? String(sib.price) : "",
        startno: ticket != null ? String(ticket) : "", isNew: true,
      };
    }
    const cat = resolveCatalogGame(packNo, catalog || undefined);
    return {
      game: cat ? cat.name : "", price: cat ? String(cat.price) : "",
      startno: ticket != null ? String(ticket) : "", isNew: true,
    };
  }

  // One scan = one row in the walk list (a re-scan of the same pack just
  // refreshes its current ticket #). The camera stays open between packs.
  function onWalkScan(code) {
    const { pack, ticket } = parseScratchBarcode(code);
    const packNo = pack || String(code).trim();
    if (!packNo) return;
    const known = walk.find((r) => r.pack === packNo);
    const res = known || resolvePack(packNo, ticket);
    setWalk((w) => {
      const i = w.findIndex((r) => r.pack === packNo);
      if (i >= 0) {
        const copy = [...w];
        if (ticket != null) copy[i] = { ...copy[i], endno: String(ticket) };
        return copy;
      }
      return [...w, {
        pack: packNo, game: res.game, price: res.price,
        startno: res.startno, endno: ticket != null ? String(ticket) : "",
        isNew: res.isNew,
      }];
    });
    const label = res.game || `…${packNo.slice(-6)}`;
    const count = known ? walk.length : walk.length + 1;
    setLastScan(`✓ ${label}${ticket != null ? ` · #${ticket}` : ""} — ${t("scratch.walk_scanned", { n: count })}`);
  }

  const setWalkRow = (i, k) => (e) => {
    const v = e.target.value;
    setWalk((w) => w.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  };
  const removeWalkRow = (i) => setWalk((w) => w.filter((_, j) => j !== i));

  // Known packs at this location (counted in the last 14 days) that are NOT in
  // the current walk — the "did I miss a slot?" checklist. Entries arrive
  // newest-first, so the first hit per pack is its latest count.
  const missingPacks = useMemo(() => {
    const cut = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const seen = new Map();
    for (const e of entries) {
      if (e.kind !== "scratch" || e.locationId !== f.locationId) continue;
      if ((e.date || "") < cut) continue;
      const p = String(e.pack || "").trim();
      if (!p || seen.has(p)) continue;
      seen.set(p, e);
    }
    const inWalk = new Set(walk.map((r) => r.pack));
    return [...seen.values()].filter((e) => !inWalk.has(String(e.pack).trim()));
  }, [entries, f.locationId, walk]);

  // Tap a missed pack → it joins the walk with the start chained; the clerk
  // types the current number by hand (worn barcode, glass case, etc.).
  function addMissingPack(e) {
    const packNo = String(e.pack).trim();
    setWalk((w) => w.some((r) => r.pack === packNo) ? w : [...w, {
      pack: packNo, game: e.game || "", price: e.price != null ? String(e.price) : "",
      startno: e.endno != null ? String(e.endno) : "", endno: "", isNew: false,
    }]);
    setShowMissing(false);
  }

  const walkReady = walk.length > 0 && !!drawer && walk.every((r) =>
    String(r.endno).trim() !== "" && Number(r.endno) >= (Number(r.startno) || 0));

  // Sign the whole walk: one entry per pack, the same signed shape as the
  // single-pack save. Sequential on purpose — if the connection drops mid-way,
  // the already-saved rows leave the list so a retry can't double-count.
  async function saveWalk() {
    if (!walkReady || walkBusy) return;
    setWalkBusy(true); setWalkErr("");
    let i = 0;
    try {
      for (; i < walk.length; i++) {
        const r = walk[i];
        const startno = Number(r.startno) || 0;
        const endno = Number(r.endno) || 0;
        const rowSold = ticketsSold(startno, endno);
        await addEntry(vendor.id, {
          kind: "scratch", date: f.date, shift: f.shift,
          locationId: f.locationId, locationName: locName(f.locationId),
          drawerId: drawer.id, drawerName: drawer.name,
          game: (r.game || "").trim() || "Game", pack: r.pack,
          price: Number(r.price) || 0, startno, endno,
          sold: rowSold, dollars: rowSold * (Number(r.price) || 0),
          by: profile.name, byId: profile.id, byRole: profile.role,
        });
      }
      saveContext(vendor.id, profile.id, { locationId: f.locationId, scratchDrawerId: drawer.id });
      const n = walk.length;
      setWalk([]); setLastScan("");
      onSaved?.(t("scratch.walk_saved", { n }));
    } catch {
      setWalk((w) => w.slice(i));
      setWalkErr(t("scratch.walk_save_err", { left: walk.length - i }));
    }
    setWalkBusy(false);
  }

  // Build + print the pack-flow report for the picked range (manager-only UI).
  async function runReport() {
    setRptBusy(true); setRptErr("");
    try {
      const list = await fetchEntriesInRange(vendor.id, rpt.from, rpt.to, rpt.locationId || null);
      const { rows, totals } = buildPackFlow(list, { from: rpt.from, to: rpt.to, locationId: rpt.locationId });
      if (!rows.length) { setRptErr(t("scratch.report_none")); setRptBusy(false); return; }
      const win = window.open("", "_blank");
      if (!win) { setRptErr(t("scratch.report_popup")); setRptBusy(false); return; }
      const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      const allLocs = !rpt.locationId;
      const gapRows = rows.filter((r) => r.gaps.length);
      win.document.write(`<!doctype html><html><head><title>${esc(vendor.name)} — ${esc(t("srpt.title"))}</title>
      <style>body{font:12px Helvetica,Arial;margin:32px;color:#1a241c}h1{font-size:18px;margin:0}h2{font-size:14px;margin:24px 0 6px}p{color:#666;margin:2px 0}
      table{border-collapse:collapse;width:100%;margin-top:12px;font-size:11px}
      th,td{text-align:left;padding:3px 6px;border-bottom:1px solid #ccc;vertical-align:top}th{border-bottom:2px solid #14532d}
      td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
      tr.tot td{border-top:2px solid #14532d;font-weight:bold}
      .gap{color:#b91c1c;font-weight:bold}.muted{color:#666;font-size:10px}
      .brand{display:flex;align-items:center;gap:8px}.mark{width:26px;height:26px;border-radius:5px;background:#298050;color:#fff;font-weight:bold;display:flex;align-items:center;justify-content:center;font-size:13px}</style>
      </head><body>
      <div class="brand"><div class="mark">D</div><div><h1>${esc(vendor.name)} — ${esc(t("srpt.title"))}</h1>
      <p>${esc(t("srpt.range", { from: rpt.from, to: rpt.to }))}${allLocs ? "" : ` · ${esc(locName(rpt.locationId))}`} · ${esc(t("srpt.packs", { n: totals.packs }))}</p>
      <p>${esc(t("srpt.generated", { date: new Date().toLocaleString(), name: profile.name }))}</p></div></div>
      <table><thead><tr>
      ${allLocs ? `<th>${esc(t("srpt.location"))}</th>` : ""}
      <th>${esc(t("srpt.game"))}</th><th>${esc(t("srpt.pack"))}</th><th class="num">${esc(t("srpt.price"))}</th>
      <th class="num">${esc(t("srpt.opening"))}</th><th class="num">${esc(t("srpt.closing"))}</th>
      <th class="num">${esc(t("srpt.sold"))}</th><th class="num">${esc(t("srpt.sales"))}</th><th class="num">${esc(t("srpt.gap"))}</th>
      </tr></thead><tbody>
      ${rows.map((r) => `<tr>
        ${allLocs ? `<td>${esc(r.locationName)}</td>` : ""}
        <td>${esc(r.game)}</td><td>…${esc(r.pack.slice(-6))}</td><td class="num">${esc(money(r.price))}</td>
        <td class="num">#${esc(r.openStart ?? "—")}<div class="muted">${esc(r.openDate || "")} · ${esc(r.openBy)}</div></td>
        <td class="num">#${esc(r.closeEnd ?? "—")}<div class="muted">${esc(r.closeDate || "")} · ${esc(r.closeBy)}</div></td>
        <td class="num">${esc(r.sold)}</td><td class="num">${esc(money(r.dollars))}</td>
        <td class="num">${r.gapTickets > 0 ? `<span class="gap">⚠ ${esc(r.gapTickets)}</span>` : "—"}</td>
      </tr>`).join("")}
      <tr class="tot">${allLocs ? "<td></td>" : ""}<td colspan="3">${esc(t("srpt.totals"))}</td><td></td><td></td>
      <td class="num">${esc(totals.sold)}</td><td class="num">${esc(money(totals.dollars))}</td>
      <td class="num">${totals.gapTickets > 0 ? `<span class="gap">⚠ ${esc(totals.gapTickets)} (${esc(money(totals.gapDollars))})</span>` : "—"}</td></tr>
      </tbody></table>
      <h2>${esc(t("srpt.gaps_title"))}</h2>
      ${gapRows.length === 0 ? `<p>${esc(t("srpt.no_gaps"))}</p>`
        : gapRows.map((r) => r.gaps.map((g) => `<p class="gap">${esc(t("srpt.gap_line", {
          game: r.game, pack: r.pack.slice(-6), missing: g.missing,
          prevBy: g.prevBy, prevEnd: g.prevEnd, prevDate: g.prevDate || "",
          nextBy: g.nextBy, nextStart: g.nextStart, nextDate: g.nextDate || "",
        }))}</p>`).join("")).join("")}
      </body></html>`);
      win.document.close(); win.focus();
      setTimeout(() => { try { win.print(); } catch { /* user prints manually */ } }, 250);
      setRptOpen(false);
    } catch (e) {
      setRptErr(e?.message || "Report failed.");
    }
    setRptBusy(false);
  }

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
    onSaved?.(t("toast.saved_scratch"));
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line flex items-center justify-between gap-2">
        <h2 className="font-semibold text-[15px] flex items-center gap-2 min-w-0"><TabIcon id="scratch" size={18} className="text-gold" /> <span className="truncate">{t("scratch.title")}</span></h2>
        {isManager && (
          <button type="button" className="btn-ghost text-[13px] px-3 py-1.5 flex-shrink-0"
            onClick={() => { setRptErr(""); setRptOpen(true); }}>🖨 {t("scratch.report_btn")}</button>
        )}
      </div>
      <div className="p-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={t("common.location")}>
            <select className="input" value={f.locationId} onChange={set("locationId")} disabled={!!lockedLoc}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></Field>
          <Field label={t("scratch.drawer")}>
            <select className="input" value={f.drawerId} onChange={set("drawerId")}>
              {locDrawers.length === 0 && <option value="">{t("cash.no_drawers")}</option>}
              {locDrawers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={t("common.date")}><input type="date" className="input" value={f.date} onChange={set("date")} /></Field>
          <Field label={t("common.shift")}>
            <select className="input" value={f.shift} onChange={set("shift")}>
              <option value="open">🌅 {t("common.opening")}</option><option value="close">🌇 {t("common.closing")}</option>
            </select></Field>
        </div>

        {/* ---- Shelf walk: scan every pack; each scan lands in the list ---- */}
        <div className="border border-line rounded-xl overflow-hidden">
          <div className="px-3.5 py-2.5 bg-panel border-b border-line flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">{t("scratch.walk_title")}</div>
              <p className="text-[11px] text-muted leading-snug">{t("scratch.walk_hint")}</p>
            </div>
            <button type="button" className="btn-ghost text-[13px] px-3 py-1.5 flex-shrink-0 whitespace-nowrap"
              onClick={() => { setLastScan(""); setWalkOpen(true); }}>📷 {t("scratch.walk_scan")}</button>
          </div>

          {walk.length === 0 ? (
            <p className="px-3.5 py-3 text-[12px] text-muted">{t("scratch.walk_empty")}</p>
          ) : (
            <div className="divide-y divide-line-soft">
              {walk.map((r, i) => (
                <div key={r.pack} className="px-3 py-2.5 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">
                      {r.game || t("scratch.walk_unknown_game")}
                      {r.isNew && <span className="ml-1.5 text-[9px] uppercase tracking-wide font-bold text-gold border border-brass/50 rounded px-1 py-px align-middle">{t("scratch.walk_new")}</span>}
                    </div>
                    <div className="text-[11px] text-muted font-mono">…{r.pack.slice(-6)}{Number(r.price) > 0 ? ` · ${money(Number(r.price))}` : ""}</div>
                  </div>
                  {/* fixed-width wrappers — .input carries w-full, so a width
                      utility stacked on it would lose to CSS order */}
                  <div className="w-[3.9rem] flex-shrink-0">
                    <input className="input px-2 py-1.5 text-[13px] font-mono" type="number" inputMode="numeric"
                      value={r.startno} placeholder="0" onChange={setWalkRow(i, "startno")} aria-label={t("scratch.startno")} />
                  </div>
                  <span aria-hidden="true" className="text-muted text-[11px] flex-shrink-0">→</span>
                  <div className="w-[3.9rem] flex-shrink-0">
                    <input className="input px-2 py-1.5 text-[13px] font-mono" type="number" inputMode="numeric"
                      value={r.endno} placeholder="#" onChange={setWalkRow(i, "endno")} aria-label={t("scratch.endno")} />
                  </div>
                  <div className="w-8 flex-shrink-0 text-right font-mono font-bold text-[13px]">{ticketsSold(r.startno, r.endno)}</div>
                  <button type="button" className="flex-shrink-0 text-muted hover:text-neg px-1" onClick={() => removeWalkRow(i)}
                    aria-label={t("scratch.walk_remove")}><span aria-hidden="true">✕</span></button>
                </div>
              ))}
            </div>
          )}

          <div className="px-3.5 py-2.5 border-t border-line bg-panel space-y-2">
            <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
              <span>{t("scratch.walk_progress", { n: walk.length, m: missingPacks.length })}</span>
              {missingPacks.length > 0 && (
                <button type="button" className="font-semibold underline underline-offset-2 hover:text-fg"
                  onClick={() => setShowMissing((v) => !v)}>
                  {showMissing ? t("scratch.walk_hide_missing") : t("scratch.walk_show_missing")}
                </button>
              )}
            </div>
            {showMissing && missingPacks.length > 0 && (
              <div className="border border-line rounded-lg overflow-hidden divide-y divide-line-soft max-h-48 overflow-y-auto bg-surface">
                {missingPacks.map((e) => (
                  <button key={e.pack} type="button" className="w-full text-left px-3 py-2 hover:bg-subtle transition"
                    onClick={() => addMissingPack(e)}>
                    <span className="block text-[13px] font-medium truncate">{e.game || t("scratch.walk_unknown_game")}</span>
                    <span className="block text-[11px] text-muted font-mono">…{String(e.pack).slice(-6)} · {t("scratch.walk_missing_last", { n: e.endno ?? "—", by: e.by || "—" })}</span>
                  </button>
                ))}
                <p className="px-3 py-2 text-[11px] text-muted bg-panel">{t("scratch.walk_add_missing_hint")}</p>
              </div>
            )}
            {walkErr && <p role="alert" className="text-[13px] text-neg">{walkErr}</p>}
            {walk.length > 0 && (
              <>
                <button type="button" className="btn-primary" disabled={!walkReady || walkBusy} onClick={saveWalk}>
                  <span aria-hidden="true">✓</span> {walkBusy ? t("common.saving") : t("scratch.walk_save", { n: walk.length })}
                </button>
                {!walkReady && <p className="text-[12px] text-muted">{t("scratch.walk_need_end")}</p>}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <div className="h-px bg-line flex-1" />
          <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("scratch.manual_divider")}</span>
          <div className="h-px bg-line flex-1" />
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          {/* datalist is a SIBLING, not a second child of Field — Field clones a
              single element child, so a second child would crash the tab. */}
          <div>
            <Field label={t("scratch.game")}>
              <input className="input" value={f.game} onChange={onGame} placeholder="Lucky 7s"
                list={knownGames.length ? gameListId : undefined} autoComplete="off" />
            </Field>
            {knownGames.length > 0 && (
              <datalist id={gameListId}>
                {knownGames.map((g) => <option key={g.game} value={g.game} />)}
              </datalist>
            )}
          </div>
          <div><label htmlFor={packId} className="label">{t("scratch.pack_no")}</label>
            <div className="flex gap-2">
              <input id={packId} className="input min-w-0" value={f.pack} onChange={set("pack")} placeholder="0000000" />
              <button type="button" className="btn-ghost min-h-[44px] w-11 px-0 flex-shrink-0 text-lg" title={t("scratch.scan_pack")}
                aria-label={t("scratch.scan_pack")} onClick={() => setScanOpen(true)}>📷</button>
            </div></div>
        </div>
        <Field label={t("scratch.price")}><input type="number" inputMode="decimal" className="input" value={f.price} onChange={set("price")} placeholder="0.00" /></Field>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={t("scratch.startno")}><input type="number" inputMode="numeric" className="input" value={f.startno} onChange={set("startno")} placeholder="0" /></Field>
          <Field label={t("scratch.endno")}><input type="number" inputMode="numeric" className="input" value={f.endno} onChange={set("endno")} placeholder="0" /></Field>
        </div>

        <div className="grid grid-cols-2 gap-px bg-line rounded-xl overflow-hidden">
          <div className="bg-panel px-3.5 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("scratch.sold")}</div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${sold > 0 ? "text-pos" : "text-fg"}`}>{sold}</div>
          </div>
          <div className="bg-panel px-3.5 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("scratch.dollars")}</div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${sold > 0 ? "text-pos" : "text-fg"}`}>{money(dollars)}</div>
          </div>
        </div>

        <SaveError message={error} onRetry={() => run(save)} busy={busy} />
        <button className="btn-primary" disabled={busy || !valid.ok || !drawer} onClick={() => run(save)}>
          <span aria-hidden="true">✓</span> {busy ? t("common.saving") : t("common.save_sign")}
        </button>
        {!valid.ok && <p className="text-[12px] text-muted -mt-1.5">{t(`err.${valid.code}`)}</p>}
        <p className="text-xs text-muted leading-relaxed">{t("scratch.helper")}</p>
      </div>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        title={t("scratch.scan_pack")}
        hint={t("scratch.scan_hint")}
        onDetected={(code) => {
          setScanOpen(false);
          // Split the scan into a stable pack id + the ticket the pack is at.
          // Setting `pack` triggers the last-count prefill (game, price, and the
          // chained start #); the scanned ticket is the pack's current position,
          // which is this count's closing/end reading. For a brand-new pack (no
          // history to chain a start from) seed the start too, so a first scan is
          // a clean baseline (sold 0) instead of a false full-pack sale. The
          // entry's timestamp + shift are recorded on save (addEntry).
          const { pack, ticket } = parseScratchBarcode(code);
          const packNo = pack || code;
          setF((p) => {
            const next = { ...p, pack: packNo };
            if (ticket != null) {
              next.endno = String(ticket);
              const hasPrev = entries.some((e) =>
                e.kind === "scratch" && e.locationId === p.locationId && (e.pack || "") === packNo);
              if (!hasPrev) next.startno = String(ticket);
            }
            return next;
          });
          onSaved?.(ticket != null ? t("toast.scan_ticket", { n: ticket }) : t("toast.pack_scanned"));
        }} />

      {/* Walk scanner — continuous: the camera stays open pack after pack. */}
      <BarcodeScanner open={walkOpen} onClose={() => setWalkOpen(false)}
        continuous status={lastScan}
        title={t("scratch.walk_scan_title")}
        hint={t("scratch.walk_scan_hint")}
        onDetected={onWalkScan} />

      {/* Pack-flow report: pick the range, print the exact-missing-tickets table. */}
      {rptOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setRptOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("scratch.report_title")}
            className="bg-surface rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <h2 className="font-semibold text-[15px]">{t("scratch.report_title")}</h2>
              <button className="btn-ghost text-[13px] px-2.5 py-1" onClick={() => setRptOpen(false)} aria-label={t("shell.close")}><span aria-hidden="true">✕</span></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("scratch.report_from")}>
                  <input type="date" className="input" value={rpt.from} max={rpt.to}
                    onChange={(e) => setRpt((p) => ({ ...p, from: e.target.value }))} />
                </Field>
                <Field label={t("scratch.report_to")}>
                  <input type="date" className="input" value={rpt.to} min={rpt.from}
                    onChange={(e) => setRpt((p) => ({ ...p, to: e.target.value }))} />
                </Field>
              </div>
              <Field label={t("common.location")}>
                <select className="input" value={rpt.locationId}
                  onChange={(e) => setRpt((p) => ({ ...p, locationId: e.target.value }))}>
                  <option value="">{t("scratch.report_all_loc")}</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <p className="text-xs text-muted leading-relaxed">{t("scratch.report_hint")}</p>
              {rptErr && <p role="alert" className="text-[13px] text-neg">{rptErr}</p>}
              <button className="btn-primary" disabled={rptBusy || !rpt.from || !rpt.to || rpt.from > rpt.to} onClick={runReport}>
                🖨 {rptBusy ? t("scratch.report_busy") : t("scratch.report_print")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
