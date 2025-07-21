// src/components/Breadcrumb.tsx
import React from "react";
import Styles from "../styles/TabPanel.module.css";

interface BreadcrumbProps {
  path: string[];
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ path }) => {
  return (
    <nav className={Styles.breadcrumb}>
      {path.map((p, i) => (
        <span key={i}>
          {p}
          {i < path.length - 1 && " > "}
        </span>
      ))}
    </nav>
  );
};

export default Breadcrumb;
