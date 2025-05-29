// src/pages/index.tsx
import { useEffect, useState, useRef, CSSProperties } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import TabPanel from "@/components/TabPanel";
import { Product, ProductCategory } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/utils/firebase";
import { collection, writeBatch, doc, onSnapshot } from "firebase/firestore";
import AddProductModal from "@/components/AddProductModal";

export default function Home() {
  const { isAuthenticated, signOut } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [productsByCategory, setProductsByCategory] = useState<
    Record<string, Product[]>
  >({});
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [filter, setFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // redirect if somehow unauthenticated
  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  // Firestore listener (now that user is authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;
    const productsCol = collection(db, "products");
    const unsubscribe = onSnapshot(productsCol, (snapshot) => {
      const grouped: Record<string, Product[]> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data() as Product & { category?: string };
        const cat = data.category || "Uncategorized";
        if (!grouped[cat]) grouped[cat] = [];
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
  }, [isAuthenticated]);

  // …your import, search, filter, add‐product logic goes here unchanged…

  return (
    <Layout>
      <Head>
        <title>Smokers Haven Inventory</title>
      </Head>

      {/* ── your existing JSX for buttons, search, tabs, tab‐content, etc. ── */}
    </Layout>
  );
}
