// src/components/TabPanel.tsx
import React, { useState } from "react";
import styles from "../styles/TabPanel.module.css";
import { Product } from "../types";
import { useAuth } from "@/context/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { useRouter } from "next/router";
import toast from "react-hot-toast";

interface TabPanelProps {
  products: Product[];
  searchTerm: string;
  filterOption: string;
}

const TabPanel: React.FC<TabPanelProps> = ({
  products,
  searchTerm,
  filterOption,
}) => {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // Editing state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingField, setEditingField] = useState<"store" | "home" | null>(
    null
  );
  const [modalValue, setModalValue] = useState("");

  // Calculate days left (Infinity for “n/a”)
  const calculateDaysLeft = (expiryDate?: string): number => {
    if (!expiryDate || expiryDate === "n/a") return Infinity;
    const today = new Date();
    const exp = new Date(expiryDate);
    const diff = exp.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // Filter by searchTerm + filterOption
  const filtered = products
    .filter((p) => p.flavor.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((p) => {
      const total = (Number(p.store) || 0) + (Number(p.home) || 0);
      const daysLeft = calculateDaysLeft(p.expiryDate);
      switch (filterOption) {
        case "Need to Order":
          return total <= 1;
        case "Good":
          return total > 1;
        case "Expiry n/a":
          return p.expiryDate === "n/a";
        case "Expiring Soon":
          return p.expiryDate !== "n/a" && daysLeft > 0 && daysLeft < 30;
        default:
          return true;
      }
    });

  // Start editing flow
  const handleCellClick = (field: "store" | "home", prod: Product) => {
    if (!isAuthenticated) {
      router.push(`/login?next=${router.pathname}`);
      return;
    }
    setEditingProduct(prod);
    setEditingField(field);
    setModalValue(String(prod[field] ?? "0"));
  };

  // Commit update
  const handleSave = async () => {
    if (!editingProduct || !editingField) return;
    const ref = doc(db, "products", editingProduct.id);
    await toast.promise(
      updateDoc(ref, { [editingField]: Number(modalValue) }),
      {
        loading: "Saving…",
        success: "Saved!",
        error: "Failed to save.",
      }
    );
    setEditingProduct(null);
    setEditingField(null);
    setModalValue("");
  };

  return (
    <div className={styles.tabPanel}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Flavor</th>
            <th>ST</th>
            <th>HM</th>
            <th>Total</th>
            <th>Status</th>
            <th>Expiry Date</th>
            <th>Days Left</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p, i) => {
            const total = (Number(p.store) || 0) + (Number(p.home) || 0);
            const daysLeft = calculateDaysLeft(p.expiryDate);

            return (
              <tr key={p.id + i}>
                <td>{p.flavor}</td>
                {(["store", "home"] as const).map((f) => (
                  <td key={f} onClick={() => handleCellClick(f, p)}>
                    <span
                      className={
                        f === "store" ? styles.storeCell : styles.homeCell
                      }
                    >
                      {p[f] ?? "0"}
                    </span>
                  </td>
                ))}
                <td>{total}</td>
                <td className={total <= 1 ? styles.lowStock : styles.goodStock}>
                  {total <= 1 ? "Need to Order" : "GOOD"}
                </td>
                <td>{p.expiryDate}</td>
                <td
                  className={
                    p.expiryDate === "n/a"
                      ? styles.naExpiry
                      : daysLeft < 30
                      ? styles.expiringSoon
                      : styles.goodExpiry
                  }
                >
                  {p.expiryDate === "n/a"
                    ? "No Expiry"
                    : daysLeft > 0
                    ? daysLeft
                    : "Expired"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Edit Modal */}
      {editingProduct && editingField && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Edit {editingField.toUpperCase()}</h3>
            <input
              type="number"
              value={modalValue}
              onChange={(e) => setModalValue(e.target.value)}
              autoFocus
            />
            <div className={styles.modalButtons}>
              <button onClick={handleSave}>Save</button>
              <button onClick={() => setEditingProduct(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabPanel;
