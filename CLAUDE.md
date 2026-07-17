# DuoCount — project notes for Claude

Multi-tenant Next.js + Tailwind + Firebase app for retail cash-drawer,
scratch-off, and inventory counting. Trust/theft-prevention is the product's
spine: signed, timestamped, append-only counts with countersign verification.

## Product direction — scratch-off / lottery scope (IMPORTANT)

The lottery/scratch-off feature is **only** a shift-boundary theft-protection
count: track the ticket number a pack is at when a shift **opens** vs. when it
**closes**, and flag any tickets that go unaccounted between two consecutive
counts (the next open sits above the previous close). That's the whole goal.

Do **NOT** reintroduce, build toward, or expand:
- **Lottery settlement / settlement-file reconciliation** — retired on purpose;
  settlement is the state lottery's job, not ours.
- **Pack lifecycle / pack "activate" / active-pack state machine** — retired
  (PR #125). No `PacksCard`, `SettlementReconcile`, or `lib/settlement.js`.

The shipped mechanism is `src/lib/scratch-audit.js` (`buildPackAudit`):
pure per-pack continuity-gap + missing-log detection, surfaced as the Dashboard
**Pack audit** card and the entry-based **pack-gap** pattern alert (detector 8
in `src/lib/patterns.js`). Keep new work inside that "opening→closing ticket
count" framing.

## Repo / naming

Repo was renamed `sh-stock-tracking` → `duoCount`. Brand is **DuoCount**
(package name `duocount`). No `sh-stock-tracking` references should remain in
tracked files. Note: the **Vercel project** may still be named
`sh-stock-tracking` — that's a dashboard setting, not in the repo.

## Localization

Pure keyed catalog in `src/lib/i18n.js` (en/es), resolved via `LangProvider`
(per-device `duocount-lang`). Rules the tests enforce: every locale's key set
equals `en`'s; no value is blank; missing key falls back to English. Keep en/es
in lockstep and never leave a half-translated ("mixed-language") screen.
