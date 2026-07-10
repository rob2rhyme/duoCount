// src/components/dashboard/BarChart.tsx
import React from "react";
import styles from "@/styles/Dashboard.module.css";

export interface Bar {
  label: string;
  value: number;
}

interface Props {
  bars: Bar[];
  /** Optional unit appended to hover titles, e.g. "units". */
  unit?: string;
}

const BarChart: React.FC<Props> = ({ bars, unit }) => {
  if (bars.length === 0) {
    return <p className={styles.empty}>No data yet.</p>;
  }
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className={styles.bars}>
      {bars.map((b) => {
        const pct = (b.value / max) * 100;
        return (
          <div
            key={b.label}
            className={styles.barRow}
            title={`${b.label}: ${b.value}${unit ? " " + unit : ""}`}
          >
            <span className={styles.barLabel}>{b.label}</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${pct}%` }} />
            </div>
            <span className={styles.barValue}>{b.value}</span>
          </div>
        );
      })}
    </div>
  );
};

export default BarChart;
