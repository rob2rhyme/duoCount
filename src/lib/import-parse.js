// Pure CSV parse + column mapping + validation for the owner-only bulk importer.
//
// No Admin SDK, network, or Firestore import — the whole correctness surface
// lives here so it unit-tests with `node --test`, exactly like seed-data.js and
// log-filter.js. The route re-runs these validators server-side against live
// Firestore state; the browser preview is advisory and never gates a write on
// its own.
//
// Phase 1 covers items, Phase 2 staff, Phase 3 opening inventory baselines —
// all against the same parser and report shape.

import { isValidNewPin } from "./pin.js";
import { normalizePhone } from "./rewards.js";
import { importMsgEn } from "./import-msg.js";

// A validation message as a stable code + params, not baked English — so the
// import preview localizes (import-msg.js). It stringifies to English (via the
// i18n catalog), so `messages.join(" ")` and every English surface are byte-
// identical to the old inline strings, and the import-parse tests are unchanged.
const m = (key, params = {}) => ({ key, params, toString() { return importMsgEn(this); } });

export const ITEM_UNITS = ["unit", "carton", "pack", "box", "case"];
export const STAFF_ROLES = ["employee", "manager"]; // owner is never importable
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Target fields per import type: what the mapping UI offers, which are required
// in the CSV, and the header aliases guessMapping fuzzy-matches against.
const TARGETS = {
  items: [
    { field: "name", label: "Item name", required: true, aliases: ["name", "item", "itemname", "product", "productname", "description", "desc"] },
    { field: "category", label: "Category", required: false, aliases: ["category", "cat", "group", "department", "dept", "type"] },
    { field: "unit", label: "Unit", required: false, aliases: ["unit", "uom", "unitofmeasure", "measure", "units"] },
    { field: "barcode", label: "Barcode", required: false, aliases: ["barcode", "upc", "sku", "ean", "plu", "code"] },
    { field: "location", label: "Location", required: false, aliases: ["location", "store", "site", "loc", "branch", "shop"] },
  ],
  staff: [
    { field: "name", label: "Name", required: true, aliases: ["name", "fullname", "employee", "employeename", "staff", "staffname", "person"] },
    { field: "role", label: "Role", required: false, aliases: ["role", "position", "title", "access", "level"] },
    { field: "pin", label: "PIN", required: false, aliases: ["pin", "passcode", "pincode", "code", "password"] },
    { field: "location", label: "Location", required: false, aliases: ["location", "store", "site", "loc", "branch", "shop"] },
    { field: "email", label: "Email", required: false, aliases: ["email", "emailaddress", "mail"] },
  ],
  baselines: [
    { field: "item", label: "Item", required: true, aliases: ["item", "itemname", "name", "product", "productname", "barcode", "upc", "sku"] },
    { field: "quantity", label: "Quantity on hand", required: true, aliases: ["quantity", "qty", "onhand", "count", "counted", "stock", "amount"] },
    { field: "location", label: "Location", required: false, aliases: ["location", "store", "site", "loc", "branch", "shop"] },
    { field: "date", label: "Count date", required: false, aliases: ["date", "countdate", "asof", "day"] },
    { field: "countedBy", label: "Counted by", required: false, aliases: ["countedby", "by", "counter", "employee", "person", "staff"] },
  ],
  stock: [
    { field: "item", label: "Item", required: true, aliases: ["item", "itemname", "name", "product", "productname", "barcode", "upc", "sku", "plu"] },
    { field: "quantity", label: "Quantity on hand", required: true, aliases: ["quantity", "qty", "onhand", "count", "stock", "units", "amount"] },
    { field: "price", label: "Price", required: false, aliases: ["price", "retail", "retailprice", "unitprice", "sellprice", "cost"] },
    { field: "expiry", label: "Expiry date", required: false, aliases: ["expiry", "expires", "expiration", "expirationdate", "expdate", "bestby", "useby", "sellby"] },
    { field: "location", label: "Location", required: false, aliases: ["location", "store", "site", "loc", "branch", "shop"] },
  ],
  customers: [
    { field: "phone", label: "Phone number", required: true, aliases: ["phone", "phonenumber", "mobile", "cell", "cellphone", "telephone", "number", "tel"] },
    { field: "name", label: "Name", required: false, aliases: ["name", "customer", "customername", "fullname", "firstname"] },
    { field: "points", label: "Points balance", required: false, aliases: ["points", "pointsbalance", "balance", "pointbalance", "rewardpoints", "loyaltypoints", "pts", "credits", "stars"] },
  ],
  games: [
    { field: "game", label: "Game number", required: true, aliases: ["game", "gamenumber", "gameno", "gamenum", "number", "gamecode", "gm"] },
    { field: "name", label: "Game name", required: true, aliases: ["name", "gamename", "gametitle", "title", "description", "desc"] },
    { field: "price", label: "Ticket price", required: true, aliases: ["price", "ticketprice", "amount", "cost", "denomination", "denom", "facevalue", "face"] },
    { field: "perPack", label: "Tickets per pack", required: false, aliases: ["tickets", "perpack", "packsize", "ticketsperpack", "ticketsperbook", "booksize", "packcount"] },
  ],
};

