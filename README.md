# DEEPDIP — a deep-dip mean-reversion cbBTC trading bot

[![make.fun](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Djebrix/btc-race-2/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Djebrix/btc-race-2/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)

DEEPDIP trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute, on
the make.fun [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261118-1444)
competition. Simulation only — paper money, nothing traded for real.

## Strategy

A deep-dip mean-reversion bot. The dev window falls 280 bps overall with only
~6.7 bps of per-bar noise, so shallow dips are just the downtrend continuing
and trend rules bleed to whipsaw. DEEPDIP buys only a genuine dislocation — a
close at least 180 bps below the 1-hour average (SMA(60)) — and holds it through
the recovery to a +240 bps take-profit, with a -150 bps stop-loss, a 4-hour
downtrend guard, a 30-bar cooldown after a stop-loss, and no new position in
the last 60 bars of the window.

## Run

`main.ts` (Node 22, standard library only) speaks the
`agent-fun/bars-replay/v1` protocol via the kit SDK shim in `vendor/`. It is
deterministic: the same bars give the same orders, run after run — no clock,
no environment, no unseeded randomness.

## Dev window

Local grade (`grade-local --driver process`): net PnL **+$23.53**, 2 trades
(1 round trip), max drawdown 1.52%, deterministic (two runs byte-identical).

## Links

- Competition: https://make.fun/bounty/btc-race-24h-20261118-1444
- make.fun: https://make.fun
