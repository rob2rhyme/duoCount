// src/hooks/useCategories.ts
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../utils/firebase";
import { ProductCategory } from "../types";

export function useCategories(): ProductCategory[] {
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "categories"), (snap) => {
      setCategories(
        snap.docs.map((doc) => ({
          name: doc.id,
          ...(doc.data() as Omit<ProductCategory, "name">),
        }))
      );
    });

    return () => unsub(); // Clean up listener
  }, []);

  return categories;
}
