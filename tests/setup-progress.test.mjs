import { test } from "node:test";
import assert from "node:assert/strict";
import { setupProgress } from "../src/lib/setup-progress.js";

const loc = (over = {}) => ({ id: "l1", name: "Main", ...over });
const drw = (over = {}) => ({ id: "d1", name: "POS", locationId: "l1", ...over });
const itm = (over = {}) => ({ id: "i1", name: "Marlboro", locationId: "l1", ...over });

test("a brand-new empty vendor has nothing done", () => {
  const p = setupProgress([], [], []);
  assert.equal(p.hasLocation, false);
  assert.equal(p.hasDrawer, false);
  assert.equal(p.hasItem, false);
  assert.equal(p.essentialsDone, false);
  assert.equal(p.allDone, false);
  assert.equal(p.doneRequired, 0);
  assert.equal(p.totalRequired, 2);
});

test("missing/undefined arrays are treated as empty, not thrown", () => {
  const p = setupProgress();
  assert.equal(p.essentialsDone, false);
  assert.equal(p.steps.length, 3);
});

test("essentials need BOTH a location and a drawer", () => {
  assert.equal(setupProgress([loc()], [], []).essentialsDone, false);
  assert.equal(setupProgress([], [drw()], []).essentialsDone, false);
  assert.equal(setupProgress([loc()], [drw()], []).essentialsDone, true);
});

test("essentials done still isn't allDone until an item exists (optional step)", () => {
  const p = setupProgress([loc()], [drw()], []);
  assert.equal(p.essentialsDone, true);
  assert.equal(p.allDone, false);
  assert.equal(p.doneRequired, 2);
});

test("everything present => allDone", () => {
  const p = setupProgress([loc()], [drw()], [itm()]);
  assert.equal(p.allDone, true);
  assert.equal(p.hasItem, true);
});

test("retired (active:false) rows don't count as done", () => {
  assert.equal(setupProgress([loc({ active: false })], [drw()], []).hasLocation, false);
  assert.equal(setupProgress([loc()], [drw({ active: false })], []).hasDrawer, false);
  assert.equal(setupProgress([loc()], [drw()], [itm({ active: false })]).hasItem, false);
  // active === true (or absent) both count
  assert.equal(setupProgress([loc({ active: true })], [drw()], []).hasLocation, true);
});

test("the item step is flagged optional; location/drawer are required", () => {
  const p = setupProgress([], [], []);
  const byKey = Object.fromEntries(p.steps.map((s) => [s.key, s]));
  assert.equal(byKey.location.optional, undefined);
  assert.equal(byKey.drawer.optional, undefined);
  assert.equal(byKey.item.optional, true);
});

test("step.done mirrors the has* flags", () => {
  const p = setupProgress([loc()], [], [itm()]);
  const byKey = Object.fromEntries(p.steps.map((s) => [s.key, s]));
  assert.equal(byKey.location.done, true);
  assert.equal(byKey.drawer.done, false);
  assert.equal(byKey.item.done, true);
});
