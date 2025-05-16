// src/pages/index.tsx
import { useEffect, useState, useRef, FormEvent } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import TabPanel from "@/components/TabPanel";
import { Product, ProductCategory } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/utils/firebase";
import { collection, writeBatch, doc, onSnapshot } from "firebase/firestore";
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
  const ACTION_BTN: React.CSSProperties = {
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

  // ─── JSON Import with Validation ─────────────────────────
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
  // ────────────────────────────────────────────────────────────

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

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "1rem",
          justifyContent: "space-between",
        }}
      >
        {/* Search & Filter */}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search flavor..."
          style={{
            flex: "1 1 200px",
            minWidth: "0",
            padding: "0.5rem",
            border: "1px solid #ccc",
            borderRadius: "5px",
          }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            flex: "0 1 150px",
            padding: "0.5rem",
            border: "1px solid #ccc",
            borderRadius: "5px",
          }}
        >
          <option>All</option>
          <option>Need to Order</option>
          <option>Good</option>
          <option>Expiry n/a</option>
          <option>Expiring Soon</option>
        </select>

        {/* Equal-width button row */}
        <div className="buttonRow">
          <button
            onClick={handleClear}
            style={{ ...ACTION_BTN, background: "red", color: "white" }}
          >
            Clear
          </button>

          {isAuthenticated && (
            <button
              onClick={() => setIsModalOpen(true)}
              style={{ ...ACTION_BTN, background: "#38a169", color: "white" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "white";
                e.currentTarget.style.color = "#38a169";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#38a169";
                e.currentTarget.style.color = "white";
              }}
            >
              + Add Product
            </button>
          )}

          {isAuthenticated && (
            <button
              onClick={handleSignOut}
              style={{ ...ACTION_BTN, background: "#4a5568", color: "white" }}
            >
              Sign Out
            </button>
          )}

          {/* Import New Vape Data only on desktop */}
          <button
            className="import-btn"
            onClick={handleImportClick}
            style={{
              ...ACTION_BTN,
              background: "#3182ce",
              color: "white",
            }}
          >
            Import New Vape Data
          </button>
        </div>

        {/* hidden JSON import */}
        <input
          type="file"
          accept=".json"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* Add Product Modal */}
        {isAuthenticated && (
          <AddProductModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <div className="tabs-scroll">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={activeTab === cat ? "active-tab" : ""}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab && productsByCategory[activeTab] && (
          <TabPanel
            products={productsByCategory[activeTab]}
            searchTerm={searchTerm}
            filterOption={filter}
          />
        )}
      </div>

      <style jsx>{`
        .tabs-container {
          overflow-x: auto;
          margin-bottom: 0.25rem;
        }
        .tabs-scroll {
          display: flex;
          gap: 0.5rem;
        }
        .tabs-scroll button {
          white-space: nowrap;
          padding: 0.5rem 1rem;
          background: #ccc;
          border: none;
          border-radius: 5px;
          font-weight: 500;
          cursor: pointer;
        }
        .tabs-scroll button:hover {
          background: #bbb;
        }
        .tabs-scroll button.active-tab {
          background: #3182ce;
          color: white;
        }
        .tab-content {
          margin-top: 0.25rem;
        }

        /* Import button hidden on mobile, shown on desktop */
        .import-btn {
          display: none;
        }
        @media (min-width: 768px) {
          .import-btn {
            display: inline-flex;
          }
        }

        /* Equal-width, equal-height, evenly spaced */
        .buttonRow {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          width: 100%;
        }
        .buttonRow > button {
          flex: 1 1 0;
        }
      `}</style>
    </Layout>
  );
};

export default Home;
