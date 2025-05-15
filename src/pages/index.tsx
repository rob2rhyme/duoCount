// src/pages/index.tsx
import { useEffect, useState, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import TabPanel from "@/components/TabPanel";
import { Product, ProductCategory } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/utils/firebase";
import { collection, writeBatch, doc, onSnapshot } from "firebase/firestore";

const Home = () => {
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
    flex: "0 1 120px",
    padding: "0.5rem",
    border: "none",
    borderRadius: "25px",
    cursor: "pointer",
    fontWeight: 600,
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

  // ─── Enhanced validation + duplication check ───────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1️⃣ Check file type/extension
    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      alert("Invalid file type. Please select a .json file.");
      e.target.value = "";
      return;
    }

    // 2️⃣ Parse JSON
    let json: ProductCategory;
    try {
      const text = await file.text();
      json = JSON.parse(text) as ProductCategory;
    } catch {
      alert("Failed to parse JSON. Make sure the file is valid JSON.");
      e.target.value = "";
      return;
    }

    // 3️⃣ Validate shape
    if (typeof json.name !== "string" || !Array.isArray(json.products)) {
      alert(
        "Invalid JSON shape. Expected:\n" +
          "{ name: string; products: Product[] }"
      );
      e.target.value = "";
      return;
    }

    // 4️⃣ Duplication guard
    if (productsByCategory[json.name]) {
      alert(`Category "${json.name}" already exists.`);
      e.target.value = "";
      return;
    }

    // 5️⃣ Batch-write to Firestore
    try {
      const batch = writeBatch(db);

      // Category doc (optional; only if you use it elsewhere)
      const categoryRef = doc(db, "categories", json.name);
      batch.set(categoryRef, { name: json.name });

      // Products
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

  // Real-time listener for products
  useEffect(() => {
    const productsCol = collection(db, "products");
    const unsubscribe = onSnapshot(productsCol, (snapshot) => {
      const grouped: Record<string, Product[]> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data() as Product & { category?: string };
        const cat = data.category || "Uncategorized";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({
          id: d.id, // Assuming Firestore document ID is used as the product ID
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

        <button
          onClick={handleClear}
          style={{ ...ACTION_BTN, background: "red", color: "white" }}
        >
          Clear
        </button>

        {/* hidden file input */}
        <input
          type="file"
          accept=".json"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* only on desktop */}
        <button
          className="import-btn"
          onClick={handleImportClick}
          style={{ ...ACTION_BTN, background: "#3182ce", color: "white" }}
        >
          Import JSON
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
          flex-wrap: nowrap;
          gap: 0.5rem;
        }
        .tabs-scroll button {
          white-space: nowrap;
          padding: 0.5rem 1rem;
          background-color: #ccc;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: 500;
        }
        .tabs-scroll button:hover {
          background-color: #bbb;
        }
        .tabs-scroll button.active-tab {
          background-color: #3182ce;
          color: white;
        }
        .tab-content {
          margin-top: 0.25rem;
        }

        .import-btn {
          display: none;
        }
        @media (min-width: 768px) {
          .import-btn {
            display: inline-flex;
            justify-content: center;
            align-items: center;
          }
        }
      `}</style>
    </Layout>
  );
};

export default Home;
