import type { NextApiRequest } from "next";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

async function yfetch<T = any>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Connection": "keep-alive",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Yahoo HTTP ${res.status} :: ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function getQuote(symbol: string) {
  const u = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const json = await yfetch<any>(u);
  const r = json?.quoteResponse?.result?.[0];
  return r || null;
}

export async function getExpirations(symbol: string): Promise<number[]> {
  const u = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  const json = await yfetch<any>(u);
  const exps: number[] = json?.optionChain?.result?.[0]?.expirationDates || [];
  return exps;
}

export type YOpt = {
  contractSymbol: string;
  strike: number;
  lastPrice?: number;
  volume?: number;
  bid?: number;
  ask?: number;
};

export async function getOptions(
  symbol: string,
  expirationUnix?: number
): Promise<{ underlyingPrice?: number; calls: YOpt[]; puts: YOpt[] }> {
  const qs = expirationUnix ? `?date=${expirationUnix}` : "";
  const u = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}${qs}`;
  const json = await yfetch<any>(u);
  const first = json?.optionChain?.result?.[0];
  return {
    underlyingPrice: first?.quote?.regularMarketPrice ?? first?.quote?.postMarketPrice,
    calls: first?.options?.[0]?.calls ?? [],
    puts: first?.options?.[0]?.puts ?? [],
  };
}
