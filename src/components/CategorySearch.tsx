// src/components/CategorySearch.tsx
import React from "react";
import styles from "../styles/CategorySearch.module.css";
import { appConfig } from "@/config/app.config";

interface Props {
  search: string;
  filter: string;
  onSearchChange(v: string): void;
  onFilterChange(v: string): void;
  onClear(): void;
}

export default function CategorySearch({
  search,
  filter,
  onSearchChange,
  onFilterChange,
  onClear,
}: Props) {
  const visibleOptions = appConfig.categoryFilters;

  return (
    <div className={styles.searchRow}>
      <input
        className={styles.searchInput}
        type="text"
        placeholder={`Search ${appConfig.labels.category}`}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        className={styles.filterSelect}
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
      >
        {visibleOptions.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <button className={styles.clearButton} onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
