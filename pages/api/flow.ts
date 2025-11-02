import type { NextApiRequest, NextApiResponse } from "next";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const qs = req.url?.includes("?") ? req.url?.substring(req.url.indexOf("?")) : "";
  const upstream = `${API_BASE}/api/flow${qs || ""}`;
  const r = await fetch(upstream, { cache: "no-store" });
  const txt = await r.text();
  res.status(r.ok ? 200 : 502).setHeader("content-type", r.headers.get("content-type") || "application/json").send(txt);
}
