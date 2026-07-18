"use client";
import { useState } from "react";
import { apiRewards } from "@/lib/data";
import { money } from "@/lib/utils";
import { resolveRewards, canRedeem, normalizePhone } from "@/lib/rewards";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import EmptyState, { IconReceipt } from "./EmptyState";
import Field from "./Field";
import TabIcon from "./TabIcon";

// Customer rewards — the register flow (rewards-program-spec.md, Phase 1).
// Zero hardware: the customer's phone number IS the card. The clerk looks a
// number up, earns points on the qualifying sale total, and redeems when the
// balance clears the bar. Every write happens server-side (/api/rewards) as a
// signed, append-only ledger line; this screen only asks and shows.

export default function RewardsPanel({ onToast }) {
  const { vendor, isManager } = useSession();
  const { t } = useLang();
  const rules = resolveRewards(vendor?.rewards);

  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState(null); // server's public shape
  const [looked, setLooked] = useState(false);    // a lookup ran for this phone
  const [name, setName] = useState("");
  const [sale, setSale] = useState("");
  const [busy, setBusy] = useState("");           // "" | lookup | enroll | earn | redeem
  const [error, setError] = useState("");

  const localize = (e) => (e?.code ? t(`rewarderr.${e.code}`) : e?.message || t("rewarderr.generic"));
  const reset = () => { setCustomer(null); setLooked(false); setName(""); setSale(""); setError(""); };

  async function run(kind, payload, after) {
    setBusy(kind); setError("");
    try { after(await apiRewards(payload)); }
    catch (e) { setError(localize(e)); }
    setBusy("");
  }

  const lookup = () => {
    if (!normalizePhone(phone)) return setError(t("rewarderr.bad_phone"));
    run("lookup", { action: "lookup", phone }, (r) => { setCustomer(r.customer); setLooked(true); });
  };
  const enroll = () =>
    run("enroll", { action: "enroll", phone, name }, (r) => {
      setCustomer(r.customer); setLooked(true);
      if (r.enrolled) onToast?.(t("rw.toast_enrolled"));
    });
  const earn = () =>
    run("earn", { action: "earn", phone, saleDollars: Number(sale) }, (r) => {
      setCustomer((c) => ({ ...c, pointsBalance: r.balance }));
      setSale("");
      onToast?.(t("rw.toast_earned", { n: r.earned, b: r.balance }));
    });
  const redeem = () =>
    run("redeem", { action: "redeem", phone }, (r) => {
      setCustomer((c) => ({ ...c, pointsBalance: r.balance }));
      onToast?.(t("rw.toast_redeemed", { value: money(r.value) }));
    });

  if (!rules.enabled) {
    return (
      <div className="card">
        <EmptyState icon={<IconReceipt />} title={t("rw.disabled_title")}
          subtitle={isManager ? t("rw.disabled_sub_mgr") : t("rw.disabled_sub_emp")} />
      </div>
    );
  }

  const goal = rules.redeemPoints;
  const balance = customer?.pointsBalance || 0;
  const pct = Math.min(100, Math.round((balance / goal) * 100));

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px] flex items-center gap-2"><TabIcon id="rewards" size={18} className="text-gold" /> {t("rw.title")}</h2>
        <p className="text-[13px] text-muted mt-0.5">{t("rw.sub", { earn: rules.earnPerDollar, goal, value: money(rules.redeemValue) })}</p>
      </div>
      <div className="p-4 space-y-3.5">
        <Field label={t("rw.phone_label")}>
          <div className="flex gap-2">
            <input className="input font-mono min-w-0" inputMode="tel" value={phone} placeholder={t("rw.phone_ph")}
              onChange={(e) => { setPhone(e.target.value); reset(); }}
              onKeyDown={(e) => { if (e.key === "Enter") lookup(); }} />
            <button className="btn-ghost whitespace-nowrap px-4" disabled={!!busy} onClick={lookup}>
              {busy === "lookup" ? t("rw.looking") : t("rw.lookup")}
            </button>
          </div>
        </Field>

        {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}

        {looked && !customer && (
          <div className="border border-line rounded-xl p-3.5 space-y-3 bg-panel">
            <div>
              <span className="font-medium text-[14px]">{t("rw.new_title")}</span>
              <p className="text-xs text-muted leading-relaxed">{t("rw.new_sub")}</p>
            </div>
            <Field label={t("rw.name_label")}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("rw.name_ph")} />
            </Field>
            <button className="btn-primary w-full" disabled={!!busy} onClick={enroll}>
              {busy === "enroll" ? t("rw.enrolling") : t("rw.enroll")}
            </button>
          </div>
        )}

        {customer && (
          <div className="border border-line rounded-xl p-3.5 space-y-3.5 bg-panel">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{customer.name || t("rw.customer_fallback")}</div>
                <div className="text-[12px] text-muted font-mono">{customer.phone}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-2xl font-bold font-mono">{balance}</div>
                <div className="text-[11px] text-muted uppercase tracking-wide font-semibold">{t("rw.points")}</div>
              </div>
            </div>

            <div>
              <div className="h-2 rounded-full bg-line overflow-hidden">
                <div className="h-full bg-brass transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[12px] text-muted mt-1.5">
                {canRedeem(balance, rules)
                  ? t("rw.ready", { value: money(rules.redeemValue) })
                  : t("rw.progress", { n: balance, goal, value: money(rules.redeemValue), left: goal - balance })}
              </p>
            </div>

            <div>
              <Field label={t("rw.sale_label")}>
                <div className="flex gap-2">
                  <input className="input font-mono min-w-0" type="number" inputMode="decimal" min="0" step="0.01"
                    value={sale} placeholder="0.00" onChange={(e) => setSale(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && Number(sale) > 0) earn(); }} />
                  <button className="btn-ghost whitespace-nowrap px-4" disabled={!!busy || !(Number(sale) > 0)} onClick={earn}>
                    {busy === "earn" ? t("rw.earning") : t("rw.earn")}
                  </button>
                </div>
              </Field>
              <p className="text-xs text-muted mt-1.5 leading-relaxed">{t("rw.sale_hint")}</p>
            </div>

            <button className="btn-primary w-full" disabled={!!busy || !canRedeem(balance, rules)} onClick={redeem}>
              {busy === "redeem" ? t("rw.redeeming") : t("rw.redeem", { goal, value: money(rules.redeemValue) })}
            </button>
          </div>
        )}

        <p className="text-xs text-muted leading-relaxed">{t("rw.footer")}</p>
      </div>
    </div>
  );
}
