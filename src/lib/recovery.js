// Account recovery — PURE policy for "I forgot my PIN" and for the verified
// email that makes a self-serve reset safe. No Firestore, no crypto, no React,
// so `node --test` runs it directly (tests/recovery.test.mjs). The I/O half —
// minting tokens, reading/burning them — lives in recovery-store.js.
//
// Why a PIN reset is not a stock password reset here: sign-in is store code +
// PIN, and the login route resolves WHO you are by which salted hash matches
// (src/app/api/auth/login/route.js). So:
//   • a reset request must name a person some other way — the verified recovery
//     email on the user doc is that name, and it must be UNIQUE among the
//     store's active users or we refuse rather than guess (resolveResetTarget);
//   • a new PIN must still be unique inside the store, or login would resolve
//     to the wrong identity. The confirm route re-runs that collision check and
//     answers with a generic "pick a different PIN" — never "that one belongs
//     to someone else", which would turn the reset screen into an oracle for
//     the store's live PINs.
//
// Everything a caller can learn from the REQUEST step is deliberately constant
// (see NEUTRAL_RESULT): a wrong store code, an unknown address, an unverified
// address and a real send are indistinguishable, so the form can't be used to
// enumerate stores or staff.

export const RESET_TTL_MIN = 30;
export const VERIFY_TTL_DAYS = 7;
export const RESET_TTL_MS = RESET_TTL_MIN * 60 * 1000;
export const VERIFY_TTL_DAYS_MS = VERIFY_TTL_DAYS * 24 * 60 * 60 * 1000;

// One collection holds both kinds of one-time link; `kind` keeps them from
// being used interchangeably (a verify link must never set a PIN).
export const TOKEN_KINDS = ["reset", "verify"];

// The single answer the request endpoint ever gives. Exported so the route and
// its test can't drift apart.
export const NEUTRAL_RESULT = Object.freeze({ ok: true, sent: true });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX = 200;

/** Normalize an address for storage and comparison, or null if it isn't one. */
export function normalizeEmail(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v || v.length > EMAIL_MAX || !EMAIL_RE.test(v)) return null;
  return v;
}

/** "" clears the address; anything else must look like one. Shared by the
 *  staff route (an owner editing a staff address) and /api/account (a member
 *  editing their own), so both accept exactly the same values. */
export function cleanEmailInput(raw) {
  const v = String(raw ?? "").trim();
  if (v === "") return { email: null };
  const email = normalizeEmail(v);
  return email ? { email } : { error: "bad_email" };
}

/* ------------------------------- Link tokens ------------------------------- */
// A token is `<docId>.<secret>`: the id addresses the Firestore doc directly
// (no query, no index) and only the secret's salted hash is stored, so a leaked
// database row can't be replayed as a link.

export function joinToken(id, secret) {
  return `${id}.${secret}`;
}

/** Parse a token from a URL. Returns { id, secret } or null — never throws. */
export function splitToken(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 300) return null;
  const i = s.indexOf(".");
  if (i <= 0 || i === s.length - 1) return null;
  const id = s.slice(0, i);
  const secret = s.slice(i + 1);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(secret)) return null;
  return { id, secret };
}

/**
 * State of a stored token doc against the wall clock, so the route only maps a
 * state to a response. Fail-closed: anything unparseable reads as "expired"
 * rather than "ok". `kind` mismatch reads as "missing" — a verify link probed
 * at the reset endpoint must look exactly like a link that never existed.
 */
export function tokenState(doc, now, kind) {
  if (!doc) return "missing";
  if (kind && doc.kind !== kind) return "missing";
  if (doc.usedAt) return "used";
  const exp = Number(doc.expiresAt);
  if (!Number.isFinite(exp) || now >= exp) return "expired";
  return "ok";
}

/* ----------------------------- Who gets a link ----------------------------- */

/** Active users of one store whose VERIFIED recovery address matches. */
export function resetRecipients(users, email) {
  const want = normalizeEmail(email);
  if (!want) return [];
  return (users || []).filter(
    (u) => u && u.active !== false && !!u.emailVerifiedAt && normalizeEmail(u.email) === want);
}

/**
 * The one person a reset link may be sent to, or null. Zero matches (unknown or
 * unverified address) and two-or-more (the same address on two staff records —
 * the PIN would be ambiguous anyway) both send nothing; the caller still
 * returns NEUTRAL_RESULT either way.
 */
