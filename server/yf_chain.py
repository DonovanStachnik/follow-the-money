#!/usr/bin/env python3
import sys, json
import yfinance as yf
import pandas as pd  # yfinance expects pandas/numpy installed

symbol = (sys.argv[1] if len(sys.argv) > 1 else "AAPL").upper()
limit  = int(sys.argv[2]) if len(sys.argv) > 2 else 3

tk = yf.Ticker(symbol)

# yfinance returns up to all expirations; trim here
exps = tk.options[:limit]

per = []
for exp in exps:
    ch = tk.option_chain(exp)
    calls = ch.calls[["strike","openInterest"]].fillna(0)
    puts  = ch.puts[["strike","openInterest"]].fillna(0)

    strikes = sorted(set(calls["strike"]).union(set(puts["strike"])))
    call_map = dict(zip(map(float, calls["strike"]), map(int, calls["openInterest"])))
    put_map  = dict(zip(map(float,  puts["strike"]), map(int,  puts["openInterest"])))
    call_vec = [int(call_map.get(k, 0)) for k in strikes]
    put_vec  = [int(put_map.get(k, 0))  for k in strikes]
    net_vec  = [c - p for c, p in zip(call_vec, put_vec)]

    per.append({
        "date": exp,
        "strikes": strikes,
        "callMatrix": call_vec,
        "putMatrix":  put_vec,
        "netMatrix":  net_vec,
    })

print(json.dumps({"symbol": symbol, "expirations": exps, "perExpiry": per}))
