# Account recovery spec — "I forgot my PIN"

> Status: **shipped.** Covers every credential in the product: staff PINs, owner
> PINs, and the developer's platform login. The operator-side runbook (rotating
> the developer credential, what support may and may not do) lives in
> `credential-recovery-runbook.md`.

## Why this is not a stock password reset

Sign-in is **store code + PIN**, and the login route works out *who you are* by
which salted hash matches (`src/app/api/auth/login/route.js`). Two consequences
shape everything below:

1. **A reset request has to name a person some other way.** The confirmed
   recovery email on the user record is that name. If two active people at one
   store have confirmed the same address, a reset is ambiguous, so it sends
   nothing — and confirmation refuses the second claim up front rather than
   leaving someone with an address that silently can't recover anything.
2. **A new PIN must stay unique inside the store**, or sign-in resolves to the
   wrong identity. Every writer re-checks, and the answer is always a generic
   "pick a different PIN" — naming the clash would turn a reset screen into an
   oracle for the store's live PINs.

## The paths, in the order people should reach for them

| Situation | Path | Who's needed |
|---|---|---|
| Staff forgot their PIN | Owner/manager sets a new one in **Admin → Staff** | someone in the store |
| Anyone wants to rotate their own PIN | **Admin → My account** (current PIN + new PIN) | nobody |
| Anyone wants to add or change a recovery email | **Admin → My account** (current PIN + confirm from the inbox) | nobody |
| Owner forgot their PIN, confirmed email on file | **Forgot your PIN?** → emailed link → choose a new PIN | nobody |
| Owner forgot their PIN, second owner exists | The other owner resets it in **Admin → Staff** | the second owner |
| Sole owner, no confirmed email | **Can't sign in?** → signed-out form → support verifies, then issues a one-time PIN | DuoCount support |
| Developer forgot the console password | Rotate `DEV_ADMIN_*` and redeploy — see the runbook | deploy access |

`/help` is the public page that spells this out, and it is linked from the
sign-in screen next to **Forgot your PIN?**.

## Verified email is the whole hinge

An address only becomes a recovery path once its holder opens a confirmation
link, so a typo'd or someone-else's address can never take an account over.

**Setting it costs the current PIN**, exactly like changing the PIN does. The
recovery address is a credential — it decides who can reset this account later —
and unlike a PIN it *outlives every later PIN change*, so a rightful owner
couldn't evict a hijacker by rotating their PIN. Without that check, a minute
alone with a signed-in device (a shared till tablet, a phone left on the counter)
would convert into permanent silent takeover: repoint the address, confirm it
from your own inbox, walk away, and request a reset link from anywhere,
indefinitely. Changing or clearing a **confirmed** address also mails a notice to
the address that is losing the claim — the one party who can spot a hijack and,
by definition, isn't the attacker.

- Asked for at **sign-up** (optional, one line of explanation about what skipping
  it costs) and editable in **Admin → My account**.
- An owner may also put an address on a staff record in **Admin → Staff**; that
  address arrives *unconfirmed* and mails the staff member a confirmation link —
  an owner typing an address is not evidence that its reader wants it to recover
  anything.
- Changing or clearing an address drops its confirmation, burns any link already
  in flight, and notifies the address that is losing the claim.
- The field stays dual-purpose (schedule emails also use it), so duplicates may
  exist. What can't be duplicated is the *recovery claim*: first to confirm wins,
  and the second is told plainly (`verifyConflict`).

## Mail that asks for a reply

`DIGEST_FROM` sits on a verified sending subdomain whose MX points at the
provider's bounce handler, so **a reply to the From address reaches nobody**.
Two lines of copy invite one — the "didn't do this?" warning on every PIN-changed
notice, and the closing line of the developer's reply to a signed-out help
request. That second one goes to the person who, by definition, cannot read the
in-app ticket thread; telling them to reply into a void closes the one channel
built for them.

So the invitation is conditional on `SUPPORT_REPLY_TO`. Set it and recovery mail
carries a `Reply-To` pointing at a mailbox a human reads; leave it blank and the
copy points at the **Can't sign in?** link instead. Both wordings are honest.
`canReply` defaults to **false** in both builders, so a caller that forgets it
cannot make a promise the deployment can't keep, and a typo'd address reads as
unset rather than as a header pointing somewhere dead.

## Link mechanics

One `recoveryTokens/{id}` doc per outstanding link, holding a **salted scrypt
hash** of the secret — a leaked database row can't be replayed. The link itself
is `<docId>.<secret>`: the id addresses the doc (no query, no index), the secret
is 32 random bytes.

