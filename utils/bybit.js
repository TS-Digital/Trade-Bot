/**
 * Bybit Testnet — paper trade executor
 *
 * Maps any signal symbol to its USDT pair on Bybit testnet and fires
 * a market order.  Forex / Gold signals that have no USDT pair are
 * skipped gracefully.
 *
 * Required env vars (optional — trading is skipped when absent):
 *   BYBIT_TESTNET_API_KEY
 *   BYBIT_TESTNET_API_SECRET
 *
 * Optional env vars:
 *   BYBIT_TRADE_SIZE_USDT  — notional size per trade (default: 10)
 */

const ccxt = require('ccxt');

// ── Symbol mapping ────────────────────────────────────────────────────────────
// Any signal symbol whose base asset matches a key is traded as that USDT pair.
const BASE_TO_USDT = {
  BTC: 'BTC/USDT',
  ETH: 'ETH/USDT',
  SOL: 'SOL/USDT',
  XRP: 'XRP/USDT',
};

/**
 * Derive the Bybit USDT pair from a signal symbol.
 * e.g. 'BTC/USD', 'BTC/GBP' → 'BTC/USDT'
 *      'XAU/USD', 'GBP/USD' → null (not tradeable on Bybit spot)
 */
function toBybitSymbol(signalSymbol) {
  // signalSymbol is like 'BTC/USD', 'BTC/GBP', 'SOL/USD', 'GBP/USD', etc.
  const base = signalSymbol.split('/')[0].toUpperCase();
  return BASE_TO_USDT[base] || null;
}

// ── Exchange singleton ────────────────────────────────────────────────────────

let _exchange = null;

function getExchange(apiKey, apiSecret) {
  if (_exchange) return _exchange;

  console.log('[Bybit] Initialising testnet exchange connection…');
  _exchange = new ccxt.bybit({
    apiKey,
    secret: apiSecret,
    enableRateLimit: true,
    sandbox: true, // routes to https://api-testnet.bybit.com
    options: {
      defaultType: 'spot', // use spot on testnet; change to 'linear' for USDT perps
    },
  });

  console.log(`[Bybit] Sandbox mode: ${_exchange.sandbox}`);
  console.log(`[Bybit] Base URL    : ${_exchange.urls.api.public ?? _exchange.urls.api}`);
  return _exchange;
}

// ── Main executor ─────────────────────────────────────────────────────────────

/**
 * Execute a paper trade on Bybit testnet for the given signal.
 *
 * @param {object} signal   — signal object from a checkXxx() function
 * @param {string} apiKey
 * @param {string} apiSecret
 * @param {number} tradeSizeUsdt — notional USDT amount to trade
 */
async function executePaperTrade(signal, apiKey, apiSecret, tradeSizeUsdt = 10) {
  console.log(`\n[Bybit] ── executePaperTrade called ──────────────────────────`);
  console.log(`[Bybit] Signal  : ${signal.symbol} | ${signal.direction} | ${signal.type}`);
  console.log(`[Bybit] Entry   : ${signal.entry} | Confidence: ${signal.confidence}%`);

  // 1. Map to a tradeable USDT pair
  const bybitSymbol = toBybitSymbol(signal.symbol);
  if (!bybitSymbol) {
    console.log(`[Bybit] SKIP — ${signal.symbol} has no USDT pair on Bybit (forex/gold)`);
    return;
  }
  console.log(`[Bybit] Mapped  : ${signal.symbol} → ${bybitSymbol}`);

  // 2. Resolve side
  const side = signal.direction === 'LONG' ? 'buy' : 'sell';
  console.log(`[Bybit] Side    : ${side}`);

  const exchange = getExchange(apiKey, apiSecret);

  try {
    // 3. Load markets (cached after first call)
    console.log(`[Bybit] Loading markets…`);
    await exchange.loadMarkets();
    console.log(`[Bybit] Markets loaded — ${Object.keys(exchange.markets).length} total`);

    if (!exchange.markets[bybitSymbol]) {
      console.error(`[Bybit] ERROR — ${bybitSymbol} not found in Bybit testnet markets`);
      console.log(`[Bybit] Available USDT pairs (sample): ${
        Object.keys(exchange.markets).filter(s => s.endsWith('/USDT')).slice(0, 10).join(', ')
      }`);
      return;
    }

    // 4. Fetch ticker to get current price for size calculation
    console.log(`[Bybit] Fetching ticker for ${bybitSymbol}…`);
    const ticker = await exchange.fetchTicker(bybitSymbol);
    const price  = ticker.last ?? ticker.close;
    console.log(`[Bybit] Current price: ${price} USDT`);

    if (!price || price <= 0) {
      console.error(`[Bybit] ERROR — could not determine current price from ticker`);
      return;
    }

    // 5. Calculate amount in base currency
    const amount = parseFloat((tradeSizeUsdt / price).toFixed(
      exchange.markets[bybitSymbol].precision?.amount ?? 6
    ));
    console.log(`[Bybit] Trade size: ${tradeSizeUsdt} USDT → ${amount} ${bybitSymbol.split('/')[0]}`);

    if (amount <= 0) {
      console.error(`[Bybit] ERROR — calculated amount is zero or negative`);
      return;
    }

    // 6. Place market order
    console.log(`[Bybit] Placing market ${side} order: ${amount} ${bybitSymbol}…`);
    const order = await exchange.createMarketOrder(bybitSymbol, side, amount);

    console.log(`[Bybit] ✓ Order placed successfully!`);
    console.log(`[Bybit] Order ID    : ${order.id}`);
    console.log(`[Bybit] Order status: ${order.status}`);
    console.log(`[Bybit] Filled      : ${order.filled ?? 'pending'} @ avg ${order.average ?? 'N/A'}`);
    console.log(`[Bybit] Cost        : ${order.cost ?? 'N/A'} USDT`);

  } catch (err) {
    console.error(`[Bybit] ERROR placing order: ${err.message}`);
    if (err.constructor?.name) console.error(`[Bybit] Error type : ${err.constructor.name}`);
    // Surface the full ccxt error body if available
    if (err.info) console.error(`[Bybit] Error info : ${JSON.stringify(err.info)}`);
  }

  console.log(`[Bybit] ─────────────────────────────────────────────────────\n`);
}

module.exports = { executePaperTrade };
