/**
 * Twelve Data REST API helper.
 *
 * Fetches OHLCV candles for a given symbol/interval and returns them in
 * CCXT-compatible format: [ [timestamp_ms, open, high, low, close, volume], … ]
 * ordered oldest → newest, with the last (potentially incomplete) candle dropped.
 */

const https = require('https');

const BASE_URL = 'https://api.twelvedata.com/time_series';

/**
 * Fetch candles from Twelve Data.
 *
 * @param {string} symbol     e.g. 'XAU/USD'
 * @param {string} interval   e.g. '4h'
 * @param {number} outputsize Number of candles to request (max 5000 for paid plans, 800 free)
 * @param {string} apiKey     Twelve Data API key
 * @returns {Promise<Array|null>} CCXT-style OHLCV array or null on error
 */
async function fetchTwelveDataCandles(symbol, interval, outputsize, apiKey) {
  const tdSymbol = symbol.replace('/', '_'); // XAU/USD → XAU_USD
  const url =
    `${BASE_URL}?symbol=${encodeURIComponent(symbol)}&interval=${interval}` +
    `&outputsize=${outputsize}&apikey=${encodeURIComponent(apiKey)}&format=JSON`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);

          if (json.status === 'error' || !Array.isArray(json.values)) {
            console.error(`[TwelveData] API error for ${symbol}: ${json.message || JSON.stringify(json)}`);
            resolve(null);
            return;
          }

          // API returns newest-first; reverse to oldest-first
          const candles = json.values
            .slice()
            .reverse()
            .map((v) => [
              new Date(v.datetime).getTime(), // timestamp ms
              parseFloat(v.open),
              parseFloat(v.high),
              parseFloat(v.low),
              parseFloat(v.close),
              parseFloat(v.volume || 0),
            ]);

          // Drop the last (potentially incomplete) candle
          resolve(candles.slice(0, -1));
        } catch (err) {
          console.error(`[TwelveData] Parse error for ${symbol}: ${err.message}`);
          resolve(null);
        }
      });
      res.on('error', (err) => {
        console.error(`[TwelveData] Request error for ${symbol}: ${err.message}`);
        resolve(null);
      });
    }).on('error', (err) => {
      console.error(`[TwelveData] Connection error for ${symbol}: ${err.message}`);
      resolve(null);
    });
  });
}

module.exports = { fetchTwelveDataCandles };
