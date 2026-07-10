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
import { appConfig } from "@/config/app.config";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/utils/firebase";
import { collection, onSnapshot } from "firebase/firestore";

export default function Home() {
  const { isAuthenticated, loading, can } = useAuth();
  const router = useRouter();

  const [productsByCategory, setProductsByCategory] = useState<
    Record<string, Product[]>
  >({});
  const [categoryMeta, setCategoryMeta] = useState<
    Array<{ name: string; imageUrl?: string; filterType: string }>
  >([]);

  const [categorySearch, setCategorySearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [flavorSearch, setFlavorSearch] = useState("");
  const [flavorFilter, setFlavorFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<ProductCategory | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const catUnsub = onSnapshot(collection(db, "categories"), (snap) => {
      setCategoryMeta(
        snap.docs.map((d) => ({
          name: d.data().name as string,
          imageUrl: d.data().imageUrl as string | undefined,
          filterType: d.data().filterType as string,
        }))
      );
    });

    const prodUnsub = onSnapshot(collection(db, "products"), (snap) => {
      const grouped: Record<string, Product[]> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        const cat = data.category || "Uncategorized";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({
          id: d.id,
          category: cat,
          flavor: String(data.flavor || ""),
          front: Number(data.front || 0),
          back: Number(data.back || 0),
          expiryDate: String(data.expiryDate || "n/a"),
        });
      });
      setProductsByCategory(grouped);
    });

    return () => {
      catUnsub();
      prodUnsub();
    };
  }, []);

  const handleClearCategory = () => {
    setCategorySearch("");
    setCategoryFilter("All");
  };
  const handleClearFlavor = () => {
    setFlavorSearch("");
    setFlavorFilter("All");
  };
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    // TODO: Implement import logic if needed
  };

  const categories: ProductCategory[] = categoryMeta
    .map((meta) => ({
      name: meta.name,
      imageUrl: meta.imageUrl,
      filterType: meta.filterType,
      products: productsByCategory[meta.name] || [],
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

  const visibleCategories = categories.filter((cat) => {
    const matchesSearch = cat.name
      .toLowerCase()
      .includes(categorySearch.toLowerCase());
    const matchesFilter =
      categoryFilter === "All" ? true : cat.filterType === categoryFilter;
    return matchesSearch && matchesFilter;
  });

  if (loading) return <p style={{ textAlign: "center" }}>Loading…</p>;
  if (!isAuthenticated) {
    router.replace("/login?next=/");
    return null;
  }

  const isGrid = !selectedCategory;

  return (
    <Layout>
      <Head>
        <title>{appConfig.appName}</title>
      </Head>

      <TopActions
        isDetail={!isGrid}
        canAdd={can("addProduct")}
        onBack={() => {
          setSelectedCategory(null);
          handleClearFlavor();
          handleClearCategory();
          router.replace(router.pathname, undefined, {
            shallow: true,
            scroll: true,
          });
        }}
        onAdd={() => setIsModalOpen(true)}
      />

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

      {isGrid ? (
        <CategoryGrid
          categories={visibleCategories}
          search={categorySearch}
          filter={categoryFilter}
          onSelect={(cat) => {
            setSelectedCategory(cat);
            setTimeout(() => {
              const HEADER_OFFSET = 70; // Change this if your header is taller/shorter
              window.scrollTo({ top: 0, behavior: "auto" });
              window.scrollBy({ top: -HEADER_OFFSET, behavior: "auto" });
            }, 0);
          }}
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
