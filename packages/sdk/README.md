# @shieldedsol/sdk

TypeScript client for the [Shielded Sol](https://www.shieldedsol.com) public API.

## Install

```bash
npm install @shieldedsol/sdk
```

## Usage

```ts
import { createClient } from '@shieldedsol/sdk';

const client = createClient(); // https://www.shieldedsol.com

const live = await client.listProtocols();
console.log(live.totalTvlUsd, live.protocols.map((p) => p.name));

const mb = await client.getProtocol('magicblock');
console.log(mb.protocol.tvlUsd, mb.protocol.pools);

const hist = await client.tvlHistory('30d');
console.log(hist.dataPoints, hist.source);
```

## API surface

| Method | Endpoint |
|--------|----------|
| `health()` | `GET /api/v1/health` |
| `listProtocols()` | `GET /api/v1/protocols` |
| `getProtocol(id)` | `GET /api/v1/protocols/{id}` |
| `tvlHistory(range)` | `GET /api/v1/history/tvl` |
| `protocolHistory(name, range)` | `GET /api/v1/history/protocol` |

OpenAPI: https://www.shieldedsol.com/api/v1/openapi.json

## Options

```ts
createClient({
  baseUrl: 'https://www.shieldedsol.com',
  headers: { 'User-Agent': 'my-app' },
});
```
