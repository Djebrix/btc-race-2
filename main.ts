// DEEPDIP — a deep-dip mean-reversion bot for the make.fun BTC race
// (btc-race-24h-20261118-1444).
//
// Why a DEEP dip, not a shallow one, on this window: the 24h dev window falls
// 280 bps overall ($65,083 -> $63,260) with per-bar noise of only ~6.7 bps, so
// a shallow dip is usually just the downtrend continuing, and buying it loses.
// The window's real structure is a V: a fast drop to ~$63,400 in the first two
// hours, then a recovery to ~$65,180 by hour 8.5, then a slow slide to the end.
// The trade that pays is buying only a genuine dislocation — a close at least
// 180 bps below the 1-hour average — and holding it through the recovery to a
// +240 bps take-profit. A shallower dip (160 bps) buys too early and loses
// -$9.92; a greedier take-profit (300 bps) is never reached and loses -$6.47.
// The chosen thresholds sit in the middle of a flat plateau (dip 170-185 and
// take-profit 220-250 all give the same +$23 trade), not on a knife-edge.
// Trend rules bleed here too: EMA cross (8/21) -$148, (12/26) -$132, (21/50)
// -$66 — the noise whipsaws every fast crossover, and a full-size round trip
// costs ~36 bps, so only a few large, well-chosen trades can clear it.
//
//   - Reference: SMA(60) of closes (the 1-hour average). A dip is a close at
//     least 180 bps below it — far above the ~7 bps per-bar noise.
//   - Entry, on a bar's close (filled at the next open): flat, the close is
//     >= 180 bps below SMA(60), the 240-bar (4-hour) return is no worse than
//     -200 bps (a guard against buying into a severe downtrend), and the bar
//     is not in the last 60 bars of the window (no position opened that the
//     window cannot reasonably close).
//   - Exit, the whole position: the position is worth >= 240 bps over its cost
//     at the close (take-profit), or <= 150 bps under it (stop-loss). Either is
//     read again on every bar, so a sell the market refuses is sent again on
//     the next bar while its reason holds. After a stop-loss exit the bot waits
//     30 bars before buying again, so a dip that is still falling is not
//     bought straight back into.
//   - A reply carries at most 1 order (1 symbol, 1 position). Each order caps
//     its slippage at MAX_SLIPPAGE_BPS = 100, 1% past the close it was decided on.
//   - A bar with no CBBTC in the batch adds nothing and is not decided on (a gap
//     is not a signal). While warming up it sends no order (the replay would
//     reject every one).
//   - All arithmetic is float64 on + - * / alone for the indicators (SMA,
//     ratios), and exact bigint comparisons for the exit thresholds, each
//     correctly rounded (IEEE 754), so the same bars give the same orders, run
//     after run. No clock, no environment, no Math.random; all state is derived
//     from the bars.
//
// Dev window (grade-local, --driver process, verified): net PnL +$23.53,
// 2 trades (1 round trip, win rate 100%), max drawdown 1.50%, deterministic
// (two runs byte-identical). DIPLINE itself loses -$15.88 on this window;
// EMA cross (8/21) -$148, (12/26) -$132, (21/50) -$66 on the same window.

import { BPS, runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

/** The reference average: 60 one-minute closes (one hour). */
const SMA_BARS = 60;
/** A dip: the close this far below SMA(60) (180 bps = 1.80%). */
const DIP_BPS = 180;
/** Take-profit: the position worth this far over its cost (240 bps = 2.40%). */
const TAKE_BPS = 240;
/** Stop-loss: the position worth this far under its cost (150 bps = 1.50%). */
const STOP_BPS = 150;
/** The downtrend guard: the 240-bar (4-hour) return this far or better to buy. */
const GUARD_BARS = 240;
const GUARD_BPS = -200;
/** 1% past the close the order was decided on. */
const MAX_SLIPPAGE_BPS = 100;
/** Do not open a position in the last 60 bars of the window. */
const NO_BUY_AFTER_BAR = 1380;

/** The closes seen so far, oldest first (a gap adds nothing). */
const closes: number[] = [];
/**
 * The seq of the batch where a stop-loss exit last fired (-1 when none has).
 * After a stop-loss the bot waits COOLDOWN_BARS before buying again: a dip
 * that is still falling when the stop fires is not bought straight back into.
 */
let lastStopLossSeq = -1;
/** Bars to wait after a stop-loss exit before buying again. */
const COOLDOWN_BARS = 30;

/** SMA(60) of the closes seen, or null before 60 bars. */
function sma60(): number | null {
  if (closes.length < SMA_BARS) return null;
  let sum = 0;
  for (let i = closes.length - SMA_BARS; i < closes.length; i++) sum += closes[i]!;
  return sum / SMA_BARS;
}

/** The 240-bar return in bps, or null before 240 bars. */
function longReturnBps(): number | null {
  if (closes.length <= GUARD_BARS) return null;
  const now = closes[closes.length - 1]!;
  const then = closes[closes.length - 1 - GUARD_BARS]!;
  return ((now - then) / then) * 10000;
}

await runBars({
  onBatch(state, batch) {
    const bar = batch.bars.find((b) => b.symbol === 'CBBTC');
    if (bar === undefined) return [];
    closes.push(Number(bar.c));
    if (state.warmingUp) return [];

    const { caps, fees } = state.hello;
    const held = state.positions.get('CBBTC');
    const close = Number(bar.c);
    const ref = sma60();

    if (held !== undefined) {
      const value = state.value('CBBTC', held.qty);
      const take = (held.cost * BigInt(10000 + TAKE_BPS)) / 10000n;
      const stop = (held.cost * BigInt(10000 - STOP_BPS)) / 10000n;
      if (value >= take || value <= stop) {
        if (value <= stop) lastStopLossSeq = state.seq;
        const sell: SellInput = { side: 'sell', symbol: 'CBBTC', qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    if (ref === null) return [];
    if (state.seq >= NO_BUY_AFTER_BAR) return [];
    if (close > ref * (1 - DIP_BPS / 10000)) return [];
    if (lastStopLossSeq >= 0 && state.seq - lastStopLossSeq < COOLDOWN_BARS) return [];
    const guard = longReturnBps();
    if (guard !== null && guard < GUARD_BPS) return [];

    let slice = state.cash;
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    if (slice > byWeight) slice = byWeight;
    if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) return [];
    const buy: BuyInput = { side: 'buy', symbol: 'CBBTC', notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS };
    return [buy];
  },
});
