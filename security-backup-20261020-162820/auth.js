const router = require("express").Router();
const { auth } = require("./firebase");
const { getUser } = require("./database");

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Not signed in" });
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
}

router.get("/status", requireAuth, async (req, res) => {
  const u = await getUser(req.uid);
  res.json({
    github: !!u.github?.token,
    githubLogin: u.github?.login || null,
    vercel: !!u.vercel?.token,
  });
});

module.exports = { router, requireAuth };