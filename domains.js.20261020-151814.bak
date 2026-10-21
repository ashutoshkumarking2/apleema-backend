const router = require("express").Router();
const { requireAuth } = require("./auth");
const { vfetch } = require("./vercel");

router.use(requireAuth);

const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

// Search availability
router.get("/search", async (req, res) => {
  try {
    const name = String(req.query.name || "").trim().toLowerCase();
    if (!DOMAIN_RE.test(name)) return res.status(400).json({ error: "Enter a valid domain like example.com" });
    const s = await vfetch(req.uid, `/v4/domains/status?name=${name}`);
    let price = null;
    if (s.available) {
      const p = await vfetch(req.uid, `/v4/domains/price?name=${name}`).catch(() => null);
      price = p?.price ?? null;
    }
    res.json({ name, available: !!s.available, price });
  } catch (e) {
    fail(res, e);
  }
});

// All domains across projects
router.get("/", async (req, res) => {
  try {
    const { projects } = await vfetch(req.uid, "/v9/projects?limit=50");
    const lists = await Promise.all(
      projects.map(async (p) => {
        const d = await vfetch(req.uid, `/v9/projects/${p.id}/domains`).catch(() => ({ domains: [] }));
        return (d.domains || []).map((x) => ({
          name: x.name,
          verified: !!x.verified,
          projectId: p.id,
          projectName: p.name,
        }));
      })
    );
    res.json(lists.flat());
  } catch (e) {
    fail(res, e);
  }
});

// Add domain to project
router.post("/add", async (req, res) => {
  try {
    const { projectId, domain } = req.body;
    const name = String(domain || "").trim().toLowerCase();
    if (!projectId || !DOMAIN_RE.test(name)) return res.status(400).json({ error: "Valid project and domain required" });
    const d = await vfetch(req.uid, `/v10/projects/${projectId}/domains`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    res.json({ name: d.name, verified: !!d.verified });
  } catch (e) {
    fail(res, e);
  }
});

// Verify + DNS records
router.post("/verify", async (req, res) => {
  try {
    const { projectId, domain } = req.body;
    const verify = await vfetch(req.uid, `/v9/projects/${projectId}/domains/${domain}/verify`, {
      method: "POST",
    }).catch(() => ({ verified: false }));
    const cfg = await vfetch(req.uid, `/v6/domains/${domain}/config`).catch(() => ({ misconfigured: true }));
    const labels = domain.split(".");
    const records =
      labels.length === 2
        ? [{ type: "A", name: "@", value: "76.76.21.21" }]
        : [{ type: "CNAME", name: labels.slice(0, -2).join("."), value: "cname.vercel-dns.com" }];
    res.json({ verified: !!verify.verified, misconfigured: !!cfg.misconfigured, records });
  } catch (e) {
    fail(res, e);
  }
});

module.exports = router;