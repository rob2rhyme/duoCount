// src/utils/loadProducts.ts

import { db } from "./firebase"
import { collection, getDocs } from "firebase/firestore"
import type { Product } from "../types"

export const loadProducts = async (): Promise<Product[]> => {
  const snapshot = await getDocs(collection(db, "products"))

  return snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, any>

    return {
      id: doc.id,                      // crucial for update/delete
      flavor: String(data.flavor || ""),  
      store: Number(data.store || 0),  
      home:  Number(data.home  || 0),  
      expiryDate: String(data.expiryDate || "n/a"),
      category:  String(data.category   || "Uncategorized"),
    }
  })
}
