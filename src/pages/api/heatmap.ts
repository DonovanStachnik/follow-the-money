import type { NextApiRequest, NextApiResponse } from "next";

type HeatResp = { strikes: number[]; callPremiums: number[]; putPremiums: number[] };

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://finance.yahoo.com/",
};

function num(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function ymdToUnix(ymd?: string): number | undefined {
  if (!ymd) return undefined;
  const t = Date.parse(ymd + "T00:00:00Z");
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const ticker = String(req.query.ticker || "").toUpperCase().trim();
  const expiration = String(req.query.expiration || "").trim(); // "YYYY-MM-DD" or ""
  if (!ticker) return res.status(400).json({ error: "Missing ticker" });

  try {
    const baseUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(
      ticker
    )}`;

    // 1) Get the list of expiration timestamps
    const baseResp = await fetch(baseUrl, { headers: UA });
    if (!baseResp.ok) {
      return res
        .status(baseResp.status)
        .json({ error: `YF base HTTP ${baseResp.status}` });
    }
    const baseJson = await baseResp.json();
    const exps: number[] =
      baseJson?.optionChain?.result?.[0]?.expirationDates || [];

    // 2) Map selected "YYYY-MM-DD" to Yahoo's unix expiration
    let ts: number | undefined;
    if (exps.length > 0) {
      if (expiration) {
        const want = ymdToUnix(expiration);
        // match exactly or pick closest
        ts =
          exps.find((d) => Math.abs(d - (want ?? 0)) < 36 * 3600) ??
          (want
            ? exps.reduce((a, b) =>
                Math.abs(a - want) < Math.abs(b - want) ? a : b
              )
            : exps[0]);
      } else {
        ts = exps[0];
      }
    }

    // 3) Fetch the chain for that expiration
    const url = ts ? `${baseUrl}?date=${ts}` : baseUrl;
    const chainResp = await fetch(url, { headers: UA });
    if (!chainResp.ok) {
      const body = await chainResp.text();
      return res
        .status(chainResp.status)
        .json({ error: `YF options HTTP ${chainResp.status}`, body: body.slice(0, 500) });
    }
    const chainJson = await chainResp.json();
    const result = chainJson?.optionChain?.result?.[0];
    const calls = result?.options?.[0]?.calls ?? [];
    const puts = result?.options?.[0]?.puts ?? [];

    // 4) Aggregate dollar flow per strike
    const strikesSet = new Set<number>();
    const callMap = new Map<number, number>();
    const putMap = new Map<number, number>();

    for (const c of calls) {
      const strike = num(c.strike);
      if (!Number.isFinite(strike)) continue;
      const vol = num(c.volume);
      const last =
        num(c.lastPrice ?? c.lastTradePrice ?? c.ask ?? c.bid ?? c.mark);
      const prem = vol * last * 100;
      strikesSet.add(strike);
      callMap.set(strike, (callMap.get(strike) ?? 0) + prem);
    }

    for (const p of puts) {
      const strike = num(p.strike);
      if (!Number.isFinite(strike)) continue;
      const vol = num(p.volume);
      const last =
        num(p.lastPrice ?? p.lastTradePrice ?? p.ask ?? p.bid ?? p.mark);
      const prem = vol * last * 100;
      strikesSet.add(strike);
      putMap.set(strike, (putMap.get(strike) ?? 0) + prem);
    }

    const strikes = Array.from(strikesSet).sort((a, b) => a - b);
    const callPremiums = strikes.map((s) => Math.round(callMap.get(s) ?? 0));
    const putPremiums = strikes.map((s) => Math.round(putMap.get(s) ?? 0));

    // 5) If there’s truly no volume, return empty but valid structure
    return res.status(200).json({ strikes, callPremiums, putPremiums } as HeatResp);
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: e?.message || "Failed to build heatmap" });
  }
}
