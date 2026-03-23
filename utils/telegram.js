const TelegramBot = require('node-telegram-bot-api');
const { telegram } = require('../config');

let bot;

function getBot() {
  if (!bot) {
    bot = new TelegramBot(telegram.botToken, { polling: false });
  }
  return bot;
}

/**
 * Build the formatted Telegram message for a signal.
 *
 * @param {Object} signal
 * @param {string} signal.symbol       e.g. 'BTC/USD'
 * @param {'LONG'|'SHORT'} signal.direction
 * @param {'SWING'|'SCALP'} signal.type
 * @param {string} signal.timeframe    e.g. '4H'
 * @param {number} signal.entry
 * @param {number} signal.stop
 * @param {number} signal.target
 * @param {number} signal.confidence   0-100
 * @param {string} signal.reason
 */
function formatMessage(signal) {
  const { symbol, direction, type, timeframe, entry, stop, target, confidence, reason } = signal;

  const emoji = direction === 'LONG' ? '🟢' : '🔴';
  const label = `${symbol} ${direction} ${type}`;

  const stopPct = (((stop - entry) / entry) * 100).toFixed(1);
  const targetPct = (((target - entry) / entry) * 100).toFixed(1);

  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  const rrRaw = reward / risk;
  const rrFormatted = rrRaw.toFixed(1);
  const rrOk = rrRaw >= 1.5 ? '✅' : '⚠️';

  const fmt = (n) =>
    n >= 1000
      ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
      : `$${n.toFixed(4)}`;

  const stopSign = parseFloat(stopPct) >= 0 ? '+' : '';
  const targetSign = parseFloat(targetPct) >= 0 ? '+' : '';

  return (
    `${emoji} *${label}*\n\n` +
    `Entry:  ${fmt(entry)}\n` +
    `Stop:   ${fmt(stop)} (${stopSign}${stopPct}%)\n` +
    `Target: ${fmt(target)} (${targetSign}${targetPct}%)\n\n` +
    `R:R → 1:${rrFormatted} ${rrOk}\n` +
    `Confidence: ${confidence}%\n` +
    `Timeframe: ${timeframe}\n` +
    `Reason: ${reason}`
  );
}

/**
 * Send a signal message to the configured Telegram chat.
 * Returns true on success, false on failure.
 */
async function sendSignal(signal) {
  try {
    const message = formatMessage(signal);
    await getBot().sendMessage(telegram.chatId, message, { parse_mode: 'Markdown' });
    console.log(`[Telegram] Signal sent: ${signal.symbol} ${signal.direction} ${signal.type}`);
    return true;
  } catch (err) {
    console.error(`[Telegram] Failed to send message: ${err.message}`);
    return false;
  }
}

module.exports = { sendSignal, formatMessage };
