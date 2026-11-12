/**
 * Umbra Privacy V1 TVL — read directly from Solana chain state.
 *
 * This is the original Arcium-MPC shielded pool (program UMBRAD2…).
 * Umbra v2 deposits live in the Nimbus shielded pool and are reported
 * on the Nimbus row (see ./nimbus.ts) so the two are not double-counted.
 *
 * Mirrors the DefiLlama adapter projects/umbra-privacy-v1:
 *  - every V1 pool account of the Umbra program owns one SPL token
 *    account holding that pool's deposits.
 *  - UMBRA (the protocol's own token) is reported separately, not in TVL,
 *    same as DefiLlama's "staking" bucket.
 * Prices + symbols come from coins.llama.fi (no key, covers long-tail mints).
 */
import type { Pool } from './protocols';

export const UMBRA_V1_PROGRAM = 'UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh';
const UMBRA_V1_POOL_ACCOUNT_SIZE = 176;
const UMBRA_V1_POOL_DISCRIMINATOR = 'JGBg3fpzoEY'; // base58 of Anchor discriminator
/** Snapshot of V1 pool accounts (2026-11-03) — used only if getProgramAccounts fails */
const UMBRA_V1_POOLS_FALLBACK = [
  '2oKcohRZ8wUoEuwq7fS7zSDSSq47ZDDeD4MGFAJs8ksR',
  '3f6xsCUj6DxsTWuWsjPXuJz6JhN7kSeKv3zxeRuwPq1N',
  '5X5K2o6MhzgZRJj3wrNZ5vRbjNRF4JZgq6RhF5LXUXkT',
  '79b7f1R8yvkaKEi6yt4tU7YU6nzjPytV8fYJiAkXWGMt',
  '8yQJpcpmK6EMfCh4Gj28Xp785a6cHYyrvXX1FAh1zdKT',
  '9qoNYrTFGRk1i8dNN8jfsbVuanmy78axvaraw2rnfDYs',
  '9w7CaKjLwDNNYa5U9dtxY4TZpxNDssL8bVWVrWLHS8FR',
  'A3HLhp1EsmjqFVix7jdbgXZVjMJkGxoincZUz6C93Xrn',
  'AA6vdQji1R6oFg5bvNr6EM12PbUdd1zhAgc2gFYwJ6zi',
  'Am5zoZxrLHrDHzhV2BTFYRPu2YkFGZy7zdtKBsfTrUoH',
  'Aor9o3ZjkkM1DfirMveG8wL4ue5Qs8Hv1dtbdE1f3jgt',
  'BbvRkMsC3WTRdWQLA3Mn78QNFrxEhE1VJT7DMECbTwsA',
  'DDQbUmedG881QimkSKSjrZB5enhzFih2W2BHh9QFxGpF',
  'DwgEYjzhyhoPVjDsBFRtyKmQ3LxuNvE8tgVDBkuVgV9w',
  'G4UZ3uHsYJWXgr4D1VhD3k9nNWtUGNih7SbfSbAErPMp',
  'Gb792nha1SxctSpqpk4nYNJyBHqMYqsqfnk1zbpVZnYR',
  'Gsy9tFoDz5BpFwXGVqS9c33DFoB5DRbQ34uFDyNTSH5J',
  'H8ZdSFxFp9ixvEmn2asiva5bPujpx1Q3EtsYwxmqNxVK',
];
export const UMBRA_MINT = 'PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** Max distinct asset rows before the rest collapse into OTHER */
const MAX_ASSET_ROWS = 8;
/** Ignore llama prices it marks as low-confidence (thin liquidity) */
const MIN_PRICE_CONFIDENCE = 0.5;

export interface UmbraResult {
  pools: Pool[];
  /** TVL excluding the UMBRA token (DefiLlama methodology) */
  tvl: number;
  /** USD value of UMBRA tokens deposited (DefiLlama "staking") */
  umbraTokenUsd: number;
  /** count of mints we could not price (excluded from TVL) */
  unpriced: number;
}

interface Holding {
  mint: string;
  amount: number;
  /** account holding it, for explorer links */
  address: string;
}

type RpcRequest = { method: string; params: unknown[] };
type RpcResponse = { id?: number; result?: any; error?: unknown };

/**
 * One JSON-RPC *batch* POST (keeps Workers subrequest count low: ~3 total
 * for Umbra instead of ~40). Tries each RPC in order and only accepts a
 * response where every entry succeeded; throws if none do.
 */
async function rpcBatch(
  urls: string[],
  reqs: RpcRequest[],
  timeoutMs = 4000
): Promise<any[]> {
  const body = JSON.stringify(
    reqs.map((r, id) => ({ jsonrpc: '2.0', id, ...r }))
  );
  let lastErr: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RpcResponse[] | RpcResponse;
      if (!Array.isArray(data) || data.length !== reqs.length) {
        throw new Error('batch not supported');
      }
      const byId = new Map(data.map((d) => [d.id, d]));
      const out: any[] = [];
      for (let i = 0; i < reqs.length; i++) {
        const d = byId.get(i);
        if (!d || d.error || d.result === undefined) {
          throw new Error('batch entry failed');
        }
        out.push(d.result);
      }
      return out;
    } catch (err) {
      lastErr = err; // try next RPC
    }
  }
  throw new Error(`Umbra RPC batch failed on all RPCs: ${String(lastErr)}`);
}

