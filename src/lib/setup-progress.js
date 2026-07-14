// Pure setup-progress derivation for first-run onboarding.
//
// Given the vendor's locations, drawers, and inventory items — exactly as they
// arrive from the live watchers in AppShell — this works out which foundational
// pieces exist yet, so the shell can steer a brand-new owner to Admin instead
// of stranding them on a Cash form full of empty selects. No I/O and no React,
// so it's unit-testable with `node --test`.
//
// The convention across the app is "active unless explicitly false" (a drawer
// or item with `active === false` is retired), so we mirror that here.

const isActive = (x) => x && x.active !== false;

export function setupProgress(locations = [], drawers = [], items = []) {
  const hasLocation = (locations || []).some(isActive);
  const hasDrawer = (drawers || []).some(isActive);
  const hasItem = (items || []).some(isActive);

  const steps = [
    {
      key: "location",
      label: "Add a store location",
      hint: "Every count is filed under a location — start with one.",
      done: hasLocation,
    },
    {
      key: "drawer",
      label: "Add a cash drawer or register",
      hint: "The register your team counts at the open and close of a shift.",
      done: hasDrawer,
    },
    {
      key: "item",
      label: "Add inventory items",
      hint: "Optional — only if you'll track high-shrink stock like cigarettes or vapes.",
      done: hasItem,
      optional: true,
    },
  ];

  // A cash or scratch count needs a location *and* a drawer; that pair is the
  // minimum for the app to be usable at all. Inventory items are a separate,
  // optional track (only the Inventory tab needs them).
  const essentialsDone = hasLocation && hasDrawer;
  const required = steps.filter((s) => !s.optional);
  const doneRequired = required.filter((s) => s.done).length;
  const allDone = steps.every((s) => s.done);

  return {
    hasLocation,
    hasDrawer,
    hasItem,
    steps,
    essentialsDone,
    allDone,
    doneRequired,
    totalRequired: required.length,
  };
}
