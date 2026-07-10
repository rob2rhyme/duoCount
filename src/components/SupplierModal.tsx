// src/components/SupplierModal.tsx
import React, { FormEvent, useEffect, useState } from "react";
import styles from "@/styles/Suppliers.module.css";
import { db } from "@/utils/firebase";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/utils/activity";
import { Supplier } from "@/types";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import toast from "react-hot-toast";

interface Props {
  isOpen: boolean;
  /** When set, the modal edits this supplier; otherwise it creates a new one. */
  supplier: Supplier | null;
  onClose: () => void;
}

const SupplierModal: React.FC<Props> = ({ isOpen, supplier, onClose }) => {
  const { user, role } = useAuth();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName(supplier?.name ?? "");
      setContact(supplier?.contact ?? "");
      setEmail(supplier?.email ?? "");
      setPhone(supplier?.phone ?? "");
    }
  }, [isOpen, supplier]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Supplier name is required.");
      return;
    }
    const payload = {
      name: trimmed,
      contact: contact.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
    };
    try {
      if (supplier) {
        await updateDoc(doc(db, "suppliers", supplier.id), payload);
        toast.success("Supplier updated");
        logActivity(
          { action: "edit", item: trimmed, detail: "supplier" },
          { uid: user?.uid ?? null, role }
        );
      } else {
        await addDoc(collection(db, "suppliers"), payload);
        toast.success("Supplier added");
        logActivity(
          { action: "add", item: trimmed, detail: "supplier" },
          { uid: user?.uid ?? null, role }
        );
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save supplier.");
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>{supplier ? "Edit supplier" : "Add supplier"}</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <label>
            Contact person
            <input value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.primary}>
              {supplier ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupplierModal;
