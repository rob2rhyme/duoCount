// src/config/app.config.ts
// ---------------------------------------------------------------------------
// White-label configuration.
// This is the ONLY file you need to edit to rebrand the app for a new client.
// Change the name, logo, colors, terminology and stock thresholds below —
// no need to touch any component code.
// ---------------------------------------------------------------------------

import type { Role } from "@/utils/permissions";

export interface AppConfig {
  /** Full product name shown in the header and browser tab. */
  appName: string;
  /** Short name used in tight spaces (e.g. footer). */
  shortName: string;
  /** Tagline shown on the login screen. */
  tagline: string;
  /** Path to your logo inside /public (recommended: square PNG, ~512px). */
  logoSrc: string;
  /** Author / company shown in the footer. */
  author: {
    name: string;
    url: string;
  };
  /** How long a session stays valid before auto sign-out (minutes). */
  sessionTimeoutMinutes: number;
  /** Access-control defaults. */
  auth: {
    /**
     * Role given to a signed-in user who has no `users/{uid}` document yet.
     * Set to "viewer" for read-only by default, or "admin" for single-operator
     * setups where every login should have full access.
     */
    defaultRole: Role;
  };
  /** Terminology — rename these to match your industry. */
  labels: {
    /** A single stocked item (e.g. "Product", "Flavor", "SKU", "Book"). */
    item: string;
    /** Plural of `item`. */
    itemPlural: string;
    /** A grouping of items (e.g. "Category", "Brand", "Aisle"). */
    category: string;
    /** First stock location — long + short label (e.g. front-of-store). */
    front: string;
    frontShort: string;
    /** Second stock location — long + short label (e.g. back/storage). */
    back: string;
    backShort: string;
  };
  /** Business rules driving the status/expiry colouring. */
  thresholds: {
    /** Total qty at or below this flags an item as "Need to Order". */
    lowStock: number;
    /** Items expiring within this many days are flagged "Expiring Soon". */
    expiringSoonDays: number;
  };
  /**
   * Options for the top-level category filter dropdown. These must match the
   * `filterType` values stored on your category documents. "All" is required
   * and should stay first. Replace the rest with tags that fit your catalogue.
   */
  categoryFilters: string[];
}

export const appConfig: AppConfig = {
  appName: "StockFlow Inventory",
  shortName: "StockFlow",
  tagline: "Sign in to manage your inventory",
  logoSrc: "/logo.png",
  author: {
    name: "Your Company",
    url: "https://example.com",
  },
  sessionTimeoutMinutes: 15,
  auth: {
    defaultRole: "viewer",
  },
  labels: {
    item: "Product",
    itemPlural: "Products",
    category: "Category",
    front: "Front",
    frontShort: "FR",
    back: "Back",
    backShort: "BK",
  },
  thresholds: {
    lowStock: 1,
    expiringSoonDays: 30,
  },
  categoryFilters: ["All", "Standard", "Premium"],
};

export default appConfig;
