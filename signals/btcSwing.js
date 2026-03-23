/**
 * BTC/USD 4H Swing signal detector.
 *
 * Long:  price closes above recent swing resistance + volume spike + RSI < 70
 * Short: price closes below recent swing support   + volume spike + RSI > 30
 */

const {
  parseOHLCV,
  calcRSI,
  hasVolumeSpike,
  swingResistance,
  swingSupport,
  trendDirection,
  calcConfidence,
} = require('../utils/indicators');

const SYMBOL    = 'BTC/USD';
const TIMEFRAME = '6h';
const LOOKBACK  = 20; // candles for swing hi/lo detection

/**
 * Analyse 4H BTC candles and return a signal object or null.
 *
 * @param {Array} candles  Raw OHLCV array from CCXT
 * @returns {Object|null}  Signal object or null if no signal
 */
function checkBTCSwing(candles) {
  if (!candles || candles.length < LOOKBACK + 10) {
    console.log('[BTC Swing] Not enough candles');
    return null;
  }

  const { highs, lows, closes, volumes } = parseOHLCV(candles);

  const currentClose = closes[closes.length - 1];
  const currentHigh  = highs[highs.length - 1];
  const currentLow   = lows[lows.length - 1];

  const rsi        = calcRSI(closes, 14);
  const resistance = swingResistance(highs, LOOKBACK);
  const support    = swingSupport(lows, LOOKBACK);
  const volSpike   = hasVolumeSpike(volumes, LOOKBACK, 1.5);
  const trend      = trendDirection(closes);

  console.log(
    `[BTC Swing] Close: ${currentClose.toFixed(2)} | ` +
    `Resistance: ${resistance.toFixed(2)} | Support: ${support.toFixed(2)} | ` +
    `RSI: ${rsi ? rsi.toFixed(1) : 'N/A'} | Vol spike: ${volSpike} | Trend: ${trend}`
  );

  // ── LONG ───────────────────────────────────────────────────────────────────
  if (currentClose > resistance && volSpike && rsi !== null && rsi < 70) {
    const entry  = currentClose;
    const stop   = support;  // below last swing low
    const risk   = entry - stop;
    const target = entry + risk * 2; // 1:2 R:R minimum

    const confidence = calcConfidence([
      trend === 'LONG',
      rsi < 60,          // RSI has room to run
      rsi > 45,          // not starting from oversold
      volSpike,
    ], 55);

    return {
      symbol:     SYMBOL,
      direction:  'LONG',
      type:       'SWING',
      timeframe:  '6H',
      entry,
      stop,
      target,
      confidence,
      reason:     `Resistance breakout (${resistance.toFixed(0)}) + volume spike`,
    };
  }

  // ── SHORT ──────────────────────────────────────────────────────────────────
  if (currentClose < support && volSpike && rsi !== null && rsi > 30) {
    const entry  = currentClose;
    const stop   = resistance; // above last swing high
    const risk   = stop - entry;
    const target = entry - risk * 2; // 1:2 R:R minimum

    const confidence = calcConfidence([
      trend === 'SHORT',
      rsi > 40,          // RSI has room to fall
      rsi < 55,          // not starting from overbought extreme
      volSpike,
    ], 55);

    return {
      symbol:     SYMBOL,
      direction:  'SHORT',
      type:       'SWING',
      timeframe:  '6H',
      entry,
      stop,
      target,
      confidence,
      reason:     `Support breakdown (${support.toFixed(0)}) + volume spike`,
    };
  }

  return null;
}

module.exports = { checkBTCSwing, SYMBOL, TIMEFRAME };
