// src/components/dashboard/Dashboard.tsx
import React, { useMemo } from "react";
import styles from "@/styles/Dashboard.module.css";
import StatCard from "./StatCard";
import DonutChart from "./DonutChart";
import BarChart from "./BarChart";
import { useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { appConfig } from "@/config/app.config";

// Validated data-viz palette (light mode) — see the dataviz skill.
const PALETTE = {
  good: "#0ca30c",
  warn: "#fab219",
  serious: "#ec835a",
  crit: "#d03b3b",
  muted: "#c3c2b7",
};

interface Severity {
  rank: number;
  label: string;
  color: string;
}

const Dashboard: React.FC = () => {
  const products = useProducts();
  const categories = useCategories();
  const { lowStock, expiringSoonDays } = appConfig.thresholds;
  const { item, itemPlural, category } = appConfig.labels;

  const stats = useMemo(() => {
    const now = Date.now();
    const daysLeft = (expiry?: string) => {
      if (!expiry || expiry === "n/a") return Infinity;
      return Math.ceil((new Date(expiry).getTime() - now) / 86_400_000);
    };

    let totalUnits = 0;
    let out = 0;
    let low = 0;
    let good = 0;
    let expiryOk = 0;
    let expiring = 0;
    let expired = 0;
    let noExpiry = 0;
    const perCategory: Record<string, number> = {};
    const attention: { flavor: string; category: string; total: number; sev: Severity }[] = [];

    for (const p of products) {
      const total = (Number(p.front) || 0) + (Number(p.back) || 0);
      totalUnits += total;
      perCategory[p.category] = (perCategory[p.category] || 0) + total;

      // Stock status
      if (total === 0) out++;
      else if (total <= lowStock) low++;
      else good++;

      // Expiry status
      const d = daysLeft(p.expiryDate);
      if (d === Infinity) noExpiry++;
      else if (d <= 0) expired++;
      else if (d < expiringSoonDays) expiring++;
      else expiryOk++;

      // Needs-attention severity (most severe issue wins)
      const candidates: Severity[] = [];
      if (total === 0) candidates.push({ rank: 0, label: "Out of stock", color: PALETTE.crit });
      else if (total <= lowStock) candidates.push({ rank: 2, label: "Low stock", color: PALETTE.warn });
      if (d !== Infinity) {
        if (d <= 0) candidates.push({ rank: 1, label: "Expired", color: PALETTE.crit });
        else if (d < expiringSoonDays) candidates.push({ rank: 3, label: "Expiring soon", color: PALETTE.serious });
      }
      if (candidates.length) {
        candidates.sort((a, b) => a.rank - b.rank);
        attention.push({ flavor: p.flavor, category: p.category, total, sev: candidates[0] });
      }
    }

    attention.sort((a, b) => a.sev.rank - b.sev.rank);

    const categoryBars = Object.entries(perCategory)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    return {
      totalItems: products.length,
      categoryCount: categories.length,
      totalUnits,
      out,
      low,
      good,
      expiryOk,
      expiring,
      expired,
      noExpiry,
      categoryBars,
      attention,
    };
  }, [products, categories, lowStock, expiringSoonDays]);

  const shownAttention = stats.attention.slice(0, 8);
  const moreAttention = stats.attention.length - shownAttention.length;

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.pageTitle}>Dashboard</h1>

      {/* KPI row */}
      <div className={styles.kpiGrid}>
        <StatCard label={`Total ${itemPlural}`} value={stats.totalItems} />
        <StatCard label={`${category === "Category" ? "Categories" : category}`} value={stats.categoryCount} />
        <StatCard label="Units in stock" value={stats.totalUnits} />
        <StatCard label="Need to order" value={stats.low + stats.out} accent={PALETTE.warn} />
        <StatCard label="Expiring soon" value={stats.expiring} accent={PALETTE.serious} />
        <StatCard label="Expired" value={stats.expired} accent={PALETTE.crit} />
      </div>

      {/* Charts */}
      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Stock status</h2>
          <DonutChart
            centerLabel={itemPlural}
            segments={[
              { label: "In stock", value: stats.good, color: PALETTE.good },
              { label: "Low", value: stats.low, color: PALETTE.warn },
              { label: "Out", value: stats.out, color: PALETTE.crit },
            ]}
          />
        </div>

        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Expiry status</h2>
          <DonutChart
            centerLabel={itemPlural}
            segments={[
              { label: "OK", value: stats.expiryOk, color: PALETTE.good },
              { label: "Expiring soon", value: stats.expiring, color: PALETTE.serious },
              { label: "Expired", value: stats.expired, color: PALETTE.crit },
              { label: "No expiry", value: stats.noExpiry, color: PALETTE.muted },
            ]}
          />
        </div>

        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Units by {category.toLowerCase()}</h2>
          <BarChart bars={stats.categoryBars} unit="units" />
        </div>
      </div>

      {/* Needs attention */}
      <div className={styles.attention}>
        <h2 className={styles.chartTitle}>Needs attention</h2>
        {shownAttention.length === 0 ? (
          <p className={styles.empty}>Everything looks good. 🎉</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{item}</th>
                <th>{category}</th>
                <th>Total</th>
                <th>Issue</th>
              </tr>
            </thead>
            <tbody>
              {shownAttention.map((a, i) => (
                <tr key={a.flavor + i}>
                  <td>{a.flavor}</td>
                  <td>{a.category}</td>
                  <td>{a.total}</td>
                  <td>
                    <span className={styles.tag} style={{ background: a.sev.color }}>
                      {a.sev.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {moreAttention > 0 && (
          <div className={styles.moreRow}>+{moreAttention} more need attention</div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
