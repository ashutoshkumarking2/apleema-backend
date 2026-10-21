require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authModule = require("./auth");
const github = require("./github");
const vercel = require("./vercel");
const domains = require("./domains");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

app.get("/", (_req, res) => res.json({ ok: true, name: "Apleema API" }));
app.use("/api", authModule.router);
app.use("/api/github", github);
app.use("/api/vercel", vercel.router);
app.use("/api/domains", domains);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Apleema API running on port ${PORT}`));