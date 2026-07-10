// src/components/AddProductModal.tsx
import React, { useState, FormEvent, useEffect } from "react";
import styles from "@/styles/AddProductModal.module.css";
import { db } from "@/utils/firebase";
import { appConfig } from "@/config/app.config";
import { collection, addDoc, onSnapshot } from "firebase/firestore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const AddProductModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [flavor, setFlavor] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [naChecked, setNaChecked] = useState(false);

  // Load all category names from the 'categories' collection (FIXED)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "categories"), (snap) => {
      const cats = snap.docs.map((doc) => doc.data().name as string);
      setAvailableCategories(cats);

      // Auto-select the first category if none selected yet
      if (!selectedCategory && cats.length > 0) {
        setSelectedCategory(cats[0]);
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
      setFront("");
      setBack("");
      setExpiryDate("");
      setNaChecked(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCategory || !flavor.trim() || isNaN(+front) || isNaN(+back)) {
      alert("Please fill in all required fields.");
      return;
    }

    try {
      await addDoc(collection(db, "products"), {
        category: selectedCategory,
        flavor: flavor.trim(),
        front: +front,
        back: +back,
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
        <h2>
          Add {appConfig.labels.item} to Existing {appConfig.labels.category}
        </h2>
        <form onSubmit={handleAdd} className={styles.form}>
          <label>
            Select Existing {appConfig.labels.category}
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
            {appConfig.labels.item} Name
            <input
              required
              value={flavor}
              onChange={(e) => setFlavor(e.target.value)}
            />
          </label>

          <label>
            {appConfig.labels.back} Qty
            <input
              required
              type="number"
              min="0"
              value={back}
              onChange={(e) => setBack(e.target.value)}
            />
          </label>

          <label>
            {appConfig.labels.front} Qty
            <input
              required
              type="number"
              min="0"
              value={front}
              onChange={(e) => setFront(e.target.value)}
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
