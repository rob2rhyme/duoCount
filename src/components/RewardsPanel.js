"use client";
import { useMemo, useState, useId } from "react";
import { apiRewards } from "@/lib/data";
import { money } from "@/lib/utils";
import { resolveRewards, rewardTiers, tierDollarValue, vipTierFor, canRedeem, canRedeemTier, normalizePhone, maskPhone } from "@/lib/rewards";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import EmptyState, { IconReceipt } from "./EmptyState";
import Field from "./Field";
import TabIcon from "./TabIcon";
import BarcodeScanner from "./BarcodeScanner";

// Customer rewards — the register flow (rewards-program-spec.md, Phase 1).
// Zero hardware: the customer's phone number IS the card. A clerk finds a
// customer in the searchable list (or enrolls a new number), earns points on
// the qualifying sale total, and redeems when the balance clears the bar. Every
// write happens server-side (/api/rewards) as a signed, append-only ledger
// line; this screen only reads (the live customer list) and asks.

const LIST_CAP = 60; // render a bounded list; search finds the rest

// Two initials for the avatar chip — from the name, else a phone glyph.
const initials = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "#";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
};
const lastEarnDate = (c) => {
  const v = c?.lastEarnAt;
  const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null);
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export default function RewardsPanel({ onToast, customers = [] }) {
  const { vendor, isManager, isOwner } = useSession();
  const { t } = useLang();
  const rules = resolveRewards(vendor?.rewards);
  const searchId = useId();

  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");         // the working phone (real digits) for API calls
  const [customer, setCustomer] = useState(null); // selected/enrolled customer (display shape)
  const [enrollPhone, setEnrollPhone] = useState(null); // set while adding a new number
  const [name, setName] = useState("");
  const [sale, setSale] = useState("");
  const [busy, setBusy] = useState("");           // "" | enroll | earn | redeem | update | adjust
  const [error, setError] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  // Owner-only controls on the customer card: inline profile edit + a signed
  // points adjustment (the server requires the note — it's a ledger line).
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [adjPts, setAdjPts] = useState("");
  const [adjNote, setAdjNote] = useState("");

  const localize = (e) => (e?.code ? t(`rewarderr.${e.code}`) : e?.message || t("rewarderr.generic"));

  async function run(kind, payload, after) {
    setBusy(kind); setError("");
    try { after(await apiRewards(payload)); }
    catch (e) { setError(localize(e)); }
    setBusy("");
  }

  // Live list, newest activity first, filtered by the search box (name or the
  // typed digits against the real phone). Phones are only ever shown masked.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = query.replace(/\D/g, "");
    const rows = customers.filter((c) => {
      if (!q) return true;
      const nameHit = c.name && c.name.toLowerCase().includes(q);
      const phoneHit = qDigits && String(c.phone || "").includes(qDigits);
      return nameHit || phoneHit;
    });
    rows.sort((a, b) => {
      const da = lastEarnDate(a)?.getTime() || 0;
      const db = lastEarnDate(b)?.getTime() || 0;
      if (db !== da) return db - da;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return rows;
  }, [customers, query]);

  const enrolledPhones = useMemo(
    () => new Set(customers.map((c) => String(c.phone || ""))), [customers]);
  // A search that is a valid, not-yet-enrolled phone offers a one-tap enroll.
  const queryPhone = normalizePhone(query);
  const canAddNew = queryPhone && !enrolledPhones.has(queryPhone);

  function selectCustomer(c) {
    // Same lifetime floor as the server: legacy docs predate lifetimePoints.
    const lifetime = Math.max(Number(c.lifetimePoints) || 0, Number(c.pointsBalance) || 0);
    setPhone(String(c.phone || ""));
    setCustomer({
      id: c.id, name: c.name || null, phone: maskPhone(c.phone), pointsBalance: c.pointsBalance || 0,
      lifetimePoints: lifetime, vipTier: vipTierFor(lifetime, vendor?.rewards)?.name || null,
      currentStreak: Number(c.currentStreak) || 0, longestStreak: Number(c.longestStreak) || 0,
    });
    setEnrollPhone(null); setName(""); setSale(""); setError("");
  }
  function startEnroll(p) {
    setEnrollPhone(p); setPhone(p); setName(""); setError("");
  }
  function back() {
    setCustomer(null); setEnrollPhone(null); setSale(""); setError("");
    setEditing(false); setAdjPts(""); setAdjNote("");
  }

  // Scan a customer code (a QR or barcode that encodes their phone number —
  // e.g. a printed loyalty card). Enrolled → open their card; new but valid →
  // jump straight into enrollment with the number filled.
  function onScanned(code) {
    setScanOpen(false);
    const digits = normalizePhone(String(code || "").replace(/\D/g, ""));
    if (!digits) { setError(t("rewarderr.bad_phone")); return; }
    const hit = customers.find((c) => String(c.phone || "") === digits);
    if (hit) selectCustomer(hit);
    else startEnroll(digits);
  }

  function startEdit() {
    setEditName(customer?.name || ""); setEditPhone(phone); setEditing(true); setError("");
  }
  const saveEdit = () =>
    run("update", { action: "update", phone, newName: editName, newPhone: editPhone }, (r) => {
      setCustomer((c) => ({ ...c, ...r.customer }));
      if (r.phoneDigits) setPhone(r.phoneDigits);
      setEditing(false);
      onToast?.(t("rw.toast_updated"));
    });
  const adjust = () =>
    run("adjust", { action: "adjust", phone, points: Math.trunc(Number(adjPts)), note: adjNote }, (r) => {
      setCustomer((c) => ({ ...c, pointsBalance: r.balance }));
      setAdjPts(""); setAdjNote("");
      onToast?.(t("rw.toast_adjusted", { n: r.adjusted, b: r.balance }));
    });

  const enroll = () =>
    run("enroll", { action: "enroll", phone, name }, (r) => {
      setCustomer(r.customer); setEnrollPhone(null); setQuery("");
      if (r.enrolled) onToast?.(t("rw.toast_enrolled"));
    });
  const earn = () =>
    run("earn", { action: "earn", phone, saleDollars: Number(sale) }, (r) => {
      setCustomer((c) => ({
        ...c, pointsBalance: r.balance,
        currentStreak: r.streak ?? c.currentStreak,
        longestStreak: Math.max(Number(c.longestStreak) || 0, r.streak || 0),
      }));
      setSale("");
      onToast?.(r.multiplier > 1
        ? t("rw.toast_earned_vip", { n: r.earned, b: r.balance, m: r.multiplier, tier: r.vipTier })
        : t("rw.toast_earned", { n: r.earned, b: r.balance }));
    });
  const redeem = (tier) =>
    run("redeem", { action: "redeem", phone, tierId: tier.id }, (r) => {
      setCustomer((c) => ({ ...c, pointsBalance: r.balance }));
      // The toast tells the clerk exactly what to hand over, per grant type.
      const msg = r.rewardType === "percent"
        ? t("rw.toast_redeemed_pct", { reward: r.reward, p: r.percent, cap: money(r.cap) })
        : r.rewardType === "item"
          ? t("rw.toast_redeemed_item", { reward: r.reward })
          : r.reward
            ? t("rw.toast_redeemed_named", { reward: r.reward, value: money(r.value) })
            : t("rw.toast_redeemed", { value: money(r.value) });
      onToast?.(msg);
    });

  if (!rules.enabled) {
    return (
      <div className="card">
        <EmptyState icon={<IconReceipt />} title={t("rw.disabled_title")}
          subtitle={isManager ? t("rw.disabled_sub_mgr") : t("rw.disabled_sub_emp")} />
      </div>
    );
  }

  const tiers = rewardTiers(vendor?.rewards); // configured tiers, or the single legacy reward
  const goal = tiers[0].points;               // progress tracks the cheapest reward
  const balance = customer?.pointsBalance || 0;
  const pct = Math.min(100, Math.round((balance / goal) * 100));
  const countKey = customers.length === 1 ? "rw.count_one" : "rw.count_other";

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-line">
        <h2 className="font-semibold text-[15px] flex items-center gap-2"><TabIcon id="rewards" size={18} className="text-gold" /> {t("rw.title")}</h2>
        <p className="text-[13px] text-muted mt-0.5">{t("rw.sub", { earn: rules.earnPerDollar, goal, value: money(rules.redeemValue) })}</p>
      </div>

      <div className="p-4 space-y-3.5">
        {/* ---- Working view: a selected (or being-enrolled) customer ---- */}
        {(customer || enrollPhone) ? (
          <>
            <button type="button" className="text-[13px] text-muted hover:text-fg font-semibold flex items-center gap-1.5" onClick={back}>
              <span aria-hidden="true">←</span> {t("rw.back")}
            </button>

            {enrollPhone && !customer && (
              <div className="border border-line rounded-xl p-3.5 space-y-3 bg-panel">
                <div>
                  <span className="font-medium text-[14px]">{t("rw.new_title")}</span>
                  <p className="text-xs text-muted leading-relaxed">{t("rw.new_sub")}</p>
                  <p className="text-[12px] text-muted font-mono mt-1">{maskPhone(enrollPhone)}</p>
                </div>
                <Field label={t("rw.name_label")}>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("rw.name_ph")} />
                </Field>
                {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
                <button className="btn-primary w-full" disabled={!!busy} onClick={enroll}>
                  {busy === "enroll" ? t("rw.enrolling") : t("rw.enroll")}
                </button>
              </div>
            )}

            {customer && (
              <div className="border border-line rounded-xl p-3.5 space-y-3.5 bg-panel">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full bg-brass text-ink font-bold text-sm">{initials(customer.name)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center gap-2">
                      <span className="truncate">{customer.name || t("rw.customer_fallback")}</span>
                      {customer.vipTier && (
                        <span className="flex-shrink-0 text-[10px] uppercase tracking-wide font-bold text-brass border border-brass/50 rounded px-1.5 py-0.5">{customer.vipTier}</span>
                      )}
                      {customer.currentStreak >= 2 && (
                        <span className="flex-shrink-0 text-[11px] font-semibold text-muted" title={t("rw.streak_chip", { n: customer.currentStreak })} aria-label={t("rw.streak_chip", { n: customer.currentStreak })}>
                          🔥{customer.currentStreak}
                        </span>
                      )}
                    </div>
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
                      ? (tiers[0].name
                        ? t("rw.ready_named", { name: tiers[0].name })
                        : t("rw.ready", { value: money(tierDollarValue(tiers[0])) }))
                      : (tiers[0].name
                        ? t("rw.progress_named", { n: balance, goal, name: tiers[0].name, left: goal - balance })
                        : t("rw.progress", { n: balance, goal, value: money(tierDollarValue(tiers[0])), left: goal - balance }))}
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

                {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5">{t("rw.rewards_label")}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {tiers.map((tier) => {
                      const ok = canRedeemTier(balance, tier);
                      // Per-type grant line: cash/item show the $, percent its
                      // % and cap — what the clerk actually hands over.
                      const grant = tier.type === "percent"
                        ? t("rw.tier_pct", { p: tier.percent, cap: money(tier.cap) })
                        : tierDollarValue(tier) > 0 ? money(tierDollarValue(tier)) : "";
                      return (
                        <button key={tier.id} type="button" disabled={!!busy || !ok} onClick={() => redeem(tier)}
                          className={`rounded-xl border p-3 text-left transition ${ok ? "border-brass bg-brass/10 hover:bg-brass/20" : "border-line bg-panel opacity-60"}`}>
                          <div className="font-semibold text-[13px] truncate">{tier.name || t("rw.reward_default", { value: money(tierDollarValue(tier)) })}</div>
                          <div className="text-[12px] text-muted mt-0.5">
                            {t("rw.tier_cost", { n: tier.points })}{grant ? ` · ${grant}` : ""}
                          </div>
                          {tier.type === "item" && tier.withPurchase && (
                            <div className="text-[11px] text-muted mt-0.5">{t("rw.tier_wp")}</div>
                          )}
                          {!ok && <div className="text-[11px] text-muted mt-1">{t("rw.tier_need", { n: tier.points - balance })}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Owner tools: profile edit + a signed points adjustment.
                    Both write through the trusted route only. */}
                {isOwner && (
                  <div className="border-t border-line pt-3 space-y-3">
                    {!editing ? (
                      <button type="button" className="text-[13px] text-muted hover:text-fg font-semibold underline underline-offset-2"
                        onClick={startEdit}>{t("rw.edit_profile")}</button>
                    ) : (
                      <div className="space-y-2.5">
                        <Field label={t("rw.name_label")}>
                          <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t("rw.name_ph")} />
                        </Field>
                        <Field label={t("rw.phone_label")}>
                          <input className="input font-mono" inputMode="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                        </Field>
                        <div className="flex gap-2">
                          <button className="btn-primary flex-1" disabled={!!busy} onClick={saveEdit}>
                            {busy === "update" ? t("common.saving") : t("rw.edit_save")}
                          </button>
                          <button className="btn-ghost w-auto px-4" disabled={!!busy} onClick={() => setEditing(false)}>{t("rw.edit_cancel")}</button>
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5">{t("rw.adjust_title")}</div>
                      {/* flex ratios, not a fixed width — .input carries w-full,
                          and stacking w-24 on it loses to CSS order. */}
                      <div className="flex gap-2">
                        <input className="input min-w-0 flex-1 font-mono" type="number" step="1" value={adjPts}
                          placeholder="+50" onChange={(e) => setAdjPts(e.target.value)} aria-label={t("rw.adjust_title")} />
                        <input className="input min-w-0 flex-[2.5]" value={adjNote} placeholder={t("rw.adjust_note_ph")}
                          onChange={(e) => setAdjNote(e.target.value)} />
                        <button className="btn-ghost px-3 flex-shrink-0" disabled={!!busy || !Math.trunc(Number(adjPts)) || !adjNote.trim()} onClick={adjust}>
                          {busy === "adjust" ? t("common.saving") : t("rw.adjust_btn")}
                        </button>
                      </div>
                      <p className="text-xs text-muted mt-1.5 leading-relaxed">{t("rw.adjust_hint")}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* ---- List view: search + browsable customer list ---- */
          <>
            {/* Search + customer-code scan share one row (datalist lesson:
                keep this a manual label, not a second Field child). */}
            <div>
              <label htmlFor={searchId} className="label">{t("rw.search_label")}</label>
              <div className="flex gap-2">
                <input id={searchId} className="input min-w-0" value={query} placeholder={t("rw.search_ph")}
                  onChange={(e) => setQuery(e.target.value)} />
                <button type="button" className="btn-ghost min-h-[44px] w-11 px-0 flex-shrink-0 text-lg"
                  title={t("rw.scan_customer")} aria-label={t("rw.scan_customer")}
                  onClick={() => setScanOpen(true)}>📷</button>
              </div>
            </div>

            {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}

            {canAddNew && (
              <button type="button" className="w-full text-left border border-dashed border-brass/60 rounded-xl px-3.5 py-3 bg-panel hover:bg-subtle transition flex items-center gap-3"
                onClick={() => startEnroll(queryPhone)}>
                <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-brass/20 text-brass font-bold text-lg leading-none">+</span>
                <span className="min-w-0">
                  <span className="block font-medium text-[14px]">{t("rw.add_new")}</span>
                  <span className="block text-[12px] text-muted font-mono">{maskPhone(queryPhone)}</span>
                </span>
              </button>
            )}

            {customers.length > 0 && (
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                {t(countKey, { n: customers.length })}
              </div>
            )}

            {customers.length === 0 ? (
              <div className="border border-line rounded-xl p-3.5 bg-panel">
                <p className="text-[13px] text-muted leading-relaxed">{t("rw.list_empty")}</p>
                {isManager && <p className="text-xs text-muted mt-2 leading-relaxed">{t("rw.bulk_hint")}</p>}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-[13px] text-muted">{t("rw.no_match", { q: query.trim() })}</p>
            ) : (
              <div className="border border-line rounded-xl overflow-hidden divide-y divide-line-soft max-h-[26rem] overflow-y-auto">
                {filtered.slice(0, LIST_CAP).map((c) => {
                  const d = lastEarnDate(c);
                  return (
                    <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-subtle transition">
                      <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-brass/15 text-brass font-bold text-[13px]">{initials(c.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-[14px] truncate">{c.name || t("rw.customer_fallback")}</span>
                        <span className="block text-[12px] text-muted font-mono">{maskPhone(c.phone)}</span>
                      </span>
                      <span className="text-right flex-shrink-0">
                        <span className="block font-mono font-bold text-[15px]">{c.pointsBalance || 0}</span>
                        <span className="block text-[11px] text-muted">{d ? t("rw.last_earned", { date: d.toLocaleDateString() }) : t("rw.no_earn_yet")}</span>
                      </span>
                    </button>
                  );
                })}
                {filtered.length > LIST_CAP && (
                  <div className="px-3 py-2 text-[12px] text-muted bg-panel">{t("rw.list_more", { shown: LIST_CAP, total: filtered.length })}</div>
                )}
              </div>
            )}
          </>
        )}

        <p className="text-xs text-muted leading-relaxed">{t("rw.footer")}</p>
      </div>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)}
        title={t("rw.scan_customer")} hint={t("rw.scan_customer_hint")}
        onDetected={onScanned} />
    </div>
  );
}