async function getV1PoolAccounts(urls: string[]): Promise<string[]> {
  try {
    const [result] = await rpcBatch(urls, [
      {
        method: 'getProgramAccounts',
        params: [
          UMBRA_V1_PROGRAM,
          {
            encoding: 'base64',
            dataSlice: { offset: 0, length: 0 },
            filters: [
              { dataSize: UMBRA_V1_POOL_ACCOUNT_SIZE },
              { memcmp: { offset: 0, bytes: UMBRA_V1_POOL_DISCRIMINATOR } },
            ],
          },
        ],
      },
    ]);
    const list = Array.isArray(result)
      ? (result as Array<{ pubkey?: string }>)
          .map((a) => a.pubkey)
          .filter((x): x is string => !!x)
      : [];
    if (list.length) return list;
  } catch {
    // fall through to snapshot
  }
  return UMBRA_V1_POOLS_FALLBACK;
}

function parseHoldings(result: any, owner: string): Holding[] {
  const out: Holding[] = [];
  for (const acc of (result?.value || []) as any[]) {
    const info = acc?.account?.data?.parsed?.info;
    const mint = info?.mint;
    const amount = parseFloat(info?.tokenAmount?.uiAmountString || '0');
    if (mint && amount > 0) {
      out.push({ mint, amount, address: acc.pubkey || owner });
    }
  }
  return out;
}

export async function getLlamaPrices(
  mints: string[]
): Promise<Record<string, { price: number; symbol: string }>> {
  const out: Record<string, { price: number; symbol: string }> = {};
  const unique = [...new Set(mints)];
  for (let i = 0; i < unique.length; i += 50) {
    const ids = unique
      .slice(i, i + 50)
      .map((m) => `solana:${m}`)
      .join(',');
    const res = await fetch(`https://coins.llama.fi/prices/current/${ids}`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`llama coins HTTP ${res.status}`);
    const json = (await res.json()) as {
      coins?: Record<
        string,
        { price?: number; symbol?: string; confidence?: number }
      >;
    };
    for (const [key, c] of Object.entries(json.coins || {})) {
      const mint = key.replace(/^solana:/, '');
      if (typeof c.price !== 'number' || !(c.price > 0)) continue;
      if (typeof c.confidence === 'number' && c.confidence < MIN_PRICE_CONFIDENCE)
        continue;
      out[mint] = { price: c.price, symbol: c.symbol || mint.slice(0, 4) };
    }
  }
  return out;
}

export async function fetchUmbraOnchain(
  rpcUrls: string[],
  solPrice?: number
): Promise<UmbraResult> {
  const v1Pools = await getV1PoolAccounts(rpcUrls);
  const owners = v1Pools;

  const reqs: RpcRequest[] = [];
  for (const owner of owners) {
    for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
      reqs.push({
        method: 'getTokenAccountsByOwner',
        params: [owner, { programId }, { encoding: 'jsonParsed' }],
      });
    }
  }
  const results = await rpcBatch(rpcUrls, reqs);

  const tagged: Holding[] = [];
  owners.forEach((owner, i) => {
    for (const r of [results[i * 2], results[i * 2 + 1]]) {
      for (const h of parseHoldings(r, owner)) tagged.push(h);
    }
  });

  const prices = await getLlamaPrices(tagged.map((h) => h.mint));
  if (solPrice && solPrice > 0) {
    prices[SOL_MINT] = { price: solPrice, symbol: 'SOL' };
  }

  let tvl = 0;
  let umbraTokenUsd = 0;
  const unpricedMints = new Set<string>();
  const bySymbol = new Map<string, Pool>();

  for (const h of tagged) {
    const p = prices[h.mint];
    if (!p) {
      unpricedMints.add(h.mint);
      continue;
    }
    const usd = h.amount * p.price;
    if (h.mint === UMBRA_MINT) {
      umbraTokenUsd += usd;
      continue;
    }
    tvl += usd;

    const upper = p.symbol.toUpperCase();
    const symbol = upper === 'WSOL' ? 'SOL' : upper;
    const row = bySymbol.get(symbol);
    if (row) {
      row.balance += h.amount;
      row.usd += usd;
    } else {
      bySymbol.set(symbol, {
        asset: symbol,
        address: h.address,
        balance: h.amount,
        usd,
      });
    }
  }

  const sorted = [...bySymbol.values()]
    .filter((p) => p.usd >= 1)
    .sort((a, b) => b.usd - a.usd);
  const pools = sorted.slice(0, MAX_ASSET_ROWS);
  const rest = sorted.slice(MAX_ASSET_ROWS);
  if (rest.length) {
    pools.push({
      asset: 'OTHER',
      address: null,
      balance: rest.reduce((s, p) => s + p.balance, 0),
      usd: rest.reduce((s, p) => s + p.usd, 0),
    });
  }

  if (!(tvl > 0)) throw new Error('Umbra on-chain read returned $0');

  return {
    pools,
    tvl,
    umbraTokenUsd,
    unpriced: unpricedMints.size,
  };
}

/**
 * Fallback only: DefiLlama Umbra Privacy V1 Solana TVL (excl. staking).
 * Used when our on-chain read fails, so the row never silently drops to $0.
 * V2 is reported on the Nimbus row and must not be included here.
 */
export async function fetchUmbraFromLlama(): Promise<number> {
  const res = await fetch('https://api.llama.fi/tvl/umbra-privacy-v1', {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`llama tvl umbra-privacy-v1 HTTP ${res.status}`);
  const total = Number(await res.text());
  if (!Number.isFinite(total) || !(total > 0)) {
    throw new Error('llama Umbra V1 TVL unavailable');
  }
  return total;
}
