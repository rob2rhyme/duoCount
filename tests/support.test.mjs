// Support-desk pure helpers. Run: node --test tests/support.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTicket, buildMessage, sanitizeAttachments, validateAttachment, dataUriBytes,
  canTransition, ownerUnread, compareTickets, toMs, ATTACH_MAX_BYTES,
  buildPublicTicket, PUBLIC_MSG_MIN, BODY_MAX,
} from "../src/lib/support.js";

// A tiny valid png data-uri (shape only — the helpers check the prefix + size).
const okPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA=";

test("toMs: parses every timestamp shape the app receives — incl. serialized Admin Timestamps", () => {
  const ms = Date.UTC(2026, 6, 23, 14, 30, 0); // 2026-07-23T14:30:00Z
  const secs = ms / 1000;
  assert.equal(toMs(null), null);
  assert.equal(toMs(undefined), null);
  assert.equal(toMs(ms), ms);                                   // already millis
  assert.equal(toMs(new Date(ms)), ms);                          // JS Date
  assert.equal(toMs("2026-07-23T14:30:00.000Z"), ms);            // ISO string
  assert.equal(toMs({ toDate: () => new Date(ms) }), ms);        // live client-SDK Timestamp
  // The regression: an Admin-SDK Timestamp serialized over JSON (the /api/dev shape).
  assert.equal(toMs({ _seconds: secs, _nanoseconds: 0 }), ms);
  assert.equal(toMs({ seconds: secs, nanoseconds: 0 }), ms);     // alt field names
  assert.equal(toMs({ _seconds: secs, _nanoseconds: 500_000_000 }), ms + 500); // sub-second
  assert.equal(toMs({ nope: 1 }), null);                          // unrecognized object
});

test("dataUriBytes: decodes base64 length without decoding", () => {
  assert.equal(dataUriBytes("data:image/png;base64,QUJD"), 3); // "ABC"
  assert.equal(dataUriBytes("data:image/png;base64,QUJDRA=="), 4); // "ABCD"
  assert.equal(dataUriBytes("nope"), 0);
});

test("validateAttachment: images only, size-capped", () => {
  assert.equal(validateAttachment({ dataUri: okPng }).ok, true);
  assert.equal(validateAttachment({ dataUri: "data:text/html;base64,QUJD" }).code, "attach_type");
  assert.equal(validateAttachment({ dataUri: "https://x/y.png" }).code, "attach_type");
  const big = "data:image/jpeg;base64," + "A".repeat(ATTACH_MAX_BYTES * 2);
  assert.equal(validateAttachment({ dataUri: big }).code, "attach_big");
  assert.equal(validateAttachment(null).code, "attach_bad");
});

test("sanitizeAttachments: caps count at 3, names default, bad → error", () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ dataUri: okPng, name: `s${i}` }));
  const r = sanitizeAttachments(many);
  assert.equal(r.attachments.length, 3);
  assert.equal(r.attachments[0].name, "s0");
  assert.equal(sanitizeAttachments([{ dataUri: okPng }]).attachments[0].name, "screenshot");
  assert.equal(sanitizeAttachments([{ dataUri: "bad" }]).error, "attach_type");
  assert.deepEqual(sanitizeAttachments(undefined).attachments, []);
});

test("buildTicket: validates subject/body, defaults category+priority, keeps attachments", () => {
  const bad1 = buildTicket({ subject: "hi", body: "x" });
  assert.equal(bad1.error, "subject_short");
  const bad2 = buildTicket({ subject: "Login broken", body: "   " });
  assert.equal(bad2.error, "body_required");
  const ok = buildTicket({ subject: "  Login   broken  ", body: "Can't sign in\n\nsince today", category: "zzz", attachments: [{ dataUri: okPng }] });
  assert.equal(ok.fields.subject, "Login broken"); // whitespace collapsed
  assert.equal(ok.fields.body, "Can't sign in\n\nsince today");
  assert.equal(ok.fields.category, "other"); // unknown → other
  assert.equal(ok.fields.priority, "normal");
  assert.equal(ok.fields.attachments.length, 1);
  assert.equal(buildTicket({ subject: "Feature idea", body: "add X", category: "feature", priority: "high" }).fields.priority, "high");
});

