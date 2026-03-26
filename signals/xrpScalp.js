/**
 * XRP/USD 15M Scalp signal detector (Coinbase via CCXT).
 * Trend filter uses 6H candles.
 */

const {
  parseOHLCV, calcRSI, hasVolumeSpike,
  isBullishEngulfing, isBearishEngulfing,
  momentumEMA, trendDirection, calcConfidence,
} = require('../utils/indicators');

const SYMBOL    = 'XRP/USD';
const TARGET_RR = 2;

function checkXRPScalp(candles15m, candles6h) {
  if (!candles15m || candles15m.length < 10) { console.log('[XRP/USD Scalp] Not enough 15M candles'); return null; }
  if (!candles6h  || candles6h.length  < 50) { console.log('[XRP/USD Scalp] Not enough 6H candles'); return null; }

  const m15  = parseOHLCV(candles15m);
  const h6   = parseOHLCV(candles6h);
  const trend    = trendDirection(h6.closes);
  const rsi      = calcRSI(m15.closes, 14);
  const momentum = momentumEMA(m15.closes, 9);
  const lastClose = m15.closes[m15.closes.length - 1];
  const lastHigh  = m15.highs[m15.highs.length - 1];
  const lastLow   = m15.lows[m15.lows.length - 1];
  const range     = lastHigh - lastLow;

  console.log(
    `[XRP/USD Scalp] 6H Trend: ${trend} | 15M Momentum: ${momentum} | ` +
    `RSI: ${rsi ? rsi.toFixed(1) : 'N/A'} | ` +
    `Bullish Eng: ${isBullishEngulfing(m15.opens, m15.closes)} | ` +
    `Bearish Eng: ${isBearishEngulfing(m15.opens, m15.closes)}`
  );

  if (trend === 'LONG' && isBullishEngulfing(m15.opens, m15.closes) && momentum === 'UP' && rsi !== null && rsi < 70) {
    const entry = lastClose, stop = lastLow - range * 0.1;
    return {
      symbol: SYMBOL, direction: 'LONG', type: 'SCALP', timeframe: '15M',
      entry, stop, target: entry + (entry - stop) * TARGET_RR,
      confidence: calcConfidence([rsi < 60, rsi > 40, momentum === 'UP', trend === 'LONG'], 55),
      reason: 'Bullish engulfing (15M) + EMA momentum UP + 6H uptrend',
    };
  }

  if (trend === 'SHORT' && isBearishEngulfing(m15.opens, m15.closes) && momentum === 'DOWN' && rsi !== null && rsi > 30) {
    const entry = lastClose, stop = lastHigh + range * 0.1;
    return {
      symbol: SYMBOL, direction: 'SHORT', type: 'SCALP', timeframe: '15M',
      entry, stop, target: entry - (stop - entry) * TARGET_RR,
      confidence: calcConfidence([rsi > 40, rsi < 60, momentum === 'DOWN', trend === 'SHORT'], 55),
      reason: 'Bearish engulfing (15M) + EMA momentum DOWN + 6H downtrend',
    };
  }

  return null;
}

function checkXRPScalpBrewing(candles15m, candles6h) {
  if (!candles15m || candles15m.length < 10) return null;
  if (!candles6h  || candles6h.length  < 50) return null;
  const m15 = parseOHLCV(candles15m);
  const h6  = parseOHLCV(candles6h);
  const trend     = trendDirection(h6.closes);
  const rsi       = calcRSI(m15.closes, 14);
  const volSpike  = hasVolumeSpike(m15.volumes, 20, 1.5);
  const engulfing = isBullishEngulfing(m15.opens, m15.closes) || isBearishEngulfing(m15.opens, m15.closes);
  if (rsi === null) return null;
  const approachingOverbought = rsi >= 65 && rsi < 70;
  const approachingOversold   = rsi > 30 && rsi <= 35;
  const volNoEngulfing        = volSpike && !engulfing;
  if (!approachingOverbought && !approachingOversold && !volNoEngulfing) return null;
  return {
    symbol: SYMBOL, type: 'BREWING', subtype: 'SCALP', timeframe: '15M',
    direction: trend, price: m15.closes[m15.closes.length - 1], trend, rsi, volSpike, engulfing,
    rsiReason: approachingOverbought ? 'approaching overbought'
             : approachingOversold   ? 'approaching oversold' : null,
  };
}

module.exports = { checkXRPScalp, checkXRPScalpBrewing };
