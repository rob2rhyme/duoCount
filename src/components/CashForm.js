"use client";
import { useEffect, useState, useId } from "react";
import { addEntry } from "@/lib/data";
import { money, expectedCash } from "@/lib/utils";
import { validateCash } from "@/lib/count-validation";
import { defaultShift, pickRemembered, loadContext, saveContext } from "@/lib/count-context";
import { useSaveState } from "@/lib/use-save-state";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import SaveError from "./SaveError";
import Field from "./Field";
import TabIcon from "./TabIcon";

const today = () => new Date().toISOString().slice(0, 10);

// Bill denominations a US drawer is counted in, largest first. Coins are
// entered as a single dollar value so the drawer total stays accurate without
// four extra rows.
const DENOMS = [100, 50, 20, 10, 5, 1];
const emptyDenoms = () => ({ 100: "", 50: "", 20: "", 10: "", 5: "", 1: "" });

export default function CashForm({ onSaved, locations, drawers, locName }) {
  const { profile, vendor, isManager } = useSession();
  const { t } = useLang();
  const lockedLoc = !isManager && profile.locationId ? profile.locationId : null;
  const [f, setF] = useState({
    date: today(), shift: defaultShift(new Date().getHours()), locationId: "", drawerId: "",
    start: "", sales: "", paidout: "", counted: "",
  });
  const { busy, error, run } = useSaveState();
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const countedId = useId();

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

  // default location: locked one, else the one this person last used here, else first active
  useEffect(() => {
    if (f.locationId || !(lockedLoc || locations[0])) return;
    const remembered = lockedLoc || pickRemembered(loadContext(vendor.id, profile.id).locationId, locations);
    setF((p) => ({ ...p, locationId: remembered }));
  }, [locations, lockedLoc]); // eslint-disable-line

  const locDrawers = drawers.filter((d) => d.active !== false && d.locationId === f.locationId);
  // default drawer: the one last used here if it's still valid, else one named like "POS"
  useEffect(() => {
    if (locDrawers.length && !locDrawers.some((d) => d.id === f.drawerId)) {
      const rememberedId = loadContext(vendor.id, profile.id).cashDrawerId;
      const pick = locDrawers.find((d) => d.id === rememberedId)
        || locDrawers.find((d) => /pos/i.test(d.name)) || locDrawers[0];
      setF((p) => ({ ...p, drawerId: pick.id }));
    }
  }, [f.locationId, drawers]); // eslint-disable-line

  const expected = expectedCash(f);
  // An opening count has no sales or paid-outs yet — expected is just the
  // starting drawer — so those two fields are hidden and stored as 0.
  const isOpen = f.shift === "open";
  // When the counter is on, the tallied denominations are the counted amount.
  const countedValue = useCounter ? denomTotal : (Number(f.counted) || 0);
  const diff = countedValue - expected;
  const diffClass = Math.abs(diff) < 0.005 ? "text-fg" : diff > 0 ? "text-pos" : "text-neg";
  const drawer = locDrawers.find((d) => d.id === f.drawerId);

  // Blind mode hides the readout for everyone (managers included) until the
  // count is committed; the entry itself is append-only, so the number is
  // locked before the counter sees the target.
  const blind = vendor.blindCounts === true;
  const threshold = Number(vendor.varianceThreshold ?? 5);

  const valid = validateCash(f, { useCounter });

  // Throws on failure so useSaveState surfaces a persistent, retryable error
  // (a vanishing toast could hide a failed save on flaky wifi). The blind-count
  // confirm cancels quietly — it's a deliberate abort, not a failure.
  async function save() {
    if (blind && !confirm(t("confirm.blind"))) return;
    const flagged = Math.abs(diff) >= threshold;
    await addEntry(vendor.id, {
      kind: "cash", date: f.date, shift: f.shift,
      locationId: f.locationId, locationName: locName(f.locationId),
      drawerId: drawer.id, drawerName: drawer.name,
      start: Number(f.start) || 0, sales: isOpen ? 0 : Number(f.sales) || 0,
      paidout: isOpen ? 0 : Number(f.paidout) || 0, counted: countedValue,
      expected, diff, blind,
      flagged, varianceStatus: flagged ? "open" : "none",
      by: profile.name, byId: profile.id, byRole: profile.role,
    });
    saveContext(vendor.id, profile.id, { locationId: f.locationId, cashDrawerId: drawer.id });
    setF((p) => ({ ...p, start: "", sales: "", paidout: "", counted: "" }));
    setDenoms(emptyDenoms());
    setCoins("");
    // In blind mode the result is revealed only after the commit.
    const result = Math.abs(diff) < 0.005 ? t("toast.balanced")
      : diff > 0 ? t("toast.over_amount", { amount: money(diff) })
        : t("toast.short_amount", { amount: money(Math.abs(diff)) });
    onSaved?.(blind ? t("toast.saved_result", { result }) : t("toast.saved_cash"));
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px] flex items-center gap-2"><TabIcon id="cash" size={18} className="text-gold" /> {t("cash.title")}</h2>
      </div>
      <div className="p-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <Field label={t("common.location")}>
            <select className="input" value={f.locationId} onChange={set("locationId")} disabled={!!lockedLoc}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></Field>
          <Field label={t("cash.drawer")}>
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
        {(() => {
          const countedInput = useCounter ? (
            <div className="input flex items-center justify-between font-mono font-semibold" aria-live="polite">
              <span>{money(denomTotal)}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted font-sans">{t("cash.from_counter")}</span>
            </div>
          ) : (
            <input id={countedId} type="number" inputMode="decimal" className="input" value={f.counted} onChange={set("counted")} placeholder="0.00" />
          );
          const startField = (
            <Field label={t("cash.start")}><input type="number" inputMode="decimal" className="input" value={f.start} onChange={set("start")} placeholder="0.00" /></Field>
          );
          const countedField = (
            <div>
              <label htmlFor={countedId} className="label">{isOpen ? t("cash.counted_now") : t("cash.counted_close")}</label>
              {countedInput}
            </div>
          );
          // Opening: just the starting drawer + the count (no sales/paid-outs yet).
          if (isOpen)
            return <div className="grid grid-cols-2 gap-3.5">{startField}{countedField}</div>;
          return (
            <>
              <div className="grid grid-cols-2 gap-3.5">
                {startField}
                <Field label={t("cash.sales")}><input type="number" inputMode="decimal" className="input" value={f.sales} onChange={set("sales")} placeholder="0.00" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <Field label={t("cash.paidout")}><input type="number" inputMode="decimal" className="input" value={f.paidout} onChange={set("paidout")} placeholder="0.00" /></Field>
                {countedField}
              </div>
            </>
          );
        })()}

        <button type="button" onClick={() => setUseCounter((v) => !v)} aria-pressed={useCounter}
          className="btn-ghost w-full min-h-[44px] justify-between text-sm font-semibold">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true">🧮</span>
            {useCounter ? t("cash.counter_on") : t("cash.counter_off")}
          </span>
          <span className="text-[12px] font-normal text-muted">{useCounter ? t("cash.counter_hint_on") : t("cash.counter_hint_off")}</span>
        </button>

        {useCounter && (
          <div className="bg-panel border border-line rounded-xl p-3.5 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">{t("cash.by_denom")}</div>
            {DENOMS.map((d) => {
              const n = parseInt(denoms[d], 10) || 0;
              return (
                <div key={d} className="flex items-center gap-2.5">
                  <span className="w-12 text-sm font-semibold font-mono text-right">${d}</span>
                  <span className="text-muted text-sm">×</span>
                  <input type="number" inputMode="numeric" min="0" step="1"
                    className="input py-1.5 w-24" value={denoms[d]} onChange={setDenom(d)} placeholder="0"
                    aria-label={t("cash.bills_of", { d })} />
                  <span className="ml-auto font-mono text-sm tabular-nums text-muted">{money(d * n)}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2.5">
              <span className="w-12 text-sm font-semibold font-mono text-right">{t("cash.coins")}</span>
              <span className="text-muted text-sm">$</span>
              <input type="number" inputMode="decimal" min="0" step="0.01"
                className="input py-1.5 w-24" value={coins}
                onChange={(e) => setCoins(e.target.value)} placeholder="0.00"
                aria-label={t("cash.coins_total")} />
              <span className="ml-auto font-mono text-sm tabular-nums text-muted">{money(coinValue)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-2.5 mt-1">
              <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("cash.counter_total")}</span>
              <span className="font-mono font-bold text-lg">{money(denomTotal)}</span>
            </div>
          </div>
        )}

        {blind ? (
          <div className="bg-panel border border-dashed border-line rounded-xl px-3.5 py-4 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("cash.blind")}</div>
            <div className="text-sm text-muted mt-1">{t("cash.blind_hint")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-px bg-line rounded-xl overflow-hidden">
            <div className="bg-panel px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("cash.expected")}</div>
              <div className="text-xl font-bold font-mono mt-0.5">{money(expected)}</div>
            </div>
            <div className="bg-panel px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{t("common.over_short")}</div>
              <div className={`text-xl font-bold font-mono mt-0.5 ${diffClass}`}>
                {Math.abs(diff) >= 0.005 && <span aria-hidden="true">{diff > 0 ? "▲ " : "▼ "}</span>}
                {diff >= 0 ? "+" : ""}{money(diff)}
              </div>
            </div>
          </div>
        )}

        <SaveError message={error} onRetry={() => run(save)} busy={busy} />
        <button className="btn-primary" disabled={busy || !valid.ok} onClick={() => run(save)}>
          <span aria-hidden="true">✓</span> {busy ? t("common.saving") : t("common.save_sign")}
        </button>
        {!valid.ok && <p className="text-[12px] text-muted -mt-1.5">{t(`err.${valid.code}`)}</p>}
        <p className="text-xs text-muted leading-relaxed">{isOpen ? t("cash.helper_open") : t("cash.helper_close")} {t("cash.helper_sig")}</p>
      </div>
    </div>
  );
}
