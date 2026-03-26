/**
 * Crypto Trading Signal Bot — main loop
 *
 * Runs every 5 minutes (configurable via POLL_INTERVAL_MS).
 * Checks BTC/USD swing (4H), BTC/USD scalp (5M), Gold/USD swing (4H).
 * Sends formatted Telegram messages when signals are detected.
 * Applies per-asset cooldowns to prevent duplicate signals.
 */

require('dotenv').config();

const ccxt   = require('ccxt');
const config = require('./config');

const { checkBTCSwing,    checkBTCSwingBrewing    } = require('./signals/btcSwing');
const { checkBTCScalp,    checkBTCScalpBrewing    } = require('./signals/btcScalp');
const { checkETHSwing,    checkETHSwingBrewing    } = require('./signals/ethSwing');
const { checkETHScalp,    checkETHScalpBrewing    } = require('./signals/ethScalp');
const { checkBTCGBPSwing, checkBTCGBPSwingBrewing } = require('./signals/btcGbpSwing');
const { checkBTCGBPScalp, checkBTCGBPScalpBrewing } = require('./signals/btcGbpScalp');
const { checkSOLSwing,    checkSOLSwingBrewing    } = require('./signals/solSwing');
const { checkSOLScalp,    checkSOLScalpBrewing    } = require('./signals/solScalp');
const { checkXRPSwing,    checkXRPSwingBrewing    } = require('./signals/xrpSwing');
const { checkXRPScalp,    checkXRPScalpBrewing    } = require('./signals/xrpScalp');
const { checkGoldSwing                            } = require('./signals/goldSwing');
const { checkGBPSwing,    checkGBPSwingBrewing    } = require('./signals/gbpSwing');
const { checkGBPJPYSwing, checkGBPJPYSwingBrewing } = require('./signals/gbpjpySwing');
const { checkEURUSDSwing, checkEURUSDSwingBrewing } = require('./signals/eurUsdSwing');
const { checkUSDJPYSwing, checkUSDJPYSwingBrewing } = require('./signals/usdJpySwing');
const { checkEURGBPSwing, checkEURGBPSwingBrewing } = require('./signals/eurGbpSwing');
const { checkAUDUSDSwing, checkAUDUSDSwingBrewing } = require('./signals/audUsdSwing');
const { sendSignal, sendBrewingAlert, sendForexOpen, sendForexClose } = require('./utils/telegram');
const { fetchTwelveDataCandles } = require('./utils/twelveData');
const { isForexOpen            } = require('./utils/marketHours');

// ── Exchange setup ────────────────────────────────────────────────────────────

const exchange = new ccxt.coinbase({
  apiKey:    config.coinbase.apiKey,
  secret:    config.coinbase.apiSecret,
  enableRateLimit: true,
});

// ── Cooldown tracker ─────────────────────────────────────────────────────────
// key: `${symbol}:${direction}:${type}` → last signal timestamp (ms)
const lastSignalTime = new Map();

function isCoolingDown(signal) {
  const key = `${signal.symbol}:${signal.direction}:${signal.type}`;
  const last = lastSignalTime.get(key) || 0;
  return Date.now() - last < config.signalCooldownMs;
}

function markSignalSent(signal) {
  const key = `${signal.symbol}:${signal.direction}:${signal.type}`;
  lastSignalTime.set(key, Date.now());
}

// ── Forex market open/close notifications ────────────────────────────────────
// null = first tick (no notification sent yet), true/false = last known state
let forexWasOpen = null;

async function checkForexTransition() {
  const nowOpen = isForexOpen();
  if (forexWasOpen === null) {
    forexWasOpen = nowOpen; // record state on first tick without alerting
    return;
  }
  if (!forexWasOpen && nowOpen)  { await sendForexOpen();  }
  if (forexWasOpen  && !nowOpen) { await sendForexClose(); }
  forexWasOpen = nowOpen;
}

// ── OHLCV fetching ────────────────────────────────────────────────────────────

async function fetchCandles(symbol, timeframe, limit = 250, exch = exchange) {
  try {
    const candles = await exch.fetchOHLCV(symbol, timeframe, undefined, limit);
    if (!candles || candles.length === 0) {
      console.warn(`[Fetch] No data returned for ${symbol} ${timeframe}`);
      return null;
    }
    // Drop the last (potentially incomplete) candle
    return candles.slice(0, -1);
  } catch (err) {
    console.error(`[Fetch] Error fetching ${symbol} ${timeframe}: ${err.message}`);
    return null;
  }
}

// ── Signal processing ─────────────────────────────────────────────────────────

// Brewing alerts reuse the same cooldown map — key uses 'BREWING' as direction.
function brewingCooldownKey(brewing) {
  return `${brewing.symbol}:BREWING:${brewing.subtype}`;
}