test("buildMessage: text or attachment required; empty rejected", () => {
  assert.equal(buildMessage({ text: "  " }).error, "msg_empty");
  assert.equal(buildMessage({ text: "here's a fix" }).message.text, "here's a fix");
  assert.equal(buildMessage({ attachments: [{ dataUri: okPng }] }).message.attachments.length, 1);
  assert.equal(buildMessage({ attachments: [{ dataUri: "bad" }] }).error, "attach_type");
});

test("canTransition: owner open↔resolved only; dev anything; no-op ok", () => {
  assert.equal(canTransition("open", "resolved", "owner"), true);
  assert.equal(canTransition("resolved", "open", "owner"), true);   // reopen
  assert.equal(canTransition("open", "pending", "owner"), false);   // owner can't set pending
  assert.equal(canTransition("open", "pending", "dev"), true);
  assert.equal(canTransition("pending", "resolved", "dev"), true);
  assert.equal(canTransition("open", "open", "owner"), true);       // idempotent
  assert.equal(canTransition("open", "bogus", "dev"), false);
});

test("ownerUnread: only when the dev acted after the owner last looked", () => {
  const t = { lastActorRole: "dev", lastActivityAt: 1000 };
  assert.equal(ownerUnread(t, 500), true);
  assert.equal(ownerUnread(t, 1500), false);
  assert.equal(ownerUnread({ lastActorRole: "owner", lastActivityAt: 1000 }, 0), false);
});

test("compareTickets: open>pending>resolved, then priority, then recency", () => {
  const rows = [
    { status: "resolved", priority: "urgent", lastActivityAt: 100 },
    { status: "open", priority: "low", lastActivityAt: 100 },
    { status: "open", priority: "urgent", lastActivityAt: 100 },
    { status: "pending", priority: "high", lastActivityAt: 100 },
    { status: "open", priority: "urgent", lastActivityAt: 200 },
  ];
  const sorted = [...rows].sort(compareTickets);
  assert.deepEqual(
    sorted.map((r) => `${r.status}/${r.priority}/${r.lastActivityAt}`),
    ["open/urgent/200", "open/urgent/100", "open/low/100", "pending/high/100", "resolved/urgent/100"],
  );
});

/* ---------------------- signed-out ("can't sign in") tickets ---------------------- */

test("a signed-out request needs a real reply-to address — there's no session to answer through", () => {
  const msg = "I am the owner and I forgot my PIN, there is no second owner.";
  assert.deepEqual(buildPublicTicket({ email: "", message: msg }), { error: "bad_email" });
  assert.deepEqual(buildPublicTicket({ email: "nope", message: msg }), { error: "bad_email" });
  assert.deepEqual(buildPublicTicket({ email: `${"a".repeat(200)}@x.com`, message: msg }), { error: "bad_email" });
  assert.equal(buildPublicTicket({ email: "Owner@Store.COM", message: msg }).fields.contactEmail, "owner@store.com");
});

test("a signed-out request needs enough detail to act on", () => {
  assert.deepEqual(buildPublicTicket({ email: "a@b.co", message: "help" }), { error: "short_message" });
  assert.deepEqual(buildPublicTicket({ email: "a@b.co", message: "   " }), { error: "short_message" });
  assert.ok(buildPublicTicket({ email: "a@b.co", message: "x".repeat(PUBLIC_MSG_MIN) }).fields);
  assert.equal(buildPublicTicket({ email: "a@b.co", message: "y".repeat(BODY_MAX + 500) }).fields.body.length, BODY_MAX);
});

test("it belongs to NO tenant and carries no attachments — an anonymous write stays minimal", () => {
  const { fields } = buildPublicTicket({
    email: "a@b.co", name: "Jordan", storeCode: "ACME-Market",
    message: "I am the sole owner and I can't sign in any more.",
  });
  assert.equal(fields.vendorId, null);      // no owner's client query can read it
  assert.equal(fields.public, true);
  assert.deepEqual(fields.attachments, []); // no anonymous upload surface
  assert.equal(fields.category, "account");
  assert.equal(fields.priority, "high");
  assert.equal(fields.claimedSlug, "acme-market");
  assert.match(fields.subject, /acme-market/);
});

test("the claimed store code is only ever a label — nothing here proves it exists", () => {
  // The route never checks it against the store list, so the form can't be used
  // to discover which stores exist; the console shows it as "claimed".
  const { fields } = buildPublicTicket({ email: "a@b.co", message: "Locked out of the till app entirely." });
  assert.equal(fields.claimedSlug, null);
  assert.equal(fields.subject, "Can't sign in");
  assert.equal(fields.contactName, null);
});
