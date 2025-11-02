import cors from 'cors';
import express from 'express';
import fetch from 'node-fetch';
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

function okJson(res, data){ res.set("Cache-Control","no-store"); return res.json(data); }

// /api/search?ticker=TSLA -> expirations[] (+ echo of symbol)
app.get("/api/search", async (req, res) => {
  try {
    const symbol = String(req.query.ticker || req.query.symbol || "").toUpperCase();
    if (!symbol) return res.status(400).json({ error: "ticker required" });

    const token = process.env.FINNHUB_API_KEY;
    if (!token) return res.status(500).json({ error: "FINNHUB_API_KEY missing" });

    const url = new URL("https://finnhub.io/api/v1/stock/option-chain");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("token", token);

    const r = await fetch(url, { timeout: 15000 });
    if (!r.ok) return res.status(502).json({ error: "upstream error", status: r.status, text: await r.text().catch(()=>r.statusText) });

    const data = await r.json();
    const expirations = Array.isArray(data?.data) ? [...new Set(data.data.map(x => x.expirationDate))].sort() : [];
    return okJson(res, { symbol, expirations });
  } catch (e) {
    console.error("search error", e);
    return res.status(500).json({ error: "search failure", detail: String(e?.message || e) });
  }
});

// /api/flow2?ticker=TSLA&date=2025-11-07&limit=25
app.get("/api/flow2", async (req, res) => {
  try {
    const symbol = String(req.query.ticker || req.query.symbol || "").toUpperCase();
    const date   = String(req.query.date || "").trim();
    const limit  = Math.max(1, Math.min(200, Number(req.query.limit) || 25));
    if (!symbol) return res.status(400).json({ error: "ticker required" });

    const token = process.env.FINNHUB_API_KEY;
    if (!token) return res.status(500).json({ error: "FINNHUB_API_KEY missing" });

    const url = new URL("https://finnhub.io/api/v1/stock/option-chain");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("token", token);

    const r = await fetch(url, { timeout: 20000 });
    if (!r.ok) return res.status(502).json({ error: "upstream error", status: r.status, text: await r.text().catch(()=>r.statusText) });

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
    if (!exp) return okJson(res, { symbol, date: date || null, count: 0, items: [] });

    const items = [];
    const push = (arr, side) => {
      for (const o of (arr || [])) {
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
    push(exp.options?.CALL, "CALL");
    push(exp.options?.PUT,  "PUT");

    items.sort((a,b)=> b.premium - a.premium);
    return okJson(res, { symbol, date: exp.expirationDate || date || null, count: items.length, items: items.slice(0, limit) });
  } catch (e) {
    console.error("flow2 error", e);
    return res.status(500).json({ error: "flow2 failure", detail: String(e?.message || e) });
  }
});

// Optional placeholder for /api/grid so the Pro page doesn’t break if it calls it.
app.get("/api/grid", async (req, res) => {
  const symbol = String(req.query.ticker || req.query.symbol || "").toUpperCase();
  const date   = String(req.query.date || "").trim();
  // Return empty but valid structure for now
  return res.json({ symbol, date: date || null, strikes: [], netMatrix: [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log("API listening on http://localhost:" + PORT));

app.get('/api/grid2', async (req, res) => {
  try {
    const symbol = String(req.query.ticker || req.query.symbol || '').toUpperCase();
    const maxExp  = Math.max(1, Math.min(6, Number(req.query.limit) || 4));
    const rowsPer = Math.max(5, Math.min(60, Number(req.query.rows) || 24));
    if (!symbol) return res.status(400).json({ error: 'ticker required' });

    const token = process.env.FINNHUB_API_KEY;
    if (!token) return res.status(500).json({ error: 'FINNHUB_API_KEY missing' });

    const u = new URL('https://finnhub.io/api/v1/stock/option-chain');
    u.searchParams.set('symbol', symbol);
    u.searchParams.set('token', token);

    const r = await fetch(u, { timeout: 15000 });
    if (!r.ok) return res.status(502).json({ error:'upstream error', status:r.status, text: await r.text().catch(()=>r.statusText) });

    const body = await r.json();
    const all = Array.isArray(body?.data) ? body.data : [];
    const exps = all
      .filter(x => (x.options?.CALL?.length || x.options?.PUT?.length))
      .sort((a,b)=> String(a.expirationDate).localeCompare(String(b.expirationDate)))
      .slice(0, maxExp);

    const expirations = [];
    for (const e of exps) {
      const map = new Map();
      const add = (arr, sign) => {
        for (const o of (arr||[])) {
          const strike = Number(o.strike||0);
          const vol    = Number(o.volume||0);
          if (!strike || !vol) continue;
          const bid = Number(o.bid||0), ask = Number(o.ask||0), last = Number(o.lastPrice||0);
          const mid = (bid>0 && ask>0) ? (bid+ask)/2 : (last>0 ? last : 0);
          if (!mid) continue;
          const prem = mid * vol * 100 * sign;
          map.set(strike, (map.get(strike)||0) + prem);
        }
      };
      add(e.options?.CALL, +1);
      add(e.options?.PUT,  -1);

      let rows = Array.from(map.entries())
        .map(([strike,value]) => ({ strike, value: Math.round(value) }))
        .sort((a,b)=> Math.abs(b.value) - Math.abs(a.value))
        .slice(0, rowsPer);

      expirations.push({ date: e.expirationDate, rows });
    }
    res.json({ symbol, expirations });
  } catch (err) {
    console.error('grid2 error', err);
    res.status(500).json({ error: 'grid2 failure', detail: String(err && err.message || err) });
  }
});const token = process.env.FINNHUB_API_KEY;
    if (!token) return res.status(500).json({ error: 'FINNHUB_API_KEY missing' });

    const u = new URL('https://finnhub.io/api/v1/stock/option-chain');
    u.searchParams.set('symbol', symbol);
    u.searchParams.set('token', token);

    const r = await fetch(u, { timeout: 15000 });
    if (!r.ok) return res.status(502).json({ error:'upstream error', status:r.status, text: await r.text().catch(()=>r.statusText) });

    const body = await r.json();
    const all = Array.isArray(body?.data) ? body.data : [];
    // choose the next N expirations that actually have options
    const exps = all
      .filter(x => (x.options?.CALL?.length || x.options?.PUT?.length))
      .sort((a,b)=> String(a.expirationDate).localeCompare(String(b.expirationDate)))
      .slice(0, maxExp);

    const expirations = [];
    for (const e of exps) {
      const map = new Map(); // strike -> net premium
      const add = (arr, sign) => {
        for (const o of (arr||[])) {
          const strike = Number(o.strike||0);
          const vol    = Number(o.volume||0);
          if (!strike || !vol) continue;
          const bid = Number(o.bid||0), ask = Number(o.ask||0), last = Number(o.lastPrice||0);
          const mid = (bid>0 && ask>0) ? (bid+ask)/2 : (last>0 ? last : 0);
          if (!mid) continue;
          const prem = mid * vol * 100 * sign;
          map.set(strike, (map.get(strike)||0) + prem);
        }
      };
      add(e.options?.CALL, +1);
      add(e.options?.PUT,  -1);

      let rows = Array.from(map.entries())
        .map(([strike,value]) => ({ strike, value: Math.round(value) }))
        .sort((a,b)=> Math.abs(b.value) - Math.abs(a.value))
        .slice(0, rowsPer);

      expirations.push({ date: e.expirationDate, rows });
    }

    res.json({ symbol, expirations });
  } catch (err) {
    console.error('grid2 error', err);
    res.status(500).json({ error: 'grid2 failure', detail: String(err && err.message || err) });
  }
});
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
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
});

