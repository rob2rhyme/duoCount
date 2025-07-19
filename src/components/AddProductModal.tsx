// src/components/AddProductModal.tsx
import React, { useState, FormEvent, useEffect } from "react";
import styles from "@/styles/AddProductModal.module.css";
import { db } from "@/utils/firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const AddProductModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [flavor, setFlavor] = useState("");
  const [store, setStore] = useState("");
  const [home, setHome] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [naChecked, setNaChecked] = useState(false);

  // Load all category names from the 'products' collection
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("category"));
    const unsub = onSnapshot(q, (snap) => {
      const cats = snap.docs.map((d) => d.data().category as string);
      const unique = Array.from(new Set(cats));
      setAvailableCategories(unique);
      if (!selectedCategory && unique.length > 0) {
        setSelectedCategory(unique[0]);
      }
    });
    return () => unsub();
  }, [selectedCategory]);

  // Clear expiry-NA if they type a real date
  useEffect(() => {
    if (expiryDate) setNaChecked(false);
  }, [expiryDate]);

  // Reset form whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedCategory("");
      setFlavor("");
      setStore("");
      setHome("");
      setExpiryDate("");
      setNaChecked(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCategory || !flavor.trim() || isNaN(+store) || isNaN(+home)) {
      alert("Please fill in all required fields.");
      return;
    }

    try {
      await addDoc(collection(db, "products"), {
        category: selectedCategory,
        flavor: flavor.trim(),
        store: +store,
        home: +home,
        expiryDate: naChecked ? "n/a" : expiryDate || "n/a",
      });
      alert("Product successfully added!");
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error writing to Firestore.");
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>Add Flavor to Existing Category</h2>
        <form onSubmit={handleAdd} className={styles.form}>
          <label>
            Select Existing Vape Category
            <select
              required
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {availableCategories.length > 0 ? (
                availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))
              ) : (
                <option disabled>No Categories Available</option>
              )}
            </select>
          </label>

          <label>
            Flavor Name
            <input
              required
              value={flavor}
              onChange={(e) => setFlavor(e.target.value)}
            />
          </label>

          <label>
            Home Qty
            <input
              required
              type="number"
              min="0"
              value={home}
              onChange={(e) => setHome(e.target.value)}
            />
          </label>

          <label>
            Store Qty
            <input
              required
              type="number"
              min="0"
              value={store}
              onChange={(e) => setStore(e.target.value)}
            />
          </label>

          <div className={styles.expiryRow}>
            <div
              className={styles.expiryField}
              onClick={() => setNaChecked(false)}
            >
              <label>Expiry Date</label>
              <input
                type="date"
                value={expiryDate}
                onFocus={() => setNaChecked(false)}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
            <div className={styles.naField}>
              <label>&nbsp;</label>
              <button
                type="button"
                className={naChecked ? styles.naActive : ""}
                onClick={() => {
                  setNaChecked(true);
                  setExpiryDate("");
                }}
              >
                No Expiry Date
              </button>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProductModal;
