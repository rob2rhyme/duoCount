"use client";
import { useMemo, useState, useId } from "react";
import { apiRewards } from "@/lib/data";
import { money } from "@/lib/utils";
import { resolveRewards, rewardTiers, tierDollarValue, vipTierFor, canRedeem, canRedeemTier, daysSince, isNewCustomer, isBirthdayMonth, normalizePhone, maskPhone } from "@/lib/rewards";
import { useSession } from "./SessionProvider";
import { useLang } from "./LangProvider";
import EmptyState, { IconReceipt } from "./EmptyState";
import Field from "./Field";
import TabIcon from "./TabIcon";
import BarcodeScanner from "./BarcodeScanner";
import ShowMore, { usePaged } from "./ShowMore";

// Customer rewards — the register flow (rewards-program-spec.md, Phase 1).
// Zero hardware: the customer's phone number IS the card. A clerk finds a
// customer in the searchable list (or enrolls a new number), earns points on
// the qualifying sale total, and redeems when the balance clears the bar. Every
// write happens server-side (/api/rewards) as a signed, append-only ledger
// line; this screen only reads (the live customer list) and asks.
//
// The customer card is tabbed (the Loyalzoo layout): Register — the earn /
// redeem / adjust actions; Profile — CRM fields (note, email, birthday,
// address), owner-editable; History — that customer's slice of the signed
// ledger (manager-gated, same feed as the Dashboard reward audit).