export function importTargets(type) {
  return TARGETS[type] || [];
}

// Required-in-CSV target fields that the owner hasn't mapped yet (blocks commit).
export function missingRequired(mapping = {}, type = "items") {
  return importTargets(type).filter((t) => t.required && !mapping[t.field]).map((t) => t.field);
}

/* ------------------------------ parseCsv ------------------------------ */

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs > commas && tabs > semis) return "\t";
  return semis > commas ? ";" : ",";
}

// A small quote-aware state machine → array of logical records (arrays of cells).
// Handles quoted fields with embedded delimiters/newlines and "" escaped quotes.
function tokenize(text, delimiter) {
  const records = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let started = false; // any char seen on the current row?
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); records.push(row); row = []; started = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') { inQuotes = true; started = true; }
    else if (c === delimiter) { pushField(); started = true; }
    else if (c === "\n") { pushRow(); }
    else if (c === "\r") { /* handled with the following \n */ }
    else { field += c; started = true; }
  }
  if (started || field !== "" || row.length) pushRow();
  return records;
}

// Parse CSV text into { headers, rows, delimiter }. Each row is
// { line, values } where `line` is the 1-based logical row number in the file
// (header = 1) so a fix reads as "line 37 in your CSV", and `values` maps each
// header to its trimmed cell. Blank rows are dropped but never renumber others.
export function parseCsv(text) {
  // Errors carry a stable `.code` so the (localized) import UI can translate
  // them; `.message` stays English for logs and any non-UI caller.
  const err = (code, message) => Object.assign(new Error(message), { code });
  if (typeof text !== "string") throw err("imp.err.no_contents", "No file contents to read.");
  const s = text.replace(/^﻿/, ""); // strip a leading BOM
  if (!s.trim()) throw err("imp.err.empty", "The file is empty.");
  const delimiter = detectDelimiter(s);
  const records = tokenize(s, delimiter);
  const headerCells = records[0] || [];
  const headers = headerCells.map((h) => h.trim());
  if (!headers.some((h) => h)) throw err("imp.err.no_headers", "The first row must be column headers.");

  const rows = [];
  for (let i = 1; i < records.length; i++) {
    const cells = records[i];
    if (!cells.some((c) => c.trim() !== "")) continue; // skip fully-blank rows
    const values = {};
    headers.forEach((h, j) => { if (h) values[h] = (cells[j] ?? "").trim(); });
    rows.push({ line: i + 1, values });
  }
  return { headers, rows, delimiter };
}

/* ----------------------------- guessMapping ----------------------------- */

const normHeader = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Pre-select a source column for each target field by fuzzy header match. Exact
// alias first, then "header contains alias". Never reuses a source column, and
// leaves a target unset when nothing plausible matches (owner picks it).
export function guessMapping(headers = [], type = "items") {
  const targets = importTargets(type);
  const normed = headers.map((h) => ({ raw: h, n: normHeader(h) })).filter((h) => h.n);
  const mapping = {};
  const used = new Set();
  for (const t of targets) {
    let hit = normed.find((h) => !used.has(h.raw) && t.aliases.includes(h.n));
    if (!hit) hit = normed.find((h) => !used.has(h.raw) && t.aliases.some((a) => a.length >= 3 && h.n.includes(a)));
    if (hit) { mapping[t.field] = hit.raw; used.add(hit.raw); }
  }
  return mapping;
}

