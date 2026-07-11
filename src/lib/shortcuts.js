// Pure decision logic for the app's keyboard shortcuts, split out from the
// React effect so it can be unit-tested without a DOM. Given a keydown event
// (only the fields below are read) and the current tab context, it returns the
// action to take, or null to ignore the key.
//
//   { type: "save" }                     ⌘/Ctrl+Enter — submit the visible form
//   { type: "toggleHelp" }               ?            — toggle the shortcuts sheet
//   { type: "closeHelp" }                Esc
//   { type: "tab", id }                  1–9, or [ / ] to step
//
// The save combo is honored even while typing in a field (you compose, then
// save); every other shortcut is suppressed while typing so it never eats input.
export function resolveShortcut(e, { tabIds = [], currentTab, typing = false } = {}) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === "Enter") return { type: "save" };
  if (typing || mod || e.altKey) return null;

  if (e.key === "?") return { type: "toggleHelp" };
  if (e.key === "Escape") return { type: "closeHelp" };

  if (/^[1-9]$/.test(e.key)) {
    const i = parseInt(e.key, 10) - 1;
    return i < tabIds.length ? { type: "tab", id: tabIds[i] } : null;
  }

  if ((e.key === "[" || e.key === "]") && tabIds.length) {
    const idx = tabIds.indexOf(currentTab);
    const step = e.key === "]" ? 1 : -1;
    // From an unknown current tab, ] lands on the first tab and [ on the last.
    const base = idx === -1 ? (step === 1 ? -1 : 0) : idx;
    return { type: "tab", id: tabIds[(base + step + tabIds.length) % tabIds.length] };
  }

  return null;
}