async function processBrewingAlert(brewing) {
  if (!brewing) return;

  const key  = brewingCooldownKey(brewing);
  const last = lastSignalTime.get(key) || 0;
  if (Date.now() - last < config.signalCooldownMs) {
    console.log(`[Cooldown] Skipping brewing alert ${brewing.symbol} ${brewing.subtype} — cooldown active`);
    return;
  }

  console.log(`[Brewing] ${brewing.symbol} ${brewing.subtype} | RSI: ${brewing.rsi.toFixed(1)} | Vol: ${brewing.volSpike}`);

  const sent = await sendBrewingAlert(brewing);
  if (sent) lastSignalTime.set(key, Date.now());
}

async function processSignal(signal) {
  if (!signal) return;

  if (isCoolingDown(signal)) {
    console.log(
      `[Cooldown] Skipping ${signal.symbol} ${signal.direction} ${signal.type} — ` +
      `cooldown active`
    );
    return;
  }

  console.log(
    `[Signal] ${signal.symbol} ${signal.direction} ${signal.type} | ` +
    `Entry: ${signal.entry.toFixed(2)} | Confidence: ${signal.confidence}%`
  );

  const sent = await sendSignal(signal);
  if (sent) markSignalSent(signal);
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function tick() {
  const now = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Tick] ${now}`);
  console.log(`${'─'.repeat(60)}`);

  await checkForexTransition();

  // Fetch all required OHLCV data in parallel
  // Coinbase: no 4H — using 6H for swing, 15M for scalp.
  // Twelve Data: supports 4H natively for metals and forex.
  const [
    btc6h,    btc15m,
    eth6h,    eth15m,
    btcgbp6h, btcgbp15m,
    sol6h,    sol15m,
    xrp6h,    xrp15m,
    gold4h,
    gbp4h,    gbpjpy4h,
    eurusd4h, usdjpy4h, eurgbp4h, audusd4h,
  ] = await Promise.all([
    fetchCandles('BTC/USD', '6h', 250),
    fetchCandles('BTC/USD', '15m', 100),
    fetchCandles('ETH/USD', '6h', 250),
    fetchCandles('ETH/USD', '15m', 100),
    fetchCandles('BTC/GBP', '6h', 250),
    fetchCandles('BTC/GBP', '15m', 100),
    fetchCandles('SOL/USD', '6h', 250),
    fetchCandles('SOL/USD', '15m', 100),
    fetchCandles('XRP/USD', '6h', 250),
    fetchCandles('XRP/USD', '15m', 100),
    fetchTwelveDataCandles('XAU/USD', '4h', 250),
    fetchTwelveDataCandles('GBP/USD', '4h', 250),
    fetchTwelveDataCandles('GBP/JPY', '4h', 250),
    fetchTwelveDataCandles('EUR/USD', '4h', 250),
    fetchTwelveDataCandles('USD/JPY', '4h', 250),
    fetchTwelveDataCandles('EUR/GBP', '4h', 250),
    fetchTwelveDataCandles('AUD/USD', '4h', 250),
  ]);

  // ── BTC/USD ─────────────────────────────────────────────────────────────
  if (btc6h) {
    await processSignal(checkBTCSwing(btc6h));
    await processBrewingAlert(checkBTCSwingBrewing(btc6h));
  }
  if (btc15m && btc6h) {
    await processSignal(checkBTCScalp(btc15m, btc6h));
    await processBrewingAlert(checkBTCScalpBrewing(btc15m, btc6h));
  }

  // ── ETH/USD ─────────────────────────────────────────────────────────────
  if (eth6h) {
    await processSignal(checkETHSwing(eth6h));
    await processBrewingAlert(checkETHSwingBrewing(eth6h));
  }
  if (eth15m && eth6h) {
    await processSignal(checkETHScalp(eth15m, eth6h));
    await processBrewingAlert(checkETHScalpBrewing(eth15m, eth6h));
  }

  // ── BTC/GBP ─────────────────────────────────────────────────────────────
  if (btcgbp6h) {
    await processSignal(checkBTCGBPSwing(btcgbp6h));
    await processBrewingAlert(checkBTCGBPSwingBrewing(btcgbp6h));
  }
  if (btcgbp15m && btcgbp6h) {
    await processSignal(checkBTCGBPScalp(btcgbp15m, btcgbp6h));
    await processBrewingAlert(checkBTCGBPScalpBrewing(btcgbp15m, btcgbp6h));
  }

  // ── SOL/USD ─────────────────────────────────────────────────────────────
  if (sol6h) {
    await processSignal(checkSOLSwing(sol6h));
    await processBrewingAlert(checkSOLSwingBrewing(sol6h));
  }
  if (sol15m && sol6h) {
    await processSignal(checkSOLScalp(sol15m, sol6h));
    await processBrewingAlert(checkSOLScalpBrewing(sol15m, sol6h));
  }

  // ── XRP/USD ─────────────────────────────────────────────────────────────
  if (xrp6h) {
    await processSignal(checkXRPSwing(xrp6h));
    await processBrewingAlert(checkXRPSwingBrewing(xrp6h));
  }
  if (xrp15m && xrp6h) {
    await processSignal(checkXRPScalp(xrp15m, xrp6h));
    await processBrewingAlert(checkXRPScalpBrewing(xrp15m, xrp6h));
  }

  // ── Gold/XAU/USD (Twelve Data) ───────────────────────────────────────────
  if (gold4h) {
    await processSignal(checkGoldSwing(gold4h));
  }

  // ── Forex pairs (Twelve Data — Mon–Fri 07:00–22:00 UTC) ─────────────────
  if (gbp4h) {
    await processSignal(checkGBPSwing(gbp4h));
    await processBrewingAlert(checkGBPSwingBrewing(gbp4h));
  }
  if (gbpjpy4h) {
    await processSignal(checkGBPJPYSwing(gbpjpy4h));
    await processBrewingAlert(checkGBPJPYSwingBrewing(gbpjpy4h));
  }
  if (eurusd4h) {
    await processSignal(checkEURUSDSwing(eurusd4h));
    await processBrewingAlert(checkEURUSDSwingBrewing(eurusd4h));
  }
  if (usdjpy4h) {
    await processSignal(checkUSDJPYSwing(usdjpy4h));
    await processBrewingAlert(checkUSDJPYSwingBrewing(usdjpy4h));
  }
  if (eurgbp4h) {
    await processSignal(checkEURGBPSwing(eurgbp4h));
    await processBrewingAlert(checkEURGBPSwingBrewing(eurgbp4h));
  }
  if (audusd4h) {
    await processSignal(checkAUDUSDSwing(audusd4h));
    await processBrewingAlert(checkAUDUSDSwingBrewing(audusd4h));
  }

  console.log(`[Tick] Done. Next check in ${config.pollIntervalMs / 1000}s`);
}

// ── Telegram connectivity test ────────────────────────────────────────────────

async function sendTestMessage() {
  // BTC test — static sample
  const btcSample = {
    symbol:     'BTC/USD',
    direction:  'LONG',
    type:       'SWING',
    timeframe:  '6H',
    entry:      83200,
    stop:       81500,
    target:     87000,
    confidence: 74,
    reason:     'TEST — bot started successfully',
  };
  const btcSent = await sendSignal(btcSample);
  if (btcSent) {
    console.log('[Init] BTC Telegram test message sent ✓');
  } else {
    console.error('[Init] Telegram test message failed — check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID');
  }

  // Gold test — fetch live price from Twelve Data
  const goldCandles = await fetchTwelveDataCandles('XAU/USD', '4h', 5);
  if (goldCandles && goldCandles.length > 0) {
    const price  = goldCandles[goldCandles.length - 1][4]; // last close
    const stop   = parseFloat((price * 0.995).toFixed(2)); // -0.5%
    const target = parseFloat((price * 1.010).toFixed(2)); // +1.0%
    const goldSample = {
      symbol:     'Gold/USD',
      direction:  'LONG',
      type:       'SWING',
      timeframe:  '4H',
      entry:      price,
      stop,
      target,
      confidence: 74,
      reason:     'TEST — Gold data feed connected',
    };
    const goldSent = await sendSignal(goldSample);
    if (goldSent) {
      console.log(`[Init] Gold Telegram test message sent ✓ (price: $${price})`);
    }
  } else {
    console.warn('[Init] Gold test skipped — Twelve Data fetch failed (check TWELVE_DATA_API_KEY)');
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('🤖 Crypto Signal Bot starting…');
  console.log(`   Poll interval : ${config.pollIntervalMs / 1000}s`);
  console.log(`   Signal cooldown: ${config.signalCooldownMs / 3600000}h`);

  // Validate exchange connectivity before entering the loop
  try {
    await exchange.loadMarkets();
    console.log(`[Init] Exchange connected — ${Object.keys(exchange.markets).length} markets loaded`);
  } catch (err) {
    console.error(`[Init] Exchange connection failed: ${err.message}`);
    console.error('[Init] Continuing anyway — individual fetches will handle errors gracefully');
  }

  await sendTestMessage();

  // Run immediately, then on interval
  await tick();
  setInterval(async () => {
    try {
      await tick();
    } catch (err) {
      // Top-level safety net — prevent the interval from dying
      console.error(`[Loop] Unhandled error in tick: ${err.message}`);
    }
  }, config.pollIntervalMs);
}

main().catch((err) => {
  console.error(`[Fatal] ${err.message}`);
  process.exit(1);
});
