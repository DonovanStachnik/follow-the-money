import React, { useMemo, useState } from "react";

type GridData = {
  symbol: string;
  expirations: string[];
  strikes: number[];
  callMatrix: number[][];
  putMatrix: number[][];
  netMatrix: number[][];
};

type Props = { data: GridData | null };

function quantize(value: number, maxAbs: number) {
  // returns bucket 0..9; center around 0
  if (maxAbs <= 0) return 0;
  const x = Math.max(-maxAbs, Math.min(maxAbs, value));
  const t = (x + maxAbs) / (2 * maxAbs); // 0..1
  return Math.min(9, Math.max(0, Math.floor(t * 10)));
}

/** Diverging palette tuned to your screenshots:
 *  deep purple (big puts) → teal/green (small pos) → bright yellow (big calls)
 */
const PALETTE = [
  "#3b0a57", "#572a7a", "#4f4fa0", "#2e7b8f", "#2aa198",
  "#3aa56e", "#6cc04f", "#a7d642", "#e4e13a", "#ffd41a"
];

export default function GridHeatmap({ data }: Props) {
  const [view, setView] = useState<"net"|"calls"|"puts">("net");

  const { rows, cols, maxAbs, pick } = useMemo(() => {
    if (!data) return { rows: 0, cols: 0, maxAbs: 0, pick: (_r:number,_c:number)=>0 };
    const rows = data.strikes.length;
    const cols = data.expirations.length;
    let maxAbs = 0;

    const mat =
      view === "calls" ? data.callMatrix :
      view === "puts"  ? data.putMatrix.map(r => r.map(v => -v)) : // invert puts so negative = puts
                         data.netMatrix;

    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) maxAbs = Math.max(maxAbs, Math.abs(mat[r][c]));
    const pick = (r:number, c:number) => mat[r][c];
    return { rows, cols, maxAbs, pick };
  }, [data, view]);

  if (!data || data.strikes.length === 0 || data.expirations.length === 0) {
    return <div className="text-slate-400">No grid data.</div>;
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-2">
        <button className={`px-2 py-1 rounded ${view==="net"?"bg-sky-600 text-white":"bg-slate-700"}`} onClick={()=>setView("net")}>Net</button>
        <button className={`px-2 py-1 rounded ${view==="calls"?"bg-sky-600 text-white":"bg-slate-700"}`} onClick={()=>setView("calls")}>Calls</button>
        <button className={`px-2 py-1 rounded ${view==="puts"?"bg-sky-600 text-white":"bg-slate-700"}`} onClick={()=>setView("puts")}>Puts</button>
        <div className="text-slate-400 text-sm ml-2">Color: deep purple (puts) → teal/green → yellow (big calls)</div>
      </div>

      <div className="relative border border-slate-700 rounded-lg overflow-auto max-h-[70vh]">
        {/* sticky column headers */}
        <div className="sticky top-0 z-10 grid" style={{ gridTemplateColumns: `120px repeat(${data.expirations.length}, 110px)`}}>
          <div className="bg-slate-900 border-b border-slate-700 p-2 font-semibold">Strike ▼ / Expiry ►</div>
          {data.expirations.map(exp => (
            <div key={exp} className="bg-slate-900 border-b border-slate-700 p-2 text-center font-semibold">{exp}</div>
          ))}
        </div>

        {/* body */}
        <div>
          {data.strikes.map((strike, r) => (
            <div key={strike} className="grid" style={{ gridTemplateColumns: `120px repeat(${data.expirations.length}, 110px)`}}>
              <div className="sticky left-0 z-10 bg-slate-900 border-t border-slate-800 p-2 text-right">{strike.toFixed(2)}</div>
              {data.expirations.map((_, c) => {
                const val = pick(r,c);
                const bucket = quantize(val, maxAbs);
                const color = PALETTE[bucket];
                return (
                  <div key={c}
                       title={`$${Math.round(Math.abs(val)).toLocaleString()} ${val<0?"puts":"calls"}`}
                       className="border-t border-slate-800 text-center text-[11px] leading-6"
                       style={{ backgroundColor: color }}>
                    {Math.abs(val) >= 1000 ? `$${Math.round(val/1000)}k` : (val!==0? `$${Math.round(val)}` : "")}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
