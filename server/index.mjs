import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

function reqToken(res){
  const token = process.env.FINNHUB_API_KEY;
  if(!token){
    res.status(500).json({error:"FINNHUB_API_KEY missing"});
    return null;
  }
  return token;
}
async function getJSON(url){
  const r = await fetch(url, { timeout: 15000 });
  if(!r.ok) throw new Error(`${r.status} ${await r.text().catch(()=>r.statusText)}`);
  return r.json();
}

app.get("/api/health", (req,res)=> res.json({ok:true, time:new Date().toISOString()}));

/** /api/search?ticker=AAPL -> {symbol, price, expirations[]} */
app.get("/api/search", async (req,res)=>{
  try{
    const symbol = String(req.query.ticker||req.query.symbol||"").toUpperCase();
    if(!symbol) return res.status(400).json({error:"ticker required"});
    const token = reqToken(res); if(!token) return;

    const [chain, quote] = await Promise.all([
      getJSON(`https://finnhub.io/api/v1/stock/option-chain?symbol=${symbol}&token=${token}`),
      getJSON(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`)
    ]);

    const exps = Array.isArray(chain?.data) ? [...new Set(chain.data.map(x=>x.expirationDate).filter(Boolean))].sort() : [];
    res.json({ symbol, price: quote?.c ?? null, expirations: exps });
  }catch(e){ res.status(502).json({error:String(e)}) }
});

/** /api/flow2?ticker=AAPL&date=YYYY-MM-DD&limit=60 */
app.get("/api/flow2", async (req,res)=>{
  try{
    const symbol = String(req.query.ticker||req.query.symbol||"").toUpperCase();
    const date   = String(req.query.date||"").trim();
    const limit  = Math.max(1, Math.min(200, Number(req.query.limit)||60));
    if(!symbol) return res.status(400).json({error:"ticker required"});
    const token = reqToken(res); if(!token) return;

    const chain = await getJSON(`https://finnhub.io/api/v1/stock/option-chain?symbol=${symbol}&token=${token}`);
    const rows  = Array.isArray(chain?.data) ? chain.data : [];

    let exp = rows.find(r=>r.expirationDate===date);
    if(!exp){
      const withOpts = rows.filter(r=>(r.options?.CALL?.length || r.options?.PUT?.length));
      exp = withOpts[0] || null;
    }
    if(!exp) return res.json({symbol, date:null, count:0, items:[]});

    const items=[];
    const push=(arr,side)=>{
      for(const o of (arr||[])){
        const volume=Number(o.volume||0);
        const oi=Number(o.openInterest||0);
        const bid=Number(o.bid||0), ask=Number(o.ask||0), last=Number(o.lastPrice||0);
        const mid=(bid>0&&ask>0)?(bid+ask)/2:0;
        const px= last>0?last:mid;
        const strike=Number(o.strike||0);
        const prem=Math.max(0, px*volume*100);
        if(prem>0) items.push({side, strike, volume, oi, bid, ask, last, premium:Math.round(prem)});
      }
    };
    push(exp.options?.CALL,'CALL');
    push(exp.options?.PUT,'PUT');

    items.sort((a,b)=>b.premium-a.premium);
    res.json({symbol, date:exp.expirationDate, count:items.length, items:items.slice(0,limit)});
  }catch(e){ res.status(502).json({error:String(e)}) }
});

/** /api/grid2?ticker=AAPL&rows=20&cols=4
 * Build a simple heatmap from option-chain: net premium per strike (calls - puts)
 * using nearest expirations.
 */
app.get("/api/grid2", async (req,res)=>{
  try{
    const symbol = String(req.query.ticker||"").toUpperCase();
    const rowsN  = Math.max(5, Math.min(50, Number(req.query.rows)||20));
    const colsN  = Math.max(1, Math.min(6, Number(req.query.cols)||4));
    if(!symbol) return res.status(400).json({error:"ticker required"});
    const token = reqToken(res); if(!token) return;

    const chain = await getJSON(`https://finnhub.io/api/v1/stock/option-chain?symbol=${symbol}&token=${token}`);
    const all   = Array.isArray(chain?.data)?chain.data:[];
    const byExp = all
      .filter(x => (x.options?.CALL?.length || x.options?.PUT?.length))
      .sort((a,b)=> a.expirationDate.localeCompare(b.expirationDate))
      .slice(0, colsN);

    const columns=[];
    for(const exp of byExp){
      const map=new Map(); // strike -> {callPrem, putPrem}
      const add=(arr,sign)=>{
        for(const o of (arr||[])){
          const vol=Number(o.volume||0);
          const bid=Number(o.bid||0), ask=Number(o.ask||0), last=Number(o.lastPrice||0);
          const px= last>0?last:((bid>0&&ask>0)?(bid+ask)/2:0);
          const prem=px*vol*100*sign;
          const k=Number(o.strike||0);
          if(!map.has(k)) map.set(k,{v:0});
          map.get(k).v += prem;
        }
      };
      add(exp.options?.CALL, +1);
      add(exp.options?.PUT , -1);

      const items=[...map.entries()]
        .sort((a,b)=>a[0]-b[0])
        .slice(0, rowsN)
        .map(([k,obj])=>({strike:k, value: Math.round(obj.v)}));

      columns.push({ expiry: exp.expirationDate, items });
    }
    res.json({symbol, columns});
  }catch(e){ res.status(502).json({error:String(e)}) }
});

app.listen(PORT, ()=> console.log(`API listening on http://localhost:${PORT}`));
