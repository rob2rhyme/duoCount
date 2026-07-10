// src/hooks/useProducts.ts
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../utils/firebase";
import { Product } from "../types";

export function useProducts(): Product[] {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(
        snap.docs.map((doc) => ({
          id: doc.id,
          flavor: doc.data().flavor || "",
          barcode: doc.data().barcode ? String(doc.data().barcode) : undefined,
          supplier: doc.data().supplier ? String(doc.data().supplier) : undefined,
          front: Number(doc.data().front || 0),
          back: Number(doc.data().back || 0),
          expiryDate: doc.data().expiryDate || "n/a",
          category: doc.data().category || "Uncategorized",
        }))
      );
    });

    return () => unsub();
  }, []);

  return products;
}
