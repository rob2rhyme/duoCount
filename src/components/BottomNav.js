"use client";
import { useState } from "react";
import { useLang } from "./LangProvider";
import TabIcon from "./TabIcon";

// Mobile bottom navigation. The top tab strip works fine on a wide screen but
// on a phone it's nine text-only tabs on a single sideways scroll — off-screen
// tabs get missed. This groups them into a few thumb-reachable buttons
// (Count / Team / Insights / Admin); tapping one opens a small sheet of that
// group's screens. Shown only < sm (the top strip takes over at ≥ sm).
//
// It's driven entirely by the visible `tabs` the shell already computed, so an
// employee (no Admin tab) simply gets one fewer group — no role logic here.

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };

const ICONS = {
  count: (<svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h3" /></svg>),
  team: (<svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.5M17 14.5a5.5 5.5 0 0 1 3.5 5.1" /></svg>),
  insights: (<svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true"><path d="M4 20h16" /><path d="M7 20v-6M12 20V6M17 20v-9" /></svg>),
  admin: (<svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 12.6H4a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5.6 6L5.5 6a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>),
};

// Order + membership of each group. `key` picks the icon above; labels resolve
// through the i18n catalog so the mobile nav follows the clerk's language.
const GROUPS = [
  { key: "count", labelKey: "nav.group_count", ids: ["cash", "scratch", "inventory", "rewards"] },
  { key: "team", labelKey: "nav.group_team", ids: ["time", "incidents", "notes"] },
  { key: "insights", labelKey: "nav.group_insights", ids: ["dashboard", "portfolio", "log"] },
  { key: "admin", labelKey: "nav.admin", ids: ["admin"] },
];

export default function BottomNav({ tabs, current, onSelect, attention = {} }) {
  const { t } = useLang();
  const [openKey, setOpenKey] = useState(null);
  const byId = Object.fromEntries(tabs.map((tb) => [tb.id, tb]));

  // Keep only the groups (and members) that are actually visible to this user,
  // and roll each group's members' attention counts up onto the group.
  const groups = GROUPS
    .map((g) => {
      const members = g.ids.filter((id) => byId[id]);
      const count = members.reduce((n, id) => n + (attention[id] || 0), 0);
      return { ...g, label: t(g.labelKey), members, count };
    })
    .filter((g) => g.members.length > 0);

  const activeKey = groups.find((g) => g.members.includes(current))?.key || null;
  const openGroup = groups.find((g) => g.key === openKey) || null;

  function tapGroup(g) {
    // Single-screen group (e.g. Admin) jumps straight there; otherwise open the
    // sheet so the specific screen can be picked.
    if (g.members.length === 1) { onSelect(g.members[0]); setOpenKey(null); return; }
    setOpenKey((k) => (k === g.key ? null : g.key));
  }

  function pick(id) { onSelect(id); setOpenKey(null); }

  return (
    <div className="sm:hidden">
      {/* Tap-away backdrop while a group sheet is open */}
      {openGroup && (
        <button type="button" aria-label={t("nav.close_menu")} onClick={() => setOpenKey(null)}
          className="fixed inset-0 z-30 bg-black/30" />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-line px-safe pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
        aria-label={t("nav.sections")}>
        {openGroup && (
          <div className="sheet-pop absolute bottom-full inset-x-0 bg-surface border-t border-x border-line rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.18)] overflow-hidden">
            <div aria-hidden="true" className="pt-2 grid place-items-center">
              <span className="w-9 h-1 rounded-full bg-line" />
            </div>
            <div className="px-4 pt-1.5 pb-2 text-[11px] uppercase tracking-wide text-muted font-semibold">
              {openGroup.label}
            </div>
            {/* Icon tiles — 2-up on narrow phones, 3-up once the width allows. */}
            <ul className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-2.5 px-3.5 pb-4">
              {openGroup.members.map((id) => {
                const active = current === id;
                return (
                  <li key={id} className="min-w-0">
                    <button type="button" onClick={() => pick(id)} aria-current={active || undefined}
                      className={`relative w-full flex flex-col items-start gap-2.5 rounded-2xl border p-3.5 text-left transition active:scale-[.97] ${active ? "border-brass bg-brass/10" : "border-line bg-panel hover:bg-subtle"}`}>
                      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 ${active ? "bg-brass text-white" : "bg-brass/10 text-brass"}`}>
                        <TabIcon id={id} size={20} />
                      </span>
                      <span className={`text-[13px] font-semibold leading-tight truncate w-full ${active ? "text-fg" : "text-fg/90"}`}>{byId[id].label}</span>
                      {attention[id] > 0 && (
                        <span className="absolute top-2.5 right-2.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-alert text-white text-[10px] font-bold leading-none"
                          aria-label={t("nav.need_attention", { n: attention[id] })}>{attention[id]}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <ul className="flex">
          {groups.map((g) => {
            const active = g.key === activeKey;
            return (
              <li key={g.key} className="flex-1">
                <button type="button" onClick={() => tapGroup(g)}
                  aria-expanded={openKey === g.key}
                  className={`w-full flex flex-col items-center gap-0.5 py-2 transition ${active ? "text-fg" : "text-muted"}`}>
                  <span className={`relative ${active ? "text-brass" : ""}`}>
                    {ICONS[g.key]}
                    {g.count > 0 && (
                      <span className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-alert text-white text-[9px] font-bold leading-none"
                        aria-label={t("nav.need_attention", { n: g.count })}>{g.count}</span>
                    )}
                  </span>
                  <span className="text-[11px] font-semibold leading-none">{g.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
