// Support-desk pure helpers. Run: node --test tests/support.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTicket, buildMessage, sanitizeAttachments, validateAttachment, dataUriBytes,
  canTransition, ownerUnread, compareTickets, ATTACH_MAX_BYTES,
} from "../src/lib/support.js";

// A tiny valid png data-uri (shape only — the helpers check the prefix + size).
const okPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA=";

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
