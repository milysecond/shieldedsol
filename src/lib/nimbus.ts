/**
 * Nimbus TVL — read directly from Solana chain state.
 *
 * Nimbus is the ZK shielded-pool protocol behind Umbra v2 (listed on
 * DefiLlama as "Umbra Privacy V2"). Its TVL is combined with Umbra V1
 * on the single Umbra dashboard row (see protocols.ts); it is not
 * listed as a standalone protocol.
 *
 * Addresses from docs.nimbusprivacy.xyz and the DefiLlama
 * umbra-privacy-v2 adapter:
 *  - Every SPL / Token-2022 deposit is in a token account owned by a
 *    single vault authority (VaultAuthority PDA).
 *  - Native SOL sits as lamports in one program-owned lamport vault.
 *  - The UMBRA token is reported separately, not in TVL, same as
 *    DefiLlama's "staking" bucket. Robinhood Chain TVL is out of scope.
 */
import type { Pool } from './protocols';
import { getLlamaPrices } from './umbra';

export const NIMBUS_SHIELDED_POOL =
  'nimBUs55CbjkNfy8UvK48DqFTY7L2mdkmZMQC9mk6LK';
export const NIMBUS_USER_REGISTRY =
  'user69YjhU8d8noiQy9H3zsPnSiT38DK8qZfmrWSLjL';
/** VaultAuthority — owner of every Nimbus SPL / Token-2022 pool ATA */
export const NIMBUS_TOKEN_VAULT =
  '2sjnjABJHPEZS8oVdp8nztPBUVUAT7uJawc8eQTMHTfa';
/** Program-owned lamport vault (confirmed owner = shielded-pool program) */
export const NIMBUS_SOL_VAULT = 'BxDCkvgZYRcCAnpywVw5j14AhkXehYvsXoCRiaodUs8s';
export const UMBRA_MINT = 'PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const MAX_ASSET_ROWS = 8;

export interface NimbusResult {
  pools: Pool[];
  /** TVL excluding the UMBRA token (DefiLlama methodology) */
  tvl: number;
  /** USD value of UMBRA tokens deposited (DefiLlama "staking") */
  umbraTokenUsd: number;
  unpriced: number;
}

type RpcRequest = { method: string; params: unknown[] };
type RpcResponse = { id?: number; result?: any; error?: unknown };

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
      lastErr = err;
    }
  }
  throw new Error(`Nimbus RPC batch failed on all RPCs: ${String(lastErr)}`);
}

export async function fetchNimbusOnchain(
  rpcUrls: string[],
  solPrice?: number
): Promise<NimbusResult> {
  const reqs: RpcRequest[] = [
    {
      method: 'getTokenAccountsByOwner',
      params: [
        NIMBUS_TOKEN_VAULT,
        { programId: TOKEN_PROGRAM },
        { encoding: 'jsonParsed' },
      ],
    },
    {
      method: 'getTokenAccountsByOwner',
      params: [
        NIMBUS_TOKEN_VAULT,
        { programId: TOKEN_2022_PROGRAM },
        { encoding: 'jsonParsed' },
      ],
    },
    { method: 'getBalance', params: [NIMBUS_SOL_VAULT] },
  ];
  const results = await rpcBatch(rpcUrls, reqs);

  const holdings: Array<{ mint: string; amount: number; address: string }> = [];
  for (const r of [results[0], results[1]]) {
    for (const acc of (r?.value || []) as any[]) {
      const info = acc?.account?.data?.parsed?.info;
      const mint = info?.mint;
      const amount = parseFloat(info?.tokenAmount?.uiAmountString || '0');
      if (mint && amount > 0) {
        holdings.push({
          mint,
          amount,
          address: acc.pubkey || NIMBUS_TOKEN_VAULT,
        });
      }
    }
  }
  const lamports = Number(results[2]?.value);
  if (!Number.isFinite(lamports)) {
    throw new Error('Nimbus SOL vault read failed');
  }
  if (lamports > 0) {
    holdings.push({
      mint: SOL_MINT,
      amount: lamports / 1e9,
      address: NIMBUS_SOL_VAULT,
    });
  }

  const prices = await getLlamaPrices(holdings.map((h) => h.mint));
  if (solPrice && solPrice > 0) {
    prices[SOL_MINT] = { price: solPrice, symbol: 'SOL' };
  }

  let tvl = 0;
  let umbraTokenUsd = 0;
  const unpricedMints = new Set<string>();
  const bySymbol = new Map<string, Pool>();

  for (const h of holdings) {
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
    const symbol = p.symbol.toUpperCase() === 'WSOL' ? 'SOL' : p.symbol.toUpperCase();
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

  if (!(tvl > 0)) throw new Error('Nimbus on-chain read returned $0');

  return { pools, tvl, umbraTokenUsd, unpriced: unpricedMints.size };
}

/**
 * Fallback only: DefiLlama Umbra Privacy V2 Solana TVL (excl. staking
 * and excl. Robinhood Chain). Used when our on-chain read fails.
 */
export async function fetchNimbusFromLlama(): Promise<number> {
  const res = await fetch('https://api.llama.fi/protocol/umbra-privacy-v2', {
    signal: AbortSignal.timeout(4000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`llama protocol umbra-privacy-v2 HTTP ${res.status}`);
  const json = (await res.json()) as {
    currentChainTvls?: Record<string, number>;
  };
  const solana = Number(json.currentChainTvls?.Solana);
  if (!Number.isFinite(solana) || !(solana > 0)) {
    throw new Error('llama Nimbus (Umbra V2) Solana TVL unavailable');
  }
  return solana;
}

