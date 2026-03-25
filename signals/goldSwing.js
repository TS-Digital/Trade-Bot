/**
 * Gold/USD (XAU/USD) 4H Swing signal detector.
 *
 * Same logic as BTC swing but tuned for Gold:
 *   Long:  close above resistance + volume spike + RSI < 70
 *   Short: close below support    + volume spike + RSI > 30
 *
 * Candle data is sourced from the Twelve Data REST API (TWELVE_DATA_API_KEY).
 * If the key is absent the Gold check is skipped gracefully.
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

const SYMBOL    = 'XAU/USD';
const TIMEFRAME = '4h';
const LOOKBACK  = 20;

/**
 * @param {Array} candles  Raw OHLCV array from CCXT
 * @returns {Object|null}
 */
function checkGoldSwing(candles) {
  if (!candles || candles.length < LOOKBACK + 10) {
    console.log('[Gold Swing] Not enough candles');
    return null;
  }

  const { highs, lows, closes, volumes } = parseOHLCV(candles);

  const currentClose = closes[closes.length - 1];

  const rsi        = calcRSI(closes, 14);
  const resistance = swingResistance(highs, LOOKBACK);
  const support    = swingSupport(lows, LOOKBACK);
  const volSpike   = hasVolumeSpike(volumes, LOOKBACK, 1.5);
  const trend      = trendDirection(closes);

  console.log(
    `[Gold Swing] Close: ${currentClose.toFixed(2)} | ` +
    `Resistance: ${resistance.toFixed(2)} | Support: ${support.toFixed(2)} | ` +
    `RSI: ${rsi ? rsi.toFixed(1) : 'N/A'} | Vol spike: ${volSpike} | Trend: ${trend}`
  );

  // ── LONG ───────────────────────────────────────────────────────────────────
  if (currentClose > resistance && volSpike && rsi !== null && rsi < 70) {
    const entry  = currentClose;
    const stop   = support;
    const risk   = entry - stop;
    const target = entry + risk * 2;

    const confidence = calcConfidence([
      trend === 'LONG',
      rsi < 60,
      rsi > 45,
      volSpike,
    ], 55);

    return {
      symbol:    'Gold/USD',
      direction: 'LONG',
      type:      'SWING',
      timeframe: '4H',  // Twelve Data supports 4H natively
      entry,
      stop,
      target,
      confidence,
      reason:    `Resistance breakout (${resistance.toFixed(2)}) + volume spike`,
    };
  }

  // ── SHORT ──────────────────────────────────────────────────────────────────
  if (currentClose < support && volSpike && rsi !== null && rsi > 30) {
    const entry  = currentClose;
    const stop   = resistance;
    const risk   = stop - entry;
    const target = entry - risk * 2;

    const confidence = calcConfidence([
      trend === 'SHORT',
      rsi > 40,
      rsi < 55,
      volSpike,
    ], 55);

    return {
      symbol:    'Gold/USD',
      direction: 'SHORT',
      type:      'SWING',
      timeframe: '4H',  // Twelve Data supports 4H natively
      entry,
      stop,
      target,
      confidence,
      reason:    `Support breakdown (${support.toFixed(2)}) + volume spike`,
    };
  }

  return null;
}

module.exports = { checkGoldSwing, SYMBOL, TIMEFRAME };
