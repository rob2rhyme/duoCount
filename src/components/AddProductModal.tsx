// src/components/AddProductModal.tsx
import React, { useState, useEffect } from "react";
import { db } from "@/utils/firebase";
import { collection, addDoc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";
import styles from "../styles/AddProductModal.module.css";

type Step = 1 | 2 | 3 | 4;

interface Props {
  onClose: () => void;
}

export default function AddProductModal({ onClose }: Props) {
  const { isAuthenticated } = useAuth();
  const [step, setStep] = useState<Step>(1);

  // form state
  const [mode, setMode] = useState<"new" | "existing">("existing");
  const [newCategory, setNewCategory] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [flavor, setFlavor] = useState("");
  const [homeQty, setHomeQty] = useState(0);
  const [storeQty, setStoreQty] = useState(0);
  const [expiryDate, setExpiryDate] = useState("");
  // new: control whether user picks a date or “N/A”
  // track which option is selected
  const [expiryOption, setExpiryOption] = useState<"date" | "na" | "">("");

  // realtime categories & products
  const [categories, setCategories] = useState<string[]>([]);
  const [existingProducts, setExistingProducts] = useState<
    { category: string; flavor: string }[]
  >([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "categories"), (snap) =>
      setCategories(
        snap.docs
          .map((d) => (d.data().name as string) || "") // grab the `name` field
          .filter((n) => !!n) // drop any empty
      )
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), (snap) =>
      setExistingProducts(
        snap.docs.map((d) => ({
          category: d.data().category,
          flavor: d.data().flavor,
        }))
      )
    );
    return unsub;
  }, []);

  const isDuplicateCategory = () =>
    mode === "new" && categories.includes(newCategory.trim());
  const isDuplicateProduct = () =>
    existingProducts.some(
      (p) =>
        p.category === (mode === "new" ? newCategory : selectedCategory) &&
        p.flavor.toLowerCase() === flavor.trim().toLowerCase()
    );

  const handleSave = async () => {
    if (!isAuthenticated) return toast.error("Session expired");

    const categoryToUse =
      mode === "new" ? newCategory.trim() : selectedCategory;
    try {
      if (mode === "new") {
        await addDoc(collection(db, "categories"), { name: categoryToUse });
      }
      await addDoc(collection(db, "products"), {
        category: categoryToUse,
        flavor: flavor.trim(),
        home: homeQty,
        store: storeQty,
        expiryDate: expiryOption === "na" ? "n/a" : expiryDate.trim(),
        createdAt: new Date(),
      });
      toast.success("Product added!");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add product");
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {step === 1 && (
          <>
            <h2>Add New Vape:</h2>
            <p>Step 1: Chose One</p>
            <div className={`${styles.buttons} ${styles.stepOneButtons}`}>
              <button
                onClick={() => {
                  setMode("new");
                  setStep(2);
                }}
              >
                Create New Vape Category
              </button>
              <button
                onClick={() => {
                  setMode("existing");
                  setStep(2);
                }}
              >
                Use Existing Vape Category
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Step 2: Name {mode === "new" ? "New" : "Existing"} Vape</h2>
            {mode === "new" ? (
              <>
                <input
                  placeholder="Vape Name"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                {isDuplicateCategory() && (
                  <p className={styles.error}>Category already exists</p>
                )}
              </>
            ) : (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">— choose —</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
            <div className={styles.buttons}>
              <button onClick={() => setStep(1)}>Back</button>
              <button
                disabled={
                  mode === "new"
                    ? !newCategory.trim() || isDuplicateCategory()
                    : !selectedCategory
                }
                onClick={() => setStep(3)}
              >
                Next
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Step 3: Vape Details</h2>
            <input
              placeholder="Flavor Name (eg. Strawberry Banana)"
              value={flavor}
              onChange={(e) => setFlavor(e.target.value)}
            />
            <input
              type="number"
              placeholder="Home Qty"
              value={homeQty}
              onChange={(e) => setHomeQty(+e.target.value)}
            />
            <input
              type="number"
              placeholder="Store Qty"
              value={storeQty}
              onChange={(e) => setStoreQty(+e.target.value)}
            />
            {/* expiry choice: date picker on left, N/A on right */}
            <div className={styles.radioGroup}>
              {/* left: date picker (disabled if N/A) */}
              <div className={styles.optionGroup}>
                <label htmlFor="expiryDate" className={styles.dateLabel}>
                  Expiry Date
                </label>
                <input
                  id="expiryDate"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setExpiryDate(v);
                    // if user picks or clears date, toggle date selection
                    setExpiryOption(v ? "date" : "");
                  }}
                  disabled={expiryOption === "na"}
                  className={styles.dateInput}
                />
              </div>

              {/* right: N/A text over radio, centered */}
              <div className={`${styles.optionGroup} ${styles.centeredOption}`}>
                <label className={styles.checkboxLabel}>
                  <span className={styles.naText}>N/A</span>
                  <input
                    type="checkbox"
                    checked={expiryOption === "na"}
                    onChange={() =>
                      setExpiryOption((prev) => (prev === "na" ? "" : "na"))
                    }
                    disabled={expiryOption === "date"}
                  />
                </label>
              </div>
            </div>
            {isDuplicateProduct() && (
              <p className={styles.error}>
                This flavor already exists in that category
              </p>
            )}
            <div className={styles.buttons}>
              <button onClick={() => setStep(2)}>Back</button>
              <button
                disabled={
                  !flavor.trim() ||
                  homeQty < 0 ||
                  storeQty < 0 ||
                  (expiryOption === "date" && !expiryDate) ||
                  isDuplicateProduct()
                }
                onClick={() => setStep(4)}
              >
                Next
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2>Step 4: Review & Confirm</h2>
            <p>
              <strong>Category:</strong>{" "}
              {mode === "new" ? newCategory : selectedCategory}
            </p>
            <p>
              <strong>Flavor:</strong> {flavor}
            </p>
            <p>
              <strong>Home:</strong> {homeQty}
            </p>
            <p>
              <strong>Store:</strong> {storeQty}
            </p>
            <p>
              <strong>Expiry:</strong> {expiryDate}
            </p>
            <div className={styles.buttons}>
              <button onClick={() => setStep(3)}>Back</button>
              <button onClick={handleSave}>Save</button>
            </div>
          </>
        )}

        <button className={styles.close} onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}
