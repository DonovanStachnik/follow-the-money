const HEADERS: Record<string,string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

function pick<T>(...xs:(T|undefined|null)[]):T|undefined{
  for (const x of xs) if (x!=null) return x as T;
  return undefined;
}

function parseEmbedded(html: string): any | null {
  const m = html.match(/root\.App\.main\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  const m2 = html.match(/"OptionContractsStore"\s*:\s*(\{[\s\S]*?\})\s*,\s*"[A-Z][A-Za-z]+Store"/);
  if (m2) { try { return JSON.parse(`{"OptionContractsStore":${m2[1]}}`); } catch {} }
  return null;
}

export async function fetchYahooOptionsPage(symbol: string, epoch?: number) {
  let url = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/options?p=${encodeURIComponent(symbol)}`;
  if (epoch) url += `&date=${epoch}`;
  const r = await fetch(url, { headers: HEADERS });
  const html = await r.text();
  const root = parseEmbedded(html);

  const store = root?.context?.dispatcher?.stores?.OptionContractsStore
             || root?.OptionContractsStore || {};

  // expirations as epoch seconds
  const expSecs: number[] =
    pick<number[]>(store?.expirationDates, store?.dates, store?.expirations) || [];

  // options buckets
  let calls: any[] = [];
  let puts:  any[] = [];

  const buckets = []
    .concat(store?.contracts || [])
    .concat(store?.options || [])
    .concat(store?.optionData || []);
  for (const b of buckets) {
    if (b?.calls) calls = calls.concat(b.calls);
    if (b?.puts)  puts  = puts.concat(b.puts);
  }
  if (!buckets.length && store?.calls) {
    calls = calls.concat(store.calls);
    if (store?.puts) puts = puts.concat(store.puts);
  }

  // normalize
  const norm = (row:any) => ({
    strike: Number(row.strike ?? row.strikePrice ?? row.strikeprice ?? row.strike_value),
    volume: Number(row.volume ?? row.vol ?? 0),
    last:   Number(row.lastPrice ?? row.last ?? 0),
    oi:     Number(row.openInterest ?? row.oi ?? 0),
  });

  return {
    expirations: expSecs,
    calls: calls.map(norm).filter(x => Number.isFinite(x.strike)),
    puts:  puts.map(norm).filter(x => Number.isFinite(x.strike)),
    picked: store?.quote?.expirationDate
      ? new Date(store.quote.expirationDate * 1000).toISOString().slice(0,10)
      : null
  };
}

/** Build a 2D grid of premium by strike × expiry (next N expiries) */
export async function buildOptionsGrid(symbol: string, takeN = 4) {
  // 1) fetch landing page to get the expirations
  const first = await fetchYahooOptionsPage(symbol);
  const exps = (first.expirations || []).slice(0, takeN);

  // include the first page’s chains as the first column if present
  const columns: {epoch:number, dateIso:string, calls:any[], puts:any[]}[] = [];
  const seenFirstEpoch = first.picked ? Math.floor(new Date(first.picked).getTime()/1000) : exps[0];
  if (seenFirstEpoch) {
    columns.push({
      epoch: seenFirstEpoch,
      dateIso: new Date(seenFirstEpoch*1000).toISOString().slice(0,10),
      calls: first.calls, puts: first.puts
    });
  }

  // 2) fetch the rest of the expiries
  for (const ep of exps) {
    if (ep === seenFirstEpoch) continue;
    const p = await fetchYahooOptionsPage(symbol, ep);
    columns.push({
      epoch: ep,
      dateIso: new Date(ep*1000).toISOString().slice(0,10),
      calls: p.calls, puts: p.puts
    });
  }

  // 3) collect strike universe
  const strikesSet = new Set<number>();
  for (const col of columns) {
    for (const c of col.calls) strikesSet.add(c.strike);
    for (const p of col.puts)  strikesSet.add(p.strike);
  }
  let strikes = Array.from(strikesSet).sort((a,b)=>a-b);

  // 4) build premium matrices (premium = volume * last * 100)
  const premium = (vol:number,last:number)=>Math.max(0, Math.round(vol*last*100));
  const callMatrix: number[][] = [];
  const putMatrix:  number[][] = [];

  for (const col of columns) {
    const cmap = new Map<number,number>();
    const pmap = new Map<number,number>();
    for (const c of col.calls) cmap.set(c.strike, (cmap.get(c.strike)||0) + premium(c.volume,c.last));
    for (const p of col.puts)  pmap.set(p.strike, (pmap.get(p.strike)||0) + premium(p.volume,p.last));
    callMatrix.push(strikes.map(s => cmap.get(s)||0));
    putMatrix .push(strikes.map(s => pmap.get(s)||0));
  }

  return {
    symbol,
    expirations: columns.map(c=>c.dateIso),
    strikes,
    callMatrix,  // [col][row]
    putMatrix    // [col][row]
  };
}
