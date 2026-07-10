// src/pages/dashboard.tsx
import Head from "next/head";
import Layout from "@/components/Layout";
import Dashboard from "@/components/dashboard/Dashboard";
import { useAuth } from "@/context/AuthContext";
import { appConfig } from "@/config/app.config";

export default function DashboardPage() {
  const { loading, isAuthenticated, can } = useAuth();

  if (loading) return <p style={{ textAlign: "center" }}>Loading…</p>;
  // Unauthenticated users are redirected to /login by RequireAuth in _app.
  if (!isAuthenticated) return null;

  return (
    <Layout>
      <Head>
        <title>Dashboard – {appConfig.appName}</title>
      </Head>
      {can("viewDashboard") ? (
        <Dashboard />
      ) : (
        <p style={{ textAlign: "center", padding: "2rem" }}>
          You don’t have access to the dashboard.
        </p>
      )}
    </Layout>
  );
}
