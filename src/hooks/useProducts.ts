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
          store: Number(doc.data().store || 0),
          home: Number(doc.data().home || 0),
          expiryDate: doc.data().expiryDate || "n/a",
          category: doc.data().category || "Uncategorized",
        }))
      );
    });

    return () => unsub();
  }, []);

  return products;
}
