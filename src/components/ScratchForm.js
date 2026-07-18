"use client";
import { useEffect, useMemo, useState, useId } from "react";
import { addEntry } from "@/lib/data";
import { money, ticketsSold } from "@/lib/utils";
import { parseScratchBarcode, packGameKey } from "@/lib/scratch-barcode";
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

export default function ScratchForm({ onSaved, locations, drawers, locName, entries = [] }) {
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
    onSaved?.(t("toast.saved_scratch"));
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px] flex items-center gap-2"><TabIcon id="scratch" size={18} className="text-gold" /> {t("scratch.title")}</h2>
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
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={t("scratch.game")}>
            <input className="input" value={f.game} onChange={onGame} placeholder="Lucky 7s"
              list={knownGames.length ? gameListId : undefined} autoComplete="off" />
            {knownGames.length > 0 && (
              <datalist id={gameListId}>
                {knownGames.map((g) => <option key={g.game} value={g.game} />)}
              </datalist>
            )}
          </Field>
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
    </div>
  );
}
