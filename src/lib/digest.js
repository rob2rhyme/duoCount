// Server-only digest composer shared by the cron route and the owner test
// route. Summarizes a vendor's "yesterday" (in the vendor's timezone) and
// sends it via the Resend HTTP API — no email SDK needed.

import { detectPatterns, resolvePatternRules } from "./patterns";
import { buildStockAlerts } from "./stock-alerts";
import { buildRewardAudit, outstandingLiability } from "./reward-audit";
import { resolveRewards } from "./rewards";
import { openItemCounts } from "./utils";
import { aiNarrativeEnabled, generateNarrative } from "./digest-narrative";

const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** YYYY-MM-DD of `now` in an IANA timezone. */
function dateInTz(tz, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** The vendor's local "yesterday" as YYYY-MM-DD (their business date). */
function yesterdayInTz(tz, now = new Date()) {
  const today = dateInTz(tz, now);
  let probe = new Date(now.getTime() - 24 * 3600 * 1000);
  let y = dateInTz(tz, probe);
  if (y === today) { // 25-hour DST day edge: step back a little further
    probe = new Date(now.getTime() - 26 * 3600 * 1000);
    y = dateInTz(tz, probe);
  }
  return y;
}

/** Yesterday's per-location activity table + total. Entries = docs whose
 *  `date` == yesterday. The open-item backlog counts are computed separately
 *  (openItemCounts), over the whole window rather than this one-day slice. */
function summarizeEntries(entries) {
  const byLoc = {};
  for (const e of entries) {
    const key = e.locationName || "(no location)";
    byLoc[key] = byLoc[key] || { name: key, count: 0, cashSales: 0, netDiff: 0, shorts: 0, scratchDollars: 0 };
    const l = byLoc[key];
    l.count++;
    if (e.kind === "cash") {
      l.cashSales += e.sales || 0;
      l.netDiff += e.diff || 0;
      if ((e.diff || 0) < -0.005) l.shorts++;
    }
    if (e.kind === "scratch") l.scratchDollars += e.dollars || 0;
  }
  return {
    locations: Object.values(byLoc).sort((a, b) => a.name.localeCompare(b.name)),
    total: entries.length,
  };
}

function composeEmail(vendor, dateStr, s, appUrl, narrative = null) {
  const subject = `DuoCount digest — ${vendor.name} — ${dateStr}`;
  const windowDays = s.windowDays ?? resolvePatternRules().windowDays;

  // Optional AI narrative block, rendered above the location table. Additive:
  // absent (null) when the feature is off or the model call failed, and the
  // digest reads exactly as it did before. Model output is untrusted text, so
  // every string goes through esc() in the HTML path below.
  const nWatch = (narrative?.watch || []).filter(Boolean);
  const hasNarrative = !!(narrative && (narrative.summary || nWatch.length));

  const locLinesText = s.locations.map((l) =>
    `  ${l.name}: ${l.count} entries · cash sales ${money(l.cashSales)} · net ${l.netDiff >= 0 ? "+" : ""}${money(l.netDiff)} · ${l.shorts} short · scratch ${money(l.scratchDollars)}`
  ).join("\n") || "  No counts were logged.";

  const text = [
    `${vendor.name} — daily count digest for ${dateStr}`,
    "",
    ...(hasNarrative ? [
      ...(narrative.summary ? [narrative.summary, ""] : []),
      ...(nWatch.length ? ["What to watch tomorrow:", ...nWatch.map((w) => `  - ${w}`), ""] : []),
    ] : []),
    locLinesText,
    "",
    `Open variances: ${s.openVariances}`,
    `Open disputes:  ${s.openDisputes}`,
    `Open incidents: ${s.openIncidents ?? 0}`,
    `Unverified:     ${s.unverified}`,
    ...(s.rewards ? [
      `Rewards (last ${s.rewards.windowDays}d): ${s.rewards.earned} pts issued · ${s.rewards.redeemed} redeemed · outstanding ${s.rewards.liability.points} pts ≈ ${money(s.rewards.liability.dollars)}`,
    ] : []),
    ...(s.patterns?.length ? [
      "",
      `Patterns (last ${windowDays} days — signals, not conclusions):`,
      ...s.patterns.map((p) => `  [${p.severity === "high" ? "HIGH" : "watch"}] ${p.title} — ${p.detail}`),
    ] : []),
    ...(s.stock && (s.stock.expiring.length || s.stock.lowStock.length) ? [
      "",
      `Stock attention (expiring ≤ ${s.stock.rules.expiryDays}d, fewer than ${s.stock.rules.lowStockUnits} left):`,
      ...s.stock.expiring.map(({ item, daysLeft }) =>
        `  [expiring] ${item.name} — ${daysLeft < 0 ? `expired ${item.expiresAt}` : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left (${item.expiresAt})`}`),
      ...s.stock.lowStock.map(({ item, quantity }) =>
        `  [reorder] ${item.name} — ${quantity} ${item.unit || "unit"}${quantity === 1 ? "" : "s"} left`),
    ] : []),
    "",
    appUrl ? `Review in DuoCount: ${appUrl}` : "",
  ].join("\n");

  const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");

  const narrativeHtml = hasNarrative ? `
    <div style="margin:0 0 16px;padding:12px 14px;background:#f2f6fb;border:1px solid #d9e2ef;border-radius:8px">
      ${narrative.summary ? `<p style="margin:0;font-size:14px;line-height:1.5">${esc(narrative.summary)}</p>` : ""}
      ${nWatch.length ? `
      <p style="margin:${narrative.summary ? "8px 0 4px" : "0 0 4px"};font-size:13px;color:#666">What to watch tomorrow:</p>
      <ul style="margin:0;padding-left:18px;font-size:14px">
        ${nWatch.map((w) => `<li style="margin:0 0 2px">${esc(w)}</li>`).join("")}
      </ul>` : ""}
    </div>` : "";

  const locRows = s.locations.map((l) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e2d9">${esc(l.name)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e2d9;text-align:right">${l.count}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e2d9;text-align:right">${money(l.cashSales)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e2d9;text-align:right;color:${l.netDiff < -0.005 ? "#b03a3a" : l.netDiff > 0.005 ? "#2f7d5b" : "#1a1c2e"}">${l.netDiff >= 0 ? "+" : ""}${money(l.netDiff)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e2d9;text-align:right">${l.shorts}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e2d9;text-align:right">${money(l.scratchDollars)}</td>
    </tr>`).join("");

  const html = `
  <div style="font-family:Helvetica,Arial,sans-serif;color:#1a1c2e;max-width:640px">
    <h2 style="margin:0 0 2px">${esc(vendor.name)} — daily digest</h2>
    <p style="margin:0 0 14px;color:#666">${dateStr}</p>${narrativeHtml}
    ${s.locations.length ? `
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr style="text-align:left">
        <th style="padding:6px 10px;border-bottom:2px solid #1a1c2e">Location</th>
        <th style="padding:6px 10px;border-bottom:2px solid #1a1c2e;text-align:right">Entries</th>
        <th style="padding:6px 10px;border-bottom:2px solid #1a1c2e;text-align:right">Cash sales</th>
        <th style="padding:6px 10px;border-bottom:2px solid #1a1c2e;text-align:right">Net +/−</th>
        <th style="padding:6px 10px;border-bottom:2px solid #1a1c2e;text-align:right">Shorts</th>
        <th style="padding:6px 10px;border-bottom:2px solid #1a1c2e;text-align:right">Scratch $</th>
      </tr>${locRows}
    </table>` : `<p style="color:#666">No counts were logged.</p>`}
    <p style="font-size:14px;margin-top:14px">
      Open variances: <b>${s.openVariances}</b> ·
      Open disputes: <b>${s.openDisputes}</b> ·
      Open incidents: <b>${s.openIncidents ?? 0}</b> ·
      Unverified: <b>${s.unverified}</b>
    </p>
    ${s.rewards ? `
    <p style="font-size:13px;color:#666;margin-top:2px">
      Rewards (last ${s.rewards.windowDays}d): <b style="color:#1a1c2e">${s.rewards.earned}</b> pts issued ·
      <b style="color:#1a1c2e">${s.rewards.redeemed}</b> redeemed ·
      outstanding <b style="color:#1a1c2e">${s.rewards.liability.points}</b> pts ≈ <b style="color:#1a1c2e">${money(s.rewards.liability.dollars)}</b>
    </p>` : ""}
    ${s.patterns?.length ? `
    <div style="margin-top:10px;padding:10px 12px;background:#faf8f2;border:1px solid #e6e2d8;border-radius:8px">
      <p style="margin:0 0 6px;font-size:13px;color:#666">Patterns (last ${windowDays} days) — signals worth a look, not conclusions:</p>
      ${s.patterns.map((p) => `
      <p style="margin:0 0 4px;font-size:14px">
        <b style="color:${p.severity === "high" ? "#b03a3a" : "#8a6d2f"}">${p.severity === "high" ? "HIGH" : "Watch"}</b>
        — ${esc(p.title)} <span style="color:#666">${esc(p.detail)}</span>
      </p>`).join("")}
    </div>` : ""}
    ${s.stock && (s.stock.expiring.length || s.stock.lowStock.length) ? `
    <div style="margin-top:10px;padding:10px 12px;background:#faf8f2;border:1px solid #e6e2d8;border-radius:8px">
      <p style="margin:0 0 6px;font-size:13px;color:#666">Stock attention — expiring within ${s.stock.rules.expiryDays} days, or fewer than ${s.stock.rules.lowStockUnits} left:</p>
      ${s.stock.expiring.map(({ item, daysLeft }) => `
      <p style="margin:0 0 4px;font-size:14px">
        <b style="color:${daysLeft < 0 ? "#b03a3a" : "#8a6d2f"}">Expiring</b>
        — ${esc(item.name)} <span style="color:#666">${daysLeft < 0 ? `expired ${esc(item.expiresAt)}` : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left (${esc(item.expiresAt)})`}</span>
      </p>`).join("")}
      ${s.stock.lowStock.map(({ item, quantity }) => `
      <p style="margin:0 0 4px;font-size:14px">
        <b style="color:${quantity === 0 ? "#b03a3a" : "#8a6d2f"}">Reorder</b>
        — ${esc(item.name)} <span style="color:#666">${quantity} ${esc(item.unit || "unit")}${quantity === 1 ? "" : "s"} left</span>
      </p>`).join("")}
    </div>` : ""}
    ${appUrl ? `<p style="font-size:13px"><a href="${esc(appUrl)}">Review in DuoCount →</a></p>` : ""}
  </div>`;

  return { subject, text, html };
}

/** Send via Resend's HTTP API. Throws on non-2xx. */
export async function sendEmail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM;
  if (!key || !from) throw new Error("RESEND_API_KEY / DIGEST_FROM not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Compose + send one vendor's digest. Returns "sent" | "skipped:<reason>".
 * `force` (the owner test button) ignores the lastSentDate guard and does NOT
 * update it, so a test never suppresses the real morning send.
 */
export async function sendDigestForVendor(adminDb, vendorSnap, { force = false, now = new Date() } = {}) {
  const vendor = { id: vendorSnap.id, ...vendorSnap.data() };
  const digest = vendor.digest || {};
  if (!force && digest.enabled !== true) return "skipped:disabled";
  const recipients = (digest.recipients || []).filter(Boolean).slice(0, 10);
  if (!recipients.length) return "skipped:no-recipients";

  const tz = digest.tz || "America/New_York";
  const today = dateInTz(tz, now);
  if (!force && digest.lastSentDate === today) return "skipped:already-sent";

  const yesterday = yesterdayInTz(tz, now);
  // One trailing-window query feeds both yesterday's summary and the
  // pattern detectors (tier-two spec §2.2). The window honors the vendor's
  // configured lookback so the query and the detectors agree.
  const rules = resolvePatternRules(vendor.patternRules);
  const windowStart = dateInTz(tz,
    new Date(now.getTime() - rules.windowDays * 24 * 3600 * 1000));
  const vendorRef = adminDb.collection("vendors").doc(vendor.id);
  const snap = await vendorRef
    .collection("entries").where("date", ">=", windowStart).get();
  const windowEntries = snap.docs.map((d) => d.data());
  const entries = windowEntries.filter((e) => e.date === yesterday);

  const incidentsSnap = await vendorRef
    .collection("incidents").where("status", "==", "open").get();

  // Yesterday's activity table, but the open-item backlog (variances/disputes/
  // unverified) spans the whole lookback window — a still-open item from an
  // earlier day must show, consistent with the all-open "Open incidents" line
  // and the Dashboard's live counts (M3), instead of resetting to 0 each night.
  const summary = { ...summarizeEntries(entries), ...openItemCounts(windowEntries) };
  // Pack continuity gaps come from the window's scratch entries themselves —
  // no packs collection read since the lifecycle was retired.
  summary.patterns = detectPatterns(windowEntries, { now, rules });
  summary.windowDays = rules.windowDays;
  summary.openIncidents = incidentsSnap.size;

  // Stock attention (pos-inventory-sync-spec.md Phase 1): expiring-soon +
  // need-order lists over the item catalog's synced fields. One extra read per
  // vendor per send; items without synced data produce empty lists and no block.
  const itemsSnap = await vendorRef.collection("items").get();
  summary.stock = buildStockAlerts(
    itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    { now, rules: vendor.stockAlerts },
  );

  // Rewards (rewards-program-spec.md Phase 2) — only when the program is on:
  // the audit's alerts join the patterns block (clerk names ride the
  // narrative redactor's person list), and a one-line summary carries the
  // window totals + the outstanding liability at the store's settings.
  if (resolveRewards(vendor.rewards).enabled) {
    const since = new Date(now.getTime() - rules.windowDays * 24 * 3600 * 1000);
    const [evSnap, custSnap] = await Promise.all([
      vendorRef.collection("rewardEvents").where("ts", ">=", since).get(),
      vendorRef.collection("customers").get(),
    ]);
    const customersList = custSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const audit = buildRewardAudit(evSnap.docs.map((d) => d.data()), windowEntries, {
      rules: vendor.rewards, customers: customersList, windowDays: rules.windowDays, now,
    });
    summary.patterns = [...summary.patterns, ...audit.alerts];
    summary.rewards = {
      ...audit.totals,
      liability: outstandingLiability(customersList, vendor.rewards),
      windowDays: rules.windowDays,
    };
  }

  // Optional AI narrative (ai-features-spec.md). Off by default and additive:
  // stays null when the vendor hasn't opted in, no key is configured, or the
  // model call fails/times out — the digest then sends unchanged.
  let narrative = null;
  if (aiNarrativeEnabled(vendor)) {
    narrative = await generateNarrative(summary, vendor, { date: yesterday, signal: AbortSignal.timeout(8000) });
  }

  const appUrl = process.env.APP_URL || "";
  const { subject, text, html } = composeEmail(vendor, yesterday, summary, appUrl, narrative);
  await sendEmail({ to: recipients, subject, text, html });

  if (!force) {
    await vendorSnap.ref.update({ "digest.lastSentDate": today });
  }
  return "sent";
}
