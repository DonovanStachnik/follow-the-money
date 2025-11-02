import type { NextApiRequest, NextApiResponse } from "next";
import { yfQuote, yfExpirations, yfOptionsForDate } from "../../utils/yahoo";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ticker = String(req.query.ticker || "AAPL").toUpperCase();
  try {
    const quote = await yfQuote(ticker);
    const exps = await yfExpirations(ticker);
    const first = exps[0] || null;
    let hasOpt = false;
    if (first) {
      const opt = await yfOptionsForDate(ticker, first);
      hasOpt = !!opt;
    }
    return res.status(200).json({ ok: true, quoteOk: !!quote, expirations: exps.slice(0,5), firstHasOptions: hasOpt });
  } catch (e:any) {
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
}
