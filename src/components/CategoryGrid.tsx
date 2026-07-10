// src/components/CategoryGrid.tsx
import React from "react";
import CategoryCard from "./CategoryCard";
import styles from "../styles/CategoryGrid.module.css";
import { ProductCategory } from "../types";

interface Props {
  categories: ProductCategory[];
  search: string;
  filter: string;
  onSelect: (cat: ProductCategory) => void;
}

const CategoryGrid: React.FC<Props> = ({
  categories,
  search,
  filter,
  onSelect,
}) => {
  // filter for name‐search and filterType‐match
  const filtered = categories.filter((cat) => {
    const matchesSearch = cat.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || cat.filterType === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className={styles.grid}>
      {filtered.map((cat) => (
        <CategoryCard
          key={cat.name}
          category={cat}
          onClick={() => onSelect(cat)}
        />
      ))}

      {filtered.length === 0 && (
        <p className={styles.empty}>No categories match your search.</p>
      )}
    </div>
  );
};

export default CategoryGrid;
