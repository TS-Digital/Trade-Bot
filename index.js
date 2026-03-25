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

const { checkBTCSwing, checkBTCSwingBrewing   } = require('./signals/btcSwing');
const { checkBTCScalp, checkBTCScalpBrewing   } = require('./signals/btcScalp');
const { checkGoldSwing                         } = require('./signals/goldSwing');
const { sendSignal, sendBrewingAlert           } = require('./utils/telegram');
const { fetchTwelveDataCandles                 } = require('./utils/twelveData');

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

  // Fetch all required OHLCV data in parallel
  // Coinbase supports: '1m','5m','15m','30m','1h','2h','6h','1d'
  // No 4H candle on Coinbase — using 6H. Gold uses Twelve Data which supports 4H natively.
  const [btc6h, btc15m, gold4h] = await Promise.all([
    fetchCandles('BTC/USD', '6h', 250),
    fetchCandles('BTC/USD', '15m', 100),
    fetchTwelveDataCandles('XAU/USD', '4h', 250),
  ]);

  // ── BTC Swing (6H) ──────────────────────────────────────────────────────
  if (btc6h) {
    await processSignal(checkBTCSwing(btc6h));
    await processBrewingAlert(checkBTCSwingBrewing(btc6h));
  }

  // ── BTC Scalp (15M, filtered by 6H trend) ──────────────────────────────
  if (btc15m && btc6h) {
    await processSignal(checkBTCScalp(btc15m, btc6h));
    await processBrewingAlert(checkBTCScalpBrewing(btc15m, btc6h));
  }

  // ── Gold Swing (4H via Twelve Data) ─────────────────────────────────────
  if (gold4h) {
    const signal = checkGoldSwing(gold4h);
    await processSignal(signal);
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
