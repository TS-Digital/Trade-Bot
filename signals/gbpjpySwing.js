/**
 * GBP/JPY 4H Swing signal detector (Twelve Data REST API).
 *
 * Long:  close above swing resistance + RSI < 70
 * Short: close below swing support    + RSI > 30
 *
 * Same volume handling as GBP/USD — bypasses volume check when no data present.
 * Only fires Mon–Fri 07:00–22:00 UTC (London + NY sessions).
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
const { isForexOpen } = require('../utils/marketHours');

const SYMBOL    = 'GBP/JPY';
const TIMEFRAME = '4h';
const LOOKBACK  = 20;

function checkGBPJPYSwing(candles) {
  if (!isForexOpen()) {
    console.log('[GBP/JPY Swing] Market closed — skipping');
    return null;
  }
  if (!candles || candles.length < LOOKBACK + 10) {
    console.log('[GBP/JPY Swing] Not enough candles');
    return null;
  }

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
    `[GBP/JPY Swing] Close: ${currentClose.toFixed(2)} | ` +
    `Resistance: ${resistance.toFixed(2)} | Support: ${support.toFixed(2)} | ` +
    `RSI: ${rsi ? rsi.toFixed(1) : 'N/A'} | ` +
    `Vol: ${hasVolumeData ? volSpike : 'N/A'} | Trend: ${trend}`
  );

  // ── LONG ───────────────────────────────────────────────────────────────────
  if (currentClose > resistance && volConfirmed && rsi !== null && rsi < 70) {
    const entry  = currentClose;
    const stop   = support;
    const risk   = entry - stop;
    const target = entry + risk * 2;

    const confidence = calcConfidence([
      trend === 'LONG',
      rsi < 60,
      rsi > 45,
      volConfirmed,
    ], 55);

    return {
      symbol:    SYMBOL,
      direction: 'LONG',
      type:      'SWING',
      timeframe: '4H',
      entry,
      stop,
      target,
      confidence,
      reason: `Resistance breakout (${resistance.toFixed(2)}) + RSI clear`,
    };
  }

  // ── SHORT ──────────────────────────────────────────────────────────────────
  if (currentClose < support && volConfirmed && rsi !== null && rsi > 30) {
    const entry  = currentClose;
    const stop   = resistance;
    const risk   = stop - entry;
    const target = entry - risk * 2;

    const confidence = calcConfidence([
      trend === 'SHORT',
      rsi > 40,
      rsi < 55,
      volConfirmed,
    ], 55);

    return {
      symbol:    SYMBOL,
      direction: 'SHORT',
      type:      'SWING',
      timeframe: '4H',
      entry,
      stop,
      target,
      confidence,
      reason: `Support breakdown (${resistance.toFixed(2)}) + RSI clear`,
    };
  }

  return null;
}

function checkGBPJPYSwingBrewing(candles) {
  if (!isForexOpen()) return null;
  if (!candles || candles.length < LOOKBACK + 10) return null;

  const { highs, lows, closes, volumes } = parseOHLCV(candles);
  const currentClose = closes[closes.length - 1];

  const rsi        = calcRSI(closes, 14);
  const volSpike   = hasVolumeSpike(volumes, LOOKBACK, 1.5);
  const resistance = swingResistance(highs, LOOKBACK);
  const support    = swingSupport(lows, LOOKBACK);
  const trend      = trendDirection(closes);

  if (rsi === null) return null;

  const hasVolumeData         = volumes.some((v) => v > 0);
  const approachingOverbought = rsi >= 65 && rsi < 70;
  const approachingOversold   = rsi > 30 && rsi <= 35;
  const volNoBreakout         = hasVolumeData && volSpike &&
    currentClose <= resistance &&
    currentClose >= support;

  if (!approachingOverbought && !approachingOversold && !volNoBreakout) return null;

  return {
    symbol:    SYMBOL,
    type:      'BREWING',
    subtype:   'SWING',
    timeframe: '4H',
    direction: trend,
    price:     currentClose,
    trend,
    rsi,
    volSpike:  hasVolumeData ? volSpike : false,
    engulfing: false,
    rsiReason: approachingOverbought ? 'approaching overbought'
             : approachingOversold   ? 'approaching oversold'
             : null,
  };
}

module.exports = { checkGBPJPYSwing, checkGBPJPYSwingBrewing, SYMBOL, TIMEFRAME };
