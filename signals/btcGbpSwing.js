/**
 * BTC/GBP 6H Swing signal detector (Coinbase via CCXT).
 */

const {
  parseOHLCV, calcRSI, hasVolumeSpike,
  swingResistance, swingSupport, trendDirection, calcConfidence,
} = require('../utils/indicators');

const SYMBOL   = 'BTC/GBP';
const LOOKBACK = 20;

function checkBTCGBPSwing(candles) {
  if (!candles || candles.length < LOOKBACK + 10) {
    console.log('[BTC/GBP Swing] Not enough candles');
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
    `[BTC/GBP Swing] Close: ${currentClose.toFixed(0)} | ` +
    `Resistance: ${resistance.toFixed(0)} | Support: ${support.toFixed(0)} | ` +
    `RSI: ${rsi ? rsi.toFixed(1) : 'N/A'} | Vol spike: ${volSpike} | Trend: ${trend}`
  );

  if (currentClose > resistance && volSpike && rsi !== null && rsi < 70) {
    const entry = currentClose, stop = support;
    const target = entry + (entry - stop) * 2;
    return {
      symbol: SYMBOL, direction: 'LONG', type: 'SWING', timeframe: '6H',
      entry, stop, target,
      confidence: calcConfidence([trend === 'LONG', rsi < 60, rsi > 45, volSpike], 55),
      reason: `Resistance breakout (${resistance.toFixed(0)}) + volume spike`,
    };
  }

  if (currentClose < support && volSpike && rsi !== null && rsi > 30) {
    const entry = currentClose, stop = resistance;
    const target = entry - (stop - entry) * 2;
    return {
      symbol: SYMBOL, direction: 'SHORT', type: 'SWING', timeframe: '6H',
      entry, stop, target,
      confidence: calcConfidence([trend === 'SHORT', rsi > 40, rsi < 55, volSpike], 55),
      reason: `Support breakdown (${support.toFixed(0)}) + volume spike`,
    };
  }

  return null;
}

function checkBTCGBPSwingBrewing(candles) {
  if (!candles || candles.length < LOOKBACK + 10) return null;
  const { highs, lows, closes, volumes } = parseOHLCV(candles);
  const currentClose = closes[closes.length - 1];
  const rsi = calcRSI(closes, 14);
  if (rsi === null) return null;
  const volSpike   = hasVolumeSpike(volumes, LOOKBACK, 1.5);
  const resistance = swingResistance(highs, LOOKBACK);
  const support    = swingSupport(lows, LOOKBACK);
  const trend      = trendDirection(closes);
  const approachingOverbought = rsi >= 65 && rsi < 70;
  const approachingOversold   = rsi > 30 && rsi <= 35;
  const volNoBreakout = volSpike && currentClose <= resistance && currentClose >= support;
  if (!approachingOverbought && !approachingOversold && !volNoBreakout) return null;
  return {
    symbol: SYMBOL, type: 'BREWING', subtype: 'SWING', timeframe: '6H',
    direction: trend, price: currentClose, trend, rsi, volSpike, engulfing: false,
    rsiReason: approachingOverbought ? 'approaching overbought'
             : approachingOversold   ? 'approaching oversold' : null,
  };
}

module.exports = { checkBTCGBPSwing, checkBTCGBPSwingBrewing };
