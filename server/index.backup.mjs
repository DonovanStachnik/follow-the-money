import cors from 'cors';
import express from 'express';
import fetch from 'node-fetch';
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));

function dollars(n){ return Math.round(n); }
function mid(bid, ask, last){
  if (Number.isFinite(last)) return last;
  const b = Number.isFinite(bid) ? bid : NaN;
  const a = Number.isFinite(ask) ? ask : NaN;
  if (Number.isFinite(b) && Number.isFinite(a)) return (b + a) / 2;
  return Number.isFinite(b) ? b : (Number.isFinite(a) ? a : 0);
}
async function getJSON(url){
  const r = await fetch(url, { headers: { "cache-control": "no-store" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  return r.json();
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/search", async (req, res) => {
  try{
    const sym = String(req.query.ticker || "").toUpperCase();
    const key = process.env.FINNHUB_API_KEY;
    if (!sym) return res.status(400).json({ error: "ticker required" });
    if (!key) return res.status(500).json({ error: "FINNHUB_API_KEY missing" });

    const url = `https://finnhub.io/api/v1/stock/option-chain?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`;
    const chain = await getJSON(url);
    const expirations = (Array.isArray(chain.data) ? chain.data : []).map(b => b.expirationDate);
    const last = Number(chain.lastTradePrice ?? 0) || 0;
    res.json({ quote: { symbol: sym, regularMarketPrice: last, longName: sym }, expirations });
  } catch(e){
    res.status(502).json({ error: "search_failed", message: String(e?.message || e) });
  }
});

app.get("/api/grid", async (req, res) => {
  try{
    const sym   = String(req.query.ticker || "").toUpperCase();
    const date  = String(req.query.date || "");
    const key   = process.env.FINNHUB_API_KEY;
    const limit = Math.min(parseInt(req.query.limit || "24", 10), 200);
    if (!sym) return res.status(400).json({ error: "ticker required" });
    if (!key) return res.status(500).json({ error: "FINNHUB_API_KEY missing" });

    const chain = await getJSON(`https://finnhub.io/api/v1/stock/option-chain?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`);
    const buckets = Array.isArray(chain.data) ? chain.data : [];
    let bucket = date ? (buckets.find(b => b.expirationDate === date) || null) : null;
    if (!bucket) bucket = buckets[0] || null;

    const last = Number(chain.lastTradePrice ?? 0) || 0;

    if (!bucket?.options) {
      return res.json({ symbol: sym, expirations: buckets.map(b => b.expirationDate), selectedExpiration: bucket?.expirationDate ?? null, last, strikes: [], callMatrix: [], putMatrix: [], netMatrix: [] });
    }

    const calls = Array.isArray(bucket.options.CALL) ? bucket.options.CALL : [];
    const puts  = Array.isArray(bucket.options.PUT)  ? bucket.options.PUT  : [];

    const strikeSet = new Set();
    calls.forEach(o => strikeSet.add(o.strike));
    puts.forEach(o  => strikeSet.add(o.strike));
    let strikes = Array.from(strikeSet).sort((a,b)=> b-a); // DESC

    if (limit && strikes.length > limit) {
      const idx = strikes.findIndex(s => s <= last);
      const center = idx === -1 ? Math.floor(strikes.length/2) : idx;
      const half = Math.floor(limit/2);
      const start = Math.max(0, Math.min(center - half, strikes.length - limit));
      strikes = strikes.slice(start, start + limit);
    }

    const cBy = new Map(calls.map(o => [o.strike, o]));
    const pBy = new Map(puts.map(o  => [o.strike, o]));
    const callMatrix = [], putMatrix = [], netMatrix = [];

    for (const k of strikes){
      const c = cBy.get(k), p = pBy.get(k);
      const cVol = c?.volume ?? 0, pVol = p?.volume ?? 0;
      const cLast = mid(c?.bid, c?.ask, c?.lastPrice ?? c?.last);
      const pLast = mid(p?.bid, p?.ask, p?.lastPrice ?? p?.last);
      const cPrem = dollars(cVol * cLast * 100);
      const pPrem = dollars(pVol * pLast * 100);
      if (c) callMatrix.push({ strike:k, value:cPrem, oi:c.openInterest ?? 0, volume:cVol, type:"C" });
      if (p) putMatrix.push ({ strike:k, value:pPrem, oi:p.openInterest ?? 0, volume:pVol, type:"P" });
      netMatrix.push({ strike:k, value:cPrem - pPrem });
    }

    res.json({ symbol:sym, expirations:buckets.map(b=>b.expirationDate), selectedExpiration:bucket.expirationDate, last, strikes, callMatrix, putMatrix, netMatrix });
  } catch(e){
    res.status(502).json({ error: "grid_failed", message: String(e?.message || e) });
  }
});

app.get("/api/flow", async (req, res) => {
  try{
    const sym   = String(req.query.ticker || "").toUpperCase();
    const date  = String(req.query.date || "");
    const key   = process.env.FINNHUB_API_KEY;
    const limit = Math.min(parseInt(req.query.limit || "60", 10), 200);
    if (!sym) return res.status(400).json({ error: "ticker required" });
    if (!key) return res.status(500).json({ error: "FINNHUB_API_KEY missing" });

    const chain = await getJSON(`https://finnhub.io/api/v1/stock/option-chain?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`);
    const buckets = Array.isArray(chain.data) ? chain.data : [];
    let bucket = date ? (buckets.find(b => b.expirationDate === date) || null) : null;
    if (!bucket) bucket = buckets[0] || null;

    const calls = Array.isArray(bucket?.options?.CALL) ? bucket.options.CALL : [];
    const puts  = Array.isArray(bucket?.options?.PUT)  ? bucket.options.PUT  : [];

    const rows = [];
    function push(side, o){
      const price = mid(o?.bid, o?.ask, o?.lastPrice ?? o?.last);
      const vol   = Number(o?.volume ?? 0) || 0;
      const prem  = dollars(vol * price * 100);
      if (vol > 0 && prem > 0){
        rows.push({ side, strike:o.strike, volume:vol, oi:o.openInterest ?? 0, bid:o.bid ?? 0, ask:o.ask ?? 0, last:price, iv:o.impliedVolatility ?? 0, premium: prem });
      }
    }
    calls.forEach(o => push("CALL", o));
    puts.forEach(o  => push("PUT",  o));

    rows.sort((a,b)=> b.premium - a.premium);
    res.json({ symbol:sym, date:bucket?.expirationDate ?? date ?? null, count: Math.min(rows.length, limit), items: rows.slice(0, limit) });
  } catch(e){
    res.status(500).json({ error: "flow_failed", message: String(e?.message || e) });
  }
});

app.get("/", (_req,res)=>res.sendFile(path.join(__dirname, "..", "public", "index.html")));

app.listen(3000, '0.0.0.0', () => console.log('API listening on http://localhost:3000'));=>console.log(`API listening on http://localhost:${PORT}`));

app.get('/api/flow2', async (req, res) => {
  try {
    const symbol = String(req.query.ticker || req.query.symbol || '').toUpperCase();
    const date   = String(req.query.date || '').trim();
    const limit  = Math.max(1, Math.min(200, Number(req.query.limit) || 25));
    if (!symbol) return res.status(400).json({error:'ticker required'});

    const token = process.env.FINNHUB_API_KEY;
    if (!token) return res.status(500).json({error:'FINNHUB_API_KEY missing'});

    const url = new URL('https://finnhub.io/api/v1/stock/option-chain');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('token', token);

    const r = await fetch(url, { timeout: 15000 });
    if (!r.ok) return res.status(502).json({error:'upstream error', status:r.status, text: await r.text().catch(()=>r.statusText)});
    const data = await r.json();
    const all = Array.isArray(data?.data) ? data.data : [];

    let exp = all.find(x => x.expirationDate === date);
    if (!exp) {
      const withOpts = all.filter(x => (x.options?.CALL?.length || x.options?.PUT?.length));
      if (date) {
        const later = withOpts.filter(x => x.expirationDate >= date).sort((a,b)=> a.expirationDate.localeCompare(b.expirationDate));
        exp = later[0] || withOpts[0];
      } else {
        exp = withOpts[0];
      }
    }
    if (!exp) return res.json({symbol, date: date || null, count:0, items:[]});

    const items = [];
    const push = (arr, side) => {
      for (const o of (arr||[])) {
        const volume = Number(o.volume||0);
        const oi     = Number(o.openInterest||0);
        const last   = Number(o.lastPrice||0);
        const bid    = Number(o.bid||0);
        const ask    = Number(o.ask||0);
        const mid    = (bid>0 && ask>0) ? (bid+ask)/2 : 0;
        const px     = last>0 ? last : mid;
        const strike = Number(o.strike||0);
        const prem   = px * volume * 100;
        const iv     = Number(o.impliedVolatility||0);
        if (prem > 0) items.push({ side, strike, volume, oi, bid, ask, last, iv, premium: Math.round(prem) });
      }
    };
    push(exp.options?.CALL, 'CALL');
    push(exp.options?.PUT,  'PUT');

    items.sort((a,b)=> b.premium - a.premium);
    res.json({ symbol, date: exp.expirationDate || date || null, count: items.length, items: items.slice(0, limit) });
  } catch (e) {
    console.error('flow2 error', e);
    res.status(500).json({ error: 'flow2 failure', detail: String(e && e.message || e) });
  }
});const token = process.env.FINNHUB_API_KEY;
    if (!token) return res.status(500).json({error:'FINNHUB_API_KEY missing'});

    const url = new URL('https://finnhub.io/api/v1/stock/option-chain');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('token', token);

    const r = await fetch(url, { timeout: 15000 });
    if (!r.ok) return res.status(502).json({error:'upstream error', status:r.status, text: await r.text().catch(()=>r.statusText)});
    const data = await r.json();

    const exp = (data?.data || []).find(x => x.expirationDate === date);
    if (!exp) return res.json({symbol, date, count:0, items:[]});

    const items = [];
    const pushSide = (sideArr, sideName) => {
      for (const o of sideArr || []) {
        const volume = Number(o.volume||0);
        const oi     = Number(o.openInterest||0);
        const last   = Number(o.lastPrice||0);
        const bid    = Number(o.bid||0);
        const ask    = Number(o.ask||0);
        const iv     = Number(o.impliedVolatility||0);
        const strike = Number(o.strike||0);
        const prem   = (last>0 ? last : (bid>0 && ask>0 ? (bid+ask)/2 : 0)) * volume * 100;
        items.push({ side: sideName, strike, volume, oi, bid, ask, last, iv, premium: Math.round(prem) });
      }
    };

    pushSide(exp.options?.CALL, 'CALL');
    pushSide(exp.options?.PUT,  'PUT');

    items.sort((a,b)=> b.premium - a.premium);
    const top = items.slice(0, limit);

    res.json({ symbol, date, count: top.length, items: top });
  } catch (e) {
    console.error('flow2 error', e);
    res.status(500).json({ error: 'flow2 failure', detail: String(e && e.message || e) });
  }
});






const app = express();`r`napp.use(express.static("public"));
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});
