// src/pages/reorder.tsx
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Layout from "@/components/Layout";
import styles from "@/styles/Reorder.module.css";
import { useAuth } from "@/context/AuthContext";
import { useProducts } from "@/hooks/useProducts";
import { appConfig } from "@/config/app.config";
import { reorderToCSV, downloadCSV, ReorderItem } from "@/utils/csv";
import { db } from "@/utils/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import toast from "react-hot-toast";

const NO_SUPPLIER_LABEL = "No supplier";
const MAILTO_MAX = 1900; // stay under mail-client URL limits

/** Case/space-insensitive key so vendor spelling variants group together. */
const normKey = (name: string) => name.trim().toLowerCase();

interface Group {
  /** Canonical display name. */
  display: string;
  email?: string;
  hasSupplier: boolean;
  list: ReorderItem[];
}

export default function ReorderPage() {
  const { loading, isAuthenticated } = useAuth();
  const products = useProducts();
  const { lowStock } = appConfig.thresholds;
  // Supplier index keyed by normalised name -> canonical name + email.
  const [supplierIndex, setSupplierIndex] = useState<
    Record<string, { name: string; email?: string }>
  >({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "suppliers"), (snap) => {
      const index: Record<string, { name: string; email?: string }> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        const name = (data.name as string) || "";
        if (name) {
          index[normKey(name)] = {
            name,
            email: (data.email as string) || undefined,
          };
        }
      });
      setSupplierIndex(index);
    });
    return () => unsub();
  }, []);

  const groups = useMemo<Group[]>(() => {
    const real = new Map<string, Group>();
    const noSupplier: ReorderItem[] = [];

    for (const p of products) {
      const total = (Number(p.front) || 0) + (Number(p.back) || 0);
      if (total > lowStock) continue;
      const raw = (p.supplier || "").trim();

      if (raw) {
        const key = normKey(raw);
        const known = supplierIndex[key];
        const display = known?.name || raw;
        if (!real.has(key)) {
          real.set(key, {
            display,
            email: known?.email,
            hasSupplier: true,
            list: [],
          });
        }
        real.get(key)!.list.push({
          supplier: display,
          category: p.category,
          flavor: p.flavor,
          barcode: p.barcode,
          current: total,
        });
      } else {
        noSupplier.push({
          supplier: NO_SUPPLIER_LABEL,
          category: p.category,
          flavor: p.flavor,
          barcode: p.barcode,
          current: total,
        });
      }
    }

    const sortList = (list: ReorderItem[]) =>
      list.sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.flavor.localeCompare(b.flavor)
      );

    const entries = Array.from(real.values())
      .map((g) => ({ ...g, list: sortList(g.list) }))
      .sort((a, b) => a.display.localeCompare(b.display));

    // The no-supplier bucket is kept out of the keyed map entirely, so it can
    // never collide with a real supplier literally named "No supplier".
    if (noSupplier.length) {
      entries.push({
        display: NO_SUPPLIER_LABEL,
        email: undefined,
        hasSupplier: false,
        list: sortList(noSupplier),
      });
    }
    return entries;
  }, [products, lowStock, supplierIndex]);

  const totalItems = groups.reduce((n, g) => n + g.list.length, 0);

  if (loading) return <p className="loading">Loading…</p>;
  if (!isAuthenticated) return null;

  const handleExport = () => {
    if (totalItems === 0) {
      toast.error("Nothing to reorder.");
      return;
    }
    const all = groups.flatMap((g) => g.list);
    downloadCSV("purchase-order.csv", reorderToCSV(all));
    toast.success(`Exported ${totalItems} rows`);
  };

  // Build a mailto: link, encoding the address and capping the body length so
  // large orders don't get silently truncated by the mail client.
  const mailtoFor = (g: Group): string | null => {
    if (!g.hasSupplier || !g.email) return null;
    const allLines = g.list.map(
      (i) => `- ${i.flavor} (${i.category}) — currently ${i.current}`
    );
    const build = (lines: string[], omitted: number) => {
      const note =
        omitted > 0 ? `\n…and ${omitted} more — see the exported CSV.` : "";
      const body = `Hello ${g.display},\n\nWe'd like to reorder the following:\n\n${lines.join(
        "\n"
      )}${note}\n\nThank you.`;
      return `mailto:${encodeURIComponent(g.email!)}?subject=${encodeURIComponent(
        "Purchase order"
      )}&body=${encodeURIComponent(body)}`;
    };
    let lines = allLines;
    let url = build(lines, 0);
    while (url.length > MAILTO_MAX && lines.length > 1) {
      lines = lines.slice(0, -1);
      url = build(lines, allLines.length - lines.length);
    }
    return url;
  };

  return (
    <Layout>
      <Head>
        <title>Reorder – {appConfig.appName}</title>
      </Head>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <h1 className={styles.title}>Reorder</h1>
          <button
            className={styles.exportBtn}
            onClick={handleExport}
            disabled={totalItems === 0}
          >
            ⬇ Export purchase order
          </button>
        </div>
        <p className={styles.subtitle}>
          {totalItems} {appConfig.labels.itemPlural.toLowerCase()} at or below the
          low-stock threshold ({lowStock}), grouped by supplier.
        </p>

        {totalItems === 0 ? (
          <div className={styles.empty}>Everything is well stocked. 🎉</div>
        ) : (
          groups.map((g) => {
            const mailto = mailtoFor(g);
            return (
              <div key={g.display} className={styles.group}>
                <div className={styles.groupHead}>
                  <span className={styles.groupName}>{g.display}</span>
                  <span className={styles.groupCount}>
                    {g.list.length} to order
                  </span>
                  {mailto && (
                    <a className={styles.emailLink} href={mailto}>
                      ✉ Email order
                    </a>
                  )}
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{appConfig.labels.item}</th>
                      <th>{appConfig.labels.category}</th>
                      <th>Barcode</th>
                      <th>Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.list.map((i, idx) => (
                      <tr key={i.flavor + idx}>
                        <td>{i.flavor}</td>
                        <td>{i.category}</td>
                        <td>{i.barcode || "—"}</td>
                        <td
                          className={`${styles.qty} ${
                            i.current === 0 ? styles.out : styles.low
                          }`}
                        >
                          {i.current === 0 ? "Out" : i.current}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}
