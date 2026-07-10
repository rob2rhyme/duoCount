// src/components/TopActions.tsx
import React from "react";
import styles from "@/styles/TopActions.module.css";
import { appConfig } from "@/config/app.config";

interface Props {
  isDetail: boolean;
  canAdd: boolean;
  onBack: () => void;
  onAdd: () => void;
  onImport: () => void;
  onExportAll: () => void;
  onScan: () => void;
}

export default function TopActions({
  isDetail,
  canAdd,
  onBack,
  onAdd,
  onImport,
  onExportAll,
  onScan,
}: Props) {
  return (
    <div className={styles.row}>
      {isDetail && (
        <button className={`${styles.btn} ${styles.back}`} onClick={onBack}>
          ‹ Back
        </button>
      )}

      {!isDetail && (
        <button
          className={`${styles.btn} ${styles.neutral}`}
          onClick={onScan}
          title="Scan a barcode to find a product"
        >
          📷 Scan
        </button>
      )}

      {!isDetail && (
        <button
          className={`${styles.btn} ${styles.neutral}`}
          onClick={onExportAll}
          title="Export all inventory to CSV"
        >
          ⬇ Export
        </button>
      )}

      {!isDetail && canAdd && (
        <button
          className={`${styles.btn} ${styles.neutral}`}
          onClick={onImport}
          title="Import from a CSV file"
        >
          ⬆ Import
        </button>
      )}

      {canAdd && (
        <button className={`${styles.btn} ${styles.primary}`} onClick={onAdd}>
          + Add {appConfig.labels.item}
        </button>
      )}
    </div>
  );
}
