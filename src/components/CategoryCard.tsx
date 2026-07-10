// src/components/CategoryCard.tsx
import React from "react";
import { ProductCategory } from "../types";
import styles from "../styles/CategoryCard.module.css";
import { appConfig } from "@/config/app.config";

interface Props {
  category: ProductCategory;
  onClick: () => void;
}

const CategoryCard: React.FC<Props> = ({ category, onClick }) => {
  const bg = category.imageUrl ?? "/images/fallback.jpg";

  const totalFlavors = category.products.length;
  const needToOrder = category.products.filter((p) => {
    const total = (Number(p.front) || 0) + (Number(p.back) || 0);
    return total <= appConfig.thresholds.lowStock;
  }).length;

  const good = totalFlavors - needToOrder;

  return (
    <div
      className={styles.card}
      onClick={onClick}
      style={{ backgroundImage: `url(${bg})` }}
    >
      <div className={styles.overlay}>
        <h3 className={styles.title}>{category.name}</h3>
        <p className={styles.valueLabel}>
          Total: <span>{totalFlavors}</span>
        </p>
        <p className={styles.valueLabel}>
          Need to Order: <span className={styles.valueLow}>{needToOrder}</span>
        </p>
        <p className={styles.valueLabel}>
          Good: <span className={styles.valueGood}>{good}</span>
        </p>
      </div>
    </div>
  );
};

export default CategoryCard;
