// src/components/ImportModal.tsx
import React, { useRef, useState } from "react";
import styles from "@/styles/ImportModal.module.css";
import { db } from "@/utils/firebase";
import { appConfig } from "@/config/app.config";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/utils/activity";
import { parseInventoryCSV, ParsedProduct } from "@/utils/csv";
import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import toast from "react-hot-toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const BATCH_LIMIT = 450; // Firestore caps a batch at 500 writes.

const ImportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user, role } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedProduct[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setRows([]);
    setErrors([]);
    setFileName("");
    setImporting(false);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const { rows, errors } = parseInventoryCSV(text);
    setRows(rows);
    setErrors(errors);
    if (rows.length === 0) toast.error("No valid rows found in that file.");
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      // Ensure categories referenced by the import exist.
      const existing = new Set(
        (await getDocs(collection(db, "categories"))).docs.map(
          (d) => (d.data().name as string) ?? d.id
        )
      );
      const defaultFilter =
        appConfig.categoryFilters.find((f) => f !== "All") ?? "Standard";

      // Chunk into batches to respect Firestore's 500-write limit.
      const chunks: ParsedProduct[][] = [];
      for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
        chunks.push(rows.slice(i, i + BATCH_LIMIT));
      }

      const createdCategories = new Set<string>();
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const r of chunk) {
          if (!existing.has(r.category) && !createdCategories.has(r.category)) {
            batch.set(doc(db, "categories", r.category), {
              name: r.category,
              filterType: defaultFilter,
              imageUrl: "",
            });
            createdCategories.add(r.category);
          }
          batch.set(doc(collection(db, "products")), {
            category: r.category,
            flavor: r.flavor,
            front: r.front,
            back: r.back,
            expiryDate: r.expiryDate,
          });
        }
        await batch.commit();
      }

      toast.success(`Imported ${rows.length} ${appConfig.labels.itemPlural.toLowerCase()}`);
      logActivity(
        { action: "import", item: `${rows.length} ${appConfig.labels.itemPlural.toLowerCase()}`, detail: fileName },
        { uid: user?.uid ?? null, role }
      );
      reset();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Import failed. Check your permissions and try again.");
      setImporting(false);
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>Import {appConfig.labels.itemPlural} from CSV</h2>
        <p className={styles.hint}>
          Required columns: <code>category</code>, <code>flavor</code>. Optional:{" "}
          <code>front</code>, <code>back</code>, <code>expiryDate</code>. Tip:
          export first to see the exact format.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className={styles.drop} onClick={() => fileRef.current?.click()}>
          {fileName ? (
            <>
              <strong>{fileName}</strong> — {rows.length} valid rows. Click to
              choose a different file.
            </>
          ) : (
            <>📄 Click to choose a CSV file</>
          )}
        </div>

        {rows.length > 0 && (
          <div className={styles.preview}>
            <div className={styles.previewHead}>
              <span>Preview</span>
              <span>{rows.length} rows</span>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{appConfig.labels.category}</th>
                  <th>{appConfig.labels.item}</th>
                  <th>{appConfig.labels.frontShort}</th>
                  <th>{appConfig.labels.backShort}</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <td>{r.category}</td>
                    <td>{r.flavor}</td>
                    <td>{r.front}</td>
                    <td>{r.back}</td>
                    <td>{r.expiryDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {errors.length > 0 && (
          <div className={styles.errors}>
            {errors.slice(0, 8).map((e, i) => (
              <div key={i}>• {e}</div>
            ))}
            {errors.length > 8 && <div>…and {errors.length - 8} more</div>}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.secondary} onClick={close}>
            Cancel
          </button>
          <button
            className={styles.primary}
            onClick={handleImport}
            disabled={rows.length === 0 || importing}
          >
            {importing ? "Importing…" : `Import ${rows.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
