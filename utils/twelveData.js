/**
 * Twelve Data REST API client for OHLCV candle data.
 *
 * Fetches candles and returns them in CCXT-compatible format:
 *   [[timestamp_ms, open, high, low, close, volume], ...]
 * sorted oldest → newest, with the incomplete last candle already dropped.
 */

const config = require('../config');

const BASE_URL = 'https://api.twelvedata.com/time_series';

/**
 * @param {string} symbol    e.g. 'XAU/USD'
 * @param {string} interval  e.g. '4h'
 * @param {number} limit     number of complete candles to return
 * @returns {Array|null}     CCXT-format OHLCV array or null on error
 */
async function fetchTwelveDataCandles(symbol, interval, limit = 250) {
  if (!config.twelveData.apiKey) {
    console.warn('[TwelveData] API key not configured — Gold signals disabled');
    return null;
  }

  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(limit + 1), // +1 so we can drop the incomplete last candle
    apikey: config.twelveData.apiKey,
    format: 'JSON',
  });

  try {
    const res = await fetch(`${BASE_URL}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.status === 'error') {
      throw new Error(data.message || 'Unknown Twelve Data error');
    }

    if (!data.values || data.values.length === 0) {
      console.warn(`[TwelveData] No data returned for ${symbol} ${interval}`);
      return null;
    }

    // Twelve Data returns newest-first — reverse to oldest-first (CCXT convention)
    const candles = data.values
      .slice()
      .reverse()
      .map((v) => [
        new Date(v.datetime.replace(' ', 'T') + 'Z').getTime(),
        parseFloat(v.open),
        parseFloat(v.high),
        parseFloat(v.low),
        parseFloat(v.close),
        parseFloat(v.volume) || 0,
      ]);

    // Drop the last candle (may be incomplete / still forming)
    return candles.slice(0, -1);
  } catch (err) {
    console.error(`[TwelveData] Error fetching ${symbol} ${interval}: ${err.message}`);
    return null;
  }
}

module.exports = { fetchTwelveDataCandles };