/* ----------------------------- validateItems ----------------------------- */

const normName = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Resolve a location cell (name or id) against the store's active locations.
function resolveLocation(raw, ctx) {
  const active = (ctx.locations || []).filter((l) => l && l.active !== false);
  const cell = String(raw ?? "").trim();
  if (!cell) {
    if (ctx.defaultLocationId) return { id: ctx.defaultLocationId };
    if (active.length === 1) return { id: active[0].id };
    return { error: m("imp.msg.loc_none_multi") };
  }
  const hit = active.find((l) => l.id === cell || normName(l.name) === normName(cell));
  if (!hit) return { error: m("imp.msg.loc_not_found", { cell }) };
  return { id: hit.id };
}

// Validate mapped item rows against live store state (locations + existing
// items). Returns { rows: [report…], summary: {create,update,skip,error} }.
// report = { line, status, fields, messages }.
export function validateItems(rows = [], mapping = {}, ctx = {}) {
  const locName = (id) => (ctx.locations || []).find((l) => l && l.id === id)?.name || null;
  const existing = (ctx.existingItems || []).filter((i) => i && i.active !== false);
  const seenInFile = new Map(); // key: loc|normName -> line
  const reports = [];
  const summary = { create: 0, update: 0, skip: 0, error: 0 };

  for (const row of rows) {
    const v = row.values || {};
    const messages = [];
    const get = (field) => (mapping[field] ? v[mapping[field]] : undefined);
    const name = String(get("name") ?? "").trim();
    const fields = { name, category: null, unit: "unit", barcode: null, locationId: null, locationName: null };
    const push = (status, msgs) => {
      summary[status] += 1;
      reports.push({ line: row.line, status, fields: { ...fields }, messages: msgs });
    };

    // name (required)
    if (!name) { push("error", [m("imp.msg.item_name_missing")]); continue; }
    if (name.length < 2) { push("error", [m("imp.msg.item_name_short")]); continue; }

    // category
    fields.category = mapping.category ? (String(get("category") ?? "").trim() || null) : null;

    // unit (warn-not-block on an unknown value)
    if (mapping.unit) {
      const u = String(get("unit") ?? "").trim().toLowerCase();
      if (u && ITEM_UNITS.includes(u)) fields.unit = u;
      else if (u) messages.push(m("imp.msg.unit_unknown", { unit: u, list: ITEM_UNITS.join(", ") }));
    }

    // barcode (digits-only is advisory)
    if (mapping.barcode) {
      const b = String(get("barcode") ?? "").trim();
      fields.barcode = b || null;
      if (b && !/^\d+$/.test(b)) messages.push(m("imp.msg.barcode_nondigit"));
    }

    // location
    const loc = resolveLocation(get("location"), ctx);
    if (loc.error) { push("error", [loc.error]); continue; }
    fields.locationId = loc.id;
    fields.locationName = locName(loc.id);

    // in-file duplicate
    const key = `${loc.id}|${normName(name)}`;
    if (seenInFile.has(key)) { push("skip", [m("imp.msg.dup_item_line", { n: seenInFile.get(key) })]); continue; }
    seenInFile.set(key, row.line);

    // against-store match → update or skip
    const match = existing.find((e) =>
      e.locationId === loc.id &&
      (normName(e.name) === normName(name) || (fields.barcode && e.barcode && e.barcode === fields.barcode)));
    if (match) {
      fields.id = match.id;
      const changed = [];
      if (fields.category !== (match.category ?? null)) changed.push("category");
      if (mapping.unit && fields.unit !== (match.unit || "unit")) changed.push("unit");
      if (fields.barcode && fields.barcode !== (match.barcode ?? null)) changed.push("barcode");
      if (changed.length) push("update", [m("imp.msg.item_updates", { changed }), ...messages]);
      else push("skip", [m("imp.msg.item_unchanged"), ...messages]);
      continue;
    }

    push("create", messages);
  }

  return { rows: reports, summary };
}

