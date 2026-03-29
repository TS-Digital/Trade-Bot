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
  bybit: {
    apiKey:        optionalEnv('BYBIT_TESTNET_API_KEY'),
    apiSecret:     optionalEnv('BYBIT_TESTNET_API_SECRET'),
    tradeSizeUsdt: parseFloat(process.env.BYBIT_TRADE_SIZE_USDT || '10'),
  },
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    chatId:   requireEnv('TELEGRAM_CHAT_ID'),
    chatId2:  optionalEnv('TELEGRAM_CHAT_ID_2'),
  },
  // How often the main loop runs (ms)
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '300000', 10),
  // Minimum time between repeated signals of the same type
  swingCooldownMs: parseInt(process.env.SWING_COOLDOWN_MS || '14400000', 10), // 4h
  scalpCooldownMs: parseInt(process.env.SCALP_COOLDOWN_MS || '3600000',  10), // 1h
  symbols: {
    btc: 'BTC/USD',
    gold: 'XAU/USD',
  },
};
