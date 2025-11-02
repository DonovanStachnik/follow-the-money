import type { NextApiRequest, NextApiResponse } from "next";

// Small Finnhub fetcher (local to this file)
const FH_BASE = "https://finnhub.io/api/v1";
function qs(params: Record<string, string | number | undefined>) {
  return Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}
async function fhFetch<T = any>(path: string, params: Record<string, any> = {}): Promise<T> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("FINNHUB_API_KEY missing in .env.local");
  const url = `${FH_BASE}${path}?${qs({ ...params, token })}`;
  const res = await fetch(url, { next: { revalidate: 0 } as any });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Finnhub ${res.status} :: ${txt.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// Types we use
type FHRow = {
  expirationDate?: string;  // ISO like '2025-11-07'
  strike?: number;          // sometimes strike
  strikePrice?: number;     // sometimes strikePrice
  type?: string;            // 'CALL'|'PUT' (sometimes lowercase)
  lastPrice?: number;
  volume?: number;
  bid?: number;
  ask?: number;
};
type FHChain = { code?: string; data?: FHRow[] };

type GridPayload = {
  symbol: string;
  expirations: string[];
  strikes: number[];
  callMatrix: number[][];
  putMatrix: number[][];
  netMatrix: number[][];
};

// Premium = (lastPrice or mid(bid, ask)) * volume * 100
function premiumUSD(r: FHRow): number {
  const px = Number(r.lastPrice ?? ((r.bid ?? 0) + (r.ask ?? 0)) / 2) || 0;
  const vol = Number(r.volume ?? 0) || 0;
  return px * vol * 100;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ticker = String(req.query.ticker || "").trim().toUpperCase();
    const limit  = Math.min(Math.max(Number(req.query.limit || 6), 1), 12);
    if (!ticker) return res.status(400).json({ error: "ticker required" });

    // 1) Pull the whole chain ONCE
    const chain = await fhFetch<FHChain>("/stock/option-chain", { symbol: ticker });
    const rows = (chain?.data ?? []).filter(r => r && r.expirationDate);

    if (!rows.length) {
      const empty: GridPayload = { symbol: ticker, expirations: [], strikes: [], callMatrix: [], putMatrix: [], netMatrix: [] };
      return res.status(200).json(empty);
    }

    // 2) Find unique expirations available in the chain, pick the first N (sorted)
    const allExps = Array.from(new Set(rows.map(r => r.expirationDate as string))).sort();
    const expirations = allExps.slice(0, limit);

    // 3) Build per-exp maps and a global strike set
    type PerExp = { calls: Map<number, number>; puts: Map<number, number> };
    const per: Record<string, PerExp> = {};
    const strikeSet = new Set<number>();

    for (const exp of expirations) {
      per[exp] = { calls: new Map(), puts: new Map() };
    }

    for (const r of rows) {
      const exp = r.expirationDate!;
      if (!per[exp]) continue; // ignore expirations beyond the selected limit
      const strike = Number(r.strike ?? (r as any).strikePrice ?? NaN);
      if (!isFinite(strike)) continue;

      const t = String(r.type || "").toUpperCase();
      const prem = premiumUSD(r);
      if (prem <= 0) continue;

      if (t === "CALL") {
        const prev = per[exp].calls.get(strike) || 0;
        per[exp].calls.set(strike, prev + prem);
      } else if (t === "PUT") {
        const prev = per[exp].puts.get(strike) || 0;
        per[exp].puts.set(strike, prev + prem);
      } else {
        continue;
      }
      strikeSet.add(strike);
    }

    let strikes = Array.from(strikeSet.values()).sort((a,b)=>a-b);
    // Clamp rows for readability
    const MAX_ROWS = 80;
    if (strikes.length > MAX_ROWS) {
      const step = Math.ceil(strikes.length / MAX_ROWS);
      strikes = strikes.filter((_, i) => i % step === 0);
    }

    // 4) Build matrices
    const rowsN = strikes.length, colsN = expirations.length;
    const callMatrix = Array.from({ length: rowsN }, () => Array(colsN).fill(0));
    const putMatrix  = Array.from({ length: rowsN }, () => Array(colsN).fill(0));
    const netMatrix  = Array.from({ length: rowsN }, () => Array(colsN).fill(0));

    for (let c = 0; c < colsN; c++) {
      const exp = expirations[c];
      const maps = per[exp];
      for (let rIdx = 0; rIdx < rowsN; rIdx++) {
        const k = strikes[rIdx];
        const cPrem = maps.calls.get(k) || 0;
        const pPrem = maps.puts.get(k)  || 0;
        callMatrix[rIdx][c] = cPrem;
        putMatrix[rIdx][c]  = pPrem;
        netMatrix[rIdx][c]  = cPrem - pPrem;
      }
    }

    const payload: GridPayload = { symbol: ticker, expirations, strikes, callMatrix, putMatrix, netMatrix };
    res.status(200).json(payload);
  } catch (e:any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
