import test from "node:test";
import assert from "node:assert/strict";
import { statValueClass } from "../src/lib/stat-size.js";

// Characters that fit a 2-column tile at 320px, measured in the real app.
// The ramp exists to respect this table, so the table is what the tests check
// against rather than the class names in isolation.
const FITS_AT_320 = { "text-2xl": 7, "text-xl": 8, "text-lg": 9, "text-base": 11, "text-xs": 14 };

/** The size that actually applies below 400px — the first class in the pair. */
const baseSize = (cls) => cls.split(" ")[0];

test("every tier fits its own length at 320px", () => {
  // The whole point: no value may be given a size that overflows the narrowest
  // tile. This is the assertion that would have caught the original bug.
  for (let len = 1; len <= 40; len++) {
    const cls = baseSize(statValueClass("x".repeat(len)));
    const capacity = FITS_AT_320[cls];
    assert.ok(capacity !== undefined, `unknown size class ${cls}`);
    if (len <= 14) {
      assert.ok(len <= capacity,
        `${len} chars got ${cls}, which holds only ${capacity} at 320px`);
    }
  }
});

test("the value that was actually broken now fits", () => {
  // "$93,607.00" rendered as "$93,607.0" on the Dashboard: 10 characters in a
  // tier measured to hold 7.
  const cls = baseSize(statValueClass("$93,607.00"));
  assert.ok("$93,607.00".length <= FITS_AT_320[cls],
    `"$93,607.00" still overflows at 320px with ${cls}`);
  assert.notEqual(cls, "text-2xl", "still using the size that truncated it");
});

test("short values keep the large type", () => {
  // The fix must not shrink the common case: counts and small money are what
  // most tiles hold, and they are the reason the tile is large in the first place.
  for (const v of ["0", "26", "107", "59%", "$0.00", "4", "$1,408"]) {
    assert.equal(statValueClass(v), "text-2xl", v);
  }
});

test("longer values step down, and never step back up", () => {
  // Monotonic: a longer string can never be given a bigger size than a shorter
  // one, or the ramp has a hole in it.
  const order = ["text-2xl", "text-xl", "text-lg", "text-base", "text-xs"];
  let prev = 0;
  for (let len = 1; len <= 30; len++) {
    const idx = order.indexOf(baseSize(statValueClass("9".repeat(len))));
    assert.ok(idx >= prev, `length ${len} jumped back up the ramp`);
    prev = idx;
  }
});

test("every tier carries a bump for ordinary phone widths", () => {
  // A 320px-safe size on a 390px phone would be needlessly small, so each
  // stepped-down tier pairs with a larger size above 400px.
  for (const v of ["$193,607", "$93,607.00", "$1,234,567.00"]) {
    const cls = statValueClass(v);
    assert.match(cls, /min-\[400px\]:text-/, `${v} has no wider-screen size`);
  }
  // ...except the top tier, which is already the largest size and so has
  // nothing to step up to. "$93,607" is 7 characters and belongs here.
  assert.equal(statValueClass("26"), "text-2xl");
  assert.equal(statValueClass("$93,607"), "text-2xl");
});

test("counts the formatted string, separators and symbol included", () => {
  // Those characters take width like any other; counting the raw number would
  // under-measure by three characters on "$1,234,567".
  assert.notEqual(statValueClass("$1,234,567.00"), statValueClass("1234567"));
  assert.equal(statValueClass("1234567"), statValueClass("9999999"));
});

test("junk never throws — this runs on every tile, every render", () => {
  for (const v of [null, undefined, "", 0, 12345, {}, []]) {
    assert.match(statValueClass(v), /^text-/, JSON.stringify(v));
  }
});

test("a capped ramp never exceeds its ceiling, and still shrinks", () => {
  // The Gaming tab's tiles have always been text-xl. It has the same overflow
  // problem and wants the same shrinking — not a bigger number for every
  // short value, which is what inheriting the Dashboard's ramp would do.
  const cap = { max: "text-xl" };
  assert.equal(statValueClass("26", cap), "text-xl");
  assert.ok(!statValueClass("26", cap).includes("text-2xl"), "capped ramp exceeded its ceiling");
  for (let len = 1; len <= 30; len++) {
    assert.ok(!statValueClass("9".repeat(len), cap).includes("2xl"), `len ${len} exceeded the cap`);
  }
  // ...and the value that overflows a text-xl tile still steps down.
  assert.notEqual(statValueClass("$93,607.00", cap), "text-xl");
});

test("an unknown cap falls back to the full ramp rather than throwing", () => {
  assert.equal(statValueClass("26", { max: "text-nonsense" }), statValueClass("26"));
});
