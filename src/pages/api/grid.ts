import type { NextApiRequest, NextApiResponse } from "next";

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

type FHFlatRow = {
  expirationDate?: string;
  strike?: number;
  strikePrice?: number;
  type?: string;
  lastPrice?: number;
  markPrice?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
};

type FHNestedEntry = {
  expirationDate?: string;
  options?: {
    CALL?: FHFlatRow[];
    PUT?: FHFlatRow[];
  };
};

type FHChain =
  | { code?: string; data?: (FHFlatRow | FHNestedEntry)[] }
  | any;

type GridPayload = {
  symbol: string;
  expirations: string[];
  strikes: number[];
  callMatrix: number[][];
  putMatrix: number[][];
  netMatrix: number[][];
};

// price × size × 100, with fallbacks for free plan gaps
function premiumUSD(r: FHFlatRow): number {
  const mid = ((r.bid ?? 0) + (r.ask ?? 0)) / 2;
  const px =
    Number(r.lastPrice ?? r.markPrice ?? mid) ||
    0;
  const size = Number(r.volume ?? r.openInterest ?? 0) || 0;
  return px * size * 100;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const symbol = String(req.query.ticker || "").trim().toUpperCase();
    const limit = Math.min(Math.max(Number(req.query.limit || 6), 1), 12);
    if (!symbol) return res.status(400).json({ error: "ticker required" });

    const chain = await fhFetch<FHChain>("/stock/option-chain", { symbol });
    const raw = Array.isArray(chain?.data) ? (chain.data as any[]) : [];

    // Flatten BOTH shapes to a simple array of rows: {expirationDate, type, strike, ...}
    const flat: FHFlatRow[] = [];
    for (const entry of raw) {
      if (entry && entry.options && (entry.options.CALL || entry.options.PUT)) {
        const exp = entry.expirationDate as string | undefined;
        const add = (arr: FHFlatRow[] | undefined, t: "CALL" | "PUT") => {
          (arr || []).forEach((r) =>
            flat.push({
              ...r,
              expirationDate: r.expirationDate ?? exp,
              type: (r.type ?? t).toString().toUpperCase(),
              strike: r.strike ?? r.strikePrice,
            })
          );
        };
        add(entry.options.CALL, "CALL");
        add(entry.options.PUT, "PUT");
      } else {
        // assume flat row
        flat.push({
          ...entry,
          strike: entry.strike ?? entry.strikePrice,
          type: (entry.type ?? "").toString().toUpperCase(),
        });
      }
    }

    // Keep only rows with a valid expiration + strike + type
    const rows = flat.filter(
      (r) =>
        r.expirationDate &&
        Number.isFinite(Number(r.strike)) &&
        (r.type === "CALL" || r.type === "PUT")
    ) as Required<Pick<FHFlatRow, "expirationDate" | "strike" | "type">> & FHFlatRow[];

    if (!rows.length) {
      const empty: GridPayload = {
        symbol,
        expirations: [],
        strikes: [],
        callMatrix: [],
        putMatrix: [],
        netMatrix: [],
      };
      return res.status(200).json(empty);
    }

    // Find expirations (sorted, first N)
    const allExps = Array.from(new Set(rows.map((r: any) => r.expirationDate as string))).sort();
    const expirations = allExps.slice(0, limit);

    // Aggregate by expiration + strike
    type PerExp = { calls: Map<number, number>; puts: Map<number, number> };
    const per: Record<string, PerExp> = {};
    const strikeSet = new Set<number>();
    for (const exp of expirations) per[exp] = { calls: new Map(), puts: new Map() };

    for (const r of rows) {
      const exp = r.expirationDate as string;
      if (!per[exp]) continue; // ignore expirations outside the first N
      const k = Number(r.strike);
      const prem = premiumUSD(r);
      if (!Number.isFinite(k)) continue;

      if (r.type === "CALL") {
        per[exp].calls.set(k, (per[exp].calls.get(k) || 0) + prem);
      } else {
        per[exp].puts.set(k, (per[exp].puts.get(k) || 0) + prem);
      }
      strikeSet.add(k);
    }

    let strikes = Array.from(strikeSet.values()).sort((a, b) => a - b);
    const MAX_ROWS = 80;
    if (strikes.length > MAX_ROWS) {
      const step = Math.ceil(strikes.length / MAX_ROWS);
      strikes = strikes.filter((_, i) => i % step === 0);
    }

    const R = strikes.length, C = expirations.length;
    const callMatrix = Array.from({ length: R }, () => Array(C).fill(0));
    const putMatrix  = Array.from({ length: R }, () => Array(C).fill(0));
    const netMatrix  = Array.from({ length: R }, () => Array(C).fill(0));

    for (let c = 0; c < C; c++) {
      const exp = expirations[c];
      const maps = per[exp];
      for (let rIdx = 0; rIdx < R; rIdx++) {
        const k = strikes[rIdx];
        const cp = maps.calls.get(k) || 0;
        const pp = maps.puts.get(k) || 0;
        callMatrix[rIdx][c] = cp;
        putMatrix[rIdx][c]  = pp;
        netMatrix[rIdx][c]  = cp - pp;
      }
    }

    const payload: GridPayload = { symbol, expirations, strikes, callMatrix, putMatrix, netMatrix };
    res.status(200).json(payload);
  } catch (e:any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
