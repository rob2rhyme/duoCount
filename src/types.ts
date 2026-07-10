// src/types.ts

export interface Product {
  id: string
  category: string
  flavor: string
  /** switched from string to number */
  front?: number
  /** switched from string to number */
  back?: number
  expiryDate?: string
  /** optional barcode / SKU used by the scanner */
  barcode?: string
  /** optional supplier name (denormalised, matches Supplier.name) */
  supplier?: string
}

export interface Supplier {
  id: string
  name: string
  contact?: string
  email?: string
  phone?: string
}

export interface ProductCategory {
  name: string
  products: Product[]
  filterType: string
  imageUrl?: string
}

import type { Role } from "@/utils/permissions"

/** A row in the `users` collection (document id = Firebase Auth uid). */
export interface UserProfile {
  role: Role
  displayName?: string
  phone?: string
}
