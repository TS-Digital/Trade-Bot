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

const { checkBTCSwing  } = require('./signals/btcSwing');
const { checkBTCScalp  } = require('./signals/btcScalp');
const { checkGoldSwing } = require('./signals/goldSwing');
const { sendSignal     } = require('./utils/telegram');

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

async function fetchCandles(symbol, timeframe, limit = 250) {
  try {
    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
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
  const [btc4h, btc5m, gold4h] = await Promise.all([
    fetchCandles('BTC/USD', '4h', 250),
    fetchCandles('BTC/USD', '5m', 100),
    fetchCandles('XAU/USD', '4h', 250),
  ]);

  // ── BTC Swing (4H) ──────────────────────────────────────────────────────
  if (btc4h) {
    const signal = checkBTCSwing(btc4h);
    await processSignal(signal);
  }

  // ── BTC Scalp (5M, filtered by 4H trend) ───────────────────────────────
  if (btc5m && btc4h) {
    const signal = checkBTCScalp(btc5m, btc4h);
    await processSignal(signal);
  }

  // ── Gold Swing (4H) ─────────────────────────────────────────────────────
  if (gold4h) {
    const signal = checkGoldSwing(gold4h);
    await processSignal(signal);
  }

  console.log(`[Tick] Done. Next check in ${config.pollIntervalMs / 1000}s`);
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
