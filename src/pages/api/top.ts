import type { NextApiRequest, NextApiResponse } from "next";

const HEADERS: Record<string,string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Referer": "https://finance.yahoo.com/"
};

async function getJson(url: string) {
  const resp = await fetch(url, { headers: HEADERS });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText} :: ${txt.slice(0,300)}`);
  return JSON.parse(txt);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Yahoo trending (US)
    const data: any = await getJson("https://query1.finance.yahoo.com/v1/finance/trending/US?count=12");
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    const top = quotes.slice(0, 10).map((q: any) => ({
      symbol: q?.symbol || q?.quote?.symbol || "N/A",
      value: Number(q?.quote?.regularMarketVolume || 0)
    }));
    return res.status(200).json({ top });
  } catch (e:any) {
    console.error("[/api/top] error:", e?.message || e);
    return res.status(500).json({ error: e?.message || "Failed in /api/top" });
  }
}
