// pages/index.tsx
import { useEffect, useState, useRef, CSSProperties } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import TabPanel from "@/components/TabPanel";
import { Product } from "@/types";
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
    if (confirm("Confirm sign out?")) {
      signOut();
      router.push("/login");
    }
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

  // ─── JSON Import with Validation ─────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      alert("Invalid file type. Please select a .json file.");
      e.target.value = "";
      return;
    }

    let json: { name: string; products: Product[] };
    try {
      const text = await file.text();
      json = JSON.parse(text);
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
  // ────────────────────────────────────────────────────────────

  // Firestore listener
  useEffect(() => {
    const productsCol = collection(db, "products");
    const unsub = onSnapshot(productsCol, (snap) => {
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
      setActiveTab((prev) =>
        prev && grouped[prev] ? prev : Object.keys(grouped)[0] || ""
      );
    });
    return () => unsub();
  }, []);

  const categories = Object.keys(productsByCategory).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  return (
    <Layout>
      <Head>
        <title>Smokers Haven Inventory</title>
      </Head>

      <div className="controls">
        <div className="buttonRow">
          {isAuthenticated && (
            <button
              onClick={() => setIsModalOpen(true)}
              style={{ ...ACTION_BTN, background: "#38a169", color: "white" }}
            >
              + Add Product
            </button>
          )}
          <button
            className="import-btn"
            onClick={handleImportClick}
            style={{ ...ACTION_BTN, background: "#3182ce", color: "white" }}
          >
            Import New Vape Data
          </button>
          {isAuthenticated && (
            <button
              onClick={handleSignOut}
              style={{ ...ACTION_BTN, background: "#4a5568", color: "white" }}
            >
              Sign Out
            </button>
          )}
        </div>

        <div className="searchRow">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search flavor..."
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>All</option>
            <option>Need to Order</option>
            <option>Good</option>
            <option>Expiry n/a</option>
            <option>Expiring Soon</option>
          </select>
          <button
            onClick={handleClear}
            style={{ ...ACTION_BTN, background: "red", color: "white" }}
          >
            Clear
          </button>
        </div>

        <input
          type="file"
          accept=".json"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {isAuthenticated && (
          <AddProductModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
          />
        )}
      </div>

      <div className="tabs-container">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={activeTab === cat ? "active-tab" : ""}
            style={ACTION_BTN}
          >
            {cat}
          </button>
        ))}
      </div>

      {activeTab && productsByCategory[activeTab] && (
        <TabPanel
          products={productsByCategory[activeTab]}
          searchTerm={searchTerm}
          filterOption={filter}
        />
      )}

      <style jsx>{`
        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
          justify-content: space-between;
        }
        .buttonRow {
          display: flex;
          gap: 0.5rem;
          width: 100%;
        }
        .buttonRow > button {
          flex: 1 1 0;
        }
        .import-btn {
          display: none;
        }
        @media (min-width: 768px) {
          .import-btn {
            display: inline-flex;
          }
        }
        .searchRow {
          display: flex;
          gap: 0.5rem;
          width: 100%;
        }
        .tabs-container {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          margin-bottom: 0.25rem;
        }
        .tabs-container button {
          white-space: nowrap;
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          background: #ccc;
        }
        .tabs-container button.active-tab {
          background: #3182ce;
          color: white;
        }
      `}</style>
    </Layout>
  );
}
