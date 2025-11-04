/* OSTAC app stable reset */
const METRIC = { NET_OI:"net_oi", NOTIONAL:"notional", NETGEX:"netgex" };
const $ = s => document.querySelector(s);
const statusEl = $("#status") || (()=>{const n=document.createElement("span");n.id="status";(document.querySelector(".row")||document.body).appendChild(n);return n;})();

function fmtInt(x){ if(!isFinite(x)) return "–"; return Math.round(x).toLocaleString("en-US"); }
function fmtUSD(x){ if(!isFinite(x)) return "–"; const s=Math.round(x); return (s<0?"-$":"$")+Math.abs(s).toLocaleString("en-US"); }

function phi(x){ return Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI); }
function gammaBS(S,K,T,vol){
  if(!(S>0 && K>0 && T>0 && vol>0)) return 0;
  const rt = vol*Math.sqrt(T);
  const d1 = (Math.log(S/K) + 0.5*vol*vol*T)/rt;
  return phi(d1)/(S*rt);
}

function metricValue(kind, c, p, K, ctx){
  const net = (c|0) - (p|0);
  if (kind===METRIC.NET_OI)     return net;
  if (kind===METRIC.NOTIONAL)   return net * K * 100;
  if (kind===METRIC.NETGEX){
    const {S, vol, T} = ctx||{};
    const g = gammaBS(S||0, K||0, T||0, vol||0);
    return 100 * (S||0) * (S||0) * g * net;
  }
  return 0;
}
function fmtMetric(kind, v){ return kind===METRIC.NOTIONAL ? fmtUSD(v) : fmtInt(v); }

function getQuotePx(q){ try { return Number(q?.regularMarketPrice)||NaN } catch { return NaN } }

function pickExpiries(grid, limit, specific){
  const blocks = Array.isArray(grid?.perExpiry) ? grid.perExpiry.slice() : [];
  if (specific) return blocks.filter(b => b?.date === specific);
  return blocks.slice(0, Math.max(1, Number(limit)||5));
}
function strikeUnion(blocks){
  const set = new Set();
  for (const b of blocks) (b?.strikes||[]).forEach(k=>set.add(k));
  return Array.from(set).sort((a,b)=>b-a); // desc
}
function th(t){ const e=document.createElement("th"); e.textContent=t; return e; }
function tdRight(t){ const e=document.createElement("td"); e.className="right"; e.textContent=t; return e; }

function upcomingFridays(n=10){
  const out=[], d=new Date(), dow=d.getDay(); const add=((5-dow+7)%7)||7; d.setDate(d.getDate()+add);
  for(let i=0;i<n;i++){ const t=new Date(d); t.setDate(d.getDate()+7*i); out.push(t.toISOString().slice(0,10)); }
  return out;
}
function updateExpiryHints(grid){
  try{
    const dl = document.getElementById("expList"); if(!dl) return;
    dl.innerHTML = "";
    const seen=new Set();
    const fromChain = Array.isArray(grid?.perExpiry) ? grid.perExpiry.map(b=>b?.date).filter(Boolean) : [];
    const list = (fromChain.length ? fromChain : upcomingFridays(10));
    for(const dt of list){ if(seen.has(dt)) continue; seen.add(dt); const opt=document.createElement("option"); opt.value=dt; dl.appendChild(opt); }
  }catch(e){ console.warn("expiry hints failed", e); }
}

function buildTable(grid, quote, kind, opts){
  const table = document.getElementById("tbl");
  const headRow = table?.querySelector("thead tr");
  const body = document.getElementById("rows");
  if(!(table && headRow && body)){ statusEl.textContent="ERR: table skeleton missing"; return; }

  headRow.innerHTML=""; body.innerHTML="";
  headRow.appendChild(th("Strike ▼"));

  const blocks = pickExpiries(grid, opts.limit, opts.expiry);
  for(const b of blocks) headRow.appendChild(th(b?.date || "—"));
  if (!blocks.length){ statusEl.textContent="No expiries."; return; }

  const strikes = strikeUnion(blocks);
  const S = getQuotePx(quote);
  const vol = opts.iv>0 ? opts.iv/100 : 0.6;

  for(const K of strikes){
    const tr = document.createElement("tr");
    tr.appendChild(tdRight(K));
    for(const b of blocks){
      const i = (b?.strikes||[]).indexOf(K);
      const c = i>=0 ? (b?.callMatrix?.[i]||0) : 0;
      const p = i>=0 ? (b?.putMatrix ?. [i]||0) : 0;
      let T=0; try { const days=Math.max(1,(new Date(b?.date)-new Date())/86400000); T=days/365; } catch{}
      const val = metricValue(kind, c, p, K, {S, vol, T});
      const td = tdRight(fmtMetric(kind, val));
      const mag = Math.tanh(Math.abs(val)/(kind===METRIC.NOTIONAL?5e6:(kind===METRIC.NETGEX?2e9:4000)));
      td.style.setProperty("--mag", (mag*100).toFixed(1));
      td.className = "right heat " + (val>=0?"pos":"neg");
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
}

async function fetchJSON(u){ const r=await fetch(u); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

async function load(){
  const sym = (document.getElementById("sym")?.value||"AAPL").trim().toUpperCase();
  const lim = Number(document.getElementById("lim")?.value)||5;
  const metric = document.getElementById("metric")?.value || METRIC.NET_OI;
  const exp = (document.getElementById("exp")?.value||"").trim();
  const ivBox = document.getElementById("ivBox"); if (ivBox) ivBox.style.display = (metric===METRIC.NETGEX) ? "inline" : "none";
  const iv = Number(document.getElementById("iv")?.value)||60;

  statusEl.textContent = `Loading ${sym}…`;
  try{
    const [grid, search] = await Promise.all([
      fetchJSON(`/api/grid?ticker=${encodeURIComponent(sym)}&limit=${encodeURIComponent(lim)}`),
      fetchJSON(`/api/search?ticker=${encodeURIComponent(sym)}`).catch(()=>({}))
    ]);
    updateExpiryHints(grid);
    buildTable(grid, search?.quote, metric, {limit:lim, expiry:exp, iv});
    const px = getQuotePx(search?.quote);
    statusEl.textContent = `OK ${sym}${isFinite(px)?` @ ${px}`:""}`;
  }catch(e){
    console.error(e); statusEl.textContent = `ERR: ${e.message||e}`;
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  ["#sym","#exp","#lim"].forEach(sel=>{
    const el=document.querySelector(sel); if(el) el.addEventListener("keydown",ev=>{ if(ev.key==="Enter") load(); });
  });
  const go=$("#go"); if(go) go.addEventListener("click", ()=>load());
  const m=$("#metric"); if(m) m.addEventListener("change", ()=>load());
  load();
});