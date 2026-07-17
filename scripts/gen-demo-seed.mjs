// Generate an importable demo-data file from the same pure builder the in-app
// "Load demo data" button uses (src/lib/seed-data.js), so the file and the app
// stay in lockstep.
//
//   node scripts/gen-demo-seed.mjs [--now=2026-07-12] [--out=demo-seed.json]
//
// Output shape:
//   { _meta, collections: { <collection>: { <docId>: { ...fields } } } }
// entries carry a nested `comments` map. Dates are tagged `{ "__ts__": ISO }`
// so they survive JSON and the importer can restore Firestore Timestamps.
//
// Dates in the data (counts, punches, this week's roster) are anchored to
// `now` at generation time — regenerate for a fresh-looking demo, or pass
// --now to pin a specific reference date.

import { writeFileSync } from "node:fs";
import { buildDemoData } from "../src/lib/seed-data.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true])
);
const now = args.now ? new Date(args.now) : new Date();
const out = args.out || "demo-seed.json";

// A self-contained demo owner (the in-app loader uses the real signed-in owner;
// the file bakes one in so authorship resolves on its own).
const owner = { id: "seed_usr_owner", name: "Jordan Price", role: "owner" };
const data = buildDemoData({ owner, now });

const tag = (v) => {
  if (v instanceof Date) return { __ts__: v.toISOString() };
  if (Array.isArray(v)) return v.map(tag);
  if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = tag(v[k]); return o; }
  return v;
};
const byId = (arr) => Object.fromEntries(arr.map(({ id, ...f }) => [id, tag(f)]));

// Owner shown as a staff member too (seed-tagged, no credentials — like staff).
const users = {
  [owner.id]: tag({ name: owner.name, role: "owner", locationId: null, active: true, createdAt: data.staff[0].createdAt }),
  ...byId(data.staff),
};

const entries = {};
for (const { id, ...f } of data.entries) {
  entries[id] = tag(f);
  if (data.comments[id]) entries[id].comments = byId(data.comments[id]);
}

const file = {
  _meta: {
    app: "DuoCount demo seed",
    generatedAtNow: now.toISOString(),
    import: "node scripts/import-demo-seed.mjs <vendorId> [demo-seed.json]",
    notes: "Every doc is written with { seed: true } so the in-app clear removes it. Dates are tagged { __ts__: ISO }.",
  },
  collections: {
    users,
    locations: byId(data.locations),
    drawers: byId(data.drawers),
    items: byId(data.items),
    entries,
    notes: byId(data.notes),
    incidents: byId(data.incidents),
    timeclock: byId(data.timeclock),
    schedule: byId(data.schedule),
    availability: byId(data.availability),
    templates: byId(data.templates),
    schedulePublished: byId(data.schedulePublished),
  },
};

writeFileSync(out, JSON.stringify(file, null, 2) + "\n");
const counts = Object.fromEntries(Object.entries(file.collections).map(([k, v]) => [k, Object.keys(v).length]));
console.log(`Wrote ${out}`);
console.table(counts);
