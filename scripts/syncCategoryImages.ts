// scripts/syncCategoryImages.ts
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// 1) Initialize the Admin SDK
initializeApp({
  credential: cert(require("../serviceAccountKey.json")),
});
const db = getFirestore();

// 2) Define your category → imageUrl map
const mapping: Record<string, string> = {
  "Oxbar":           "https://firebasestorage.googleapis.com/v0/b/mymediastorage-e5bb2.appspot.com/o/SMOKERS%20HAVEN%20CATEGORY%20IMAGES%2FCALI-8K.png?alt=media&token=00f22242-d920-477f-8562-c1ff4f0492b3",
  "Pyne Pod 15K":    "https://firebasestorage.googleapis.com/v0/b/mymediastorage-e5bb2.appspot.com/o/SMOKERS%20HAVEN%20CATEGORY%20IMAGES%2FCali%2020K.png?alt=media&token=44fb779c-897d-4193-b8fb-be6b74bd3e08",
  "Sombar":          "https://firebasestorage.googleapis.com/v0/b/mymediastorage-e5bb2.appspot.com/o/SMOKERS%20HAVEN%20CATEGORY%20IMAGES%2FFOGER-KIT.png?alt=media&token=6e2177e8-1f9f-4cb7-9de5-93dd9fa22262",
  "Weirdo Bar":      "https://firebasestorage.googleapis.com/v0/b/mymediastorage-e5bb2.appspot.com/o/SMOKERS%20HAVEN%20CATEGORY%20IMAGES%2FFOGER-POD-ONLY.png?alt=media&token=01b12345-563c-4a67-8c2f-bf0e5976c107",
  // …and so on…
};

async function run() {
  // 3) Read all products
  const prodSnap = await db.collection("products").get();

  // 4) Build a set of unique category names
  const cats = new Set<string>();
  prodSnap.forEach(d => {
    const cat = (d.data().category as string) || "Uncategorized";
    cats.add(cat);
  });

  // 5a) OPTION A: Create a dedicated `categories` collection
  for (const name of cats) {
    const imageUrl = mapping[name] || "/images/fallback.jpg";
    await db.collection("categories").doc(name).set({ name, imageUrl });
    console.log(`✅ Created category doc for "${name}"`);
  }

  // 5b) OPTION B: Or, patch every product with the URL directly
  // // Uncomment to use:
  // for (const d of prodSnap.docs) {
  //   const cat = d.data().category as string;
  //   const imageUrl = mapping[cat] || "/images/fallback.jpg";
  //   await db.collection("products").doc(d.id).update({ categoryImageUrl: imageUrl });
  // }
}

run().catch(console.error);
