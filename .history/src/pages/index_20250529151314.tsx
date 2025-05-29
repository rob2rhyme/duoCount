// src/pages/index.tsx
import { useEffect, useState, useRef, CSSProperties } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import TabPanel from "@/components/TabPanel";
import { Product, ProductCategory } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/utils/firebase";
import {
  collection,
  writeBatch,
  doc,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import AddProductModal from "@/components/AddProductModal";

export default function Home() {
  const { isAuthenticated, loading, signOut } = useAuth();
  const router = useRouter();

  // If we’re still checking auth, show nothing (or a spinner)
  if (loading) {
    return <p style={{ textAlign: "center", padding: "2rem" }}>Loading…</p>;
  }
  // If we’re *sure* they’re not logged in (this is just a fallback—
  // _app’s RequireAuth should have redirected already)
  if (!isAuthenticated) {
    router.replace("/login?next=/");
    return null;
  }

  // Now that we’re authenticated, we can safely read/write Firestore
  const [productsByCategory, setProductsByCategory] = useState<
    Record<string, Product[]>
  >({});
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [filter, setFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Firestore listener
  useEffect(() => {
    const productsCol = collection(db, "products");
    const unsubscribe = onSnapshot(productsCol, (snapshot) => {
      const grouped: Record<string, Product[]> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data() as Product & { category?: string };
        const cat = data.category || "Uncategorized";
        grouped[cat] = grouped[cat] || [];
        grouped[cat].push({
          id: d.id,
          category: cat,
          flavor: data.flavor,
          store: data.store,
          home: data.home,
          expiryDate: data.expiryDate,
        });
      });
      setProductsByCategory(grouped);
      setActiveTab((prev) =>
        prev && grouped[prev] ? prev : Object.keys(grouped)[0] || ""
      );
    });
    return () => unsubscribe();
  }, []);

  // … the rest of your handlers (import, clear, add‐product modal) …

  const ACTION_BTN: CSSProperties = {
    padding: "0.75rem",
    border: "none",
    borderRadius: "25px",
    cursor: "pointer",
    fontWeight: 900,
    textAlign: "center",
  };

  const handleSignOut = () => {
    if (confirm("Confirm sign out?")) signOut();
  };
  const handleClear = () => {
    setSearchTerm("");
    setFilter("All");
  };
  const handleImportClick = () => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    fileInputRef.current?.click();
  };
  const handleFileChange = /* … your existing import code … */;

  const categories = Object.keys(productsByCategory).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  return (
    <Layout>
      <Head>
        <title>Smokers Haven Inventory</title>
      </Head>

      {/* … your JSX for +Add, Import, Sign Out, Search, Tabs, TabPanel … */}

    </Layout>
  );
}
