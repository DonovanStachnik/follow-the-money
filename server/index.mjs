import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const FINN = process.env.FINNHUB_API_KEY;

app.get('/api/health', (req,res)=> {
  res.json({ ok:true, port: PORT, finnhub: !!FINN });
});

function pickNearestWithData(chain, wantDate) {
  const all = Array.isArray(chain?.data) ? chain.data : [];
  if (all.length === 0) return null;
  // prefer exact date that has options
  let exact = all.find(x => x.expirationDate === wantDate && ((x.options?.CALL?.length||0) + (x.options?.PUT?.length||0) > 0));
  if (exact) return exact;
  // else first with data, or first overall
  const withData = all.filter(x => (x.options?.CALL?.length||0) + (x.options?.PUT?.length||0) > 0);
  return withData[0] || all[0];
}

app.get('/api/search', async (req,res) => {
  try {
    const symbol = String(req.query.ticker || req.query.symbol || '').toUpperCase().trim();
    if (!symbol) return res.status(400).json({ error:'ticker required' });
    if (!FINN) return res.status(500).json({ error:'FINNHUB_API_KEY missing' });

    const url = new URL('https://finnhub.io/api/v1/stock/option-chain');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('token', FINN);

    const r = await fetch(url, { timeout: 15000 });
    if (!r.ok) return res.status(502).json({ error:'upstream', status:r.status, text: await r.text().catch(()=>r.statusText) });
    const data = await r.json();

    const exps = (Array.isArray(data?.data) ? data.data : []).map(x => x.expirationDate).filter(Boolean);
    const unique = [...new Set(exps)];
    res.json({ symbol, expirations: unique });
  } catch (e) {
    console.error('search error', e);
    res.status(500).json({ error:'search failure', detail: String(e?.message || e) });
  }
});

app.get('/api/flow2', async (req,res) => {
  try {
    const symbol = String(req.query.ticker || req.query.symbol || '').toUpperCase().trim();
    const date   = String(req.query.date || '').trim();
    const limit  = Math.max(1, Math.min(200, Number(req.query.limit) || 25));
    if (!symbol) return res.status(400).json({ error:'ticker required' });
    if (!FINN)   return res.status(500).json({ error:'FINNHUB_API_KEY missing' });

    const url = new URL('https://finnhub.io/api/v1/stock/option-chain');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('token', FINN);

    const r = await fetch(url, { timeout: 20000 });
    if (!r.ok) return res.status(502).json({ error:'upstream', status:r.status, text: await r.text().catch(()=>r.statusText) });
    const chain = await r.json();

    const exp = pickNearestWithData(chain, date);
    if (!exp) return res.json({ symbol, date: date || null, count:0, items:[] });

    const items = [];
    const pushSide = (arr, side) => {
      for (const o of (arr||[])) {
        const volume = Number(o.volume||0);
        const oi     = Number(o.openInterest||0);
        const bid    = Number(o.bid||0);
        const ask    = Number(o.ask||0);
        const last   = Number(o.lastPrice||0);
        const mid    = (bid>0 && ask>0) ? (bid+ask)/2 : 0;
        const px     = last>0 ? last : mid;
        const strike = Number(o.strike||0);
        const prem   = px * volume * 100;
        if (prem > 0) {
          items.push({
            side,
            strike,
            volume,
            oi,
            bid, ask, last,
            iv: Number(o.impliedVolatility||0),
            premium: Math.round(prem)
          });
        }
      }
    };
    pushSide(exp.options?.CALL, 'CALL');
    pushSide(exp.options?.PUT,  'PUT');

    items.sort((a,b)=> b.premium - a.premium);
    res.json({ symbol, date: exp.expirationDate || date || null, count: items.length, items: items.slice(0, limit) });
  } catch (e) {
    console.error('flow2 error', e);
    res.status(500).json({ error:'flow2 failure', detail: String(e?.message || e) });
  }
});

app.get('/api/grid2', async (req,res) => {
  try {
    const symbol = String(req.query.ticker || req.query.symbol || '').toUpperCase().trim();
    const date   = String(req.query.date || '').trim();
    const rows   = Math.max(3, Math.min(25, Number(req.query.rows) || 10));
    const limit  = Math.max(1, Math.min(2000, Number(req.query.limit) || 200));
    if (!symbol) return res.status(400).json({ error:'ticker required' });
    if (!FINN)   return res.status(500).json({ error:'FINNHUB_API_KEY missing' });

    const url = new URL('https://finnhub.io/api/v1/stock/option-chain');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('token', FINN);

    const r = await fetch(url, { timeout: 20000 });
    if (!r.ok) return res.status(502).json({ error:'upstream', status:r.status, text: await r.text().catch(()=>r.statusText) });
    const chain = await r.json();

    const exp = pickNearestWithData(chain, date);
    if (!exp) return res.json({ symbol, date: date || null, strikes:[], netMatrix:[], rows });

    const map = new Map(); // strike -> net premium (CALL +, PUT -)
    const add = (arr, sign) => {
      for (const o of (arr||[])) {
        const volume = Number(o.volume||0);
        const bid    = Number(o.bid||0);
        const ask    = Number(o.ask||0);
        const last   = Number(o.lastPrice||0);
        const mid    = (bid>0 && ask>0) ? (bid+ask)/2 : 0;
        const px     = last>0 ? last : mid;
        const prem   = px * volume * 100 * sign;
        const strike = Number(o.strike||0);
        if (!Number.isFinite(strike) || strike<=0) continue;
        const cur = map.get(strike) || 0;
        map.set(strike, cur + (Number.isFinite(prem) ? prem : 0));
      }
    };
    add(exp.options?.CALL, +1);
    add(exp.options?.PUT,  -1);

    const pairs = [...map.entries()].map(([strike, value]) => ({ strike, value: Math.round(value) }));
    pairs.sort((a,b)=> a.strike - b.strike);

    // pick a window of strikes around max net premium
    let top = pairs.toSorted((a,b)=> Math.abs(b.value) - Math.abs(a.value)).slice(0, rows);
    let strikes = [...new Set(top.map(x => x.strike))].sort((a,b)=> a-b);
    if (strikes.length < rows && pairs.length > 0) {
      // pad with neighbors
      strikes = pairs.slice(0, Math.min(rows, pairs.length)).map(p=>p.strike);
    }

    const netMatrix = strikes.map(s => {
      const f = pairs.find(p => p.strike === s) || { strike:s, value:0 };
      return f;
    });

    res.json({ symbol, date: exp.expirationDate || date || null, strikes, netMatrix, rows });
  } catch (e) {
    console.error('grid2 error', e);
    res.status(500).json({ error:'grid2 failure', detail: String(e?.message || e) });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log("API listening on http://localhost:");
});
