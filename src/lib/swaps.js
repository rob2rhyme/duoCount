// Shift-swap state machine (pure). A scheduled shift carries a `swapStatus`
// ('none' | 'offered' | 'claimed') and, while a coworker has claimed it,
// `claimedById` / `claimedByName`. Transitions:
//
//   owner offers        none            -> offered
//   owner cancels       offered         -> none
//   coworker claims     offered         -> claimed   (records the claimer)
//   claimer withdraws   claimed         -> offered   (clears the claimer)
//   manager approves    claimed         -> none      (REASSIGNS to the claimer)
//   manager rejects     offered/claimed -> none      (owner keeps it)
//
// The component computes the field patch with applySwap and writes it; the
// Firestore rules independently enforce the same transitions. Keeping the logic
// here means it's unit-tested without an emulator, and the UI and the rules
// can't silently disagree about what's allowed.

export const SWAP_ACTIONS = {
  offer: "Offer to swap",
  "cancel-offer": "Cancel offer",
  claim: "Claim shift",
  "withdraw-claim": "Withdraw claim",
  approve: "Approve",
  reject: "Reject",
};

export function swapStatusOf(shift) {
  return shift?.swapStatus || "none";
}

/** Actions the given user may take on this shift, in display order. */
export function availableActions(shift, { userId, isManager = false } = {}) {
  const status = swapStatusOf(shift);
  const isOwner = shift.userId === userId;
  const isClaimer = shift.claimedById === userId;
  const acts = [];
  if (isManager && status === "claimed") acts.push("approve", "reject");
  else if (isManager && status === "offered") acts.push("reject");
  if (isOwner && status === "none") acts.push("offer");
  if (isOwner && status === "offered") acts.push("cancel-offer");
  // Managers supervise swaps (approve/reject); they don't claim through the swap
  // flow — a manager who wants an open shift just edits the roster directly.
  if (!isOwner && !isManager && status === "offered") acts.push("claim");
  if (!isOwner && !isManager && status === "claimed" && isClaimer) acts.push("withdraw-claim");
  return acts;
}

/** The field patch for an action, or null if it isn't valid in this state. */
export function applySwap(shift, action, actor = {}) {
  const status = swapStatusOf(shift);
  const isOwner = shift.userId === actor.userId;
  const isClaimer = shift.claimedById === actor.userId;
  switch (action) {
    case "offer":
      return isOwner && status === "none" ? { swapStatus: "offered" } : null;
    case "cancel-offer":
      return isOwner && status === "offered" ? { swapStatus: "none" } : null;
    case "claim":
      return !isOwner && !actor.isManager && status === "offered"
        ? { swapStatus: "claimed", claimedById: actor.userId, claimedByName: actor.name }
        : null;
    case "withdraw-claim":
      return isClaimer && !actor.isManager && status === "claimed"
        ? { swapStatus: "offered", claimedById: null, claimedByName: null }
        : null;
    case "approve":
      return actor.isManager && status === "claimed" && shift.claimedById
        ? { userId: shift.claimedById, userName: shift.claimedByName, swapStatus: "none", claimedById: null, claimedByName: null }
        : null;
    case "reject":
      return actor.isManager && (status === "offered" || status === "claimed")
        ? { swapStatus: "none", claimedById: null, claimedByName: null }
        : null;
    default:
      return null;
  }
}
