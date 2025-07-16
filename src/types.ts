// src/types.ts

export interface Product {
  id: string;
  category: string;
  flavor: string;
  store?: string;
  home?: string;
  expiryDate?: string;
}

export interface ProductCategory {
  name: string;
  products: Product[];
  imageUrl?: string;    // ← new optional field
}
