# HeatSeeker Pro (REAL data MVP)

Free, professional options dashboard (15-min delayed) — Next.js + TypeScript + Tailwind + yahoo-finance2.
No mock data: all endpoints fetch real quotes/options from Yahoo Finance's public endpoints via yahoo-finance2.

## Requirements
- Node.js 18+
- npm (or pnpm/yarn)
- Internet connection (APIs are called at runtime)

## Quickstart
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Notes
- "Top" panel uses Yahoo trending tickers (real, but not options-specific).
- "Most Active Contracts" is derived from the options chain for the selected expiration, sorted by volume.
- Heatmap aggregates premium by strike for calls and puts: premium ≈ volume × last × 100.
- True *per-trade* options flow requires paid feeds. This MVP uses free, delayed public data.

## Deploy
- Frontend/API: Vercel (works out of the box)
