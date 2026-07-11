// Pure shift-swap state machine. No emulator needed. Run: npm run test:swaps
import { test } from "node:test";
import assert from "node:assert/strict";
import { availableActions, applySwap, swapStatusOf } from "../src/lib/swaps.js";

const shift = (over = {}) => ({ id: "s1", userId: "owner", userName: "Owner O", date: "2026-07-10", start: "09:00", end: "17:00", ...over });
const OWNER = { userId: "owner", name: "Owner O" };
const CO = { userId: "co", name: "Coworker C" };
const MGR = { userId: "mgr", name: "Manager M", isManager: true };

test("swapStatusOf defaults to none", () => {
  assert.equal(swapStatusOf(shift()), "none");
  assert.equal(swapStatusOf(shift({ swapStatus: "offered" })), "offered");
});

test("owner can offer a clean shift; nobody else can", () => {
  assert.deepEqual(availableActions(shift(), { userId: "owner" }), ["offer"]);
  assert.deepEqual(availableActions(shift(), { userId: "co" }), []);
  assert.deepEqual(applySwap(shift(), "offer", OWNER), { swapStatus: "offered" });
  assert.equal(applySwap(shift(), "offer", CO), null);          // coworker can't offer
  assert.equal(applySwap(shift({ swapStatus: "offered" }), "offer", OWNER), null); // already offered
});

test("owner can cancel their own offer", () => {
  const s = shift({ swapStatus: "offered" });
  assert.deepEqual(availableActions(s, { userId: "owner" }), ["cancel-offer"]);
  assert.deepEqual(applySwap(s, "cancel-offer", OWNER), { swapStatus: "none" });
});

test("a coworker claims an offered shift, recording themselves", () => {
  const s = shift({ swapStatus: "offered" });
  assert.deepEqual(availableActions(s, { userId: "co" }), ["claim"]);
  assert.deepEqual(applySwap(s, "claim", CO), { swapStatus: "claimed", claimedById: "co", claimedByName: "Coworker C" });
  // the owner cannot claim their own offered shift
  assert.equal(applySwap(s, "claim", OWNER), null);
  // cannot claim something not offered
  assert.equal(applySwap(shift(), "claim", CO), null);
});

test("the claimer (only) can withdraw a claim, back to offered", () => {
  const s = shift({ swapStatus: "claimed", claimedById: "co", claimedByName: "Coworker C" });
  assert.deepEqual(availableActions(s, { userId: "co" }), ["withdraw-claim"]);
  assert.deepEqual(availableActions(s, { userId: "other" }), []); // some other coworker: nothing
  assert.deepEqual(applySwap(s, "withdraw-claim", CO), { swapStatus: "offered", claimedById: null, claimedByName: null });
  assert.equal(applySwap(s, "withdraw-claim", { userId: "other", name: "X" }), null);
});

test("manager approval reassigns the shift to the claimer and clears the swap", () => {
  const s = shift({ swapStatus: "claimed", claimedById: "co", claimedByName: "Coworker C" });
  assert.deepEqual(availableActions(s, { userId: "mgr", isManager: true }), ["approve", "reject"]);
  assert.deepEqual(applySwap(s, "approve", MGR), {
    userId: "co", userName: "Coworker C", swapStatus: "none", claimedById: null, claimedByName: null,
  });
  // a non-manager cannot approve
  assert.equal(applySwap(s, "approve", CO), null);
  assert.equal(applySwap(s, "approve", OWNER), null);
});

test("manager rejection returns the shift to the owner", () => {
  const claimed = shift({ swapStatus: "claimed", claimedById: "co", claimedByName: "Coworker C" });
  assert.deepEqual(applySwap(claimed, "reject", MGR), { swapStatus: "none", claimedById: null, claimedByName: null });
  // a manager can also reject a merely-offered shift
  assert.deepEqual(availableActions(shift({ swapStatus: "offered" }), { userId: "mgr", isManager: true }), ["reject"]);
  assert.equal(applySwap(shift(), "reject", MGR), null); // nothing to reject on a clean shift
  assert.equal(applySwap(claimed, "reject", CO), null);  // non-manager can't reject
});

test("patches only touch swap fields (owner/reassign aside), matching the rules' allow-lists", () => {
  assert.deepEqual(Object.keys(applySwap(shift(), "offer", OWNER)).sort(), ["swapStatus"]);
  assert.deepEqual(Object.keys(applySwap(shift({ swapStatus: "offered" }), "claim", CO)).sort(),
    ["claimedById", "claimedByName", "swapStatus"]);
  assert.deepEqual(Object.keys(applySwap(shift({ swapStatus: "claimed", claimedById: "co", claimedByName: "C" }), "approve", MGR)).sort(),
    ["claimedById", "claimedByName", "swapStatus", "userId", "userName"]);
});

test("unknown actions return null", () => {
  assert.equal(applySwap(shift(), "frobnicate", OWNER), null);
});