- **Reset links** live 30 minutes; **confirmation links** 7 days.
- Minting burns that user's other outstanding links of the same kind, so asking
  twice never leaves two doors open.
- Spending is a **transaction** — validate and mark used together — so a double
  tap can't both succeed.
- Any PIN write, by any route, burns that user's reset links and revokes refresh
  tokens (`lib/pin-store.js` is the single writer).
- A `kind` mismatch reads as *missing*, so a confirmation link probed at the
  reset endpoint looks exactly like one that never existed.

## What the request endpoint never reveals

`POST /api/auth/reset` returns one frozen body (`NEUTRAL_RESULT`) whatever
happened: unknown store code, unknown address, unconfirmed address, two people
sharing one address, suspended store, Resend unconfigured, bounced send, even an
internal error. The only observable difference is a 429, which says nothing about
any store. Otherwise the form would be a directory of which stores exist and who
works at them.

Rate limits (`lib/login-throttle.js`, every one auto-expiring):

| Limiter | Window | Cap |
|---|---|---|
| Reset request, per IP | 15 min | 5 |
| Reset request, per store | 60 min | 20 |
| Link confirm / email confirm, per IP | 15 min | 15 |
| Signed-out help form, per IP | 60 min | 4 |

## Support's reset, and why it can't leave support holding a key

The `/dev` console's owner reset (`storeAction` → `resetOwnerPin`) demands a
written reason (≥10 chars, stored in `adminAudit`) and offers two shapes:

- **Email a reset link** (default): support triggers it and never sees a
  credential; the owner proves they still hold the confirmed address. Audited as
  `ownerResetLink`.
- **One-time PIN** (only when there's no confirmed address): the *server*
  generates it — support no longer chooses it — redrawing until it's unique at
  that store (a collision would make login refuse *both* accounts, which is the
  lockout this is meant to end). It's shown once to read out, and it sets
  `mustChangePin`. The app opens nothing but the replace-your-PIN screen
  until the owner picks their own, after which what support saw is worthless.
  Audited as `resetOwnerPin`.

  To be precise about what `mustChangePin` is: a **client gate**
  (`src/app/page.js`), not a server-side authorization boundary. Login mints an
  ordinary token for a temporary PIN, because the person holding it is entitled
  to use it — once — to reach the screen that replaces it. The only other holder
  is the operator who issued it, who already has unrestricted cross-tenant Admin
  SDK power and gains nothing by bypassing a screen. What makes the temporary PIN
  safe is that it is server-generated, unique at that store, single-trip, audited
  with a reason, and dead the moment the owner completes the change — not that
  the gate is enforced server-side.

Either way the owner is emailed a notice if an address is on file, live sessions
are dropped, and any link already in flight dies.

An in-store reset (an owner resetting a staff PIN) deliberately does **not** set
`mustChangePin`: that PIN is handed over face to face, which is the documented
model, and the owner can already reset it again at will.

## The signed-out help form

`/api/support/public` is the app's **only anonymous write**, so it's the
narrowest one: rate-limited before any write, no attachments, bounded message, a
required reply-to address, and `vendorId: null` — no tenant owns it, so no
client query can read it. Tickets land in the same `/dev` inbox, labelled
**Signed out** with a banner saying nothing in them is verified. A developer's
reply is emailed to the address on the ticket, because the person who wrote it
can't read the in-app thread — that's why they wrote in.

## Files

| Area | Where |
|---|---|
| Policy (pure, tested) | `src/lib/recovery.js` · `tests/recovery.test.mjs` |
| Token I/O + mail | `src/lib/recovery-store.js` |
| The single PIN writer | `src/lib/pin-store.js` |
| Second factor (pure, RFC vectors) | `src/lib/totp.js` · `tests/totp.test.mjs` |
| Routes | `api/auth/reset`, `api/auth/reset/confirm`, `api/auth/verify-email`, `api/account`, `api/support/public` |
| Screens | `/reset`, `/verify-email`, `/help`, Admin → My account, the forced `MustChangePin` gate |
| Rules | `recoveryTokens` denied to every client (`firestore.rules`, `tests/rules.test.mjs`) |

## Deliberately not built

- **Password-reset for the developer credential.** Adding an email-driven path
  into the most privileged credential in the system is a net loss; rotation plus
  a second factor plus a second registered operator is stronger. See the runbook.
- **SMS recovery.** No phone channel exists in v1 (TCPA, same reason rewards has
  none), and an SMS reset would be a weaker second path to the same account.
- **Security questions.** Guessable, phishable, and one more thing to forget.
- **Self-serve store deletion or owner transfer via recovery.** Recovery returns
  someone to the account they already had; it never changes who owns a store.
