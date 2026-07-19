"use client";
import { useEffect, useMemo, useState } from "react";
import { pageState, PAGE_INITIAL, PAGE_STEP, PAGE_FROM } from "@/lib/paging";
import { useLang } from "./LangProvider";

// Reusable progressive disclosure for long lists: render the first `initial`
// rows, reveal `step` more per tap. Lists shorter than `from` render whole, so
// short lists are never truncated behind a button. Pass `resetKey` (e.g. a
// search string) to snap back to the first page when the list is re-scoped.
// Paging math lives in lib/paging.js so it stays unit-tested.
export function usePaged(items, { initial = PAGE_INITIAL, step = PAGE_STEP, from = PAGE_FROM, resetKey } = {}) {
  const [count, setCount] = useState(initial);
  useEffect(() => { setCount(initial); }, [resetKey, initial]);
  const list = items || [];
  const st = pageState(list.length, count, { initial, step, from });
  const visible = useMemo(() => list.slice(0, st.shown), [items, st.shown]);
  const showMore = () => setCount((c) => Math.max(c, initial) + step);
  return { visible, showMore, hasMore: st.hasMore, remaining: st.remaining, nextStep: st.nextStep, total: list.length };
}

// The tap-to-reveal control. Renders nothing when there's nothing more to show,
// so callers can drop it unconditionally at the foot of any list.
export default function ShowMore({ hasMore, nextStep, onMore, className = "" }) {
  const { t } = useLang();
  if (!hasMore) return null;
  return (
    <button type="button" onClick={onMore}
      className={`w-full text-center text-[13px] font-semibold text-muted hover:text-fg hover:bg-subtle py-2.5 transition ${className}`}>
      {t("common.show_more", { n: nextStep })}
    </button>
  );
}
