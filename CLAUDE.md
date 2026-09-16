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

The scan surface (`ScratchForm.js` "Scan to log") is guarded by
`src/lib/scratch-scan-guard.js` (pure, `tests/scratch-scan-guard.test.mjs`)
without leaving that scope: an accidental re-scan of the same game+pack+ticket
is refused **within a shift** (Opening and Closing are separate buckets;
survives a reload or a second device); staff can mark a pack **sold out** from
the scan list — a signed `soldOut` final count, the existing terminal state,
**not** the retired settlement banned above; and the replacement book of the
same game # auto-reads as a fresh "New" book starting at #0 until the next day,
derived from that same-day `soldOut` marker (nothing new is persisted).

## Product direction — inventory & rewards

- **Inventory / stock sync:** whole-store per-shift counting is rejected as
  impractical. The shipped mechanism is the owner-only **CSV "Stock levels"
  sync** — refresh existing items' quantity/price/expiry from a POS export —
  plus two owner-tunable alerts, "Expiring soon" (default ≤ 30 days) and "Need
  order" (default < 5 units), surfaced on the Dashboard **Stock attention** card
  and the digest. The signed per-shift count stays **only** for the high-shrink
  watch list (the theft spine). **Live/OAuth POS integration (Phase 2) is
  shelved — not on the roadmap.** Spec (Phase 1 shipped):
  `docs/pos-inventory-sync-spec.md`.
- **Rewards — shipped.** Phone-number points at the register (defaults **$1 = 1
  point, 100 points = $5 off**, owner-adjustable, off by default), an
  append-only signed ledger via the trusted `/api/rewards` route (client rules
  allow no writes), clerk points-fraud detectors, the public `/rewards` balance
  page + printable bilingual counter sign, and — added later — **inactivity
  points expiry** (owner `expiryMonths`, signed `expire` ledger lines,
  liability-aware) and **store-specific excluded categories** on top of the
  always-excluded legal base (tobacco/vape/alcohol/lottery/gift-cards/fuel; no
  SMS in v1 per TCPA). Spec: `docs/rewards-program-spec.md`.

## Account recovery (all three credential planes)

Nobody is permanently locked out, and the design is in
`docs/account-recovery-spec.md` (operator side: `credential-recovery-runbook.md`).
Two rules that are easy to break by accident:

- **Sign-in resolves identity BY PIN**, so every PIN write goes through
  `src/lib/pin-store.js` (`pinTaken` + `setUserPin`) — it keeps PINs unique per
  store, burns recovery links, and revokes sessions. Don't hand-roll a
  `pinHash` write. A PIN collision is always reported generically ("pick a
  different PIN"); naming the clash turns a form into a PIN oracle.
- **`POST /api/auth/reset` answers with one frozen body** (`NEUTRAL_RESULT`)
  whatever it finds — unknown store, unknown or unconfirmed address, suspended
  store, failed send, internal error. Anything that makes those distinguishable
  re-opens store/staff enumeration.

- **A recovery-address change costs the current PIN**, same as a PIN change
  (`/api/account` `setEmail`). It outlives every later PIN change, so without
  that check a minute with a signed-in device becomes permanent takeover. The
  address losing a confirmed claim gets a notice.

An email only recovers an account once **confirmed** (`emailVerifiedAt`); policy
is pure in `src/lib/recovery.js` (+ `tests/recovery.test.mjs`), I/O in
`recovery-store.js`. Support's `/dev` reset prefers emailing the owner a link
over issuing a credential; the temporary-PIN fallback is server-generated and
always sets `mustChangePin`. `/api/support/public` is the app's only anonymous
write — keep it that narrow.

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
