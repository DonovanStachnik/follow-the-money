import express from "express";
import cors from "cors";
import os from "node:os";

const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN || "";
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();
app.use(cors());
app.use(express.json());

// ---- helpers
async function jget(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} - ${url}\n${body}`);
  }
  return res.json();
}

// ---- data sources
async function finnhubQuote(symbol) {
  const b = "https://finnhub.io/api/v1";
  const q = await jget(`${b}/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_TOKEN}`);
  // map to yahoo-ish
  return {
    symbol,
    regularMarketPrice: q.c ?? 0,
    longName: symbol
  };
}

async function finnhubExpirations(symbol) {
  const b = "https://finnhub.io/api/v1";
  const data = await jget(`${b}/stock/option-chain?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_TOKEN}`);
  // Finnhub returns { data: [ {expirationDate: '2025-11-15', ...}, ...] }
  const dates = Array.from(new Set((data?.data ?? []).map(x => x.expirationDate))).sort();
  return dates;
}

// Finnhub doesn’t give a full bid/ask matrix in one shot, so we’ll stub an empty grid
async function finnhubGrid(symbol, limit = 4) {
  const expirations = (await finnhubExpirations(symbol)).slice(0, limit);
  return { symbol, expirations, perExpiry: expirations.map(date => ({ date, strikes: [], callMatrix: [], putMatrix: [], netMatrix: [] })) };
}

// Flow list is also not a 1:1 Finnhub endpoint without paid add-ons; keep the pane but it may be empty
async function finnhubFlow(symbol, limit = 60, expiries = 3) {
  return { symbol, totals: { callNotional: 0, putNotional: 0, pcr: 0 }, items: [] };
}

// ---- routes
app.get("/", (_req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, source: FINNHUB_TOKEN ? "finnhub" : "none", port: PORT, host: os.hostname() });
});

app.get("/api/search", async (req, res) => {
  try {
    const ticker = String(req.query.ticker || "AAPL").toUpperCase();
    const quote = await finnhubQuote(ticker);
    const expirations = await finnhubExpirations(ticker);
    res.json({ quote, expirations });
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

app.get("/api/grid", async (req, res) => {
  try {
    const ticker = String(req.query.ticker || "AAPL").toUpperCase();
    const limit = Number(req.query.limit || 4);
    res.json(await finnhubGrid(ticker, limit));
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

app.get("/api/flow", async (req, res) => {
  try {
    const ticker = String(req.query.ticker || "AAPL").toUpperCase();
    const limit = Number(req.query.limit || 60);
    const expiries = Number(req.query.expiries || 3);
    res.json(await finnhubFlow(ticker, limit, expiries));
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

// serve static UI
app.use(express.static("public"));

app.use((_req, res) => res.status(404).json({ error: "not found" }));

app.listen(PORT, () => {
  console.log(`[heatseeker] http://localhost:${PORT}`);
});
