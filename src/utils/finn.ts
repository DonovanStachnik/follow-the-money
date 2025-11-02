const FINN = process.env.FINNHUB_API_KEY || "";
export async function fhJson(url: string) {
  if (!FINN) throw new Error("FINNHUB_API_KEY missing");
  const u = url.includes("?") ? `${url}&token=${encodeURIComponent(FINN)}` : `${url}?token=${encodeURIComponent(FINN)}`;
  const r = await fetch(u);
  const t = await r.text();
  if (!r.ok) throw new Error(`FH HTTP ${r.status} ${r.statusText} :: ${t.slice(0,200)}`);
  try { return JSON.parse(t); } catch { throw new Error(`FH bad JSON: ${t.slice(0,200)}`); }
}
