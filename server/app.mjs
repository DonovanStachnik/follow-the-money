import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

function assertToken() {
  const t = process.env.FINNHUB_API_KEY;
  if (!t) throw new Error("FINNHUB_API_KEY missing in environment");
  return t;
}

async function getOptionChain(symbol) {
  const token = assertToken();
  const url = new URL("https://finnhub.io/api/v1/stock/option-chain");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("token", token);
  const r = await fetch(url, { timeout: 15000 });
  if (!r.ok) throw new Error(`Finnhub ${r.status}: ` + (await r.text().catch(()=>r.statusText)));
  const data = await r.json();
  const all = Array.isArray(data?.data) ? data.data : [];
  return all;
}

const px = (o) => {
  const last = Number(o.lastPrice || 0);
  const bid  = Number(o.bid || 0);
  const ask  = Number(o.ask || 0);
  const mid  = (bid > 0 && ask > 0) ? (bid + ask) / 2 : 0;
  return last > 0 ? last : mid;
};

const prem = (o) => Math.round(px(o) * Number(o.volume || 0) * 100);

app.get("/api/search", async (req, res) => {
  try {
    const symbol = String(req.query.ticker || req.query.symbol || "").toUpperCase();
    if (!symbol) return res.status(400).json({ error: "ticker required" });
    const chain = await getOptionChain(symbol);
    const expirations = [...new Set(chain.map(x => x.expirationDate))].filter(Boolean).sort();
    // Also include a quote-like stub so your UI header has something to show
    res.json({ quote: { symbol }, expirations });
  } catch (e) {
    console.error("search error", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/flow2", async (req, res) => {
  try {
    const symbol = String(req.query.ticker || req.query.symbol || "").toUpperCase();
    const date   = String(req.query.date || "").trim();
    const limit  = Math.max(1, Math.min(200, Number(req.query.limit) || 25));
    if (!symbol) return res.status(400).json({ error: "ticker required" });

    const chain = await getOptionChain(symbol);

    let exp = chain.find(x => x.expirationDate === date);
    if (!exp) {
      const withOpts = chain.filter(x => (x.options?.CALL?.length || x.options?.PUT?.length));
      if (date) {
        const later = withOpts.filter(x => x.expirationDate >= date).sort((a,b)=> a.expirationDate.localeCompare(b.expirationDate));
        exp = later[0] || withOpts[0];
      } else {
        exp = withOpts[0];
      }
    }
    if (!exp) return res.json({ symbol, date: date || null, count: 0, items: [] });

    const items = [];
    const pushSide = (arr, side) => {
      for (const o of (arr || [])) {
        const volume = Number(o.volume || 0);
        const oi     = Number(o.openInterest || 0);
        const strike = Number(o.strike || 0);
        const iv     = Number(o.impliedVolatility || 0);
        const premium = prem(o);
        if (premium > 0) items.push({ side, strike, volume, oi, bid:Number(o.bid||0), ask:Number(o.ask||0), last:Number(o.lastPrice||0), iv, premium });
      }
    };
    pushSide(exp.options?.CALL, "CALL");
    pushSide(exp.options?.PUT,  "PUT");

    items.sort((a,b)=> b.premium - a.premium);
    res.json({ symbol, date: exp.expirationDate || date || null, count: items.length, items: items.slice(0, limit) });
  } catch (e) {
    console.error("flow2 error", e);
    res.status(500).json({ error: "flow2 failure", detail: String(e?.message || e) });
  }
});

/**
 * /api/grid2?ticker=AAPL&rows=16&cols=4
 * Returns several expiry columns, each with net premium (CALL - PUT) per strike.
 */
app.get("/api/grid2", async (req, res) => {
  try {
    const symbol = String(req.query.ticker || req.query.symbol || "").toUpperCase();
    const rows   = Math.max(6, Math.min(40, Number(req.query.rows) || 16));
    const cols   = Math.max(1, Math.min(6,  Number(req.query.cols) || 4));
    if (!symbol) return res.status(400).json({ error: "ticker required" });

    const chain = await getOptionChain(symbol);
    const expirations = [...new Set(chain.map(x => x.expirationDate))].filter(Boolean).sort().slice(0, cols);

    const columns = [];
    for (const d of expirations) {
      const exp = chain.find(x => x.expirationDate === d);
      if (!exp) continue;

      // Build net premium map per strike
      const map = new Map(); // strike -> net
      const add = (o, sgn) => {
        const k = Number(o.strike || 0);
        const v = (map.get(k) || 0) + sgn * prem(o);
        map.set(k, v);
      };
      for (const c of (exp.options?.CALL || [])) add(c, +1);
      for (const p of (exp.options?.PUT  || [])) add(p, -1);

      // Pick top strikes by absolute premium
      const rowsArr = [...map.entries()]
        .map(([strike, value]) => ({ strike, value }))
        .sort((a,b)=> Math.abs(b.value) - Math.abs(a.value))
        .slice(0, rows);

      columns.push({ date: d, rows: rowsArr });
    }

    res.json({ symbol, columns });
  } catch (e) {
    console.error("grid2 error", e);
    res.status(500).json({ error: "grid2 failure", detail: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
