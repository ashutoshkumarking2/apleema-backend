const router = require("express").Router();
const crypto = require("crypto");
const { auth } = require("./firebase");
const {
  getUser,
  saveDisconnectChallenge,
} = require("./database");

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Not signed in" });
    }

    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

router.get("/status", requireAuth, async (req, res) => {
  try {
    const u = await getUser(req.uid);
    res.json({
      github: !!u.github?.token,
      githubLogin: u.github?.login || null,
      vercel: !!u.vercel?.token,
    });
  } catch {
    res.status(500).json({ error: "Could not load account status" });
  }
});

router.post("/disconnect-challenge", requireAuth, async (req, res) => {
  try {
    const { provider } = req.body || {};

    if (!["github", "vercel"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    const user = await getUser(req.uid);

    if (!user[provider]?.token) {
      return res.status(400).json({
        error: `${provider} is not connected`,
      });
    }

    const challengeId = crypto.randomBytes(24).toString("hex");
    const code = String(crypto.randomInt(10000000, 100000000));
    const codeHash = crypto
      .createHash("sha256")
      .update(code)
      .digest("hex");

    await saveDisconnectChallenge({
      challengeId,
      uid: req.uid,
      provider,
      codeHash,
    });

    res.json({
      challengeId,
      code,
      expiresInSeconds: 300,
    });
  } catch {
    res.status(500).json({ error: "Could not start disconnect confirmation" });
  }
});

module.exports = { router, requireAuth };
