// Pure CSV parse + column mapping + validation for the owner-only bulk importer.
//
// No Admin SDK, network, or Firestore import — the whole correctness surface
// lives here so it unit-tests with `node --test`, exactly like seed-data.js and
// log-filter.js. The route re-runs these validators server-side against live
// Firestore state; the browser preview is advisory and never gates a write on
// its own.
//
// Phase 1 covers items and Phase 2 staff; baseline validation lands in Phase 3
// against the same parser and report shape.

import { isValidNewPin } from "./pin.js";

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
  if (typeof text !== "string") throw new Error("No file contents to read.");
  const s = text.replace(/^﻿/, ""); // strip a leading BOM
  if (!s.trim()) throw new Error("The file is empty.");
  const delimiter = detectDelimiter(s);
  const records = tokenize(s, delimiter);
  const headerCells = records[0] || [];
  const headers = headerCells.map((h) => h.trim());
  if (!headers.some((h) => h)) throw new Error("The first row must be column headers.");

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
    return { error: "No location given, and the store has more than one — map a location column." };
  }
  const hit = active.find((l) => l.id === cell || normName(l.name) === normName(cell));
  if (!hit) return { error: `No active location named "${cell}" — add it in Admin first.` };
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
    if (!name) { push("error", ["Item name is missing."]); continue; }
    if (name.length < 2) { push("error", ["Item name must be at least 2 characters."]); continue; }

    // category
    fields.category = mapping.category ? (String(get("category") ?? "").trim() || null) : null;

    // unit (warn-not-block on an unknown value)
    if (mapping.unit) {
      const u = String(get("unit") ?? "").trim().toLowerCase();
      if (u && ITEM_UNITS.includes(u)) fields.unit = u;
      else if (u) messages.push(`Unit "${u}" isn't one of ${ITEM_UNITS.join(", ")} — using "unit".`);
    }

    // barcode (digits-only is advisory)
    if (mapping.barcode) {
      const b = String(get("barcode") ?? "").trim();
      fields.barcode = b || null;
      if (b && !/^\d+$/.test(b)) messages.push("Barcode has non-digit characters.");
    }

    // location
    const loc = resolveLocation(get("location"), ctx);
    if (loc.error) { push("error", [loc.error]); continue; }
    fields.locationId = loc.id;
    fields.locationName = locName(loc.id);

    // in-file duplicate
    const key = `${loc.id}|${normName(name)}`;
    if (seenInFile.has(key)) { push("skip", [`Same item as line ${seenInFile.get(key)} in this file.`]); continue; }
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
      if (changed.length) push("update", [`Already in the catalog — updates ${changed.join(", ")}.`, ...messages]);
      else push("skip", ["Already in the catalog, unchanged.", ...messages]);
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
    if (!name) { push("error", ["Name is missing."]); continue; }
    if (name.length < 2) { push("error", ["Name must be at least 2 characters."]); continue; }

    // in-file duplicate name — skip the later one rather than risk a duplicate person
    const nameKey = normName(name);
    if (seenNames.has(nameKey)) {
      push("skip", [`Same name as line ${seenNames.get(nameKey)} in this file — skipped. Import separately if they're different people.`]);
      continue;
    }
    seenNames.set(nameKey, row.line);

    // role (owner never importable)
    if (mapping.role) {
      const raw = String(get("role") ?? "").trim().toLowerCase();
      if (raw === "owner") { push("error", ["Owner accounts can't be imported — add an owner in Admin."]); continue; }
      if (raw && !STAFF_ROLES.includes(raw)) { push("error", [`Role "${raw}" must be employee or manager.`]); continue; }
      if (raw) fields.role = raw;
    }

    // email
    if (mapping.email) {
      const e = String(get("email") ?? "").trim();
      if (e) {
        if (!EMAIL_RE.test(e) || e.length > 200) { push("error", [`"${e}" isn't a valid email.`]); continue; }
        fields.email = e.toLowerCase();
      }
    }

    // pin (format + in-file uniqueness; against-store uniqueness is server-side)
    let rawPin = "";
    if (mapping.pin) {
      rawPin = String(get("pin") ?? "").trim();
      if (rawPin) {
        if (!isValidNewPin(rawPin)) { push("error", ["PIN must be exactly 6 digits (or leave it blank)."]); continue; }
        if (seenPins.has(rawPin)) { push("error", [`PIN is already used on line ${seenPins.get(rawPin)} in this file.`]); continue; }
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
      if (r.error) { push("error", ["Employees need a location — add a location column."]); continue; }
      fields.locationId = r.id;
    }
    fields.locationName = fields.locationId
      ? ((ctx.locations || []).find((l) => l && l.id === fields.locationId)?.name || null)
      : null;

    // against-store match by name
    const match = existing.find((u) => normName(u.name) === nameKey);
    if (match) {
      fields.id = match.id;
      if (match.role === "owner") { push("skip", ["Matches an existing owner — owners are managed in Admin, not by import."]); continue; }
      messages.push("Matches an existing staff member — is this the same person? Owners are managed in Admin.");
      if (fields.hasPin) messages.push("PIN left unchanged — reset a PIN in Admin, never by import.");
      const changed = [];
      if (mapping.role && fields.role !== match.role) changed.push("role");
      if (mapping.location && fields.locationId !== (match.locationId ?? null)) changed.push("location");
      if (mapping.email && fields.email !== (match.email ?? null)) changed.push("email");
      if (changed.length) push("update", [`Updates ${changed.join(", ")}.`, ...messages]);
      else push("skip", messages);
      continue;
    }

    messages.push(fields.hasPin ? "Sets a sign-in PIN." : "No PIN — set one in Admin or at first sign-in.");
    push("create", messages);
  }

  return { rows: reports, summary };
}
