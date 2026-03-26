/**
 * USD/JPY 4H Swing signal detector (Twelve Data REST API).
 * Only fires Mon–Fri 07:00–22:00 UTC.
 */

const {
  parseOHLCV, calcRSI, hasVolumeSpike,
  swingResistance, swingSupport, trendDirection, calcConfidence,
} = require('../utils/indicators');
const { isForexOpen } = require('../utils/marketHours');

const SYMBOL   = 'USD/JPY';
const LOOKBACK = 20;

function checkUSDJPYSwing(candles) {
  if (!isForexOpen()) { console.log('[USD/JPY Swing] Market closed — skipping'); return null; }
  if (!candles || candles.length < LOOKBACK + 10) { console.log('[USD/JPY Swing] Not enough candles'); return null; }

  const { highs, lows, closes, volumes } = parseOHLCV(candles);
  const currentClose = closes[closes.length - 1];
  const rsi        = calcRSI(closes, 14);
  const resistance = swingResistance(highs, LOOKBACK);
  const support    = swingSupport(lows, LOOKBACK);
  const volSpike   = hasVolumeSpike(volumes, LOOKBACK, 1.5);
  const trend      = trendDirection(closes);
  const hasVolumeData = volumes.some((v) => v > 0);
  const volConfirmed  = !hasVolumeData || volSpike;

  console.log(
    `[USD/JPY Swing] Close: ${currentClose.toFixed(2)} | ` +
    `Resistance: ${resistance.toFixed(2)} | Support: ${support.toFixed(2)} | ` +
    `RSI: ${rsi ? rsi.toFixed(1) : 'N/A'} | Vol: ${hasVolumeData ? volSpike : 'N/A'} | Trend: ${trend}`
  );

  if (currentClose > resistance && volConfirmed && rsi !== null && rsi < 70) {
    const entry = currentClose, stop = support;
    const target = entry + (entry - stop) * 2;
    return {
      symbol: SYMBOL, direction: 'LONG', type: 'SWING', timeframe: '4H',
      entry, stop, target,
      confidence: calcConfidence([trend === 'LONG', rsi < 60, rsi > 45, volConfirmed], 55),
      reason: `Resistance breakout (${resistance.toFixed(2)}) + RSI clear`,
    };
  }

  if (currentClose < support && volConfirmed && rsi !== null && rsi > 30) {
    const entry = currentClose, stop = resistance;
    const target = entry - (stop - entry) * 2;
    return {
      symbol: SYMBOL, direction: 'SHORT', type: 'SWING', timeframe: '4H',
      entry, stop, target,
      confidence: calcConfidence([trend === 'SHORT', rsi > 40, rsi < 55, volConfirmed], 55),
      reason: `Support breakdown (${support.toFixed(2)}) + RSI clear`,
    };
  }

  return null;
}

function checkUSDJPYSwingBrewing(candles) {
  if (!isForexOpen()) return null;
  if (!candles || candles.length < LOOKBACK + 10) return null;
  const { highs, lows, closes, volumes } = parseOHLCV(candles);
  const currentClose = closes[closes.length - 1];
  const rsi = calcRSI(closes, 14);
  if (rsi === null) return null;
  const hasVolumeData = volumes.some((v) => v > 0);
  const volSpike   = hasVolumeSpike(volumes, LOOKBACK, 1.5);
  const resistance = swingResistance(highs, LOOKBACK);
  const support    = swingSupport(lows, LOOKBACK);
  const trend      = trendDirection(closes);
  const approachingOverbought = rsi >= 65 && rsi < 70;
  const approachingOversold   = rsi > 30 && rsi <= 35;
  const volNoBreakout = hasVolumeData && volSpike && currentClose <= resistance && currentClose >= support;
  if (!approachingOverbought && !approachingOversold && !volNoBreakout) return null;
  return {
    symbol: SYMBOL, type: 'BREWING', subtype: 'SWING', timeframe: '4H',
    direction: trend, price: currentClose, trend, rsi,
    volSpike: hasVolumeData ? volSpike : false, engulfing: false,
    rsiReason: approachingOverbought ? 'approaching overbought'
             : approachingOversold   ? 'approaching oversold' : null,
  };
}

module.exports = { checkUSDJPYSwing, checkUSDJPYSwingBrewing };
