# Shielded Sol

Real-time Solana privacy pool TVL tracker.

**Live:** [www.shieldedsol.com](https://www.shieldedsol.com) · **Developers:** [/developers](https://www.shieldedsol.com/developers)

## Public API (v1)

Base: `https://www.shieldedsol.com` · CORS open · no API key

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health` | Health + endpoint index |
| `GET /api/v1/protocols` | Live TVL all protocols |
| `GET /api/v1/protocols/{id}` | One protocol (slug or name) |
| `GET /api/v1/history/tvl?range=7d` | Aggregate TVL history |
| `GET /api/v1/history/protocol?protocol=Privacy%20Cash&range=30d` | Per-protocol history |
| `GET /api/v1/openapi.json` | OpenAPI 3.1 |

Legacy: `GET /api/protocols` still works for the dashboard.

## TypeScript SDK

```bash
npm install @shieldedsol/sdk
```

```ts
import { createClient } from '@shieldedsol/sdk';
const client = createClient();
const { totalTvlUsd, protocols } = await client.listProtocols();
```

Package: `packages/sdk`

## MCP server

```bash
npx -y @shieldedsol/mcp
```

```json
{
  "mcpServers": {
    "shieldedsol": {
      "command": "npx",
      "args": ["-y", "@shieldedsol/mcp"]
    }
  }
}
```

Package: `packages/mcp` · tools: `list_protocols`, `get_protocol`, `tvl_history`, `protocol_history`, `health`

## Develop

```bash
npm install
npm run dev
# API
curl -s localhost:3000/api/v1/protocols | jq .totalTvlUsd
```

## Deploy

Cloudflare Workers (OpenNext) + Vercel dual-host:

```bash
npm run deploy
```

## License

MIT
