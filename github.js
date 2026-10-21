const router = require("express").Router();
const { requireAuth } = require("./auth");
const { getUser, saveUser, completeDisconnect } = require("./database");

router.use(requireAuth);

async function gh(token, path) {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "apleema",
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || "GitHub request failed");
  return data;
}

router.post("/token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token missing" });
    const me = await gh(token, "/user");
    await saveUser(req.uid, { github: { token, login: me.login, avatar: me.avatar_url } });
    res.json({ ok: true, login: me.login });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/repos", async (req, res) => {
  try {
    const { github } = await getUser(req.uid);
    if (!github?.token) return res.status(400).json({ error: "GitHub is not connected" });
    const list = await gh(github.token, "/user/repos?per_page=100&sort=updated");
    res.json(
      list.map((r) => ({
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        branch: r.default_branch,
        description: r.description,
        language: r.language,
        updated_at: r.updated_at,
      }))
    );
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/", async (req, res) => {
  try {
    const { challengeId, code, reason, details } = req.body || {};
    const allowedReasons = [
      "different_account",
      "security_privacy",
      "not_working",
      "other",
    ];

    if (
      typeof challengeId !== "string" ||
      !/^[a-f0-9]{48}$/.test(challengeId) ||
      typeof code !== "string" ||
      !/^\d{8}$/.test(code) ||
      !allowedReasons.includes(reason) ||
      (details !== undefined &&
        (typeof details !== "string" || details.length > 500))
    ) {
      return res.status(400).json({
        error: "Valid challenge, code, and disconnect reason are required.",
      });
    }

    const result = await completeDisconnect({
      uid: req.uid,
      provider: "github",
      challengeId,
      code,
      reason,
      details: reason === "other" ? (details || "").trim() : "",
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "GitHub disconnect failed" });
  }
});

module.exports = router;
