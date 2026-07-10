// src/components/TabPanel.tsx
import Breadcrumb from "./Breadcrumb";
import React, { useState, useEffect, useMemo } from "react";
import styles from "../styles/TabPanel.module.css";
import { Product } from "../types";
import { useAuth } from "@/context/AuthContext";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/utils/firebase";
import { appConfig } from "@/config/app.config";
import { productsToCSV, downloadCSV } from "@/utils/csv";
import { logActivity } from "@/utils/activity";
import { useRouter } from "next/router";
import toast from "react-hot-toast";

const { lowStock, expiringSoonDays } = appConfig.thresholds;

interface TabPanelProps {
  products: Product[];
  searchTerm: string;
  filterOption: string;
}

type SortKey = "flavor" | "front" | "back" | "total" | "expiry";
type SortDir = "asc" | "desc";

const TabPanel: React.FC<TabPanelProps> = ({
  products,
  searchTerm,
  filterOption,
}) => {
  const { isAuthenticated, can, user, role } = useAuth();
  const router = useRouter();
  const canEdit = can("editStock");
  const canDelete = can("deleteProduct");

  const [liveProducts, setLiveProducts] = useState<Product[]>(products);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingField, setEditingField] = useState<"front" | "back" | null>(
    null
  );
  const [modalValue, setModalValue] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("flavor");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const categoryName = products[0]?.category || "Unknown Category";

  // Real-time listener for products in this category
  useEffect(() => {
    const cat = products[0]?.category || null;
    if (!cat) return;

    const q = query(collection(db, "products"), where("category", "==", cat));
    const unsub = onSnapshot(q, (snap) => {
      const updated = snap.docs.map((d) => ({
        id: d.id,
        category: d.data().category,
        flavor: d.data().flavor,
        barcode: d.data().barcode ? String(d.data().barcode) : undefined,
        supplier: d.data().supplier ? String(d.data().supplier) : undefined,
        front: Number(d.data().front || 0),
        back: Number(d.data().back || 0),
        expiryDate: d.data().expiryDate,
      }));
      setLiveProducts(updated);
    });

    return () => unsub();
  }, [products]);

  const calculateDaysLeft = (expiryDate?: string): number => {
    if (!expiryDate || expiryDate === "n/a") return Infinity;
    const diff = new Date(expiryDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const filtered = useMemo(() => {
    const list = liveProducts
      .filter((p) => p.flavor.toLowerCase().includes(searchTerm.toLowerCase()))
      .filter((p) => {
        const total = (Number(p.front) || 0) + (Number(p.back) || 0);
        const daysLeft = calculateDaysLeft(p.expiryDate);
        switch (filterOption) {
          case "Need to Order":
            return total <= lowStock;
          case "Good":
            return total > lowStock;
          case "Expiry n/a":
            return p.expiryDate === "n/a";
          case "Expiring Soon":
            return (
              p.expiryDate !== "n/a" && daysLeft > 0 && daysLeft < expiringSoonDays
            );
          default:
            return true;
        }
      });

    const dir = sortDir === "asc" ? 1 : -1;
    const val = (p: Product): number | string => {
      const total = (Number(p.front) || 0) + (Number(p.back) || 0);
      switch (sortKey) {
        case "front":
          return Number(p.front) || 0;
        case "back":
          return Number(p.back) || 0;
        case "total":
          return total;
        case "expiry":
          return calculateDaysLeft(p.expiryDate);
        default:
          return p.flavor.toLowerCase();
      }
    };
    return [...list].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [liveProducts, searchTerm, filterOption, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "";

  const handleCellClick = (field: "front" | "back", prod: Product) => {
    if (!isAuthenticated) {
      router.push(`/login?next=${router.pathname}`);
      return;
    }
    if (!canEdit) return; // read-only roles
    setEditingProduct(prod);
    setEditingField(field);
    setModalValue(String(prod[field] ?? "0"));
  };

  const handleDelete = async (prod: Product) => {
    if (!canDelete) return;
    if (!confirm(`Delete "${prod.flavor}"? This cannot be undone.`)) return;
    await toast.promise(deleteDoc(doc(db, "products", prod.id)), {
      loading: "Deleting…",
      success: "Deleted",
      error: "Failed to delete.",
    });
    logActivity(
      { action: "delete", item: prod.flavor, category: prod.category },
      { uid: user?.uid ?? null, role }
    );
  };

  const handleSave = async () => {
    if (!editingProduct || !editingField) return;
    const previous = editingProduct[editingField] ?? 0;
    const next = Number(modalValue);
    const ref = doc(db, "products", editingProduct.id);
    await toast.promise(updateDoc(ref, { [editingField]: next }), {
      loading: "Saving…",
      success: "Saved!",
      error: "Failed to save.",
    });
    logActivity(
      {
        action: "edit",
        item: editingProduct.flavor,
        category: editingProduct.category,
        detail: `${editingField} ${previous} → ${next}`,
      },
      { uid: user?.uid ?? null, role }
    );
    setEditingProduct(null);
    setEditingField(null);
    setModalValue("");
  };

  const handleExport = () => {
    const csv = productsToCSV(filtered);
    const safe = categoryName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadCSV(`${safe}-inventory.csv`, csv);
    toast.success(`Exported ${filtered.length} rows`);
  };

  const Header = ({ label, k }: { label: string; k: SortKey }) => (
    <th className={styles.sortable} onClick={() => toggleSort(k)}>
      {label}
      <span className={styles.sortArrow}>{sortArrow(k)}</span>
    </th>
  );

  return (
    <div className={styles.tabPanel}>
      <div className={styles.toolbar}>
        <Breadcrumb path={["Home", categoryName]} />
        <span className={styles.count}>
          {filtered.length} {appConfig.labels.itemPlural.toLowerCase()}
        </span>
        <button
          className={styles.exportBtn}
          onClick={handleExport}
          title="Export these rows to CSV"
        >
          ⬇ Export CSV
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <Header label={appConfig.labels.item} k="flavor" />
              <Header label={appConfig.labels.frontShort} k="front" />
              <Header label={appConfig.labels.backShort} k="back" />
              <Header label="Total" k="total" />
              <th>Status</th>
              <Header label="Days Left" k="expiry" />
              <th>Expiry Date</th>
              {canDelete && <th></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td className={styles.emptyRow} colSpan={canDelete ? 8 : 7}>
                  No {appConfig.labels.itemPlural.toLowerCase()} match.
                </td>
              </tr>
            )}
            {filtered.map((p, i) => {
              const total = (Number(p.front) || 0) + (Number(p.back) || 0);
              const daysLeft = calculateDaysLeft(p.expiryDate);

              return (
                <tr key={p.id + i}>
                  <td>{p.flavor}</td>
                  {(["front", "back"] as const).map((f) => (
                    <td
                      key={f}
                      onClick={() => handleCellClick(f, p)}
                      style={{ cursor: canEdit ? "pointer" : "default" }}
                      title={canEdit ? "Click to edit" : undefined}
                    >
                      <span
                        className={
                          f === "front" ? styles.storeCell : styles.homeCell
                        }
                      >
                        {p[f] ?? "0"}
                      </span>
                    </td>
                  ))}
                  <td>{total}</td>
                  <td
                    className={
                      total <= lowStock ? styles.lowStock : styles.goodStock
                    }
                  >
                    {total <= lowStock ? "Need to Order" : "GOOD"}
                  </td>
                  <td
                    className={
                      p.expiryDate === "n/a"
                        ? styles.naExpiry
                        : daysLeft < expiringSoonDays
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
                  <td>{p.expiryDate}</td>
                  {canDelete && (
                    <td>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(p)}
                        title={`Delete ${p.flavor}`}
                        aria-label={`Delete ${p.flavor}`}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingProduct && editingField && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>
              Edit {editingProduct.flavor} —{" "}
              {editingField === "front"
                ? appConfig.labels.front
                : appConfig.labels.back}
            </h3>
            <input
              type="number"
              value={modalValue}
              onChange={(e) => setModalValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
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
