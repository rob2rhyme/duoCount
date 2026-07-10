// src/components/dashboard/StatCard.tsx
import React from "react";
import styles from "@/styles/Dashboard.module.css";

interface Props {
  label: string;
  value: string | number;
  /** Left-border accent colour (defaults to the series blue). */
  accent?: string;
  sublabel?: string;
}

const StatCard: React.FC<Props> = ({ label, value, accent, sublabel }) => (
  <div
    className={styles.statCard}
    style={accent ? ({ ["--accent" as string]: accent } as React.CSSProperties) : undefined}
  >
    <div className={styles.statValue}>{value}</div>
    <div className={styles.statLabel}>{label}</div>
    {sublabel && <div className={styles.statSub}>{sublabel}</div>}
  </div>
);

export default StatCard;
