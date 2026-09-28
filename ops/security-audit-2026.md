# DuoCount — security audit, September 2026

Full-surface review of both planes: the tenant app (owners, managers, staff,
and the two anonymous surfaces) and the operator plane (`/dev`, the Admin-SDK
routes, the credential env vars).

**This file lives in `ops/`, not `docs/`, and that is deliberate — see F5.**
Everything under `docs/` is built as a public static page. A document that
names defence thresholds and unfixed weaknesses must not be one.

Method: the rules file and every API route were read directly, throttle
budgets were computed rather than eyeballed, and each claim below was checked
against the code before it was written down. Where a number appears, the
arithmetic is shown so it can be re-derived when the limits change.

---

## What was verified and found sound

| Area | Result |
| --- | --- |
| **Firestore rules** | All **74** `allow` statements carry a tenant guard, directly or via a guarded predicate. The 11 predicates without one (`varianceConsistent`, `flagOk`, `dayLocked`, …) are data-shape validators, always ANDed with `member()`/`mgr()`, and every `get()`/`exists()` inside them is scoped to `$(vendorId)` from the match path. |
| **Privileged collections** | `adminAudit`, `platformAdmins`, `billing`, `recoveryTokens` and `users/*/private` (PIN hashes) are `allow read, write: if false` — Admin SDK only, no client path. |
| **Mid-session revocation** | `liveActive()` reads the live user doc on every write, so a deactivated user is stopped even while holding a valid token. Reads are covered by the client force-sign-out. |
| **Vendor doc writes** | Restricted to an explicit `hasOnly([...])` key allowlist — an owner cannot write arbitrary fields. |
| **Route authorization** | All 25 routes guarded (`requireMember` / `requireManager` / `requireOwner` / `requirePlatformAdmin` + `assertScope` / `CRON_SECRET`), except the five intentionally public ones below. |
| **XSS** | No user-supplied content reaches `dangerouslySetInnerHTML`. `marked` only ever parses repo-authored `docs/*.md`; `getDoc` validates `^[a-z0-9-]+$` so there is no path traversal; print windows escape via `esc()`. |
| **Security headers** | `next.config.mjs` sets CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS (preload), `Permissions-Policy`. |
| **Dependencies** | **0** production advisories. |
| **Enumeration-resistant design** | `/api/auth/reset` returns one frozen `NEUTRAL_RESULT`; `/api/auth/dev` returns one combined message for both credential halves; `/api/rewards/balance` counts *every* request and never returns a name. |
| **`/api/health`** | No I/O, no configuration echo. |

The intentionally public surfaces are `auth/login`, `auth/signup`,
`auth/reset(/confirm)`, `auth/verify-email`, `auth/check-slug`, `health`,
`rewards/balance` and `support/public`.

---

## F1 — Store-wide PIN brute force was economically viable — **FIXED**

**Severity: High.** `src/app/api/auth/login/route.js`, `src/lib/login-throttle.js`.

The PIN is 6 digits and login matches it against *every* active user in the
store, so any one of S staff PINs wins. With a flat 50-failures-per-15-minutes
store cap:

```
50 × 4 windows/hr × 24 × 365            = 1,752,000 guesses/year/store
P(win per guess), S = 6 staff           = 6 / 1,000,000
expected breaks per year                = 1,752,000 × 6e-6 ≈ 10.5
P(at least one break within 30 days)    = 1 − e^(−0.864) ≈ 58%
```

An attacker needed only the store slug (public, and F2 handed out the list) and
rotating IPs to stay under the per-IP cap. An owner PIN sits in the same space,
and an owner can reset staff PINs.

**Compounding bug:** a successful sign-in by *any* staff member deleted the
store counter, refilling the attacker's budget on every honest login. The code
comment justified this by shared shop Wi-Fi — but that rationale is about the
**IP** counter, not the store one.

### Fix

1. **The store counter survives a success.** Only the IP counter is cleared, so
   the shared-Wi-Fi behaviour the original comment actually describes is
   preserved, without handing an attacker a refill on every honest login.
