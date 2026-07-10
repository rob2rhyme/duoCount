// src/components/dashboard/DonutChart.tsx
import React from "react";
import styles from "@/styles/Dashboard.module.css";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  centerLabel?: string;
}

const SIZE = 150;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GAP = 2; // 2px surface gap between segments (per mark specs)

const DonutChart: React.FC<Props> = ({ segments, centerLabel }) => {
  const data = segments.filter((s) => s.value > 0);
  const total = data.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;

  return (
    <div className={styles.donutWrap}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={
          total === 0
            ? "No data"
            : segments.map((s) => `${s.label}: ${s.value}`).join(", ")
        }
      >
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {total === 0 ? (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="var(--grid)"
              strokeWidth={STROKE}
            />
          ) : (
            data.map((s) => {
              const len = (s.value / total) * C;
              const dash = Math.max(len - GAP, 0.001);
              const circle = (
                <circle
                  key={s.label}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                >
                  <title>
                    {s.label}: {s.value} ({Math.round((s.value / total) * 100)}%)
                  </title>
                </circle>
              );
              offset += len;
              return circle;
            })
          )}
        </g>

        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          dominantBaseline="middle"
          className={styles.donutCenterValue}
        >
          {total}
        </text>
        {centerLabel && (
          <text
            x="50%"
            y="62%"
            textAnchor="middle"
            dominantBaseline="middle"
            className={styles.donutCenterLabel}
          >
            {centerLabel}
          </text>
        )}
      </svg>

      <ul className={styles.legend}>
        {segments.map((s) => (
          <li key={s.label} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: s.color }} />
            <span className={styles.legendLabel}>{s.label}</span>
            <span className={styles.legendValue}>{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DonutChart;
