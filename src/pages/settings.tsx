// src/pages/settings.tsx
import Head from "next/head";
import Layout from "@/components/Layout";
import UserManagement from "@/components/UserManagement";
import styles from "@/styles/Settings.module.css";
import { useAuth } from "@/context/AuthContext";
import { useTheme, Theme } from "@/context/ThemeContext";
import { appConfig } from "@/config/app.config";
import { ROLE_LABELS } from "@/utils/permissions";
import toast from "react-hot-toast";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsPage() {
  const { loading, isAuthenticated, user, role, can } = useAuth();
  const { theme, setTheme } = useTheme();

  if (loading) return <p className="loading">Loading…</p>;
  if (!isAuthenticated) return null;

  const copyUid = async () => {
    if (!user?.uid) return;
    try {
      await navigator.clipboard.writeText(user.uid);
      toast.success("UID copied");
    } catch {
      toast.error("Couldn't copy — copy it manually.");
    }
  };

  return (
    <Layout>
      <Head>
        <title>Settings – {appConfig.appName}</title>
      </Head>
      <div className={styles.wrap}>
        <h1 className={styles.title}>Settings</h1>

        {/* Appearance */}
        <div className={styles.card}>
          <h2>Appearance</h2>
          <div className={styles.row}>
            <span className={styles.label}>Theme</span>
            <div className={styles.segment}>
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={theme === opt.value ? styles.segActive : ""}
                  onClick={() => setTheme(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Account */}
        <div className={styles.card}>
          <h2>Account</h2>
          <div className={styles.row}>
            <span className={styles.label}>Role</span>
            <span className={styles.value}>{role ? ROLE_LABELS[role] : "—"}</span>
          </div>
          {user?.phoneNumber && (
            <div className={styles.row}>
              <span className={styles.label}>Phone</span>
              <span className={styles.value}>{user.phoneNumber}</span>
            </div>
          )}
          <div className={styles.row}>
            <span className={styles.label}>User ID</span>
            <span className={`${styles.value} ${styles.mono}`}>
              {user?.uid}
            </span>
            <button className={styles.copyBtn} onClick={copyUid}>
              Copy
            </button>
          </div>
        </div>

        {/* User management (admin only) */}
        {can("manageUsers") && <UserManagement />}

        {/* About */}
        <div className={styles.card}>
          <h2>About</h2>
          <div className={styles.row}>
            <span className={styles.label}>App</span>
            <span className={styles.value}>{appConfig.appName}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Version</span>
            <span className={styles.value}>1.3.0</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
