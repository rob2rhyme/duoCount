// updatePinValidity.js
const admin = require("firebase-admin");

// 🔐 Load service account credentials
const serviceAccount = require("./serviceAccountKey.json");

// 🔗 Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function updatePinValidity() {
  const now = admin.firestore.Timestamp.now();
  const validUntil = admin.firestore.Timestamp.fromMillis(now.toMillis() + 60 * 1000); // +1 minute

  await db.collection("pinAuth").doc("userPin").set(
    {
      isValid: true,
      validUntil: validUntil,
    },
    { merge: true }
  );

  console.log("✅ PIN updated. Valid until:", validUntil.toDate().toLocaleString());
  process.exit(0);
}

updatePinValidity().catch((err) => {
  console.error("❌ Failed to update PIN:", err);
  process.exit(1);
});
