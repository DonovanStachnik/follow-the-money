import type { NextApiRequest, NextApiResponse } from "next";
import { fhQuote, fhExpirations } from "../../utils/finnhub";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ticker = String(req.query.ticker || "").trim().toUpperCase();
    if (!ticker) return res.status(400).json({ error: "ticker required" });

    const [{ price, name }, expirations] = await Promise.all([
      fhQuote(ticker),
      fhExpirations(ticker).catch(() => []),
    ]);

    res.status(200).json({
      quote: { symbol: ticker, regularMarketPrice: price, longName: name },
      expirations,
    });
  } catch (e:any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
