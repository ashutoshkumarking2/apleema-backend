const crypto = require("crypto");
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
  await db.collection("oauthStates").doc(state).set({
    ...data,
    createdAt: Date.now(),
  });
}

async function takeState(state) {
  const ref = db.collection("oauthStates").doc(String(state));
  const snap = await ref.get();
  if (!snap.exists) return null;

  await ref.delete();
  const data = snap.data();
  return Date.now() - data.createdAt > 10 * 60 * 1000 ? null : data;
}

async function saveDisconnectChallenge({
  challengeId,
  uid,
  provider,
  codeHash,
}) {
  await db.collection("disconnectChallenges").doc(challengeId).set({
    uid,
    provider,
    codeHash,
    attempts: 0,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

async function completeDisconnect({
  uid,
  provider,
  challengeId,
  code,
  reason,
  details,
}) {
  const challengeRef = db.collection("disconnectChallenges").doc(challengeId);
  const accountRef = userRef(uid);
  const logRef = db.collection("disconnectLogs").doc();

  const submittedHash = crypto
    .createHash("sha256")
    .update(String(code))
    .digest("hex");

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(challengeRef);

    if (!snap.exists) {
      return {
        ok: false,
        status: 410,
        error: "Challenge expired or already used. Start again.",
      };
    }

    const challenge = snap.data();

    if (
      challenge.uid !== uid ||
      challenge.provider !== provider
    ) {
      return {
        ok: false,
        status: 403,
        error: "Challenge does not match this account or provider.",
      };
    }

    if (
      !challenge.expiresAt ||
      Date.now() > challenge.expiresAt
    ) {
      tx.delete(challengeRef);
      return {
        ok: false,
        status: 410,
        error: "Code expired. Start again.",
      };
    }

    if ((challenge.attempts || 0) >= 5) {
      tx.delete(challengeRef);
      return {
        ok: false,
        status: 429,
        error: "Too many incorrect attempts. Start again.",
      };
    }

    const storedHash = String(challenge.codeHash || "");
    const hashesMatch =
      /^[a-f0-9]{64}$/i.test(storedHash) &&
      crypto.timingSafeEqual(
        Buffer.from(storedHash, "hex"),
        Buffer.from(submittedHash, "hex")
      );

    if (!hashesMatch) {
      const attempts = (challenge.attempts || 0) + 1;

      if (attempts >= 5) {
        tx.delete(challengeRef);
      } else {
        tx.update(challengeRef, { attempts });
      }

      return {
        ok: false,
        status: attempts >= 5 ? 429 : 400,
        error:
          attempts >= 5
            ? "Too many incorrect attempts. Start again."
            : `Incorrect code. ${5 - attempts} attempt(s) remaining.`,
      };
    }

    // Consume the challenge and disconnect in the same transaction.
    tx.delete(challengeRef);
    tx.set(
      accountRef,
      { [provider]: FieldValue.delete() },
      { merge: true }
    );
    tx.set(logRef, {
      uid,
      provider,
      reason,
      details: details || "",
      createdAt: Date.now(),
    });

    return { ok: true };
  });
}

module.exports = {
  getUser,
  saveUser,
  removeField,
  saveState,
  takeState,
  saveDisconnectChallenge,
  completeDisconnect,
};
