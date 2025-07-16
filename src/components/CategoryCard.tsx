// src/components/CategoryCard.tsx

import React from "react";
import { ProductCategory } from "../types";
import styles from "../styles/CategoryCard.module.css";

interface Props {
  category: ProductCategory;
  onClick: () => void;
}

const CategoryCard: React.FC<Props> = ({ category, onClick }) => {
  const bg = category.imageUrl ?? "/images/fallback.jpg";

  return (
    <div
      className={styles.card}
      onClick={onClick}
      style={{ backgroundImage: `url(${bg})` }}
    >
      <h3 className={styles.title}>{category.name}</h3>
    </div>
  );
};

export default CategoryCard;