export function resolveResetTarget(users, email) {
  const hits = resetRecipients(users, email);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * The other active user who has ALREADY verified this address at the same
 * store, if any. The `email` field stays dual-purpose — it's also where
 * schedule emails go, and a small store may legitimately point two staff at one
 * family inbox — so duplicates are allowed to EXIST. What can't be duplicated is
 * the recovery claim: the first person to confirm an address owns it for
 * recovery, and the second is told plainly instead of silently ending up with
 * an address that can never reset anything (resolveResetTarget refuses a tie).
 */
export function verifyConflict(users, email, selfId) {
  const want = normalizeEmail(email);
  if (!want) return null;
  return (users || []).find((u) => u && u.id !== selfId && u.active !== false
    && !!u.emailVerifiedAt && normalizeEmail(u.email) === want) || null;
}

/** Has this user got somewhere a recovery link could actually go? */
export function hasRecoveryEmail(user) {
  return !!(user && normalizeEmail(user.email) && user.emailVerifiedAt);
}

/**
 * The mailbox a human actually reads, or null. Recovery and support mail is sent
 * FROM a no-reply address on the verified sending subdomain — whose MX points at
 * the provider's bounce handler — so without this, a reply reaches nobody.
 * Garbage in the env reads as unset, so a typo degrades to the honest wording
 * rather than a Reply-To header pointing somewhere dead.
 */
export function supportReplyTo(env = process.env) {
  return normalizeEmail(env.SUPPORT_REPLY_TO || "");
}

/** Is there somewhere for a reply to land? What the builders' `canReply` should
 *  be set to. Named apart from that parameter so it can't shadow it. */
export const supportReplyEnabled = (env = process.env) => !!supportReplyTo(env);

/* --------------------------------- Links ---------------------------------- */

export function recoveryLink(appUrl, path, token) {
  const base = String(appUrl || "").replace(/\/+$/, "");
  return `${base}${path}?t=${encodeURIComponent(token)}`;
}
export const resetLink = (appUrl, token) => recoveryLink(appUrl, "/reset", token);
export const verifyLink = (appUrl, token) => recoveryLink(appUrl, "/verify-email", token);

/* ------------------------------ Email copy -------------------------------- */
// Recovery mail is security mail: the person must understand "someone asked to
// reset your PIN" in their own language, so — unlike the digest — these are
// bilingual.
//
// Lines that invite a REPLY come in pairs, `x` and `x_noreply`, chosen by the
// caller's `canReply`. The sending address is a no-reply on a subdomain whose MX
// points at the provider's bounce handler, so a reply only reaches a human when
// SUPPORT_REPLY_TO is configured (recovery-store.supportReplyTo). `canReply`
// defaults to FALSE everywhere: an email must never tell someone to reply into a
// void — least of all the signed-out support reply, which goes to the one person
// who cannot read the in-app thread. The catalog is local (it never belongs in a client bundle) and
// tests/recovery.test.mjs enforces the same en/es key-parity rule the UI
// catalog lives under.

export const EMAIL_LOCALES = ["en", "es"];
export const pickLang = (lang) => (EMAIL_LOCALES.includes(String(lang)) ? String(lang) : "en");

export const EMAIL_COPY = Object.freeze({
  en: {
    reset_subject: "Reset your {store} PIN",
    reset_head: "Reset your PIN",
    reset_hi: "Hi {name},",
    reset_body: "Someone asked to reset the PIN for your {store} account. Open the link below to choose a new 6-digit PIN.",
    reset_cta: "Choose a new PIN",
    reset_expiry: "This link works once and expires in {minutes} minutes.",
    reset_ignore: "Didn't ask for this? Ignore this email — your PIN hasn't changed.",
    verify_subject: "Confirm your {store} recovery email",
    verify_head: "Confirm your recovery email",
    verify_hi: "Hi {name},",
    verify_body: "Confirm this address so it can be used to reset your {store} PIN if you're ever locked out. Until you confirm, it can't recover your account.",
    verify_cta: "Confirm this address",
    verify_expiry: "This link works once and expires in {days} days.",
    verify_ignore: "Didn't ask for this? Ignore this email — nothing will change.",
    changed_subject: "Your {store} PIN was changed",
    changed_head: "Your PIN was changed",
    changed_hi: "Hi {name},",
    changed_self: "Your PIN for {store} was just changed from inside the app.",
    changed_reset: "Your PIN for {store} was just changed using a recovery link.",
    changed_owner: "An owner at {store} just reset your PIN.",
    changed_support: "DuoCount support reset the owner PIN for {store} at your store's request. You'll be asked to choose your own new PIN the next time you sign in.",
    changed_warn: "Didn't do this? Reply to this email or contact DuoCount support right away.",
    changed_warn_noreply: "Didn't do this? Tell the store owner, or use the \"Can't sign in?\" link on the sign-in screen, right away.",
    rechanged_subject: "The recovery email on your {store} account changed",
    rechanged_head: "Recovery email changed",
    rechanged_hi: "Hi {name},",
    rechanged_to: "The address that can reset the PIN for your {store} account was changed to {email}. This address can no longer recover that account.",
    rechanged_cleared: "The recovery email on your {store} account was removed. This address can no longer reset its PIN.",
    rechanged_warn: "Didn't do this? Someone may have used your signed-in device. Change your PIN now and tell the store owner or DuoCount support.",
    support_subject: "DuoCount support — re: your message",
    support_head: "A reply from DuoCount support",
    support_intro: "You wrote to DuoCount support because you couldn't sign in. Here's the reply:",
    support_outro: "Reply to this email to continue the conversation.",
    support_outro_noreply: "Need to add something? Send another message from the \"Can't sign in?\" link on the sign-in screen.",
    footer: "DuoCount — all your counts. All in one place.",
  },
  es: {
    reset_subject: "Restablece tu PIN de {store}",
    reset_head: "Restablece tu PIN",
    reset_hi: "Hola {name}:",
    reset_body: "Alguien pidió restablecer el PIN de tu cuenta en {store}. Abre el enlace de abajo para elegir un nuevo PIN de 6 dígitos.",
    reset_cta: "Elegir un nuevo PIN",
    reset_expiry: "Este enlace sirve una sola vez y vence en {minutes} minutos.",
    reset_ignore: "¿No lo pediste? Ignora este correo — tu PIN no ha cambiado.",
    verify_subject: "Confirma tu correo de recuperación de {store}",
    verify_head: "Confirma tu correo de recuperación",
    verify_hi: "Hola {name}:",
    verify_body: "Confirma esta dirección para poder restablecer tu PIN de {store} si alguna vez no puedes entrar. Hasta que la confirmes, no sirve para recuperar la cuenta.",
    verify_cta: "Confirmar esta dirección",
    verify_expiry: "Este enlace sirve una sola vez y vence en {days} días.",
    verify_ignore: "¿No lo pediste? Ignora este correo — no cambiará nada.",
    changed_subject: "Tu PIN de {store} cambió",
    changed_head: "Tu PIN cambió",
    changed_hi: "Hola {name}:",
    changed_self: "Tu PIN de {store} acaba de cambiarse desde la aplicación.",
    changed_reset: "Tu PIN de {store} acaba de cambiarse con un enlace de recuperación.",
    changed_owner: "Un dueño de {store} acaba de restablecer tu PIN.",
    changed_support: "El soporte de DuoCount restableció el PIN del dueño de {store} a pedido de tu tienda. Se te pedirá elegir tu propio PIN nuevo la próxima vez que inicies sesión.",
    changed_warn: "¿No fuiste tú? Responde a este correo o contacta al soporte de DuoCount de inmediato.",
    changed_warn_noreply: "¿No fuiste tú? Avisa al dueño de la tienda, o usa el enlace \"¿No puedes entrar?\" de la pantalla de inicio de sesión, de inmediato.",
    rechanged_subject: "Cambió el correo de recuperación de tu cuenta de {store}",
    rechanged_head: "Cambió el correo de recuperación",
    rechanged_hi: "Hola {name}:",
    rechanged_to: "La dirección que puede restablecer el PIN de tu cuenta en {store} se cambió a {email}. Esta dirección ya no puede recuperar esa cuenta.",
    rechanged_cleared: "Se quitó el correo de recuperación de tu cuenta en {store}. Esta dirección ya no puede restablecer su PIN.",
    rechanged_warn: "¿No fuiste tú? Puede que alguien haya usado tu dispositivo con la sesión abierta. Cambia tu PIN ahora y avisa al dueño de la tienda o al soporte de DuoCount.",
    support_subject: "Soporte de DuoCount — sobre tu mensaje",
    support_head: "Respuesta del soporte de DuoCount",
    support_intro: "Escribiste al soporte de DuoCount porque no podías iniciar sesión. Esta es la respuesta:",
    support_outro: "Responde a este correo para seguir la conversación.",
    support_outro_noreply: "¿Necesitas agregar algo? Envía otro mensaje desde el enlace \"¿No puedes entrar?\" de la pantalla de inicio de sesión.",
    footer: "DuoCount — todos tus conteos. En un solo lugar.",
  },
});

/** Look up one line of email copy with {var} interpolation. */
export function line(lang, key, vars = {}) {
  const loc = pickLang(lang);
  const raw = EMAIL_COPY[loc][key] ?? EMAIL_COPY.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

const esc = (x) => String(x ?? "").replace(/[&<>"']/g,
  (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

/** One house style for every recovery email, mirroring the digest's markup. */
export function renderEmail({ lang, head, paras = [], cta = null, ctaLabel = "", note = "" }) {
  const text = [...paras, cta ? `\n${ctaLabel}: ${cta}` : "", note ? `\n${note}` : "",
    `\n— ${line(lang, "footer")}`].filter(Boolean).join("\n");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1a1c2e;max-width:520px">
    <h2 style="margin:0 0 14px">${esc(head)}</h2>
    ${paras.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5">${esc(p)}</p>`).join("")}
    ${cta ? `<p style="margin:18px 0"><a href="${esc(cta)}" style="background:#1a1c2e;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;display:inline-block">${esc(ctaLabel)}</a></p>
    <p style="margin:0 0 12px;font-size:12px;color:#666;word-break:break-all">${esc(cta)}</p>` : ""}
    ${note ? `<p style="margin:12px 0 0;font-size:13px;color:#666">${esc(note)}</p>` : ""}
    <p style="margin:18px 0 0;font-size:12px;color:#999;border-top:1px solid #e5e2d9;padding-top:10px">${esc(line(lang, "footer"))}</p>
  </div>`;
  return { text, html };
}

export function buildResetEmail({ lang, storeName, name, link, minutes = RESET_TTL_MIN } = {}) {
  const l = pickLang(lang);
  const store = storeName || "DuoCount";
  return {
    subject: line(l, "reset_subject", { store }),
    ...renderEmail({
      lang: l,
      head: line(l, "reset_head"),
      paras: [line(l, "reset_hi", { name: name || "" }), line(l, "reset_body", { store }),
        line(l, "reset_expiry", { minutes })],
      cta: link, ctaLabel: line(l, "reset_cta"),
      note: line(l, "reset_ignore"),
    }),
  };
}

export function buildVerifyEmail({ lang, storeName, name, link, days = VERIFY_TTL_DAYS } = {}) {
  const l = pickLang(lang);
  const store = storeName || "DuoCount";
  return {
    subject: line(l, "verify_subject", { store }),
    ...renderEmail({
      lang: l,
      head: line(l, "verify_head"),
      paras: [line(l, "verify_hi", { name: name || "" }), line(l, "verify_body", { store }),
        line(l, "verify_expiry", { days })],
      cta: link, ctaLabel: line(l, "verify_cta"),
      note: line(l, "verify_ignore"),
    }),
  };
}

// Who changed it, so the notice can say so plainly: the person themselves, a
// recovery link, a store owner, or DuoCount support (the /dev console).
export const CHANGED_BY = ["self", "reset", "owner", "support"];

export function buildPinChangedEmail({ lang, storeName, name, by = "self", canReply = false } = {}) {
  const l = pickLang(lang);
  const store = storeName || "DuoCount";
  const which = CHANGED_BY.includes(by) ? by : "self";
  return {
    subject: line(l, "changed_subject", { store }),
    ...renderEmail({
      lang: l,
      head: line(l, "changed_head"),
      paras: [line(l, "changed_hi", { name: name || "" }), line(l, `changed_${which}`, { store })],
      note: line(l, canReply ? "changed_warn" : "changed_warn_noreply"),
    }),
  };
}

/**
 * Sent to the address that is LOSING its recovery claim, at the moment it loses
 * it. Changing where a reset link goes decides who can take an account over
 * later and outlives every PIN change, so the one party who can spot a hijack —
 * and the one party who by definition isn't the attacker — has to hear about it.
 * `newEmail` null means the address was removed rather than replaced.
 */
export function buildRecoveryEmailChangedEmail({ lang, storeName, name, newEmail = null } = {}) {
  const l = pickLang(lang);
  const store = storeName || "DuoCount";
  return {
    subject: line(l, "rechanged_subject", { store }),
    ...renderEmail({
      lang: l,
      head: line(l, "rechanged_head"),
      paras: [line(l, "rechanged_hi", { name: name || "" }),
        newEmail ? line(l, "rechanged_to", { store, email: newEmail }) : line(l, "rechanged_cleared", { store })],
      note: line(l, "rechanged_warn"),
    }),
  };
}

/**
 * A developer's reply to a SIGNED-OUT help request. Someone who can't get in
 * can't read the in-app ticket thread, so the reply has to travel to the
 * address they left — otherwise the one channel built for locked-out people
 * ends in a thread they'll never see.
 */
export function buildSupportReplyEmail({ lang, text, canReply = false } = {}) {
  const l = pickLang(lang);
  return {
    subject: line(l, "support_subject"),
    ...renderEmail({
      lang: l,
      head: line(l, "support_head"),
      paras: [line(l, "support_intro"), String(text ?? "")],
      note: line(l, canReply ? "support_outro" : "support_outro_noreply"),
    }),
  };
}
