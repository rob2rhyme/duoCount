// src/components/TabPanel.tsx
import React, { useState } from "react";
import styles from "../styles/TabPanel.module.css";
import { Product } from "../types";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/utils/firebase";
import { doc, updateDoc } from "firebase/firestore";
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
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingField, setEditingField] = useState<"store" | "home" | null>(
    null
  );
  const [modalValue, setModalValue] = useState("");
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const calculateDaysLeft = (expiryDate: string): number => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const filteredProducts = products.filter((product) => {
    const flavorMatch = product.flavor
      ?.toLowerCase()
      .includes(searchTerm.toLowerCase());
    const total = Number(product.store || 0) + Number(product.home || 0);
    const daysLeft = calculateDaysLeft(product.expiryDate || "");

    switch (filterOption) {
      case "Need to Order":
        return flavorMatch && total <= 1;
      case "Good":
        return flavorMatch && total > 1;
      case "Expiry n/a":
        return flavorMatch && product.expiryDate === "n/a";
      case "Expiring Soon":
        return (
          flavorMatch &&
          product.expiryDate !== "n/a" &&
          daysLeft > 0 &&
          daysLeft < 30
        );
      default:
        return flavorMatch;
    }
  });

  const handleCellClick = (field: "store" | "home", product: Product) => {
    if (!isAuthenticated) {
      router.push(`/login?next=${router.pathname}`);
      return;
    }
    setEditingProduct(product);
    setEditingField(field);
    setModalValue(String(product[field] ?? "0"));
  };

  const handleSave = async () => {
    if (!editingProduct || !editingField) return;

    try {
      const ref = doc(db, "products", editingProduct.id);
      await toast.promise(
        updateDoc(ref, { [editingField]: Number(modalValue) }),
        {
          loading: "Saving...",
          success: "Quantity updated!",
          error: "Save failed.",
        }
      );
      editingProduct[editingField] = Number(modalValue);
      setEditingProduct(null);
      setEditingField(null);
      setModalValue("");
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  const handleCancel = () => {
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
          {filteredProducts.map((product, rowIdx) => {
            const total =
              (Number(product.store) || 0) + (Number(product.home) || 0);
            const daysLeft = calculateDaysLeft(product.expiryDate);
            const isLowStock = total <= 1;
            const isExpiringSoon = daysLeft < 30;

            return (
              <tr key={`${product.flavor}-${rowIdx}`}>
                <td>{product.flavor}</td>

                {["store", "home"].map((field) => {
                  const value = product[field as keyof Product] ?? "0";

                  return (
                    <td
                      key={field}
                      onClick={() =>
                        handleCellClick(field as "store" | "home", product)
                      }
                    >
                      <span
                        className={
                          field === "store" ? styles.storeCell : styles.homeCell
                        }
                      >
                        {String(value)}
                      </span>
                    </td>
                  );
                })}

                <td>{total}</td>
                <td className={isLowStock ? styles.lowStock : styles.goodStock}>
                  {isLowStock ? "Need to Order" : "GOOD"}
                </td>
                <td>{product.expiryDate}</td>
                <td
                  className={
                    product.expiryDate === "n/a"
                      ? styles.naExpiry
                      : isExpiringSoon
                        ? styles.expiringSoon
                        : styles.goodExpiry
                  }
                >
                  {product.expiryDate === "n/a"
                    ? "No Expiry Date"
                    : daysLeft > 0
                      ? daysLeft
                      : "Expired"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editingProduct && editingField && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Edit {editingField.toUpperCase()} Quantity</h3>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={modalValue}
              onChange={(e) => setModalValue(e.target.value)}
              autoFocus
            />
            <div className={styles.modalButtons}>
              <button onClick={handleSave}>Save</button>
              <button onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabPanel;
