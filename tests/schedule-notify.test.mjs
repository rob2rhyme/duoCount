// Pure schedule-notify email builder. No emulator needed. Run: npm run test:notify
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScheduleEmails } from "../src/lib/schedule-notify.js";

const staff = {
  u1: { name: "Eve", email: "eve@shop.com" },
  u2: { name: "Bob", email: "bob@shop.com" },
  u3: { name: "Cal", email: null }, // no address on file
};
const shift = (userId, date, start, end, over = {}) => ({ userId, date, start, end, ...over });

test("one email per employee who has shifts AND an email; skips those without", () => {
  const shifts = [
    shift("u1", "2026-07-06", "09:00", "17:00", { locationName: "Downtown" }),
    shift("u2", "2026-07-07", "10:00", "18:00"),
    shift("u3", "2026-07-06", "09:00", "17:00"), // no email -> skipped
  ];
  const emails = buildScheduleEmails(shifts, staff, { weekLabel: "Jul 6", vendorName: "Smokers Haven" });
  assert.equal(emails.length, 2);
  const eve = emails.find((e) => e.userId === "u1");
  assert.equal(eve.to, "eve@shop.com");
  assert.match(eve.subject, /Smokers Haven schedule — week of Jul 6/);
  assert.match(eve.text, /Your shifts for the week of Jul 6/);
  assert.match(eve.text, /Downtown/);
  assert.ok(!emails.some((e) => e.userId === "u3"));
});

test("open (unassigned) shifts are not emailed to anyone", () => {
  const emails = buildScheduleEmails([shift(null, "2026-07-06", "09:00", "17:00", { open: true })], staff, {});
  assert.deepEqual(emails, []);
});

test("an employee's shifts are combined into one email and sorted by date then time", () => {
  const shifts = [
    shift("u1", "2026-07-08", "12:00", "20:00"),
    shift("u1", "2026-07-06", "13:00", "17:00"),
    shift("u1", "2026-07-06", "08:00", "12:00"),
  ];
  const [eve] = buildScheduleEmails(shifts, staff, { weekLabel: "Jul 6" });
  assert.equal(eve.shifts, 3);
  // earliest date/time first: Jul 6 8am, Jul 6 1pm, Jul 8 12pm
  const order = eve.text.match(/(Mon|Wed)[^\n]*/g);
  assert.match(order[0], /8:00 AM/);
  assert.match(order[1], /1:00 PM/);
  assert.match(order[2], /12:00 PM/);
});

test("times render 12-hour and the app link is included when provided", () => {
  const [eve] = buildScheduleEmails([shift("u1", "2026-07-06", "09:30", "17:00")], staff, { appUrl: "https://app.example" });
  assert.match(eve.text, /9:30 AM–5:00 PM/);
  assert.match(eve.text, /Full schedule: https:\/\/app\.example/);
  assert.match(eve.html, /app\.example/);
});

test("no recipients when nobody has an email", () => {
  assert.deepEqual(buildScheduleEmails([shift("u3", "2026-07-06", "09:00", "17:00")], staff, {}), []);
});
