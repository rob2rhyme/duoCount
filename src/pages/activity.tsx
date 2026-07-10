// src/pages/activity.tsx
import { useEffect, useState } from "react";
import Head from "next/head";
import Layout from "@/components/Layout";
import styles from "@/styles/Activity.module.css";
import { useAuth } from "@/context/AuthContext";
import { appConfig } from "@/config/app.config";
import { db } from "@/utils/firebase";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

interface Entry {
  id: string;
  action: "add" | "edit" | "delete" | "import";
  item: string;
  category?: string | null;
  detail?: string | null;
  actorRole?: string | null;
  at?: { toDate: () => Date } | null;
}

function timeAgo(date?: Date): string {
  if (!date) return "just now";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return date.toLocaleDateString();
}

export default function ActivityPage() {
  const { loading, isAuthenticated, can } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);

  const allowed = can("manageUsers");

  useEffect(() => {
    if (!allowed) return;
    const q = query(
      collection(db, "activityLog"),
      orderBy("at", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntries(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Entry, "id">) }))
      );
    });
    return () => unsub();
  }, [allowed]);

  if (loading) return <p className="loading">Loading…</p>;
  if (!isAuthenticated) return null;

  return (
    <Layout>
      <Head>
        <title>Activity – {appConfig.appName}</title>
      </Head>
      <div className={styles.wrap}>
        <h1 className={styles.title}>Activity</h1>
        <p className={styles.subtitle}>
          Recent changes to your inventory (latest 100).
        </p>

        {!allowed ? (
          <p className={styles.empty}>
            You don’t have access to the activity log.
          </p>
        ) : entries.length === 0 ? (
          <p className={styles.empty}>No activity recorded yet.</p>
        ) : (
          <div className={styles.list}>
            {entries.map((e) => (
              <div key={e.id} className={styles.item}>
                <span className={`${styles.badge} ${styles[e.action]}`}>
                  {e.action}
                </span>
                <div className={styles.body}>
                  <div className={styles.itemName}>{e.item}</div>
                  <div className={styles.detail}>
                    {[e.category, e.detail].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className={styles.meta}>
                  <div>{timeAgo(e.at?.toDate())}</div>
                  {e.actorRole && (
                    <div className={styles.actor}>{e.actorRole}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