/* ----------------------------- validateStaff ----------------------------- */

// Validate mapped staff rows against live store state (locations + existing
// staff by name). Same report shape as validateItems. PIN *format* and in-file
// uniqueness are checked here; against-store PIN uniqueness (hashed creds) can
// only be checked server-side and is enforced at commit. fields carries
// `hasPin` (never the digits) for the preview.
export function validateStaff(rows = [], mapping = {}, ctx = {}) {
  const existing = (ctx.existingStaff || []).filter((u) => u && u.active !== false);
  const seenNames = new Map(); // normName -> line
  const seenPins = new Map();  // pin -> line
  const reports = [];
  const summary = { create: 0, update: 0, skip: 0, error: 0 };

  for (const row of rows) {
    const v = row.values || {};
    const messages = [];
    const get = (field) => (mapping[field] ? v[mapping[field]] : undefined);
    const name = String(get("name") ?? "").trim();
    const fields = { name, role: "employee", locationId: null, locationName: null, email: null, hasPin: false };
    const push = (status, msgs) => {
      summary[status] += 1;
      reports.push({ line: row.line, status, fields: { ...fields }, messages: msgs });
    };

    // name (required)
    if (!name) { push("error", [m("imp.msg.name_missing")]); continue; }
    if (name.length < 2) { push("error", [m("imp.msg.name_short")]); continue; }

    // in-file duplicate name — skip the later one rather than risk a duplicate person
    const nameKey = normName(name);
    if (seenNames.has(nameKey)) {
      push("skip", [m("imp.msg.dup_name_line", { n: seenNames.get(nameKey) })]);
      continue;
    }
    seenNames.set(nameKey, row.line);

    // role (owner never importable)
    if (mapping.role) {
      const raw = String(get("role") ?? "").trim().toLowerCase();
      if (raw === "owner") { push("error", [m("imp.msg.role_owner_block")]); continue; }
      if (raw && !STAFF_ROLES.includes(raw)) { push("error", [m("imp.msg.role_invalid", { role: raw })]); continue; }
      if (raw) fields.role = raw;
    }

    // email
    if (mapping.email) {
      const e = String(get("email") ?? "").trim();
      if (e) {
        if (!EMAIL_RE.test(e) || e.length > 200) { push("error", [m("imp.msg.email_invalid", { email: e })]); continue; }
        fields.email = e.toLowerCase();
      }
    }

    // pin (format + in-file uniqueness; against-store uniqueness is server-side)
    let rawPin = "";
    if (mapping.pin) {
      rawPin = String(get("pin") ?? "").trim();
      if (rawPin) {
        if (!isValidNewPin(rawPin)) { push("error", [m("imp.msg.pin_invalid")]); continue; }
        if (seenPins.has(rawPin)) { push("error", [m("imp.msg.pin_dup_line", { n: seenPins.get(rawPin) })]); continue; }
        seenPins.set(rawPin, row.line);
        fields.hasPin = true;
      }
    }

    // location — employees require one; managers default to all-locations (null)
    const locCell = String(get("location") ?? "").trim();
    if (locCell) {
      const r = resolveLocation(locCell, ctx);
      if (r.error) { push("error", [r.error]); continue; }
      fields.locationId = r.id;
    } else if (fields.role === "employee") {
      const r = resolveLocation("", ctx);
      if (r.error) { push("error", [m("imp.msg.emp_need_loc")]); continue; }
      fields.locationId = r.id;
    }
    fields.locationName = fields.locationId
      ? ((ctx.locations || []).find((l) => l && l.id === fields.locationId)?.name || null)
      : null;

    // against-store match by name
    const match = existing.find((u) => normName(u.name) === nameKey);
    if (match) {
      fields.id = match.id;
      if (match.role === "owner") { push("skip", [m("imp.msg.staff_owner_skip")]); continue; }
      messages.push(m("imp.msg.staff_match"));
      if (fields.hasPin) messages.push(m("imp.msg.pin_unchanged"));
      const changed = [];
      if (mapping.role && fields.role !== match.role) changed.push("role");
      if (mapping.location && fields.locationId !== (match.locationId ?? null)) changed.push("location");
      if (mapping.email && fields.email !== (match.email ?? null)) changed.push("email");
      if (changed.length) push("update", [m("imp.msg.staff_updates", { changed }), ...messages]);
      else push("skip", messages);
      continue;
    }

    messages.push(fields.hasPin ? m("imp.msg.sets_pin") : m("imp.msg.no_pin"));
    push("create", messages);
  }

  return { rows: reports, summary };
}

