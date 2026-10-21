const fs = require("fs");
const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

function loadKey() {
  if (process.env.FIREBASE_KEY_B64) {
    return JSON.parse(Buffer.from(process.env.FIREBASE_KEY_B64, "base64").toString("utf8"));
  }
  const file = path.join(__dirname, "serviceAccountKey.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/^"|"$/g, "").replace(/\\n/g, "\n"),
  };
}

try {
  if (!getApps().length) initializeApp({ credential: cert(loadKey()) });
} catch (e) {
  console.error("Firebase credentials problem:", e.message);
  process.exit(1);
}

module.exports = { auth: getAuth(), db: getFirestore() };