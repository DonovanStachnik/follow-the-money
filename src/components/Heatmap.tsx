import React from "react";

type HeatData = {
  strikes: number[];
  callPremiums: number[]; // total premium = lastPrice * volume * 100
  putPremiums: number[];
} | null;

export default function Heatmap({ data }: { data: HeatData }) {
  if (!data) return <div className="subtle">No heatmap data</div>;

  const maxVal = Math.max(
    ...data.callPremiums,
    ...data.putPremiums,
    1
  );

  const toAlpha = (val: number) => Math.min(1, val / maxVal);

  return (
    <div className="mt-2 space-y-3">
      <div className="text-sm text-slate-300">Calls</div>
      <div className="grid grid-cols-8 gap-1">
        {data.strikes.map((s, i) => (
          <div key={i} className="h-8 rounded flex items-center justify-center text-xs"
            style={{ background: `rgba(16,185,129, ${toAlpha(data.callPremiums[i])})` }}
            title={`Strike ${s} • $${Math.round(data.callPremiums[i]).toLocaleString()}`}>
            {s}
          </div>
        ))}
      </div>

      <div className="text-sm text-slate-300 mt-4">Puts</div>
      <div className="grid grid-cols-8 gap-1">
        {data.strikes.map((s, i) => (
          <div key={i} className="h-8 rounded flex items-center justify-center text-xs"
            style={{ background: `rgba(244,63,94, ${toAlpha(data.putPremiums[i])})` }}
            title={`Strike ${s} • $${Math.round(data.putPremiums[i]).toLocaleString()}`}>
            {s}
          </div>
        ))}
      </div>

      <div className="subtle mt-2">Aggregated from real options chain (volume × last price × 100)</div>
    </div>
  );
}
