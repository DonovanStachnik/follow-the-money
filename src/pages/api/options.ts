import type { NextApiRequest, NextApiResponse } from "next";
import { getExpirations, getOptionsForDate } from "../../utils/yahoo";

async function firstNonEmpty(ticker: string, preferred?: string | null) {
  // 1) try preferred first
  if (preferred) {
    const pack = await getOptionsForDate(ticker, preferred);
    if (pack && ((pack.data.calls?.length || 0) + (pack.data.puts?.length || 0)) > 0) {
      return pack;
    }
  }
  // 2) scan next expirations and return the first with data
  const exps = await getExpirations(ticker);
  for (const d of exps.slice(0, 10)) {
    const pack = await getOptionsForDate(ticker, d);
    if (pack && ((pack.data.calls?.length || 0) + (pack.data.puts?.length || 0)) > 0) {
      return pack;
    }
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ticker = String(req.query.ticker || "").toUpperCase().trim();
  const expiration = String(req.query.expiration || "").trim() || null;
  if (!ticker) return res.status(200).json({ topContracts: [], error: "Missing ticker" });

  try {
    const pack = await firstNonEmpty(ticker, expiration);
    if (!pack) return res.status(200).json({ topContracts: [], picked: null });

    const { data, expiryIso } = pack;
    const rows:any[] = [];
    const add = (arr:any[], type:"CALL"|"PUT") => {
      for (const c of arr || []) {
        const vol  = Number(c.volume||0);
        const last = Number(c.lastPrice||0);
        const prem = Math.max(0, Math.round(vol * last * 100));
        rows.push({
          time: "", symbol: ticker, type, strike: c.strike, expiry: expiryIso,
          premium: prem, side: "BUY", volume: vol, lastPrice: last, openInterest: Number(c.openInterest||0)
        });
      }
    };
    add(data.calls, "CALL"); add(data.puts, "PUT");
    rows.sort((a,b)=> (b.volume - a.volume) || (b.premium - a.premium));
    return res.status(200).json({ topContracts: rows.slice(0,30), picked: expiryIso });
  } catch (e:any) {
    return res.status(200).json({ topContracts: [], error: e?.message || "OPTIONS_FAIL" });
  }
}
