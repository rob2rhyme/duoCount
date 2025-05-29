// src/pages/index.tsx
import { useEffect, useState, useRef, FormEvent, CSSProperties } from "react";
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

const Home = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [productsByCategory, setProductsByCategory] = useState<
    Record<string, Product[]>
  >({});
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [filter, setFilter] = useState("All");

  const { isAuthenticated, signOut } = useAuth();

  // Shared button style
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

  // JSON Import
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      alert("Invalid file type. Please select a .json file.");
      e.target.value = "";
      return;
    }

    let json: ProductCategory;
    try {
      const text = await file.text();
      json = JSON.parse(text) as ProductCategory;
    } catch {
      alert("Failed to parse JSON. Make sure the file is valid JSON.");
      e.target.value = "";
      return;
    }

    if (typeof json.name !== "string" || !Array.isArray(json.products)) {
      alert(
        "Invalid JSON shape. Expected:\n" +
          "{ name: string; products: Product[] }"
      );
      e.target.value = "";
      return;
    }

    if (productsByCategory[json.name]) {
      alert(`Category "${json.name}" already exists.`);
      e.target.value = "";
      return;
    }

    try {
      const batch = writeBatch(db);
      const categoryRef = doc(db, "categories", json.name);
      batch.set(categoryRef, { name: json.name });

      const productsCol = collection(db, "products");
      json.products.forEach((p) => {
        const pRef = doc(productsCol);
        batch.set(pRef, { ...p, category: json.name });
      });

      await batch.commit();
      alert(`Category "${json.name}" imported successfully.`);
    } catch (err) {
      console.error(err);
      alert("Firestore write failed. Check console for details.");
    } finally {
      e.target.value = "";
    }
  };

  // Firestore listener
  useEffect(() => {
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
  }, []);

  const categories = Object.keys(productsByCategory).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  return (
    <Layout>
      <Head>
        <title>Smokers Haven Inventory</title>
      </Head>

      {/* … all your existing JSX for buttons, search, tabs, etc. … */}

      <style jsx>{`
        /* … your existing styles … */
      `}</style>
    </Layout>
  );
};

export default Home;