/* --------------------------- validateBaselines --------------------------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (s) => {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// Validate opening-inventory-baseline rows. Statuses are create / skip / error
// only — a baseline never updates (opening counts are append-only entries).
// ctx: { items, locations, existingStaff, baselinedItemIds, defaultBy, today }.
// `baselinedItemIds` is the write-once guard: any item that already has an
// inventory entry (imported or real) is skipped, so a re-run after a partial
// failure resumes on exactly the un-baselined items and can't double-write.
export function validateBaselines(rows = [], mapping = {}, ctx = {}) {
  const items = (ctx.items || []).filter((i) => i && i.active !== false);
  const staff = (ctx.existingStaff || []).filter((u) => u && u.active !== false);
  const baselined = new Set(ctx.baselinedItemIds || []);
  const locName = (id) => (ctx.locations || []).find((l) => l && l.id === id)?.name || null;
  const today = ctx.today || new Date().toISOString().slice(0, 10);
  const seenItems = new Map(); // itemId -> line (in-file dedup)
  const reports = [];
  const summary = { create: 0, update: 0, skip: 0, error: 0 };

  for (const row of rows) {
    const v = row.values || {};
    const messages = [];
    const get = (field) => (mapping[field] ? v[mapping[field]] : undefined);
    const itemCell = String(get("item") ?? "").trim();
    const fields = {
      itemId: null, itemName: itemCell || null, unit: "unit",
      locationId: null, locationName: null,
      quantity: null, date: today, by: null, byId: null, byRole: null,
    };
    const push = (status, msgs) => {
      summary[status] += 1;
      reports.push({ line: row.line, status, fields: { ...fields }, messages: msgs });
    };

    // item — must resolve to exactly one active item (by name or barcode),
    // optionally narrowed by a location column
    if (!itemCell) { push("error", [m("imp.msg.item_missing")]); continue; }
    let matches = items.filter((i) => normName(i.name) === normName(itemCell) || (i.barcode && i.barcode === itemCell));
    const locCell = String(get("location") ?? "").trim();
    if (locCell) {
      const r = resolveLocation(locCell, ctx);
      if (r.error) { push("error", [r.error]); continue; }
      matches = matches.filter((i) => i.locationId === r.id);
    }
    if (matches.length === 0) { push("error", [m("imp.msg.no_tracked_item", { item: itemCell, atLoc: locCell || "" })]); continue; }
    if (matches.length > 1) { push("error", [m("imp.msg.item_ambiguous", { item: itemCell, n: matches.length })]); continue; }
    const item = matches[0];
    fields.itemId = item.id;
    fields.itemName = item.name;
    fields.unit = item.unit || "unit";
    fields.locationId = item.locationId;
    fields.locationName = locName(item.locationId);

    // quantity — a finite number ≥ 0 ("0" is a real, meaningful opening count)
    const qRaw = String(get("quantity") ?? "").trim();
    if (qRaw === "") { push("error", [m("imp.msg.qty_missing")]); continue; }
    const q = Number(qRaw);
    if (!Number.isFinite(q) || q < 0) { push("error", [m("imp.msg.qty_invalid", { qty: qRaw })]); continue; }
    fields.quantity = q;

    // date — blank means today; otherwise a real YYYY-MM-DD
    if (mapping.date) {
      const d = String(get("date") ?? "").trim();
      if (d) {
        if (!isRealDate(d)) { push("error", [m("imp.msg.date_invalid", { date: d })]); continue; }
        fields.date = d;
      }
    }

    // countedBy — blank means the owner; otherwise must resolve to a roster name
    const byCell = String(get("countedBy") ?? "").trim();
    if (byCell) {
      const person = staff.find((u) => normName(u.name) === normName(byCell));
      if (!person) { push("error", [m("imp.msg.countedby_unknown", { by: byCell })]); continue; }
      fields.by = person.name; fields.byId = person.id; fields.byRole = person.role;
    } else if (ctx.defaultBy) {
      fields.by = ctx.defaultBy.name; fields.byId = ctx.defaultBy.id; fields.byRole = ctx.defaultBy.role;
    }

    // write-once-per-item: an item with ANY inventory entry never gets a baseline
    if (baselined.has(item.id)) { push("skip", [m("imp.msg.baseline_exists")]); continue; }

    // in-file duplicate item
    if (seenItems.has(item.id)) { push("skip", [m("imp.msg.dup_baseline_line", { n: seenItems.get(item.id) })]); continue; }
    seenItems.set(item.id, row.line);

    push("create", messages);
  }

  return { rows: reports, summary };
}

/* ----------------------------- validateStock ----------------------------- */

