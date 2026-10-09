// Type size for the big number on a dashboard stat tile.
//
// The tile is a fixed-width grid cell and the number is monospace, so whether
// it fits is pure arithmetic: characters x character width vs tile width. It
// was fixed at text-2xl, and a six-figure currency value overflowed — the
// Dashboard rendered "$93,607.0" because the last digit fell past the card
// edge. A wrong number in a counting app is worse than a small one.
//
// Which tile gets a long value depends on the STORE'S DATA, not on the
// developer's choice at the call site, so the decision belongs here rather
// than hand-tuned per tile.
//
// Measured in the real app (2-column grid, .card p-4, font-mono font-bold),
// characters that fit:
//
//            320px   360px   390px   430px      tile inner width
//   text-2xl     7       8       9      11      106 / 126 / 141 / 161 px
//   text-xl      8      10      11      13
//   text-lg      9      11      13      14
//   text-base   11      13      14      16
//   text-xs     14      17      19      22
//
// The ramp is sized so nothing overflows at 320px — the narrowest width this
// app verifiably supports without horizontal scroll — and steps back up at
// 400px so an ordinary phone still gets the large type for ordinary values.
// Tailwind's `sm:` is 640px, far above every phone, which is why the bump is
// an arbitrary `min-[400px]:` variant instead.

/** Longest value, in characters, that each tier is measured to hold at 320px. */
const TIERS = [
  { max: 7, cls: "text-2xl" },                              // "$9,607"
  { max: 9, cls: "text-lg min-[400px]:text-2xl" },          // "$93,607"
  { max: 11, cls: "text-base min-[400px]:text-xl" },        // "$93,607.00"
  { max: Infinity, cls: "text-xs min-[400px]:text-base" },  // "$1,234,567.00"
];

// Screens with their own type scale cap the top of the ramp rather than being
// pulled up to the Dashboard's. The Gaming tab's tiles have always been
// text-xl; it has the same overflow problem and wants the same shrinking, not
// a bigger number for every short value.
const CAPPED = {
  "text-xl": [
    { max: 8, cls: "text-xl" },
    { max: 11, cls: "text-base min-[400px]:text-xl" },
    { max: Infinity, cls: "text-xs min-[400px]:text-base" },
  ],
};

/**
 * The size classes for a stat value.
 *
 * Takes what will actually be rendered, already formatted — the separators and
 * the currency symbol are characters that occupy width like any other, so
 * counting the formatted string is the only count that means anything.
 *
 * `max` caps the largest size the ramp may use, for a screen whose tiles are
 * smaller than the Dashboard's.
 */
export function statValueClass(value, { max = "text-2xl" } = {}) {
  const len = String(value ?? "").length;
  const tiers = CAPPED[max] ?? TIERS;
  return (tiers.find((t) => len <= t.max) ?? tiers[tiers.length - 1]).cls;
}
