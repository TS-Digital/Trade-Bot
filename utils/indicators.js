const { RSI, EMA, BollingerBands } = require('technicalindicators');

/**
 * Extract arrays from raw OHLCV candles.
 * CCXT format: [timestamp, open, high, low, close, volume]
 */
function parseOHLCV(candles) {
  return {
    timestamps: candles.map((c) => c[0]),
    opens:      candles.map((c) => c[1]),
    highs:      candles.map((c) => c[2]),
    lows:       candles.map((c) => c[3]),
    closes:     candles.map((c) => c[4]),
    volumes:    candles.map((c) => c[5]),
  };
}

/** RSI — returns the latest value */
function calcRSI(closes, period = 14) {
  const values = RSI.calculate({ values: closes, period });
  return values.length ? values[values.length - 1] : null;
}

/** EMA — returns latest value */
function calcEMA(closes, period) {
  const values = EMA.calculate({ values: closes, period });
  return values.length ? values[values.length - 1] : null;
}

/** EMA array — returns all values aligned to closes length */
function calcEMAArray(closes, period) {
  return EMA.calculate({ values: closes, period });
}

/**
 * Detect a volume spike.
 * Returns true if the last candle's volume is > multiplier * average volume
 * of the preceding `lookback` candles.
 */
function hasVolumeSpike(volumes, lookback = 20, multiplier = 1.5) {
  if (volumes.length < lookback + 1) return false;
  const recent = volumes.slice(-lookback - 1, -1);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const lastVol = volumes[volumes.length - 1];
  return lastVol > avg * multiplier;
}

/**
 * Identify the most recent swing resistance level.
 * Looks back `lookback` candles and returns the highest high
 * within that window (excluding the last candle).
 */
function swingResistance(highs, lookback = 20) {
  const window = highs.slice(-lookback - 1, -1);
  return Math.max(...window);
}

/**
 * Identify the most recent swing support level.
 * Returns the lowest low within the lookback window (excluding last candle).
 */
function swingSupport(lows, lookback = 20) {
  const window = lows.slice(-lookback - 1, -1);
  return Math.min(...window);
}

/**
 * Determine the current trend direction using EMA50 vs EMA200.
 * Returns 'LONG', 'SHORT', or 'NEUTRAL'.
 */
function trendDirection(closes) {
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  if (!ema50 || !ema200) return 'NEUTRAL';
  if (ema50 > ema200) return 'LONG';
  if (ema50 < ema200) return 'SHORT';
  return 'NEUTRAL';
}

/**
 * Detect a bullish engulfing candle pattern on the last two candles.
 */
function isBullishEngulfing(opens, closes) {
  const n = closes.length;
  if (n < 2) return false;
  const prevOpen  = opens[n - 2];
  const prevClose = closes[n - 2];
  const currOpen  = opens[n - 1];
  const currClose = closes[n - 1];
  // Previous candle is bearish, current candle is bullish and engulfs it
  return (
    prevClose < prevOpen &&
    currClose > currOpen &&
    currOpen  < prevClose &&
    currClose > prevOpen
  );
}

/**
 * Detect a bearish engulfing candle pattern on the last two candles.
 */
function isBearishEngulfing(opens, closes) {
  const n = closes.length;
  if (n < 2) return false;
  const prevOpen  = opens[n - 2];
  const prevClose = closes[n - 2];
  const currOpen  = opens[n - 1];
  const currClose = closes[n - 1];
  // Previous candle is bullish, current candle is bearish and engulfs it
  return (
    prevClose > prevOpen &&
    currClose < currOpen &&
    currOpen  > prevClose &&
    currClose < prevOpen
  );
}

/**
 * Momentum confirmation: EMA9 direction over the last few closes.
 * Returns 'UP', 'DOWN', or 'FLAT'.
 */
function momentumEMA(closes, period = 9) {
  const emaArr = calcEMAArray(closes, period);
  if (emaArr.length < 3) return 'FLAT';
  const len = emaArr.length;
  if (emaArr[len - 1] > emaArr[len - 3]) return 'UP';
  if (emaArr[len - 1] < emaArr[len - 3]) return 'DOWN';
  return 'FLAT';
}

/**
 * Compute a simple confidence score (0–100) based on how many
 * bullish/bearish signals line up. Callers pass a list of boolean
 * conditions and optionally a base score.
 */
function calcConfidence(conditions, base = 50) {
  const perCondition = Math.floor((100 - base) / conditions.length);
  const bonus = conditions.filter(Boolean).length * perCondition;
  return Math.min(100, base + bonus);
}

module.exports = {
  parseOHLCV,
  calcRSI,
  calcEMA,
  calcEMAArray,
  hasVolumeSpike,
  swingResistance,
  swingSupport,
  trendDirection,
  isBullishEngulfing,
  isBearishEngulfing,
  momentumEMA,
  calcConfidence,
};
