import Head from "next/head";
import Header from "../components/Header";
import { useState } from "react";

export default function Home() {
  const [symbol, setSymbol] = useState("AAPL");
  return (
    <>
      <Head>
        <title><a href="/" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:inherit"><img src="/logo.svg" alt="Follow The Money" width="26" height="26"/><span>Follow The Money</span></a></title>
      </Head>
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-6 text-slate-200">
        <h1 className="text-2xl font-semibold mb-3">Options Intelligence</h1>
        <div className="flex gap-2 items-center mb-6">
          <label className="text-sm text-slate-400">Symbol</label>
          <input
            value={symbol}
            onChange={(e)=>setSymbol(e.target.value.toUpperCase())}
            className="bg-[#0f172a] border border-slate-700 rounded px-3 py-2 text-white"
            placeholder="AAPL"
          />
          <a
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded"
            href={`/api/grid?ticker=${encodeURIComponent(symbol)}`}
            target="_blank" rel="noreferrer"
          >
            Search (raw API)
          </a>
        </div>

        <p className="text-slate-400">
          Tip: Your API is running at <code className="text-slate-300">/api</code>.  
          Try <code className="text-slate-300">/api/search?ticker=AAPL</code> or view the UI page you already have for quotes/expirations.
        </p>
      </main>
    </>
  );
}

