# Credential runbook (operator-internal)

> Internal. Not listed on the public docs index. The product-side flows are in
> `account-recovery-spec.md`; this is what **you**, the developer, do — including
> the one case the app deliberately can't solve for you.

## 1. Set these before you need them

| Env var | Why it matters here |
|---|---|
| `APP_URL` | **Set it.** Recovery and confirmation links are built from it. Without it they're built from the `Host` header the request arrived with, which is one fabricated header away from pointing a reset link somewhere else. |
| `RESEND_API_KEY`, `DIGEST_FROM` | No mail means no self-serve recovery for anyone — every reset falls back to a support ticket. A verified sender domain also keeps these out of spam, which matters more for a reset link than for a digest. |
| `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD` | Both blank = the developer login is off. Use a long random password from a manager; it is a single static secret that unlocks every tenant. |
| `DEV_ADMIN_TOTP_SECRET` | Optional second factor. Blank = off, and the login behaves exactly as before — deploying it can't lock you out by itself. |

## 2. You forgot the developer password

There is **no reset flow, on purpose.** An email-driven path into the most
privileged credential in the system would be a net loss — that mailbox becomes
the real credential, and it's outside the product's control.

1. Set a new `DEV_ADMIN_PASSWORD` in the Vercel project (Settings → Environment
   Variables → Production).
2. **Redeploy** — env changes don't reach running functions until then.
3. Sign in at `/dev` and confirm the Stores tab loads.
4. Store the new value in your password manager before you close the tab.

The console is not your only way back in: an **active `platformAdmins` operator**
signs in with their ordinary store account. Which is the point of the next item.

## 3. Turn a lockout into an inconvenience — do these once

- **Register a second operator.** `/dev` → Operators → add a second
  `superadmin`. The registry refuses to drop its last active superadmin
  (transactionally), and an operator can't edit their own row, so neither of you
  can accidentally lock the pair of you out.
- **Turn on the second factor.** Generate a base32 secret, add it as
  `DEV_ADMIN_TOTP_SECRET`, redeploy, scan it into your authenticator, and keep
  the secret itself in your password manager as the recovery copy.
  ```
  node -e "console.log(require('crypto').randomBytes(20).toString('base64').replace(/[^A-Z2-7]/gi,'').toUpperCase().slice(0,32))"
  ```
  Lost the authenticator? Blank `DEV_ADMIN_TOTP_SECRET` and redeploy — that's the
  break-glass, and it's why the secret belongs in the password manager too.
- **Rotate the password** when someone with deploy access leaves, on any
  suspicion, and otherwise on whatever cadence you keep for shared secrets.
  Rotation is step 2 above; nothing else depends on the old value.

## 4. A store owner is locked out

Work the list top-down — each step is faster than the one below it and involves
fewer people.

1. **Do they have a second owner?** That owner resets the PIN in Admin → Staff.
   Nothing for you to do.
2. **Do they have a confirmed recovery email?** `/dev` → Stores shows the owner's
   address. Open **Reset owner PIN**, write the reason, leave the mode on **email
   the owner a reset link**. You never see a credential.
3. **Neither?** Verify they own the store *before* touching anything — this is
   the whole reason the reason field is mandatory and the action is audited. Use
   the signed-out ticket they sent (`/dev` inbox, labelled **Signed out**) plus
   something independent: the billing record, an address or phone you already
   hold, or a reply from an address already on the store. Then use **issue a
   one-time PIN**, read it out, and tell them the app will ask them to choose
   their own PIN as they sign in. What you saw stops working at that moment.

Then close the loop: tell them to add a confirmed recovery email and a second
owner, so there's no step 3 next time.

**Never**: reset an owner PIN without a verified requester, take a PIN over the
phone, type someone's PIN for them, or use a store account's session to look
around a tenant. Every reset is in `adminAudit` with your operator id, the store,
and your stated reason — including the reset you'd rather not explain.

## 5. Mail isn't arriving

Symptom: the reset screen says the link is on its way and nothing lands.

1. `POST /api/digest/test` (owner-side test button in Admin) names an unset
   `RESEND_API_KEY` / `DIGEST_FROM` explicitly. Start there.
2. Check the Resend dashboard for a bounce or a suppressed address. A link to a
   dead mailbox is indistinguishable from a working one at the request endpoint —
   by design — so the sending log is the only place the truth shows up.
3. Check `APP_URL`: a link that arrives but 404s means it's wrong or unset.
4. Spam is the ordinary answer. A verified sender domain in Resend fixes it more
   reliably than anything the app can do.

While mail is down, recovery for everyone falls back to a second owner or to
you, so treat it as a real outage rather than a cosmetic one.