2. **The store window escalates.** Each consecutive trip of the cap multiplies
   the next window (×4, capped at 1 hour), with strikes decaying after a quiet
   day so a key is never permanently degraded.
3. **The cap came down from 50 to 20**, so each of those windows buys less.
4. `retryAfterMs` is returned with a `Retry-After` header, and the user-facing
   string no longer promises "a few minutes" (en/es updated in lockstep).

Compounding:

| Configuration | Guesses/year | Expected breaks/year (S=6) | Chance within 30 days |
| --- | ---: | ---: | ---: |
| 50 per 15 min, flat *(original)* | 1,752,000 | ~10.5 | **58%** |
| 50 per hour, escalated | 438,000 | ~2.6 | 19% |
| **20 per hour, escalated** *(shipped)* | **175,200** | **~1.05** | **8%** |

### Why 20 does not lock out real staff

Because the store cap is not what bounds them. A shop's staff share one public
IP, so their typos land on a single `ip_` key and hit `IP_LIMIT` (10) long before
the store-wide count matters — and a successful sign-in **clears that IP
counter**, so a fumbled shift change resets the moment anyone gets in. Reaching
20 store-wide requires failures from many different addresses, which is the
distributed attack this cap exists for, not a busy Tuesday. A test asserts the
per-IP cap bites first over the same window, so tuning either number can't
silently invert that.

### Residual risk, stated plainly

8% over 30 days is a real improvement and still not zero. What is left is
inherent to a 6-digit secret matched against a whole staff list:

- **Lengthen the PIN.** 8 digits is 100× the space and closes this outright. It
  is the only remaining change that does, and it costs a migration plus daily
  keying effort for staff — a product decision, not a bug fix.
- **Raise `maxWindowMs`** from 1 hour to 4. Cuts the budget 4× more, at the cost
  of a 4-hour self-inflicted lockout (below).
- **Per-user lockout** is not directly available: sign-in resolves identity *by*
  PIN, so there is no known user to lock until after a match.

### The tradeoff this fix accepts

Escalation lengthens a self-inflicted lockout, and the lower cap makes it
cheaper to trigger: closing a store's new sign-ins used to take 50 failures for
15 minutes, and now takes 20 for an hour. That is the deliberate trade — the
same property that makes the cap bind an attacker makes it reachable by one.
Bounded at an hour rather than a day so a store can get its staff in within a
shift. Already-signed-in staff are unaffected either
way — only new sign-ins wait. A CAPTCHA would be the usual escape hatch and is
ruled out by the project's no-third-party-scripts rule.

### Not regressed

`STORE_LIMIT` was shared with `/api/rewards/balance`, which counts **every**
request — inheriting the escalation there would have locked a busy rewards
program out for an hour, an outage rather than a defence. That surface now has
its own `BALANCE_STORE_LIMIT` with the same numbers as before and no
escalation. A test asserts it never escalates, and another asserts the other
six limiters' persisted record shape is unchanged.

---

## F2 — `/api/auth/check-slug` was an unthrottled tenant-enumeration oracle — **FIXED**

**Severity: Medium.** Unauthenticated, **no rate limit at all**, and a prefix
range query: `{"businessName":"a"}` returned every slug starting with `a`, so
36 requests over `a–z`/`0–9` enumerated the platform's entire store list. Also
an unbounded Firestore read on an anonymous endpoint — a cost-amplification
vector. It fed F1 with a target list.

(`slugify("")` returns `"store"`, so the empty-input full scan was already
impossible. Credit where due.)

**Fix:** per-IP throttle counting *every* request (`SLUG_CHECK_LIMIT`, 30 per 15
minutes — a real signup tries a handful of names); a `MIN_BASE` of 3 characters,
below which the vendor collection is not touched at all; and `.limit(25)` on the
range, which is all `nextAvailableSlug` ever consults. Enumeration now means
guessing 3-character prefixes (46,656 of them) at 30 requests per 15 minutes.

