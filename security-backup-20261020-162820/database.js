const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("./firebase");

const userRef = (uid) => db.collection("users").doc(uid);

async function getUser(uid) {
  const snap = await userRef(uid).get();
  return snap.exists ? snap.data() : {};
}
async function saveUser(uid, data) {
  await userRef(uid).set(data, { merge: true });
}
async function removeField(uid, field) {
  await userRef(uid).set({ [field]: FieldValue.delete() }, { merge: true });
}
async function saveState(state, data) {
  await db.collection("oauthStates").doc(state).set({ ...data, createdAt: Date.now() });
}
async function takeState(state) {
  const ref = db.collection("oauthStates").doc(String(state));
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.delete();
  const data = snap.data();
  return Date.now() - data.createdAt > 10 * 60 * 1000 ? null : data;
}

module.exports = { getUser, saveUser, removeField, saveState, takeState };