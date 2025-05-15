import React, { useState, FormEvent, useEffect } from "react";
import styles from "@/styles/AddProductModal.module.css";
import { db } from "@/utils/firebase";
import {
  collection,
  addDoc,
  writeBatch,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const AddProductModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [flavor, setFlavor] = useState("");
  const [store, setStore] = useState("");
  const [home, setHome] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [naChecked, setNaChecked] = useState(false);

  // load all categories once
  useEffect(() => {
    const q = query(collection(db, "categories"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => {
      const cats = snap.docs.map((d) => d.data().name as string);
      setAvailableCategories(cats);
      if (!selectedCategory && cats.length) setSelectedCategory(cats[0]);
    });
    return () => unsub();
  }, [selectedCategory]);

  // if you ever type a real date, clear the "no expiry" flag
  useEffect(() => {
    if (expiryDate) setNaChecked(false);
  }, [expiryDate]);

  // reset on open
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setNewCategory("");
      setFlavor("");
      setStore("");
      setHome("");
      setExpiryDate("");
      setNaChecked(false);
      setSelectedCategory(availableCategories[0] || "");
    }
  }, [isOpen, availableCategories]);

  if (!isOpen) return null;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const category = step === 1 ? newCategory.trim() : selectedCategory;
    if (!category || !flavor.trim() || isNaN(+store) || isNaN(+home)) {
      alert("Please fill in required fields.");
      return;
    }
    try {
      if (step === 1) {
        const batch = writeBatch(db);
        const catRef = doc(db, "categories", category);
        batch.set(catRef, { name: category });
        await batch.commit();
      }
      await addDoc(collection(db, "products"), {
        category,
        flavor,
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
        {step === 0 ? (
          <>
            <h2>Add Product</h2>
            <div className={styles.options}>
              <button onClick={() => setStep(1)}>Add New Category Vape</button>
              <button onClick={() => setStep(2)}>
                Add Flavor to Existing Category
              </button>
            </div>
            <button className={styles.cancel} onClick={onClose}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2>
              {step === 1
                ? "New Category & Product"
                : "Existing Category & Product"}
            </h2>
            <form onSubmit={handleAdd} className={styles.form}>
              {step === 1 && (
                <label>
                  Enter New Vape Category
                  <input
                    required
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                  />
                </label>
              )}

              {step === 2 && (
                <label>
                  Select Existing Vape Category
                  <select
                    required
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
              )}

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
                    placeholder="Enter Expiry Date"
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
          </>
        )}
      </div>
    </div>
  );
};

export default AddProductModal;