// Validate stock-level sync rows (pos-inventory-sync-spec.md Phase 1): each row
// refreshes an EXISTING item's synced quantity (and optionally price / expiry).
// Statuses are update / skip / error only — a stock sync never creates an item
// (that's the items import's job) and never touches the count log. Re-running
// is the point: every valid row is an "update" (it refreshes quantitySyncedAt
// even when the number didn't move — that freshness is the signal).
// ctx: { items, locations, defaultLocationId }.
export function validateStock(rows = [], mapping = {}, ctx = {}) {
  const items = (ctx.items || []).filter((i) => i && i.active !== false);
  const locName = (id) => (ctx.locations || []).find((l) => l && l.id === id)?.name || null;
  const seenItems = new Map(); // itemId -> line (in-file dedup: last write would win silently otherwise)
  const reports = [];
  const summary = { create: 0, update: 0, skip: 0, error: 0 };

  for (const row of rows) {
    const v = row.values || {};
    const messages = [];
    const get = (field) => (mapping[field] ? v[mapping[field]] : undefined);
    const itemCell = String(get("item") ?? "").trim();
    const fields = {
      itemId: null, itemName: itemCell || null, name: itemCell || null, unit: "unit",
      locationId: null, locationName: null,
      quantity: null, price: null, expiresAt: null,
    };
    const push = (status, msgs) => {
      summary[status] += 1;
      reports.push({ line: row.line, status, fields: { ...fields }, messages: msgs });
    };

    // item — must resolve to exactly one active item (by name or barcode),
    // optionally narrowed by a location column (same rules as baselines)
    if (!itemCell) { push("error", [m("imp.msg.item_missing")]); continue; }
    let matches = items.filter((i) => normName(i.name) === normName(itemCell) || (i.barcode && i.barcode === itemCell));
    const locCell = String(get("location") ?? "").trim();
    if (locCell) {
      const r = resolveLocation(locCell, ctx);
      if (r.error) { push("error", [r.error]); continue; }
      matches = matches.filter((i) => i.locationId === r.id);
    }
    if (matches.length === 0) { push("error", [m("imp.msg.no_tracked_item", { item: itemCell, atLoc: locCell || "" })]); continue; }
    if (matches.length > 1) { push("error", [m("imp.msg.item_ambiguous", { item: itemCell, n: matches.length })]); continue; }
    const item = matches[0];
    fields.itemId = item.id;
    fields.itemName = item.name;
    fields.name = item.name;
    fields.unit = item.unit || "unit";
    fields.locationId = item.locationId;
    fields.locationName = locName(item.locationId);

    // quantity — a finite number ≥ 0 ("0" is a real on-hand level)
    const qRaw = String(get("quantity") ?? "").trim();
    if (qRaw === "") { push("error", [m("imp.msg.qty_missing")]); continue; }
    const q = Number(qRaw);
    if (!Number.isFinite(q) || q < 0) { push("error", [m("imp.msg.qty_invalid", { qty: qRaw })]); continue; }
    fields.quantity = q;

    // price — optional column; blank cell leaves the stored price unchanged
    if (mapping.price) {
      const pRaw = String(get("price") ?? "").trim().replace(/^\$/, "");
      if (pRaw !== "") {
        const p = Number(pRaw);
        if (!Number.isFinite(p) || p < 0) { push("error", [m("imp.msg.price_invalid", { price: pRaw })]); continue; }
        fields.price = p;
      }
    }

    // expiry — optional column; blank leaves it unchanged; must be a real date
    if (mapping.expiry) {
      const d = String(get("expiry") ?? "").trim();
      if (d) {
        if (!isRealDate(d)) { push("error", [m("imp.msg.date_invalid", { date: d })]); continue; }
        fields.expiresAt = d;
      }
    }

    // in-file duplicate item — keep the first row, skip the later one
    if (seenItems.has(item.id)) { push("skip", [m("imp.msg.dup_item_line", { n: seenItems.get(item.id) })]); continue; }
    seenItems.set(item.id, row.line);

    push("update", messages);
  }

  return { rows: reports, summary };
}

