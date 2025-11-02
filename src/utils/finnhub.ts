const BASE = "https://finnhub.io/api/v1";

function qs(params: Record<string, string | number | undefined>) {
  return Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

async function fhFetch<T = any>(path: string, params: Record<string, any> = {}): Promise<T> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("FINNHUB_API_KEY missing in .env.local");
  const url = `${BASE}${path}?${qs({ ...params, token })}`;
  const res = await fetch(url, { next: { revalidate: 0 } as any });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Finnhub ${res.status} :: ${txt.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** Quote (price) + company name */
export async function fhQuote(symbol: string): Promise<{ price: number; name?: string }> {
  const [q, prof] = await Promise.all([
    fhFetch<any>("/quote", { symbol }),
    fhFetch<any>("/stock/profile2", { symbol }).catch(() => null),
  ]);
  const price = Number(q?.c ?? 0) || Number(q?.pc ?? 0) || 0;
  const name = prof?.name || undefined;
  return { price, name };
}

/**
 * Finnhub option chain response looks like:
 * { code: "AAPL", data: [ { expirationDate:"2025-11-07", strike: 100, type:"CALL"|"PUT", lastPrice, volume, bid, ask } ... ] }
 */
type FHOptionRow = {
  expirationDate?: string;
  strike?: number;
  type?: "CALL" | "PUT";
  lastPrice?: number;
  volume?: number;
  bid?: number;
  ask?: number;
};

export type FHChain = { code?: string; data?: FHOptionRow[] };

/** Get unique expiration dates (sorted ascending) */
export async function fhExpirations(symbol: string): Promise<string[]> {
  const chain = await fhFetch<FHChain>("/stock/option-chain", { symbol });
  const dates = Array.from(new Set((chain.data ?? []).map(r => r.expirationDate).filter(Boolean))) as string[];
  dates.sort(); // ascending ISO
  return dates;
}

/** Get calls/puts for a specific expiration (uses Finnhub date filter if supported; otherwise filters locally) */
export async function fhOptions(symbol: string, dateISO: string): Promise<{ calls: FHOptionRow[]; puts: FHOptionRow[] }> {
  // Try asking Finnhub for that date specifically; if API ignores it we filter locally anyway.
  const chain = await fhFetch<FHChain>("/stock/option-chain", { symbol, date: dateISO }).catch(() => null);
  const rows = (chain?.data ?? []).length ? chain!.data! : (await fhFetch<FHChain>("/stock/option-chain", { symbol })).data ?? [];
  const filtered = rows.filter(r => r.expirationDate === dateISO);
  const calls = filtered.filter(r => r.type === "CALL");
  const puts  = filtered.filter(r => r.type === "PUT");
  return { calls, puts };
}

/** Premium in USD = price * volume * 100 (use lastPrice or mid(bid,ask)) */
export function premiumUSD(row: FHOptionRow): number {
  const px = Number(row.lastPrice ?? ((row.bid ?? 0) + (row.ask ?? 0)) / 2) || 0;
  const vol = Number(row.volume ?? 0) || 0;
  return px * vol * 100;
}
