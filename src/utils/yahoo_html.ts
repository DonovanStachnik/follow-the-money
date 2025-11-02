const BASE_HEADERS: Record<string,string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

function extractJson(html: string): any | null {
  // Try several common embeds
  const m1 = html.match(/root\.App\.main\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i);
  if (m1) { try { return JSON.parse(m1[1]); } catch {} }
  const m2 = html.match(/"OptionContractsStore"\s*:\s*(\{[\s\S]*?\})\s*,\s*"[A-Z][A-Za-z]+Store"/);
  if (m2) { try { return JSON.parse(`{"OptionContractsStore":${m2[1]}}`); } catch {} }
  return null;
}

export async function yahooHtmlOptions(symbol: string, dateISO?: string) {
  let url = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/options?p=${encodeURIComponent(symbol)}`;
  if (dateISO) {
    const dt = new Date(dateISO);
    if (!isNaN(dt.getTime())) url += `&date=${Math.floor(dt.getTime()/1000)}`;
  }
  const r = await fetch(url, { headers: BASE_HEADERS });
  const html = await r.text();
  const root = extractJson(html);

  const store = root?.context?.dispatcher?.stores?.OptionContractsStore
             || root?.OptionContractsStore || {};
  const calls:any[] = [];
  const puts:any[]  = [];

  const push = (arr:any[], row:any, isPut:boolean) => {
    const strike = Number(row.strike || row.strikePrice || row.strikeprice || row.strike_value);
    const volume = Number(row.volume ?? row.vol ?? 0);
    const last   = Number(row.lastPrice ?? row.last ?? 0);
    const oi     = Number(row.openInterest ?? row.oi ?? 0);
    if (Number.isFinite(strike)) (isPut ? puts : calls).push({ strike, volume, lastPrice: last, openInterest: oi });
  };

  // Accept a few shapes we see across regions/builds
  const buckets = []
    .concat(store?.contracts || [])
    .concat(store?.options || [])
    .concat(store?.optionData || []);
  for (const b of buckets) {
    if (b?.calls) for (const c of b.calls) push(calls, c, false);
    if (b?.puts)  for (const p of b.puts)  push(puts,  p, true);
  }

  // Try single object shape too
  if (!calls.length && !puts.length && store?.calls) {
    for (const c of store.calls) push(calls, c, false);
    for (const p of store.puts  || []) push(puts, p, true);
  }

  let picked: string | null = null;
  const expSec = store?.quote?.expirationDate || store?.selectedDate || store?.expiration || null;
  if (expSec) picked = new Date(Number(expSec) * 1000).toISOString().slice(0,10);

  return { calls, puts, picked };
}
