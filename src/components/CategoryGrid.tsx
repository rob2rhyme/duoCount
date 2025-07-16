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
  const matchFilter = (name: string) =>
    filter === "All" || name.toLowerCase().includes(filter.toLowerCase());

  const filtered = categories.filter(
    (cat) =>
      cat.name.toLowerCase().includes(search.toLowerCase()) &&
      matchFilter(cat.name)
  );

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
        <p style={{ gridColumn: "1/-1", textAlign: "center" }}>
          No categories match your search.
        </p>
      )}
    </div>
  );
};

export default CategoryGrid;
