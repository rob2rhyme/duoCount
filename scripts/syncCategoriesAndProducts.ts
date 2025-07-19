// scripts/syncCategoriesAndProducts.ts

import { db } from "./firebaseAdmin";

// your full CATEGORY_META mapping…
const CATEGORY_META: Record<string, { filterType: string; imageUrl: string }> = {
  "Cali 20K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/Cali%2020K.png?alt=media&token=eb6a2d6f-56be-471f-bf12-6c0da33f26e4" },
  "Cali 8k":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/CALI-8K.png?alt=media&token=f7c444e0-6d4d-4c33-97f7-c0ce17754970" },
  "Foger Pod 30K":    { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/FOGER-POD-ONLY.png?alt=media&token=9c31859d-63db-44d3-84b2-1fb84bb1c4b7" },
  "Foger With Kit 30K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/FOGER-KIT.png?alt=media&token=c6509af0-3b6b-4fc6-b6d3-6b8bfec312e1" },
  "GeekBar 15K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/Geekbar%2015K.png?alt=media&token=d297022b-e1f3-4949-b561-1320ba2c7506" },
  "GeekBar 25K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/GEEKBAR%20PULSEX.png?alt=media&token=9272e186-7def-48a4-a666-dc7a4ba41f82" },
  "Lost Mary 20K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/LostMary.png?alt=media&token=84fd8cf9-19cd-409d-a0b1-ca83c1fd7428" },
  "North Vision 15K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/NorthVision.png?alt=media&token=5a024041-8d91-47d8-a4ef-2c226c82fcf5" },
  "Off-Stamp Kit 25K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/OffStamp%20Kit.png?alt=media&token=0cbc266a-33e1-4116-a80d-47fc958eac11" },
  "OffStamp Pod 25K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/offStamp-Pod.png?alt=media&token=b06d5201-f394-4af4-96f3-31122a48c6a0" },
  "Pillow Talk 40K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/PillowTalk-Ice-Controll.png?alt=media&token=b08852b7-e3c1-4fd5-ad64-e0a884d752e3" },
  "RL Classic 35K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/RL%20CLASSIC.png?alt=media&token=6d420c50-ae03-481a-ad97-6dac4fc17743" },
  "Rama 16K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/RAMA.png?alt=media&token=2643d08a-f8f1-4a3c-84f4-e78dbc9c442a" },
  "Razz 25K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/RAZ%2025K.png?alt=media&token=e1996523-d29c-46ac-94da-406a247e1bc9" },
  "Viho 20K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/VIHO.png?alt=media&token=21afa214-e509-4389-8acf-7bbc4cec3b80" },
  "Yovo 18K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/YOVO%2018K.png?alt=media&token=14ba56aa-2a94-4090-a878-9420cd42dde1" },
  "Yovo 8K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/YOVO%208K.png?alt=media&token=ecaab93a-ad65-4949-91d6-3fd4f01e29b9" },
  "Elfbar BC5k":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/elfbar.png?alt=media&token=880046c4-ff66-46f5-9bc0-903ab79f013f" },
  "Swft Icon7K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/swft.png?alt=media&token=f1b1047e-53fb-474b-8966-4717b524725b" },
  "Cigarettes":        { filterType: "Cigarettes",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/Cigrettes.png?alt=media&token=bde6120d-4820-4c2d-9034-f626748c3e41" },
  "SWFT-Icon":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/swft.png?alt=media&token=f1b1047e-53fb-474b-8966-4717b524725b" },
  "FASTA Burst-35K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/Fasta%20burst.png?alt=media&token=d38764ad-60f6-400f-a1b7-e1dd13a7822d" },
  "ELFBAR-BC5K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/elfbar.png?alt=media&token=880046c4-ff66-46f5-9bc0-903ab79f013f" },
  "FRIOBAR-10K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/Friobar.png?alt=media&token=dbc0c823-8b0b-4677-91f9-28c3a40bcd56" },
  "DRAGBAR-3500":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/Dragbar.png?alt=media&token=f9e105c7-1f10-4f47-bc26-a8f5dee8d1af" },
  "Pyne Pod":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/pynePod.png?alt=media&token=ef6e4ff3-3661-4a6d-9a52-7b72bd0a33dc" },
  "Volf Bar DTL-15K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/Volf%20Bar.png?alt=media&token=9951cfb9-f42f-4563-8ce8-205f1e8ea6e2" },
  "Juicy Bar 5k":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/Juicy%20Bar.png?alt=media&token=31e20720-d8d6-4a63-9f27-6089d9aaca02" },
  "RiA NV30k":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/RIA.png?alt=media&token=3264f66c-c2f5-441d-b3e5-01c9aa94427a" },
  "Zero Bar Exotic":        { filterType: "0% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/ZEROBAR.png?alt=media&token=19fa683d-414d-4d00-984e-9bf5c8c74d6a" },
  "Volf Bar 20K":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/VOLFBAR%2020K.png?alt=media&token=ea37e588-0bf3-4e54-af40-ebc887c1cea0" },
  "Fiji Bar Zero":        { filterType: "0% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/30.png?alt=media&token=80596982-adba-4fc0-8e17-f6a227943c29" },
  "LostVape Orion Bar":        { filterType: "5% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/IONBAR.png?alt=media&token=afe0011e-4838-4620-b11a-4e12179302ac" },
  "Zero Geek Bar 15K":        { filterType: "0% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/GEEKBAR%20ZERO.png?alt=media&token=50313b2c-e3c2-4d4c-82fb-290b8f43a3b7" },
  "Zero Raz LTX-25k":        { filterType: "0% Nic",         imageUrl: "https://firebasestorage.googleapis.com/v0/b/smokers-haven-inventory.firebasestorage.app/o/RAZ%2025K.png?alt=media&token=e1996523-d29c-46ac-94da-406a247e1bc9" },
  // …all your other categories…
  // …all the rest…
};

async function run() {
  console.log("➡️  Syncing categories collection...");
  const prodSnap   = await db.collection("products").get();
  const uniqueCats = new Set<string>();

  prodSnap.forEach(doc => {
    const cat = (doc.data().category as string)?.trim() || "";
    if (cat) uniqueCats.add(cat);
  });

  for (const name of uniqueCats) {
    const meta = CATEGORY_META[name] || {
      filterType: "All",
      imageUrl:   "/images/fallback.jpg",
    };
    await db.collection("categories").doc(name).set({
      name,
      filterType: meta.filterType,
      imageUrl:   meta.imageUrl,
    });
    console.log(`  • Category "${name}" set`);
  }

  console.log("➡️  Backfilling products...");
  const batch = db.batch();

  prodSnap.docs.forEach(doc => {
    const cat = (doc.data().category as string)?.trim() || "";
    if (!cat) return;
    const meta = CATEGORY_META[cat] || {
      filterType: "All",
      imageUrl:   "/images/fallback.jpg",
    };
    batch.update(doc.ref, {
      filterType:       meta.filterType,
      categoryImageUrl: meta.imageUrl,
    });
  });

  await batch.commit();
  console.log("✅ All products backfilled with filterType & categoryImageUrl");
}

run().catch(err => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
