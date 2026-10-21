const fs = require("fs");
const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

function credential() {
  const file = path.join(__dirname, "serviceAccountKey.json");
  if (fs.existsSync(file)) return cert(JSON.parse(fs.readFileSync(file, "utf8")));
  return cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  });
}

if (!getApps().length) initializeApp({ credential: credential() });

module.exports = { auth: getAuth(), db: getFirestore() };