The signup form was updated to match: it no longer asks below 3 characters, and
renders `available: null` as the neutral prompt rather than "taken".

---

## F3 — The developer password alone is superadmin — **ACCEPTED, not fixed**

**Severity: Medium.** `src/lib/platform-admins.js:42`:

```js
if (claims?.platformAdmin === true && !claims?.vendorId)
  return { id: …, role: "superadmin", source: "bootstrap" };
```

`DEV_ADMIN_EMAIL` + `DEV_ADMIN_PASSWORD` returns superadmin immediately, with no
second gate — the registry and `PLATFORM_ADMIN_UIDS` checks below it apply only
to operators signing in through their own store account. That one static string
in a deploy dashboard can reset any owner's PIN, delete any store, and change
any billing record across every tenant.

The second factor exists and is tested (`DEV_ADMIN_TOTP_SECRET`, RFC 6238, with
`npm run totp:secret` to verify the key before deploying it), and is
**deliberately off**: single operator, single client, a generated 120-bit
password, and throttling already in place. Revisit if anyone else gains Vercel
deploy access, if stores the operator does not own are taken on, or if the
secret is ever exposed. Turning it on is one env var and a redeploy.

---

## F4 — CSP has no `script-src` — **ACCEPTED**

**Severity: Low.** The policy is `frame-ancestors 'none'` only, so it stops
clickjacking but not script injection. This is a documented tradeoff in
`next.config.mjs`: a `default-src`/`script-src` policy has to accommodate Next's
inline bootstrap and Firebase's XHR/WebSocket origins, and a broken CSP is worse
than a narrow one. A nonce-based policy is the hardening path if the app ever
takes untrusted HTML — it does not today (see XSS above), which is why this sits
at Low.

The three moderate `npm audit` advisories are devDependency transitives inside
`firebase-tools` (`csv-parse`, `stream-json`), unreachable from `src/`, and were
accepted deliberately in #249 rather than taken as a two-major downgrade.

---

## F5 — Internal docs were published as public static pages — **FIXED**

**Severity: Medium.** `docs/` is served at `/docs/<slug>`, and
`generateStaticParams` iterates `docSlugs()` — *all* markdown files. The
`INTERNAL` set only removes them from the index and the search corpus; its own
comment said they "stay renderable at their direct URL". Confirmed in the build
output: `credential-recovery-runbook.html` was emitted as a public page.

That runbook is an operator playbook. It names the credential env vars, the
throttle numbers, the `/dev` diagnostics and their log format, and the reset
procedures — reconnaissance served at a guessable URL to anyone.

**Fix:** the runbook moved to `ops/`, which `docs.js` never reads, with every
reference updated (`README`, `CLAUDE.md`, and the two docs that cite it). A note
at the `INTERNAL` set now states that unlisting is not access control.

**Residual:** the commercial planning documents (positioning, competitive
analysis, distribution, monetization, the dev-console roadmap) are *still*
unlisted-but-public by the same mechanism. That is a business-confidentiality
call rather than a security one, and public docs link into several of them, so
they were left in place. Moving them to `ops/` too is a one-line change per
inbound reference if that is the preference.

---

## Coverage — what this audit did not do

- No live testing against the production deployment; everything here is from
  source, the built output, and a local production build.
- No exhaustive per-route input-validation pass across all 25 routes; the
  review covered authorization, the anonymous surfaces, and injection classes.
- The rewards and gaming **business-logic** fraud paths were checked for
  authorization only, not for economic abuse (points self-dealing, split
  manipulation). The clerk-fraud detectors in `src/lib/rewards.js` are the
  intended control there and were not evaluated.
- No dependency supply-chain review beyond `npm audit`.

## Verification

`npm run lint` 0 errors (6 pre-existing warnings) · `npm test` 823 unit tests
(9 new) · `npm run test:rules` 92 rules tests · `npm run build` compiles.
