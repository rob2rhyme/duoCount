// src/components/CategorySearch.tsx
import React from "react";
import styles from "../styles/CategorySearch.module.css";

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
  const options = [
    "All",
    "5% Nic",
    "0% Nic",
    "THC Disposables",
    "THC Cartridges",
    "Cigarettes",
    "Vape Juice",
    "Cigarillos",
  ];

  // Filter out unwanted categories
  const visibleOptions = options.filter(
    (o) => !["THC Disposables", "THC Cartridges", "Vape Juice"].includes(o)
  );

  return (
    <div className={styles.searchRow}>
      <input
        className={styles.searchInput}
        type="text"
        placeholder="Search Vape Category"
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
