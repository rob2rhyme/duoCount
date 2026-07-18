// resolveStockAlerts + buildStockAlerts are pure — no emulator.
// Run: npm run test:stock-alerts
import { test } from "node:test";
import assert from "node:assert/strict";
import { STOCK_ALERTS, resolveStockAlerts, buildStockAlerts } from "../src/lib/stock-alerts.js";

const NOW = new Date("2026-07-17T12:00:00Z");
const item = (over = {}) => ({ id: "i1", name: "Marlboro", unit: "carton", active: true, ...over });

test("resolveStockAlerts: defaults, clamping, and fallback for bad values", () => {
  assert.deepEqual(resolveStockAlerts(), STOCK_ALERTS);
  assert.deepEqual(resolveStockAlerts({}), STOCK_ALERTS);
  assert.equal(resolveStockAlerts({ expiryDays: 500 }).expiryDays, 365);
  assert.equal(resolveStockAlerts({ expiryDays: 0 }).expiryDays, 1);
  assert.equal(resolveStockAlerts({ lowStockUnits: -3 }).lowStockUnits, 0);
  assert.equal(resolveStockAlerts({ lowStockUnits: "abc" }).lowStockUnits, STOCK_ALERTS.lowStockUnits);
  // numeric strings from form inputs are accepted and coerced
  assert.equal(resolveStockAlerts({ expiryDays: "45" }).expiryDays, 45);
});

test("expiring: within the window (boundary inclusive), expired first, no-expiry items skipped", () => {
  const items = [
    item({ id: "a", name: "Milk", expiresAt: "2026-07-20" }),      // 3 days
    item({ id: "b", name: "Jerky", expiresAt: "2026-08-16" }),     // 30 days — boundary, included
    item({ id: "c", name: "Soda", expiresAt: "2026-08-17" }),      // 31 days — out
    item({ id: "d", name: "Yogurt", expiresAt: "2026-07-15" }),    // expired 2 days ago
    item({ id: "e", name: "Gum" }),                                 // no expiry — never alerts
  ];
  const { expiring } = buildStockAlerts(items, { now: NOW });
  assert.deepEqual(expiring.map((x) => x.item.id), ["d", "a", "b"]); // most urgent first
  assert.equal(expiring[0].daysLeft, -2);
  assert.equal(expiring[2].daysLeft, 30);
});

test("lowStock: strictly below the threshold, 0 included, unsynced quantity skipped, emptiest first", () => {
  const items = [
    item({ id: "a", name: "Marlboro", quantity: 4 }),
    item({ id: "b", name: "Juul", quantity: 0 }),
    item({ id: "c", name: "Newport", quantity: 5 }),   // == threshold — not below, no alert
    item({ id: "d", name: "Camel" }),                   // never synced — never alerts
  ];
  const { lowStock } = buildStockAlerts(items, { now: NOW });
  assert.deepEqual(lowStock.map((x) => x.item.id), ["b", "a"]);
  assert.equal(lowStock[0].quantity, 0);
});

test("owner-tuned rules change both lists; resolved rules are returned for labels", () => {
  const items = [
    item({ id: "a", quantity: 8 }),
    item({ id: "b", name: "Milk", expiresAt: "2026-07-24" }), // 7 days
  ];
  const wide = buildStockAlerts(items, { now: NOW, rules: { lowStockUnits: 10 } });
  assert.equal(wide.lowStock.length, 1);
  assert.equal(wide.rules.lowStockUnits, 10);
  const narrow = buildStockAlerts(items, { now: NOW, rules: { expiryDays: 5 } });
  assert.equal(narrow.expiring.length, 0); // 7 days out is beyond a 5-day window
});

test("inactive items and malformed dates never alert; empty input never throws", () => {
  const items = [
    item({ id: "a", active: false, quantity: 0, expiresAt: "2026-07-18" }),
    item({ id: "b", name: "Odd", quantity: 1, expiresAt: "not-a-date" }),
  ];
  const r = buildStockAlerts(items, { now: NOW });
  assert.deepEqual(r.expiring, []);
  assert.deepEqual(r.lowStock.map((x) => x.item.id), ["b"]); // bad date ≠ bad quantity
  assert.deepEqual(buildStockAlerts([], { now: NOW }).lowStock, []);
  assert.deepEqual(buildStockAlerts(undefined, { now: NOW }).expiring, []);
});
