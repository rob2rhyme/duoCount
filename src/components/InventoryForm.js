"use client";
import { useEffect, useMemo, useState, useId } from "react";
import { addEntry } from "@/lib/data";
import { expectedStock } from "@/lib/utils";
import { searchTerms, matchesTerms } from "@/lib/text-match";
import { validateInventory } from "@/lib/count-validation";
import { defaultShift, pickRemembered, loadContext, saveContext } from "@/lib/count-context";
import { useSaveState } from "@/lib/use-save-state";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import SaveError from "./SaveError";
import Field from "./Field";
import SearchInput from "./SearchInput";
import BarcodeScanner from "./BarcodeScanner";

const today = () => new Date().toISOString().slice(0, 10);

export default function InventoryForm({ onSaved, locations, items, entries, locName }) {
  const { profile, vendor, isManager } = useSession();
  const { t } = useLang();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;
  const [f, setF] = useState({
    date: today(), shift: defaultShift(new Date().getHours()), locationId: "", itemId: "",
    startQty: "", received: "", removed: "", soldQty: "", counted: "",
  });
  const { busy, error, run } = useSaveState();
  const [itemSearch, setItemSearch] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const itemFieldId = useId();
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  // default location: locked one, else the one this person last used, else first active
  useEffect(() => {
    if (f.locationId || !(lockedLoc || locations[0])) return;
    const remembered = lockedLoc || pickRemembered(loadContext(vendor.id, profile.id).locationId, locations);
    setF((p) => ({ ...p, locationId: remembered }));
  }, [locations, lockedLoc]); // eslint-disable-line

  const locItems = useMemo(
    () => items.filter((i) => i.active !== false && i.locationId === f.locationId),
    [items, f.locationId]
  );
  const searchable = locItems.length > 15;
  const itemTerms = useMemo(() => searchTerms(itemSearch), [itemSearch]);
  const shownItems = searchable && itemTerms.length
    ? locItems.filter((i) => matchesTerms(`${i.name} ${i.category || ""}`, itemTerms))
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

  // Blind mode hides the expected/over-short readout until the count is committed
  // (same as cash). Inventory flagging is opt-in: only when the owner set a
  // positive unit threshold. Mirrors the rules' flagConsistent for inventory.
  const blind = vendor.blindCounts === true;
  const invThreshold = Number(vendor.invVarianceThreshold);
  const flaggable = Number.isFinite(invThreshold) && invThreshold > 0;
  const flagged = flaggable && Math.abs(diff) >= invThreshold;

  const valid = validateInventory(f);
  // Whether any movement (received / sold / removed) has been entered — used to
  // flag the collapsed details section so a filled-in adjustment isn't hidden.
  const hasMovement = [f.received, f.soldQty, f.removed].some((v) => String(v ?? "").trim() !== "" && Number(v) !== 0);

  // Throws on failure so useSaveState can show a persistent, retryable error
  // rather than a toast that vanishes before the clerk notices the save failed.
  async function save() {
    if (blind && !confirm(t("confirm.blind"))) return;
    await addEntry(vendor.id, {
      kind: "inventory", date: f.date, shift: f.shift,
      locationId: f.locationId, locationName: locName(f.locationId),
      itemId: item.id, itemName: item.name, unit,
      startQty: Number(f.startQty) || 0, received: Number(f.received) || 0,
      removed: Number(f.removed) || 0, soldQty: Number(f.soldQty) || 0,
      counted: Number(f.counted) || 0,
      expected, diff, blind,
      flagged, varianceStatus: flagged ? "open" : "none",
      by: profile.name, byId: profile.id, byRole: profile.role,
    });
    saveContext(vendor.id, profile.id, { locationId: f.locationId });
    setF((p) => ({ ...p, startQty: String(Number(p.counted) || 0), received: "", removed: "", soldQty: "", counted: "" }));
    const result = diff === 0 ? t("toast.balanced")
      : diff > 0 ? t("toast.over_units", { n: diff, unit })
        : t("toast.short_units", { n: Math.abs(diff), unit });
    onSaved?.(blind ? t("toast.saved_result", { result }) : t("toast.saved_inventory"));
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px]"><span aria-hidden="true">📦</span> {t("inventory.title")}</h2>
      </div>
      <div className="p-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={t("common.location")}>
            <select className="input" value={f.locationId} onChange={set("locationId")} disabled={!!lockedLoc}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></Field>
          <div><label htmlFor={itemFieldId} className="label">{t("inventory.item")}</label>
            <div className="flex gap-2">
              <select id={itemFieldId} className="input min-w-0" value={f.itemId} onChange={set("itemId")}>
                {locItems.length === 0 && <option value="">{t("inventory.no_items")}</option>}
                {shownItems.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}{i.category ? ` · ${i.category}` : ""}</option>
                ))}
              </select>
              <button type="button" className="btn-ghost min-h-[44px] w-11 px-0 flex-shrink-0 text-lg" title={t("inventory.scan_item")}
                aria-label={t("inventory.scan_item")} onClick={() => setScanOpen(true)}>📷</button>
            </div></div>
        </div>
        {searchable && (
          <SearchInput value={itemSearch} onChange={setItemSearch}
            placeholder={t("inventory.search", { n: locItems.length })} label={t("inventory.search_label")} />
        )}
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={t("common.date")}><input type="date" className="input" value={f.date} onChange={set("date")} /></Field>
          <Field label={t("common.shift")}>
            <select className="input" value={f.shift} onChange={set("shift")}>
              <option value="open">🌅 {t("common.opening")}</option><option value="close">🌇 {t("common.closing")}</option>
            </select></Field>
        </div>
        <div>
          <Field label={t("inventory.counted")}><input type="number" inputMode="numeric" className="input" value={f.counted} onChange={set("counted")} placeholder="0" /></Field>
          <p className="text-[12px] text-muted mt-1">{t("inventory.counted_hint")}</p>
        </div>

        <div className="rounded-xl border border-line overflow-hidden">
          <button type="button" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails}
            className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-[13px] font-semibold text-fg hover:bg-subtle transition">
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate">{t("inventory.movement")}</span>
              <span className="text-muted font-normal hidden sm:inline">{t("inventory.movement_sub")}</span>
              {hasMovement && !showDetails && <span className="w-1.5 h-1.5 rounded-full bg-brass flex-shrink-0" aria-label={t("inventory.has_entries")} />}
            </span>
            <span aria-hidden="true" className={`text-muted flex-shrink-0 transition-transform ${showDetails ? "rotate-180" : ""}`}>⌄</span>
          </button>
          {showDetails && (
            <div className="px-3.5 pb-3.5 pt-3 space-y-3.5 border-t border-line">
              <div className="grid grid-cols-2 gap-3.5">
                <Field label={t("inventory.startqty")}><input type="number" inputMode="numeric" className="input" value={f.startQty} onChange={set("startQty")} placeholder="0" /></Field>
                <Field label={t("inventory.received")}><input type="number" inputMode="numeric" className="input" value={f.received} onChange={set("received")} placeholder="0" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <Field label={t("inventory.sold")}><input type="number" inputMode="numeric" className="input" value={f.soldQty} onChange={set("soldQty")} placeholder="0" /></Field>
                <Field label={t("inventory.removed")}><input type="number" inputMode="numeric" className="input" value={f.removed} onChange={set("removed")} placeholder="0" /></Field>
              </div>
            </div>
          )}
        </div>

        {blind ? (
          <div className="bg-panel border border-dashed border-line rounded-xl px-3.5 py-4 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("cash.blind")}</div>
            <div className="text-sm text-muted mt-1">{t("cash.blind_hint")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-line rounded-xl overflow-hidden">
            <div className="bg-panel px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("inventory.expected")}</div>
              <div className="text-xl font-bold font-mono mt-0.5">{expected} <span className="text-sm font-normal text-muted">{unit}s</span></div>
            </div>
            <div className="bg-panel px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("common.over_short")}</div>
              <div className={`text-xl font-bold font-mono mt-0.5 ${diffClass}`}>
                {diff !== 0 && <span aria-hidden="true">{diff > 0 ? "▲ " : "▼ "}</span>}
                {diff >= 0 ? "+" : ""}{diff} <span className="text-sm font-normal text-muted">{unit}s</span>
              </div>
            </div>
          </div>
        )}

        <SaveError message={error} onRetry={() => run(save)} busy={busy} />
        <button className="btn-primary" disabled={busy || !valid.ok || !item} onClick={() => run(save)}>
          <span aria-hidden="true">✓</span> {busy ? t("common.saving") : t("common.save_sign")}
        </button>
        {!valid.ok && <p className="text-[12px] text-muted -mt-1.5">{t(`err.${valid.code}`)}</p>}
        <p className="text-xs text-muted leading-relaxed">{t("inventory.helper")}</p>
      </div>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        title={t("inventory.scan_title")}
        hint={t("inventory.scan_hint")}
        onDetected={(code) => {
          setScanOpen(false);
          const match = locItems.find((i) => i.barcode && i.barcode === code);
          if (match) {
            setF((p) => ({ ...p, itemId: match.id }));
            onSaved?.(t("toast.item_selected", { name: match.name }));
          } else {
            onSaved?.(t("toast.barcode_no_match"));
          }
        }} />
    </div>
  );
}