// The list flows the full length of the page (no inner scroll box). The
// customer roster and each customer's ledger reveal progressively via the
// shared "show more" control (usePaged), so a 1000+ customer store never paints
// every row at once. HISTORY_CAP stays as the outer backstop on ledger reads.
const HISTORY_CAP = 200; // newest ledger lines pulled for the History tab

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
// The owner sees the real number (they own the data); everyone else the mask.
const fmtPhone = (digits) => {
  const d = String(digits || "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
};

export default function RewardsPanel({ onToast, customers = [], rewardEvents = [] }) {
  const { vendor, isManager, isOwner } = useSession();
  const { t, lang } = useLang();
  const rules = resolveRewards(vendor?.rewards);
  const searchId = useId();

  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");         // the working phone (real digits) for API calls
  const [customer, setCustomer] = useState(null); // selected/enrolled customer (display shape)
  const [enrollPhone, setEnrollPhone] = useState(null); // set while adding a new number
  const [name, setName] = useState("");
  const [refBy, setRefBy] = useState(""); // optional referrer phone at enrollment
  const [sale, setSale] = useState("");
  const [busy, setBusy] = useState("");           // "" | enroll | earn | redeem | update | adjust
  const [error, setError] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [cardTab, setCardTab] = useState("register"); // register | profile | history
  // Owner-only edit state for the Profile tab (null = not editing) + the
  // signed points adjustment on the Register tab.
  const [prof, setProf] = useState(null);
  const [adjPts, setAdjPts] = useState("");
  const [adjNote, setAdjNote] = useState("");

  const localize = (e) => (e?.code ? t(`rewarderr.${e.code}`) : e?.message || t("rewarderr.generic"));
  const monthName = (m) =>
    new Date(2000, m - 1, 1).toLocaleDateString(lang === "es" ? "es" : "en", { month: "long" });

  async function run(kind, payload, after) {
    setBusy(kind); setError("");
    try { after(await apiRewards(payload)); }
    catch (e) { setError(localize(e)); }
    setBusy("");
  }

  // Live list, newest activity first, filtered by the search box (name or the
  // typed digits against the real phone).
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

  // Show 20 customers, reveal +10 per tap; a new search snaps back to the top.
  const custPage = usePaged(filtered, { initial: 20, step: 10, from: 20, resetKey: query });

  const enrolledPhones = useMemo(
    () => new Set(customers.map((c) => String(c.phone || ""))), [customers]);
  // A search that is a valid, not-yet-enrolled phone offers a one-tap enroll.
  const queryPhone = normalizePhone(query);
  const canAddNew = queryPhone && !enrolledPhones.has(queryPhone);

  // "Visited N days ago" — visits are earns (the only signed proof of one).
  const visitLabel = (c) => {
    const n = daysSince(c.lastEarnAt);
    if (n === null) return t("rw.no_visit");
    if (n === 0) return t("rw.visited_today");
    if (n === 1) return t("rw.visited_yesterday");
    return t("rw.visited_days", { n });
  };

  function selectCustomer(c) {
    // Same lifetime floor as the server: legacy docs predate lifetimePoints.
    const lifetime = Math.max(Number(c.lifetimePoints) || 0, Number(c.pointsBalance) || 0);
    setPhone(String(c.phone || ""));
    setCustomer({
      id: c.id, name: c.name || null, phone: maskPhone(c.phone), pointsBalance: c.pointsBalance || 0,
      lifetimePoints: lifetime, vipTier: vipTierFor(lifetime, vendor?.rewards)?.name || null,
      currentStreak: Number(c.currentStreak) || 0, longestStreak: Number(c.longestStreak) || 0,
      note: c.note || null, email: c.email || null, address: c.address || null,
      birthdayMonth: c.birthdayMonth ?? null, birthdayDay: c.birthdayDay ?? null,
      stamps: c.stamps || {},
    });
    setEnrollPhone(null); setName(""); setSale(""); setError("");
    setCardTab("register"); setProf(null); setAdjPts(""); setAdjNote("");
  }
  function startEnroll(p) {
    setEnrollPhone(p); setPhone(p); setName(""); setRefBy(""); setError("");
  }
  function back() {
    setCustomer(null); setEnrollPhone(null); setSale(""); setError("");
    setCardTab("register"); setProf(null); setAdjPts(""); setAdjNote("");
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

  function openTab(id) {
    setError("");
    if (id === "profile" && isOwner && !prof) initProf();
    setCardTab(id);
  }
  function initProf() {
    setProf({
      name: customer?.name || "", phone,
      note: customer?.note || "", email: customer?.email || "",
      birthdayMonth: customer?.birthdayMonth ?? "", birthdayDay: customer?.birthdayDay ?? "",
      address: customer?.address || "",
    });
  }
  const setP = (k) => (e) => setProf((p) => ({ ...p, [k]: e.target.value }));
  const saveProfile = () =>
    run("update", {
      action: "update", phone,
      newName: prof.name, newPhone: prof.phone, newNote: prof.note,
      newEmail: prof.email, newBirthdayMonth: prof.birthdayMonth,
      newBirthdayDay: prof.birthdayDay, newAddress: prof.address,
    }, (r) => {
      setCustomer((c) => ({ ...c, ...r.customer }));
      if (r.phoneDigits) setPhone(r.phoneDigits);
      setProf(null); setCardTab("register");
      onToast?.(t("rw.toast_updated"));
    });
  const adjust = () =>
    run("adjust", { action: "adjust", phone, points: Math.trunc(Number(adjPts)), note: adjNote }, (r) => {
      setCustomer((c) => ({ ...c, pointsBalance: r.balance }));
      setAdjPts(""); setAdjNote("");
      onToast?.(t("rw.toast_adjusted", { n: r.adjusted, b: r.balance }), undoOf(r.eventId));
    });

  const enroll = () =>
    run("enroll", { action: "enroll", phone, name, referredBy: refBy }, (r) => {
      setCustomer(r.customer); setEnrollPhone(null); setQuery(""); setRefBy("");
      if (r.enrolled) {
        if (r.referral?.ok) onToast?.(t("rw.toast_referral", { who: r.referral.referrerName, rp: r.referral.referrerPts, fp: r.referral.friendPts }));
        else if (r.referral?.error) onToast?.(t(`rw.toast_ref_${r.referral.error}`));
        else onToast?.(t("rw.toast_enrolled"));
      }
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
        : t("rw.toast_earned", { n: r.earned, b: r.balance }), undoOf(r.eventId));
    });
  // One-tap take-back for the toast: the server writes a NEW signed "undo"
  // line reversing the event (15-minute window, your own lines only).
  const undoOf = (eventId) => eventId ? {
    fn: async () => {
      const u = await apiRewards({ action: "undo", phone, eventId });
      setCustomer((c) => ({ ...c, pointsBalance: u.balance, ...(u.stamps ? { stamps: u.stamps } : {}) }));
      onToast?.(t("rw.toast_undone"));
    },
  } : undefined;

  // Punch cards: +1 stamp / give the reward — both signed ledger lines, a
  // separate currency from points (the server writes points: 0 on each).
  const stamp = (card) =>
    run(`stamp:${card.id}`, { action: "stamp", phone, cardId: card.id }, (r) => {
      setCustomer((c) => ({ ...c, stamps: { ...(c.stamps || {}), [r.cardId]: r.count } }));
      onToast?.(r.count >= r.goal
        ? t("rw.toast_stamp_full", { name: card.name })
        : t("rw.toast_stamp", { name: card.name, n: r.count, goal: r.goal }), undoOf(r.eventId));
    });
  const stampRedeem = (card) =>
    run(`stampredeem:${card.id}`, { action: "stampRedeem", phone, cardId: card.id }, (r) => {
      setCustomer((c) => ({ ...c, stamps: { ...(c.stamps || {}), [r.cardId]: r.count } }));
      onToast?.(t("rw.toast_stamp_redeemed", { reward: r.reward }), undoOf(r.eventId));
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
      onToast?.(msg, undoOf(r.eventId));
    });

  // This customer's slice of the signed ledger, newest first (History tab).
  const history = useMemo(() => {
    if (!customer) return [];
    return rewardEvents
      .filter((e) => e.customerId === customer.id)
      .map((e) => ({ ...e, _d: e.ts?.toDate ? e.ts.toDate() : (e.ts ? new Date(e.ts) : null) }))
      .filter((e) => e._d && !Number.isNaN(e._d.getTime()))
      .sort((a, b) => b._d - a._d)
      .slice(0, HISTORY_CAP);
  }, [rewardEvents, customer]);

  // Paginate a customer's ledger the same way; reset when the customer changes.
  const histPage = usePaged(history, { resetKey: customer?.id });

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
  const showHistory = isManager; // the ledger feed itself is manager-gated upstream

  const tabBtn = (id, label) => (
    <button key={id} type="button" role="tab" aria-selected={cardTab === id} onClick={() => openTab(id)}
      className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px transition ${cardTab === id ? "border-brass text-fg" : "border-transparent text-muted hover:text-fg"}`}>
      {label}
    </button>
  );

  // Staff-facing read view of the CRM fields (owners get the edit form).
  const profileRows = customer ? [
    [t("rw.note_label"), customer.note],
    [t("rw.email_label"), customer.email],
    [t("rw.bday"), customer.birthdayMonth
      ? `${monthName(customer.birthdayMonth)}${customer.birthdayDay ? ` ${customer.birthdayDay}` : ""}` : null],
    [t("rw.address_label"), customer.address],
  ].filter(([, v]) => v) : [];

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
                {(rules.referral.referrer > 0 || rules.referral.friend > 0) && (
                  <div>
                    <Field label={t("rw.ref_label")}>
                      <input className="input font-mono" inputMode="tel" value={refBy}
                        onChange={(e) => setRefBy(e.target.value)} placeholder={t("rw.ref_ph")} />
                    </Field>
                    <p className="text-xs text-muted mt-1 leading-relaxed">{t("rw.ref_hint", { rp: rules.referral.referrer, fp: rules.referral.friend })}</p>
                  </div>
                )}
                {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
                <button className="btn-primary w-full" disabled={!!busy} onClick={enroll}>
                  {busy === "enroll" ? t("rw.enrolling") : t("rw.enroll")}
                </button>
              </div>
            )}

            {customer && (
              <div className="border border-line rounded-xl bg-panel overflow-hidden">
                {/* ---- card header: identity + the points pill ---- */}
                <div className="p-3.5 pb-3 flex items-center gap-3">
                  <div className="flex-shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-full bg-brass text-white font-bold text-sm">{initials(customer.name)}</div>
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
                      {isBirthdayMonth(customer) && (
                        <span className="flex-shrink-0 text-[12px]" title={t("rw.bday_chip")} aria-label={t("rw.bday_chip")}>🎂</span>
                      )}
                    </div>
                    <div className="text-[12px] text-muted font-mono">{isOwner ? fmtPhone(phone) : customer.phone}</div>
                    {customer.note ? (
                      <p className="text-[12px] text-muted italic truncate">“{customer.note}”</p>
                    ) : isOwner && (
                      <button type="button" className="text-[12px] text-muted hover:text-fg underline underline-offset-2"
                        onClick={() => openTab("profile")}>✎ {t("rw.add_note")}</button>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="inline-flex items-center rounded-full bg-brass/15 border border-brass/40 px-3.5 py-1 text-xl font-bold font-mono">{balance}</div>
                    <div className="text-[11px] text-muted uppercase tracking-wide font-semibold mt-0.5">{t("rw.points")}</div>
                  </div>
                </div>

                {/* ---- tabs ---- */}
                <div className="flex gap-1 px-3.5 border-b border-line" role="tablist">
                  {tabBtn("register", t("rw.tab_register"))}
                  {tabBtn("profile", t("rw.tab_profile"))}
                  {showHistory && tabBtn("history", t("rw.tab_history"))}
                </div>

                <div className="p-3.5 space-y-3.5">
                  {/* ---- Register: earn / redeem / adjust ---- */}
                  {cardTab === "register" && (
                    <>
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

                      {/* Punch cards — buy-N-get-one stamps beside the points. */}
                      {rules.stamps.length > 0 && (
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5">{t("rw.stamps_label")}</div>
                          <div className="space-y-2">
                            {rules.stamps.map((card) => {
                              const count = Math.max(0, Math.trunc(Number(customer.stamps?.[card.id]) || 0));
                              const full = count >= card.goal;
                              return (
                                <div key={card.id} className={`rounded-xl border p-3 ${full ? "border-brass bg-brass/10" : "border-line bg-panel"}`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="font-semibold text-[13px] truncate">{card.name}</div>
                                      <div className="text-[12px] text-muted truncate">{t("rw.stamp_reward_at", { n: card.goal, reward: card.reward })}</div>
                                    </div>
                                    <div className="font-mono font-bold text-[13px] flex-shrink-0">{count}/{card.goal}</div>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-2" aria-hidden="true">
                                    {Array.from({ length: card.goal }, (_, di) => (
                                      <span key={di} className={`w-3 h-3 rounded-full ${di < Math.min(count, card.goal) ? "bg-brass" : "border border-line bg-surface"}`} />
                                    ))}
                                  </div>
                                  <div className="flex gap-2 mt-2.5">
                                    <button type="button" className="btn-ghost flex-1 text-[13px] py-2" disabled={!!busy} onClick={() => stamp(card)}>
                                      {busy === `stamp:${card.id}` ? t("common.saving") : t("rw.stamp_btn")}
                                    </button>
                                    <button type="button" className={full ? "btn-primary flex-1 text-[13px] py-2" : "btn-ghost flex-1 text-[13px] py-2 opacity-60"}
                                      disabled={!!busy || !full} onClick={() => stampRedeem(card)}>
                                      {busy === `stampredeem:${card.id}` ? t("common.saving") : t("rw.stamp_redeem_btn")}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Owner: a signed points adjustment (the server requires
                          the note — it's a permanent ledger line). */}
                      {isOwner && (
                        <div className="border-t border-line pt-3">
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
                      )}
                    </>
                  )}

                  {/* ---- Profile: CRM fields — owner edits, staff read ---- */}
                  {cardTab === "profile" && (
                    isOwner && prof ? (
                      <div className="space-y-2.5">
                        <Field label={t("rw.name_label")}>
                          <input className="input" value={prof.name} onChange={setP("name")} placeholder={t("rw.name_ph")} />
                        </Field>
                        <Field label={t("rw.phone_label")}>
                          <input className="input font-mono" inputMode="tel" value={prof.phone} onChange={setP("phone")} />
                        </Field>
                        <Field label={t("rw.note_label")}>
                          <input className="input" value={prof.note} onChange={setP("note")} placeholder={t("rw.note_ph")} />
                        </Field>
                        <Field label={t("rw.email_label")}>
                          <input className="input" type="email" inputMode="email" value={prof.email} onChange={setP("email")} />
                        </Field>
                        <div className="grid grid-cols-2 gap-3.5">
                          <Field label={t("rw.bday_month")}>
                            <select className="input" value={prof.birthdayMonth} onChange={setP("birthdayMonth")}>
                              <option value="">—</option>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                <option key={m} value={m}>{monthName(m)}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label={t("rw.bday_day")}>
                            <select className="input" value={prof.birthdayDay} onChange={setP("birthdayDay")}>
                              <option value="">—</option>
                              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <Field label={t("rw.address_label")}>
                          <input className="input" value={prof.address} onChange={setP("address")} />
                        </Field>
                        {error && <p role="alert" className="text-[13px] text-neg">{error}</p>}
                        <div className="flex gap-2">
                          <button className="btn-primary flex-1" disabled={!!busy} onClick={saveProfile}>
                            {busy === "update" ? t("common.saving") : t("rw.edit_save")}
                          </button>
                          <button className="btn-ghost w-auto px-4" disabled={!!busy} onClick={initProf}>{t("rw.edit_cancel")}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {profileRows.length === 0 ? (
                          <p className="text-[13px] text-muted leading-relaxed">{t("rw.profile_empty")}</p>
                        ) : profileRows.map(([label, value]) => (
                          <div key={label} className="flex items-baseline gap-3">
                            <span className="text-[11px] uppercase tracking-wide text-muted font-semibold w-24 flex-shrink-0">{label}</span>
                            <span className="text-[13px] min-w-0 break-words">{value}</span>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {/* ---- History: this customer's signed ledger lines ---- */}
                  {cardTab === "history" && showHistory && (
                    history.length === 0 ? (
                      <p className="text-[13px] text-muted leading-relaxed">{t("rw.h_empty")}</p>
                    ) : (
                      <div>
                        <div className="border border-line rounded-xl overflow-hidden divide-y divide-line-soft">
                          {histPage.visible.map((e) => {
                            const pts = Number(e.points) || 0;
                            const green = e.kind === "redeem" || e.kind === "stampRedeem";
                            const label = e.kind === "earn"
                              ? `${t("rw.h_earn")}${e.saleDollars ? ` · ${money(e.saleDollars)}` : ""}${Number(e.multiplier) > 1 ? ` · ×${e.multiplier}` : ""}`
                              : e.kind === "redeem"
                                ? t("rw.h_redeem", { reward: e.rewardName || money(Number(e.value) || 0) })
                                : e.kind === "referral"
                                  ? t("rw.h_referral")
                                  : e.kind === "stamp"
                                    ? t("rw.h_stamp", { card: e.cardName || "", n: e.count, goal: e.goal })
                                    : e.kind === "stampRedeem"
                                      ? t("rw.h_stamp_redeem", { reward: e.reward || e.cardName || "" })
                                      : e.kind === "undo"
                                        ? t("rw.h_undo")
                                        : `${t("rw.h_adjust")}${e.note ? ` — ${e.note}` : ""}`;
                            const ptsCell = e.kind === "undo" && pts === 0 ? "↩"
                              : e.kind === "stamp" ? "⬤" : e.kind === "stampRedeem" ? "🎁"
                                : `${pts > 0 ? `+${pts}` : pts} ${t("rw.pts")}`;
                            return (
                              <div key={e.id} className={`px-3 py-2.5 flex items-start gap-3 ${e.reversedBy ? "opacity-50" : ""}`}>
                                <div className="flex-shrink-0 w-[4.4rem] text-right text-[11px] text-muted font-mono leading-snug">
                                  <div>{e._d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                                  <div>{e._d.toLocaleDateString()}</div>
                                </div>
                                <div className={`min-w-0 flex-1 text-[13px] leading-snug ${green ? "text-pos font-semibold" : ""}`}>
                                  <span className={e.reversedBy ? "line-through" : ""}>{label}</span>
                                  {e.reversedBy && <span className="text-[11px] text-muted font-normal"> {t("rw.h_undone_mark")}</span>}
                                  {e.by && <span className="block text-[11px] text-muted font-normal">{t("rw.h_by", { name: e.by })}</span>}
                                </div>
                                <div className={`flex-shrink-0 font-mono font-bold text-[13px] ${green ? "text-pos" : pts < 0 ? "text-neg" : ""}`}>
                                  {ptsCell}
                                </div>
                              </div>
                            );
                          })}
                          <ShowMore hasMore={histPage.hasMore} nextStep={histPage.nextStep} onMore={histPage.showMore} />
                        </div>
                        <p className="text-[11px] text-muted mt-1.5">{t("rw.h_window")}</p>
                      </div>
                    )
                  )}
                </div>
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
              <div className="border border-line rounded-xl overflow-hidden divide-y divide-line-soft">
                {custPage.visible.map((c) => {
                  const lifetime = Math.max(Number(c.lifetimePoints) || 0, Number(c.pointsBalance) || 0);
                  const vip = vipTierFor(lifetime, vendor?.rewards)?.name;
                  return (
                    <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-subtle transition">
                      <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-brass/15 text-brass font-bold text-[13px]">{initials(c.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium text-[14px] truncate">{c.name || t("rw.customer_fallback")}</span>
                          {vip && <span className="flex-shrink-0 text-[9px] uppercase tracking-wide font-bold text-brass border border-brass/50 rounded px-1 py-px">{vip}</span>}
                          {isNewCustomer(c) && <span className="flex-shrink-0 text-[9px] uppercase tracking-wide font-bold text-pos border border-pos/50 rounded px-1 py-px">{t("rw.badge_new")}</span>}
                          {isBirthdayMonth(c) && <span className="flex-shrink-0 text-[11px]" title={t("rw.bday_chip")} aria-label={t("rw.bday_chip")}>🎂</span>}
                        </span>
                        <span className="block text-[12px] text-muted font-mono">{isOwner ? fmtPhone(c.phone) : maskPhone(c.phone)}</span>
                        <span className="block text-[11px] text-muted">{visitLabel(c)}</span>
                      </span>
                      <span className="text-right flex-shrink-0">
                        <span className="block font-mono font-bold text-[15px]">{c.pointsBalance || 0}</span>
                        <span className="block text-[11px] text-muted">{t("rw.points")}</span>
                      </span>
                    </button>
                  );
                })}
                <ShowMore hasMore={custPage.hasMore} nextStep={custPage.nextStep} onMore={custPage.showMore} />
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
