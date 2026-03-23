# Crypto Trading Signal Bot

A Node.js bot that monitors **BTC/USD** and **Gold/USD** on Coinbase, detects
trading signals using technical analysis, and sends formatted alerts to a
Telegram chat. You decide whether to act on each signal.

## Signals

| Signal            | Timeframe | Logic |
|-------------------|-----------|-------|
| BTC Long Swing    | 4H        | Close above swing resistance + volume spike + RSI < 70 |
| BTC Short Swing   | 4H        | Close below swing support + volume spike + RSI > 30 |
| BTC Long Scalp    | 5M        | Bullish engulfing + EMA9 momentum UP + 4H uptrend |
| BTC Short Scalp   | 5M        | Bearish engulfing + EMA9 momentum DOWN + 4H downtrend |
| Gold Long Swing   | 4H        | Close above swing resistance + volume spike + RSI < 70 |
| Gold Short Swing  | 4H        | Close below swing support + volume spike + RSI > 30 |

## Sample Telegram Message

```
🟢 BTC/USD LONG SWING

Entry:  $83,200
Stop:   $81,500 (-2.1%)
Target: $87,000 (+4.6%)

R:R → 1:2.2 ✅
Confidence: 74%
Timeframe: 4H
Reason: Resistance breakout + volume spike
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env
```

Edit `.env`:

```
COINBASE_API_KEY=your_coinbase_api_key
COINBASE_API_SECRET=your_coinbase_api_secret

TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

### 3. Get a Coinbase API key

1. Log in to [Coinbase Advanced Trade](https://advanced.coinbase.com)
2. Go to **Settings → API**
3. Create a new API key with **View** permissions only (read-only is enough)
4. Copy the API Key and Secret into `.env`

### 4. Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. Copy the bot token into `TELEGRAM_BOT_TOKEN`
4. Start a chat with your new bot, then visit:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Send any message to the bot, refresh the URL, and find `chat.id`
6. Copy that number into `TELEGRAM_CHAT_ID`

### 5. Run the bot

```bash
npm start
```

Or with file-watching during development:

```bash
npm run dev
```

## Configuration

All tuneable parameters are in `.env` (optional overrides):

| Variable             | Default   | Description |
|----------------------|-----------|-------------|
| `POLL_INTERVAL_MS`   | `300000`  | How often to check signals (ms). Default = 5 min |
| `SIGNAL_COOLDOWN_MS` | `14400000`| Min time between same signal (ms). Default = 4h |

## File Structure

```
├── index.js              # Main loop
├── config.js             # Loads and validates env vars
├── signals/
│   ├── btcSwing.js       # BTC/USD 4H swing detector
│   ├── btcScalp.js       # BTC/USD 5M scalp detector
│   └── goldSwing.js      # Gold/USD 4H swing detector
├── utils/
│   ├── telegram.js       # Message formatting + Telegram sender
│   └── indicators.js     # RSI, EMA, volume spike, engulfing patterns
├── .env.example          # Template for secrets
└── README.md
```

## Gold/USD Note

Coinbase does not natively offer XAU/USD. If you see fetch errors for Gold,
you have two options:

1. **Use a different CCXT exchange** — swap `new ccxt.coinbase(...)` for
   another exchange that supports XAU/USD (e.g. `ccxt.oanda` via a compatible
   broker). Update `index.js` to use a separate exchange instance for Gold.

2. **Disable Gold** — comment out the Gold fetch/check block in `index.js`.

## Disclaimer

This bot generates informational signals only. It does **not** place trades
automatically. Always perform your own analysis before trading. Crypto and
commodity trading involves significant risk.
