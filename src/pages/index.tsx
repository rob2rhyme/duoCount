// src/pages/index.tsx
import { useEffect, useState, useRef, ChangeEvent } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import TopActions from "@/components/TopActions";
import CategorySearch from "@/components/CategorySearch";
import FlavorSearch from "@/components/FlavorSearch";
import CategoryGrid from "@/components/CategoryGrid";
import TabPanel from "@/components/TabPanel";
import AddProductModal from "@/components/AddProductModal";
import { Product, ProductCategory } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/utils/firebase";
import { collection, onSnapshot, writeBatch, doc } from "firebase/firestore";

export default function Home() {
  const { isAuthenticated, loading, signOut } = useAuth();
  const router = useRouter();

  // Firestore state
  const [productsByCategory, setProductsByCategory] = useState<
    Record<string, Product[]>
  >({});
  const [categoryMeta, setCategoryMeta] = useState<
    { name: string; imageUrl?: string }[]
  >([]);

  // UI state
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [flavorSearch, setFlavorSearch] = useState("");
  const [flavorFilter, setFlavorFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<ProductCategory | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Firestore subscriptions
  useEffect(() => {
    const catUnsub = onSnapshot(collection(db, "categories"), (snap) => {
      setCategoryMeta(
        snap.docs.map((d) => ({
          name: d.data().name as string,
          imageUrl: d.data().imageUrl as string | undefined,
        }))
      );
    });

    const prodUnsub = onSnapshot(collection(db, "products"), (snap) => {
      const grouped: Record<string, Product[]> = {};
      snap.docs.forEach((d) => {
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
    });

    return () => {
      catUnsub();
      prodUnsub();
    };
  }, []);

  // Handlers
  const handleSignOut = () => {
    if (confirm("Confirm sign out?")) signOut();
  };
  const handleClearCategory = () => {
    setCategorySearch("");
    setCategoryFilter("All");
  };
  const handleClearFlavor = () => {
    setFlavorSearch("");
    setFlavorFilter("All");
  };
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    // … your existing JSON‐import logic …
  };

  // Build sorted categories array
  const categories: ProductCategory[] = categoryMeta
    .map((m) => ({
      name: m.name,
      imageUrl: m.imageUrl,
      products: productsByCategory[m.name] || [],
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

  // Auth guard
  if (loading) return <p style={{ textAlign: "center" }}>Loading…</p>;
  if (!isAuthenticated) {
    router.replace("/login?next=/");
    return null;
  }

  const isGrid = !selectedCategory;

  return (
    <Layout>
      <Head>
        <title>Smokers Haven Inventory</title>
      </Head>

      {/* Top bar: Back / Add / Sign Out */}
      <TopActions
        isDetail={!isGrid}
        onBack={() => {
          setSelectedCategory(null);
          handleClearFlavor();
          handleClearCategory();
        }}
        onAdd={() => setIsModalOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Grid‐mode search vs. Flavor‐mode search */}
      {isGrid ? (
        <CategorySearch
          search={categorySearch}
          filter={categoryFilter}
          onSearchChange={setCategorySearch}
          onFilterChange={setCategoryFilter}
          onClear={handleClearCategory}
        />
      ) : (
        <FlavorSearch
          search={flavorSearch}
          filter={flavorFilter}
          onSearchChange={setFlavorSearch}
          onFilterChange={setFlavorFilter}
          onClear={handleClearFlavor}
        />
      )}

      {/* Hidden file input + import modal */}
      <input
        type="file"
        accept=".json"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <AddProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Main content: CategoryGrid or TabPanel */}
      {isGrid ? (
        <CategoryGrid
          categories={categories}
          search={categorySearch}
          filter={categoryFilter}
          onSelect={setSelectedCategory}
        />
      ) : (
        <TabPanel
          products={selectedCategory!.products}
          searchTerm={flavorSearch}
          filterOption={flavorFilter}
        />
      )}
    </Layout>
  );
}
