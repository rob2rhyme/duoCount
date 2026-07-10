// src/utils/csv.ts
// Dependency-free CSV helpers for inventory export/import.
import { Product } from "@/types";

const HEADERS = ["category", "flavor", "front", "back", "total", "expiryDate"];

function escapeCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise products to a CSV string. */
export function productsToCSV(products: Product[]): string {
  const rows = products.map((p) => {
    const total = (Number(p.front) || 0) + (Number(p.back) || 0);
    return [p.category, p.flavor, p.front ?? 0, p.back ?? 0, total, p.expiryDate ?? "n/a"];
  });
  return [HEADERS, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

/** Trigger a browser download of a CSV string. */
export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Split CSV text into rows of fields, honouring quoted fields (RFC-4180-ish). */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface ParsedProduct {
  category: string;
  flavor: string;
  front: number;
  back: number;
  expiryDate: string;
}

export interface ImportResult {
  rows: ParsedProduct[];
  errors: string[];
}

/**
 * Parse an inventory CSV into product records. Expects a header row containing
 * at least `category` and `flavor` columns; `front`, `back` and `expiryDate`
 * are optional. Column order does not matter.
 */
export function parseInventoryCSV(text: string): ImportResult {
  const table = parseCSV(text);
  const errors: string[] = [];
  if (table.length < 2) {
    return { rows: [], errors: ["File has no data rows."] };
  }

  const header = table[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iCat = idx("category");
  const iFlavor = idx("flavor");
  const iFront = idx("front");
  const iBack = idx("back");
  const iExp = idx("expirydate");

  if (iCat === -1 || iFlavor === -1) {
    return {
      rows: [],
      errors: ['CSV must include "category" and "flavor" columns.'],
    };
  }

  const rows: ParsedProduct[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const category = (cells[iCat] || "").trim();
    const flavor = (cells[iFlavor] || "").trim();
    if (!category || !flavor) {
      errors.push(`Row ${r + 1}: missing category or flavor — skipped.`);
      continue;
    }
    const num = (i: number) => {
      if (i === -1) return 0;
      const n = Number((cells[i] || "").trim());
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    };
    const expiryRaw = iExp === -1 ? "" : (cells[iExp] || "").trim();
    rows.push({
      category,
      flavor,
      front: num(iFront),
      back: num(iBack),
      expiryDate: expiryRaw || "n/a",
    });
  }
  return { rows, errors };
}