/* --------------------------- validateCustomers --------------------------- */

// Validate rewards-customer rows (rewards-program-spec.md — the bulk answer to
// "how does an owner add customers?"): a phone number per line, name and a
// starting points balance optional (the migration path from another rewards
// app). Phones normalize exactly like the register flow (digits only, US
// leading 1 dropped), so "(555) 123-4567" in the CSV and 5551234567 typed at
// the counter are the same customer. Idempotent: an enrolled phone is skipped
// (or gets its name filled in), never duplicated — a points column seeds NEW
// customers only; an enrolled customer's balance is never touched by import.
// ctx: { existingCustomers }.
const POINTS_MAX = 100000; // same bound as the owner adjust action
export function validateCustomers(rows = [], mapping = {}, ctx = {}) {
  const existing = new Map((ctx.existingCustomers || [])
    .filter((c) => c && c.phone)
    .map((c) => [String(c.phone), c]));
  const seenPhones = new Map(); // normalized phone -> line
  const reports = [];
  const summary = { create: 0, update: 0, skip: 0, error: 0 };

  for (const row of rows) {
    const v = row.values || {};
    const get = (field) => (mapping[field] ? v[mapping[field]] : undefined);
    const rawPhone = String(get("phone") ?? "").trim();
    const name = String(get("name") ?? "").trim().slice(0, 80);
    const fields = { phone: null, name: name || null };
    const push = (status, msgs) => {
      summary[status] += 1;
      reports.push({ line: row.line, status, fields: { ...fields }, messages: msgs });
    };

    if (!rawPhone) { push("error", [m("imp.msg.phone_missing")]); continue; }
    const phone = normalizePhone(rawPhone);
    if (!phone) { push("error", [m("imp.msg.phone_invalid", { phone: rawPhone })]); continue; }
    fields.phone = phone;
    // `customerName` is what commits (null when the CSV had none); `name` is
    // the preview's display column — the name when given, else the number.
    fields.customerName = name || null;
    fields.name = name || phone;

    // Starting balance (optional). Blank → 0; garbage errors the row even for
    // an already-enrolled customer, so a malformed file is never half-trusted.
    // Commas stripped ("1,250" from Excel), rounded to a whole point.
    let pts = null;
    if (mapping.points) {
      const ptsRaw = String(get("points") ?? "").trim();
      if (ptsRaw !== "") {
        const n = Number(ptsRaw.replace(/,/g, ""));
        if (!Number.isFinite(n) || n < 0 || n > POINTS_MAX) { push("error", [m("imp.msg.points_invalid", { points: ptsRaw })]); continue; }
        pts = Math.round(n);
      }
    }
    fields.points = pts;

    if (seenPhones.has(phone)) { push("skip", [m("imp.msg.dup_phone_line", { n: seenPhones.get(phone) })]); continue; }
    seenPhones.set(phone, row.line);

    const match = existing.get(phone);
    if (match) {
      fields.id = match.id;
      // Fill in a missing/changed name; otherwise nothing to do. The points
      // column NEVER applies here — an enrolled balance only moves through
      // the register's signed earn/redeem/adjust flow.
      if (name && name !== (match.name || "")) { fields.newName = name; push("update", [m("imp.msg.customer_name_update")]); }
      else push("skip", [m("imp.msg.customer_exists")]);
      continue;
    }

    push("create", pts > 0 ? [m("imp.msg.points_start", { n: pts })] : []);
  }

  return { rows: reports, summary };
}

