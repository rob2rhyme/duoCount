// src/pages/suppliers.tsx
import { useEffect, useState } from "react";
import Head from "next/head";
import Layout from "@/components/Layout";
import SupplierModal from "@/components/SupplierModal";
import styles from "@/styles/Suppliers.module.css";
import { useAuth } from "@/context/AuthContext";
import { appConfig } from "@/config/app.config";
import { logActivity } from "@/utils/activity";
import { Supplier } from "@/types";
import { db } from "@/utils/firebase";
import { collection, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import toast from "react-hot-toast";

export default function SuppliersPage() {
  const { loading, isAuthenticated, can, role, user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const allowed = can("manageSuppliers");
  const canDelete = role === "admin";

  useEffect(() => {
    if (!allowed) return;
    const q = query(collection(db, "suppliers"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => {
      setSuppliers(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Supplier, "id">) }))
      );
    });
    return () => unsub();
  }, [allowed]);

  if (loading) return <p className="loading">Loading…</p>;
  if (!isAuthenticated) return null;

  const handleDelete = async (s: Supplier) => {
    if (!canDelete) return;
    if (!confirm(`Delete supplier "${s.name}"? Products keep their supplier name.`))
      return;
    try {
      await deleteDoc(doc(db, "suppliers", s.id));
      toast.success("Supplier removed");
      logActivity(
        { action: "delete", item: s.name, detail: "supplier" },
        { uid: user?.uid ?? null, role }
      );
    } catch {
      toast.error("Failed to delete supplier.");
    }
  };

  return (
    <Layout>
      <Head>
        <title>Suppliers – {appConfig.appName}</title>
      </Head>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <h1 className={styles.title}>Suppliers</h1>
          {allowed && (
            <button
              className={styles.addBtn}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              + Add supplier
            </button>
          )}
        </div>

        {!allowed ? (
          <p className={styles.empty}>
            You don’t have access to supplier management.
          </p>
        ) : (
          <div className={styles.grid}>
            {suppliers.length === 0 && (
              <p className={styles.empty}>
                No suppliers yet. Add one to link products and build reorder lists.
              </p>
            )}
            {suppliers.map((s) => (
              <div key={s.id} className={styles.card}>
                <span className={styles.name}>{s.name}</span>
                {s.contact && (
                  <span className={styles.meta}>
                    <span className={styles.metaLabel}>Contact</span>
                    {s.contact}
                  </span>
                )}
                {s.email && (
                  <span className={styles.meta}>
                    <span className={styles.metaLabel}>Email</span>
                    <a href={`mailto:${encodeURIComponent(s.email)}`}>
                      {s.email}
                    </a>
                  </span>
                )}
                {s.phone && (
                  <span className={styles.meta}>
                    <span className={styles.metaLabel}>Phone</span>
                    {s.phone}
                  </span>
                )}
                <div className={styles.actions}>
                  <button
                    className={styles.editBtn}
                    onClick={() => {
                      setEditing(s);
                      setModalOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  {canDelete && (
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(s)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SupplierModal
        isOpen={modalOpen}
        supplier={editing}
        onClose={() => setModalOpen(false)}
      />
    </Layout>
  );
}
