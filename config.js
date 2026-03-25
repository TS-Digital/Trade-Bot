require('dotenv').config();

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env variable: ${name}`);
  return val;
}

function optionalEnv(name) {
  return process.env[name] || null;
}

module.exports = {
  coinbase: {
    apiKey: requireEnv('COINBASE_API_KEY'),
    apiSecret: requireEnv('COINBASE_API_SECRET'),
  },
  twelveData: {
    apiKey: optionalEnv('TWELVE_DATA_API_KEY'),
  },
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    chatId:   requireEnv('TELEGRAM_CHAT_ID'),
    chatId2:  optionalEnv('TELEGRAM_CHAT_ID_2'),
  },
  // How often the main loop runs (ms)
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '300000', 10),
  // Minimum time between signals for the same asset+direction (ms) — default 4h
  signalCooldownMs: parseInt(process.env.SIGNAL_COOLDOWN_MS || '14400000', 10),
  symbols: {
    btc: 'BTC/USD',
    gold: 'XAU/USD',
  },
};
