const router = require("express").Router();
const crypto = require("crypto");
const { auth } = require("./firebase");
const { requireAuth } = require("./auth");
const { getUser, saveUser, removeField, saveState, takeState } = require("./database");

const authUrl = (state) =>
  `https://vercel.com/integrations/${process.env.VERCEL_INTEGRATION_SLUG}/new?state=${state}`;

async function vfetch(uid, path, options = {}) {
  const { vercel } = await getUser(uid);
  if (!vercel?.token) {
    const err = new Error("Vercel is not connected");
    err.status = 400;
    throw err;
  }
  const url = new URL(`https://api.vercel.com${path}`);
  const teamId = vercel.teamId || process.env.VERCEL_TEAM_ID;
  if (teamId) url.searchParams.set("teamId", teamId);
  const r = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${vercel.token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error?.message || "Vercel request failed");
    err.status = r.status === 401 ? 400 : r.status;
    throw err;
  }
  return data;
}

const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });

// Connect (logged-in user)
router.post("/start", requireAuth, async (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  await saveState(state, { mode: "connect", uid: req.uid });
  res.json({ url: authUrl(state) });
});

// Continue with Vercel (login page)
router.get("/login", async (_req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  await saveState(state, { mode: "login" });
  res.redirect(authUrl(state));
});

// Vercel redirects here
router.get("/callback", async (req, res) => {
  const front = process.env.FRONTEND_URL;
  let mode = "connect";
  try {
    const { code, state } = req.query;
    const s = await takeState(state);
    if (!s) throw new Error("Invalid or expired login. Please try again.");
    mode = s.mode;

    const r = await fetch("https://api.vercel.com/v2/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.VERCEL_CLIENT_ID,
        client_secret: process.env.VERCEL_CLIENT_SECRET,
        code: String(code),
        redirect_uri: `${process.env.BACKEND_URL}/api/vercel/callback`,
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || "Vercel token exchange failed");

    const vercel = { token: d.access_token, teamId: d.team_id || null, userId: d.user_id };

    if (s.mode === "login") {
      const uid = `vercel_${d.user_id}`;
      await saveUser(uid, { vercel });
      const token = await auth.createCustomToken(uid);
      return res.redirect(`${front}/login?token=${token}`);
    }
    await saveUser(s.uid, { vercel });
    res.redirect(`${front}/connect?vercel=ok`);
  } catch (e) {
    const page = mode === "login" ? "login" : "connect";
    res.redirect(`${front}/${page}?error=${encodeURIComponent(e.message)}`);
  }
});

router.get("/projects", requireAuth, async (req, res) => {
  try {
    const d = await vfetch(req.uid, "/v9/projects?limit=100");
    res.json(
      d.projects.map((p) => ({
        id: p.id,
        name: p.name,
        repo: p.link ? `${p.link.org}/${p.link.repo}` : null,
        url:
          p.targets?.production?.alias?.[0] ||
          p.latestDeployments?.[0]?.alias?.[0] ||
          p.latestDeployments?.[0]?.url ||
          null,
      }))
    );
  } catch (e) {
    fail(res, e);
  }
});

router.post("/deploy", requireAuth, async (req, res) => {
  try {
    const { repo, repoId, branch, name } = req.body;
    if (!repo || !repoId || !name)
      return res.status(400).json({ error: "repo, repoId and name are required" });

    let project;
    try {
      project = await vfetch(req.uid, "/v11/projects", {
        method: "POST",
        body: JSON.stringify({ name, gitRepository: { type: "github", repo } }),
      });
    } catch (e) {
      if (e.status !== 409) throw e;
      project = await vfetch(req.uid, `/v9/projects/${encodeURIComponent(name)}`);
    }

    const dep = await vfetch(req.uid, "/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1", {
      method: "POST",
      body: JSON.stringify({
        name,
        project: project.name,
        target: "production",
        projectSettings: {},
        gitSource: { type: "github", repoId: Number(repoId), ref: branch || "main" },
      }),
    });
    res.json({ projectId: project.id, projectName: project.name, url: dep.url, state: dep.readyState });
  } catch (e) {
    fail(res, e);
  }
});

router.delete("/", requireAuth, async (req, res) => {
  await removeField(req.uid, "vercel");
  res.json({ ok: true });
});

module.exports = { router, vfetch };