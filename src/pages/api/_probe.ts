import type { NextApiRequest, NextApiResponse } from "next";
import { getOptionsForDate, getExpirations } from "../../utils/yahoo";
import { getQuote } from "../../utils/yahoo";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ticker = String(req.query.ticker || "").toUpperCase().trim() || "AAPL";
  const expiration = String(req.query.expiration || "").trim() || null;
  try {
    const quote = await getQuote(ticker);
    const exps  = await getExpirations(ticker);
    const pack  = await getOptionsForDate(ticker, expiration || exps[0]);
    if (!pack) return res.status(200).json({ ticker, quote, exps, provider: null, counts: {calls:0, puts:0} });
    const { provider, data, expiryIso } = pack as any;
    return res.status(200).json({
      ticker, expiryIso, provider,
      counts: { calls: data?.calls?.length || 0, puts: data?.puts?.length || 0 },
      sample: {
        call0: data?.calls?.[0] ?? null,
        put0:  data?.puts?.[0]  ?? null
      }
    });
  } catch (e:any) {
    return res.status(200).json({ error: e?.message || String(e) });
  }
}