/* ----------------------------- validateGames ----------------------------- */

// Validate lottery scratch-game catalog rows: game number + name + ticket price
// (+ optional tickets-per-pack). This is the owner-uploadable version of the
// bundled state catalog (scratch-catalog.js) — so a store in any state, or a
// store wanting the current game list, can drop in the lottery's published
// listing and have a scan fill Game name + Ticket price for every game. Pure
// reference data: it NEVER writes a count and never touches audited ticket
// numbers. Idempotent by game number: re-uploading upserts (create/update),
// never duplicates and never deletes a game. ctx: { existingGames } (the stored
// game# -> {name, price, perPack} map).
export function validateGames(rows = [], mapping = {}, ctx = {}) {
  const existing = ctx.existingGames || {};
  const seen = new Map(); // game# -> line (in-file dedup)
  const reports = [];
  const summary = { create: 0, update: 0, skip: 0, error: 0 };

  for (const row of rows) {
    const v = row.values || {};
    const get = (field) => (mapping[field] ? v[mapping[field]] : undefined);
    const gameRaw = String(get("game") ?? "").trim();
    const fields = { game: null, name: null, price: null, perPack: null };
    const push = (status, msgs) => {
      summary[status] += 1;
      reports.push({ line: row.line, status, fields: { ...fields }, messages: msgs });
    };

    // game number — required, numeric (tolerate a leading '#'); leading zeros
    // normalized so "01801" and "1801" are the same game.
    if (!gameRaw) { push("error", [m("imp.msg.game_missing")]); continue; }
    const digits = gameRaw.replace(/\D/g, "");
    if (!digits) { push("error", [m("imp.msg.game_invalid", { game: gameRaw })]); continue; }
    const game = String(Number(digits));
    fields.game = game;

    // name — required
    const name = String(get("name") ?? "").trim();
    if (!name) { push("error", [m("imp.msg.gname_missing")]); continue; }
    fields.name = name.slice(0, 120);

    // price — required, a finite number > 0 (a $0 face value fills nothing useful)
    const pRaw = String(get("price") ?? "").trim().replace(/^\$/, "");
    if (pRaw === "") { push("error", [m("imp.msg.gprice_missing")]); continue; }
    const price = Number(pRaw);
    if (!Number.isFinite(price) || price <= 0) { push("error", [m("imp.msg.price_invalid", { price: pRaw })]); continue; }
    fields.price = price;

    // tickets-per-pack — optional; a whole number ≥ 1 when given
    if (mapping.perPack) {
      const ppRaw = String(get("perPack") ?? "").trim();
      if (ppRaw !== "") {
        const pp = Number(ppRaw);
        if (!Number.isInteger(pp) || pp < 1) { push("error", [m("imp.msg.perpack_invalid", { n: ppRaw })]); continue; }
        fields.perPack = pp;
      }
    }

    // in-file duplicate game number — keep the first row, skip the later one
    if (seen.has(game)) { push("skip", [m("imp.msg.dup_game_line", { n: seen.get(game) })]); continue; }
    seen.set(game, row.line);

    // against the stored catalog → update (a field changed) or skip (identical)
    const prior = existing[game];
    if (prior) {
      const changed = [];
      if (fields.name !== (prior.name ?? "")) changed.push("name");
      if (fields.price !== (prior.price ?? null)) changed.push("price");
      if (mapping.perPack && fields.perPack !== (prior.perPack ?? null)) changed.push("perPack");
      if (changed.length) push("update", [m("imp.msg.item_updates", { changed })]);
      else push("skip", [m("imp.msg.item_unchanged")]);
      continue;
    }

    push("create", []);
  }

  return { rows: reports, summary };
}
