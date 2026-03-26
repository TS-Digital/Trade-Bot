/**
 * Twelve Data REST API client for OHLCV candle data.
 *
 * Fetches candles and returns them in CCXT-compatible format:
 *   [[timestamp_ms, open, high, low, close, volume], ...]
 * sorted oldest → newest, with the incomplete last candle already dropped.
 *
 * Rate limiting: free tier allows 8 credits/minute (~7.5 s/request).
 * A sequential queue with DELAY_MS between requests keeps well within that
 * limit. Callers can still use Promise.all — promises resolve in arrival
 * order but HTTP requests fire one at a time through the queue.
 */

const config = require('../config');

const BASE_URL = 'https://api.twelvedata.com/time_series';
const DELAY_MS = 10_000; // 10 s gap → safe on free tier (8 credits/min)

// ── Sequential request queue ──────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// queueTail is always a promise that resolves after the previous request
// (plus its trailing delay) has finished.
let queueTail = Promise.resolve();

function enqueue(fn) {
  // Chain the new request onto the tail
  const result = queueTail.then(fn);
  // Append a fixed delay after completion (success or failure) so the next
  // enqueued request doesn't start too soon.
  queueTail = result.then(
    () => sleep(DELAY_MS),
    () => sleep(DELAY_MS),
  );
  return result;
}

// ── Core fetch (runs inside the queue) ───────────────────────────────────────

async function doFetch(symbol, interval, limit) {
  if (!config.twelveData.apiKey) {
    console.warn('[TwelveData] API key not configured — signals disabled');
    return null;
  }

  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(limit + 1), // +1 so we can drop the incomplete last candle
    apikey: config.twelveData.apiKey,
    format: 'JSON',
  });

  console.log(`[TwelveData] Fetching ${symbol} ${interval}…`);

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
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch OHLCV candles from Twelve Data, serialised through a rate-limit queue.
 *
 * @param {string} symbol    e.g. 'XAU/USD'
 * @param {string} interval  e.g. '4h'
 * @param {number} limit     number of complete candles to return
 * @returns {Promise<Array|null>}
 */
function fetchTwelveDataCandles(symbol, interval, limit = 250) {
  return enqueue(() => doFetch(symbol, interval, limit).catch((err) => {
    console.error(`[TwelveData] Error fetching ${symbol} ${interval}: ${err.message}`);
    return null;
  }));
}

module.exports = { fetchTwelveDataCandles };
