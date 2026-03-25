/**
 * BTC/USD 5M Scalp signal detector.
 *
 * Signals:
 *   Long scalp:  bullish engulfing on 5M + EMA momentum UP + 4H trend is LONG
 *   Short scalp: bearish engulfing on 5M + EMA momentum DOWN + 4H trend is SHORT
 *
 * RSI filter: avoid entering at extremes (long if RSI < 70, short if RSI > 30)
 */

const {
  parseOHLCV,
  calcRSI,
  hasVolumeSpike,
  isBullishEngulfing,
  isBearishEngulfing,
  momentumEMA,
  trendDirection,
  calcConfidence,
} = require('../utils/indicators');

const SYMBOL      = 'BTC/USD';
const TIMEFRAME   = '15m';
// Stop: half the engulfing candle's range below/above entry
const STOP_MULTIPLIER = 1.0;
// Target: 2× risk
const TARGET_RR = 2;

/**
 * @param {Array} candles5m  Raw 5M OHLCV from CCXT
 * @param {Array} candles4h  Raw 4H OHLCV from CCXT (for trend filter)
 * @returns {Object|null}
 */
function checkBTCScalp(candles5m, candles4h) {
  if (!candles5m || candles5m.length < 10) {
    console.log('[BTC Scalp] Not enough 5M candles');
    return null;
  }
  if (!candles4h || candles4h.length < 50) {
    console.log('[BTC Scalp] Not enough 4H candles for trend');
    return null;
  }

  const m5 = parseOHLCV(candles5m);
  const h4 = parseOHLCV(candles4h);

  const trend    = trendDirection(h4.closes);
  const rsi      = calcRSI(m5.closes, 14);
  const momentum = momentumEMA(m5.closes, 9);

  const lastClose = m5.closes[m5.closes.length - 1];
  const lastOpen  = m5.opens[m5.opens.length - 1];
  const lastHigh  = m5.highs[m5.highs.length - 1];
  const lastLow   = m5.lows[m5.lows.length - 1];
  const candleRange = lastHigh - lastLow;

  console.log(
    `[BTC Scalp] 4H Trend: ${trend} | 5M Momentum: ${momentum} | ` +
    `RSI: ${rsi ? rsi.toFixed(1) : 'N/A'} | ` +
    `Bullish Eng: ${isBullishEngulfing(m5.opens, m5.closes)} | ` +
    `Bearish Eng: ${isBearishEngulfing(m5.opens, m5.closes)}`
  );

  // ── LONG SCALP ─────────────────────────────────────────────────────────────
  if (
    trend === 'LONG' &&
    isBullishEngulfing(m5.opens, m5.closes) &&
    momentum === 'UP' &&
    rsi !== null && rsi < 70
  ) {
    const entry  = lastClose;
    const stop   = lastLow - candleRange * 0.1; // just below the engulfing low
    const risk   = entry - stop;
    const target = entry + risk * TARGET_RR;

    const confidence = calcConfidence([
      rsi < 60,
      rsi > 40,
      momentum === 'UP',
      trend === 'LONG',
    ], 55);

    return {
      symbol:    SYMBOL,
      direction: 'LONG',
      type:      'SCALP',
      timeframe: '15M',
      entry,
      stop,
      target,
      confidence,
      reason:    'Bullish engulfing (5M) + EMA momentum UP + 4H uptrend',
    };
  }

  // ── SHORT SCALP ────────────────────────────────────────────────────────────
  if (
    trend === 'SHORT' &&
    isBearishEngulfing(m5.opens, m5.closes) &&
    momentum === 'DOWN' &&
    rsi !== null && rsi > 30
  ) {
    const entry  = lastClose;
    const stop   = lastHigh + candleRange * 0.1; // just above the engulfing high
    const risk   = stop - entry;
    const target = entry - risk * TARGET_RR;

    const confidence = calcConfidence([
      rsi > 40,
      rsi < 60,
      momentum === 'DOWN',
      trend === 'SHORT',
    ], 55);

    return {
      symbol:    SYMBOL,
      direction: 'SHORT',
      type:      'SCALP',
      timeframe: '15M',
      entry,
      stop,
      target,
      confidence,
      reason:    'Bearish engulfing (5M) + EMA momentum DOWN + 4H downtrend',
    };
  }

  return null;
}

/**
 * Brewing alert for scalp setups.
 */
function checkBTCScalpBrewing(candles5m, candles4h) {
  if (!candles5m || candles5m.length < 10) return null;
  if (!candles4h || candles4h.length < 50) return null;

  const m5 = parseOHLCV(candles5m);
  const h4 = parseOHLCV(candles4h);

  const trend    = trendDirection(h4.closes);
  const rsi      = calcRSI(m5.closes, 14);
  const volSpike = hasVolumeSpike(m5.volumes, 20, 1.5);
  const engulfing = isBullishEngulfing(m5.opens, m5.closes) ||
                    isBearishEngulfing(m5.opens, m5.closes);

  if (rsi === null) return null;

  const approachingOverbought = rsi >= 65 && rsi < 70;
  const approachingOversold   = rsi > 30 && rsi <= 35;
  const volNoEngulfing        = volSpike && !engulfing;

  if (!approachingOverbought && !approachingOversold && !volNoEngulfing) return null;

  return {
    symbol:    SYMBOL,
    type:      'BREWING',
    subtype:   'SCALP',
    timeframe: '15M',
    direction: trend,
    price:     m5.closes[m5.closes.length - 1],
    trend,
    rsi,
    volSpike,
    engulfing,
    rsiReason: approachingOverbought ? 'approaching overbought'
             : approachingOversold   ? 'approaching oversold'
             : null,
  };
}

module.exports = { checkBTCScalp, checkBTCScalpBrewing, SYMBOL, TIMEFRAME };
