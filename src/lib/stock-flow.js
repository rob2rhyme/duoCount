// Backroom flow — pure aggregation over the signed stock movement log
// (stockMoves: one append-only line per pull/restock, written by the trusted
// /api/stock-move route). Answers the demand question the owner actually has:
// which products LEAVE the backroom fastest (high demand — keep it ordered)
// and which never move (dead stock). Pure + clock-injectable, like patterns.

import { toDate } from "./utils.js";

/**
 * @param {Array} moves  stockMoves docs ({ itemId, itemName, locationId, delta, ts })
 * @param {Object} opts  { days = 30, now = new Date(), locationId = "" }
 * @returns {{ rows, totals, days }}
 *   rows: one per item, busiest-outflow first:
 *     { itemId, name, out, in, net, moves }  (out/in are unit totals, net = in - out)
 *   totals: { out, in, moves }
 */
export function buildStockFlow(moves = [], { days = 30, now = new Date(), locationId = "" } = {}) {
  const cut = now.getTime() - days * 24 * 3600 * 1000;
  const byItem = new Map();
  for (const m of moves) {
    if (!m || !m.itemId) continue;
    if (locationId && m.locationId !== locationId) continue;
    const d = toDate(m.ts);
    if (!d || d.getTime() < cut || d.getTime() > now.getTime()) continue;
    const delta = Math.trunc(Number(m.delta) || 0);
    if (delta === 0) continue;
    if (!byItem.has(m.itemId))
      byItem.set(m.itemId, { itemId: m.itemId, name: m.itemName || "—", out: 0, in: 0, moves: 0 });
    const r = byItem.get(m.itemId);
    r.moves += 1;
    if (delta < 0) r.out += -delta; else r.in += delta;
  }
  const rows = [...byItem.values()]
    .map((r) => ({ ...r, net: r.in - r.out }))
    .sort((a, b) => b.out - a.out || a.name.localeCompare(b.name));
  const totals = rows.reduce(
    (t, r) => ({ out: t.out + r.out, in: t.in + r.in, moves: t.moves + r.moves }),
    { out: 0, in: 0, moves: 0 });
  return { rows, totals, days };
}

// Share-of-outflow for the pie: the top `cap` products plus ONE "Other" fold.
// The categorical palette is fixed-order, so a 6th product never invents a
// hue — it folds into Other (the dataviz non-negotiable).
export function flowShare(rows = [], cap = 5) {
  const moved = rows.filter((r) => r.out > 0);
  const top = moved.slice(0, cap).map((r) => ({ name: r.name, value: r.out, other: false }));
  const rest = moved.slice(cap).reduce((s, r) => s + r.out, 0);
  if (rest > 0) top.push({ name: null, value: rest, other: true });
  return top;
}
