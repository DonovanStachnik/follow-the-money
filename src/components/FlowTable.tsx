import React from "react";

type Row = {
  time: string;
  symbol: string;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  premium: number;
  side: "BUY" | "SELL";
  volume?: number;
  lastPrice?: number;
  openInterest?: number;
};

type Props = { rows: Row[] };

export default function FlowTable({ rows }: Props) {
  if (!rows || rows.length === 0) {
    return <div className="subtle">No active contracts found.</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-slate-300">
          <tr>
            <th className="py-2 pr-4">Symbol</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Strike</th>
            <th className="py-2 pr-4">Expiry</th>
            <th className="py-2 pr-4">Volume</th>
            <th className="py-2 pr-4">OI</th>
            <th className="py-2 pr-4">Last</th>
            <th className="py-2 pr-4">Est. Premium</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-top border-slate-800 border-t">
              <td className="py-2 pr-4 font-semibold">{r.symbol}</td>
              <td className="py-2 pr-4">{r.type}</td>
              <td className="py-2 pr-4">{r.strike}</td>
              <td className="py-2 pr-4">{r.expiry}</td>
              <td className="py-2 pr-4">{r.volume ?? "-"}</td>
              <td className="py-2 pr-4">{r.openInterest ?? "-"}</td>
              <td className="py-2 pr-4">${(r.lastPrice ?? 0).toFixed(2)}</td>
              <td className="py-2 pr-4">${r.premium.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="subtle mt-2">Derived from real Yahoo options chain (volume × last × 100). Not true per-trade flow.</div>
    </div>
  );
}
