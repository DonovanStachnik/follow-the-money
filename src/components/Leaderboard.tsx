export default function Leaderboard({ items }: { items: { symbol: string; dollarFlow: number }[] }) {
  if (!items?.length) return <div className="subtle">No data</div>;
  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div key={it.symbol} className="flex justify-between items-center bg-slate-800 border border-slate-700 p-3 rounded-xl">
          <div>
            <div className="font-medium">{idx + 1}. {it.symbol}</div>
            <div className="text-xs text-slate-400">Trending activity</div>
          </div>
          <div className="font-semibold">${it.dollarFlow.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
