import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveShortcut } from "../src/lib/shortcuts.js";

const TABS = ["cash", "scratch", "inventory", "log", "notes", "incidents", "dashboard", "admin"];
const k = (key, opts = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, ...opts });

test("digit jumps to the matching tab", () => {
  assert.deepEqual(resolveShortcut(k("1"), { tabIds: TABS, currentTab: "cash" }), { type: "tab", id: "cash" });
  assert.deepEqual(resolveShortcut(k("4"), { tabIds: TABS, currentTab: "cash" }), { type: "tab", id: "log" });
  assert.deepEqual(resolveShortcut(k("8"), { tabIds: TABS, currentTab: "cash" }), { type: "tab", id: "admin" });
});

test("digit beyond the tab count is ignored", () => {
  const ids = TABS.slice(0, 7); // employee: no admin tab
  assert.equal(resolveShortcut(k("8"), { tabIds: ids, currentTab: "cash" }), null);
  assert.equal(resolveShortcut(k("9"), { tabIds: ids, currentTab: "cash" }), null);
});

test("] and [ step forward and back with wraparound", () => {
  assert.deepEqual(resolveShortcut(k("]"), { tabIds: TABS, currentTab: "cash" }), { type: "tab", id: "scratch" });
  assert.deepEqual(resolveShortcut(k("["), { tabIds: TABS, currentTab: "cash" }), { type: "tab", id: "admin" }); // wrap back
  assert.deepEqual(resolveShortcut(k("]"), { tabIds: TABS, currentTab: "admin" }), { type: "tab", id: "cash" }); // wrap fwd
});

test("? toggles help, Esc closes it", () => {
  assert.deepEqual(resolveShortcut(k("?"), { tabIds: TABS }), { type: "toggleHelp" });
  assert.deepEqual(resolveShortcut(k("Escape"), { tabIds: TABS }), { type: "closeHelp" });
});

test("Cmd/Ctrl+Enter saves — even while typing in a field", () => {
  assert.deepEqual(resolveShortcut(k("Enter", { metaKey: true }), { tabIds: TABS, typing: true }), { type: "save" });
  assert.deepEqual(resolveShortcut(k("Enter", { ctrlKey: true }), { tabIds: TABS, typing: false }), { type: "save" });
});

test("plain Enter is not a save", () => {
  assert.equal(resolveShortcut(k("Enter"), { tabIds: TABS, typing: false }), null);
});

test("shortcuts are suppressed while typing (so they never eat input)", () => {
  assert.equal(resolveShortcut(k("1"), { tabIds: TABS, typing: true }), null);
  assert.equal(resolveShortcut(k("]"), { tabIds: TABS, typing: true }), null);
  assert.equal(resolveShortcut(k("?"), { tabIds: TABS, typing: true }), null);
});

test("modifier combos (other than the save combo) are ignored", () => {
  assert.equal(resolveShortcut(k("1", { metaKey: true }), { tabIds: TABS }), null); // ⌘1 is a browser tab switch
  assert.equal(resolveShortcut(k("2", { ctrlKey: true }), { tabIds: TABS }), null);
  assert.equal(resolveShortcut(k("]", { altKey: true }), { tabIds: TABS }), null);
});

test("non-shortcut keys return null", () => {
  for (const key of ["a", "0", "Tab", "ArrowRight", " ", "Enter"]) {
    assert.equal(resolveShortcut(k(key), { tabIds: TABS, currentTab: "cash", typing: false }), null);
  }
});
