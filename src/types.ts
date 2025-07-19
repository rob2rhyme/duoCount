// src/types.ts

export interface Product {
  id: string;
  category: string;
  flavor: string;
  /** switched from string to number */
  store?: number;
  /** switched from string to number */
  home?: number;
  expiryDate?: string;
}

export interface ProductCategory {
  name: string;
  products: Product[];
  filterType: string;
  imageUrl?: string;
}
