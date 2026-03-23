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

// OANDA is used for XAU/USD (Gold) — optional, skipped if keys are absent
const oandaReady =
  config.oanda.apiKey &&
  config.oanda.accountId &&
  typeof ccxt.oanda === 'function';

const oandaExchange = oandaReady
  ? new ccxt.oanda({
      apiKey:    config.oanda.apiKey,
      accountId: config.oanda.accountId,
      enableRateLimit: true,
    })
  : null;

if (!oandaExchange) {
  console.warn('[Init] OANDA not configured — Gold/XAU/USD signals disabled');
}

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
  // No 4H candle — using 6H (SIX_HOUR). No 5M — using 15M (FIFTEEN_MINUTE).
  const [btc6h, btc15m, gold6h] = await Promise.all([
    fetchCandles('BTC/USD', '6h', 250),
    fetchCandles('BTC/USD', '15m', 100),
    oandaExchange ? fetchCandles('XAU/USD', '6h', 250, oandaExchange) : Promise.resolve(null),
  ]);

  // ── BTC Swing (6H) ──────────────────────────────────────────────────────
  if (btc6h) {
    const signal = checkBTCSwing(btc6h);
    await processSignal(signal);
  }

  // ── BTC Scalp (15M, filtered by 6H trend) ──────────────────────────────
  if (btc15m && btc6h) {
    const signal = checkBTCScalp(btc15m, btc6h);
    await processSignal(signal);
  }

  // ── Gold Swing (6H) ─────────────────────────────────────────────────────
  if (gold6h) {
    const signal = checkGoldSwing(gold6h);
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
