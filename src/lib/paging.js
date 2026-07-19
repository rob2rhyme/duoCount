// Progressive "show more" paging math — pure so it's unit-tested independently
// of React. Short lists (below `from`) render whole and never get a truncation
// control; longer ones reveal `initial` rows, then `step` more per tap.
//
// Defaults match the product spec: the customer roster shows 20 then +10, and
// project-wide any list of 25+ paginates the same way.
export const PAGE_INITIAL = 20;
export const PAGE_STEP = 10;
export const PAGE_FROM = 25;

// total  — length of the full list
// count  — how many rows the caller currently wants shown (starts at `initial`)
// returns { paginate, shown, hasMore, remaining, nextStep }
export function pageState(total, count, { initial = PAGE_INITIAL, step = PAGE_STEP, from = PAGE_FROM } = {}) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const want = Math.max(Math.floor(Number(count) || 0), initial);
  const paginate = n >= from;
  const shown = paginate ? Math.min(want, n) : n;
  const remaining = n - shown;
  return {
    paginate,
    shown,
    hasMore: remaining > 0,
    remaining,
    nextStep: Math.min(step, remaining),
  };
}
