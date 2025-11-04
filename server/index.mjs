import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// --- static site (Home, Disclaimer, CSS) ---
const PUB = path.join(__dirname, "..", "public");
app.use(express.static(PUB));
app.get("/",          (req,res)=>res.sendFile(path.join(PUB, "index.html")));
app.get("/home",      (req,res)=>res.redirect("/"));
app.get("/disclaimer",(req,res)=>res.sendFile(path.join(PUB, "disclaimer.html")));

// --- helpers ---
function pickPython() {
  // prefer pythonw to avoid console popups; fallback to python
  return process.env.PYTHON || "pythonw";
}

function runChain(symbol, limit) {
  return new Promise((resolve, reject) => {
    const py = pickPython();
    const args = [path.join(__dirname, "yf_chain.py"), symbol.toUpperCase(), String(limit)];
    const child = execFile(py, args, { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      try {
        const json = JSON.parse(stdout.toString("utf8"));
        resolve(json);
      } catch (e) {
        reject(new Error("JSON parse failed: " + e.message + " | stdout=" + stdout));
      }
    });
  });
}

// --- routes ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true, python: pickPython(), port: PORT, index: __filename });
});

app.get("/api/grid", async (req, res) => {
  try {
    const ticker = (req.query.ticker || "AAPL").toString().toUpperCase();
    const limit  = Number(req.query.limit || 3);
    const data   = await runChain(ticker, limit);
    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("[HeatSeeker] API up on http://localhost:" + PORT);
});
