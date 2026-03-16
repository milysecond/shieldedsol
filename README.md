# Shielded Sol

Real-time Solana privacy pool tracker. Monitor TVL across privacy protocols with live balances, historical charts, and alerts.

**Live:** [shieldedsol.com](https://shieldedsol.com)

## Protocols Tracked

| Protocol | Status | Pools |
|----------|--------|-------|
| Privacy Cash | Live | SOL, USDC, USDT, ORE |
| Light Protocol | Live | SOL |
| Turbine | Live | ZSOL |
| Vanish Trade | Live | SOL |
| Mixoor | Live | SOL, USDC, USD1 |
| Umbra | Upcoming | SOL, USDC |
| Elusiv | Sunset | SOL, USDC, USDT, BONK |

## Features

- Real-time TVL tracking via on-chain data
- Historical TVL chart (7D/30D/90D)
- 24h change indicator
- Browser notifications for TVL alerts (10%+ changes)
- Share to Twitter/Telegram/Discord
- Dark/light theme
- PWA support (installable on iOS/Android)
- Dynamic OG images with live TVL data

## Tech Stack

- Static HTML/CSS/JS (no build step)
- Vercel serverless functions (API)
- Vercel Analytics (page views + custom events)
- Helius RPC for Solana data
- Jupiter API for token prices
- DeFiLlama API for historical TVL

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/protocols` | Returns all protocol TVL data and pool balances |
| `/api/og` | Dynamic OG image with current TVL |
| `/api/tweet` | Pre-formatted tweet text with TVL stats |
| `/api/icon` | Dynamic app icon |
| `/api/logo` | Logo endpoint |

## Development

```bash
# Install dependencies (for OG image generation)
npm install

# Run locally with Vercel CLI
vercel dev
```

## Environment Variables

```
NEXT_PUBLIC_SOLANA_RPC_URL=https://your-rpc-endpoint.com
```

## Deploy

Push to `main` to deploy automatically via Vercel.

```bash
git add .
git commit -m "Your changes"
git push
```

## License

MIT

