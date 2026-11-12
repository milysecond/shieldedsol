/**
 * Cloak TVL — read directly from Solana chain state.
 *
 * Verified against docs.cloak.ag (program ID, pool PDA seeds, fee
 * treasuries excluded) and live mainnet transactions:
 *  - SOL deposits sit as lamports on the mint-scoped pool PDA
 *    ["pool", wSOL mint] under the shield-pool program.
 *  - USDC / USDT sit in the associated token account of
 *    ["vault_authority", mint]. Treasuries (["treasury", mint]) hold
 *    withdrawal fees and are not counted.
 * Cloak is not on DefiLlama; if the on-chain read fails we surface an
 * error rather than a fake $0.
 */
import type { Pool } from './protocols';
import { getLlamaPrices } from './umbra';

export const CLOAK_PROGRAM = 'zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW';
/** PDA ["pool", So11111111111111111111111111111111111111112] */
export const CLOAK_SOL_POOL = 'XJ63J8R5Bgb7eEg6UehcF96yLXUV5Sgs2fnhTHKuTH8';
/** PDA ["vault_authority", USDC mint] — owner of the USDC pool ATA */
export const CLOAK_USDC_VAULT_AUTHORITY =
  'HS4QMJB2TKvRHMWhLrq6nV8SrEVezp4oUVozo3PaS6BY';
/** PDA ["vault_authority", USDT mint] — owner of the USDT pool ATA */
export const CLOAK_USDT_VAULT_AUTHORITY =
  'BbgLH695kwN1UCzEdVnjS6Jk7vZNhpY8Ah7HHKkjjBz8';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export interface CloakResult {
  pools: Pool[];
  tvl: number;
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
  throw new Error(`Cloak RPC batch failed on all RPCs: ${String(lastErr)}`);
}

export async function fetchCloakOnchain(
  rpcUrls: string[],
  solPrice?: number
): Promise<CloakResult> {
  const owners = [CLOAK_USDC_VAULT_AUTHORITY, CLOAK_USDT_VAULT_AUTHORITY];
  const reqs: RpcRequest[] = [];
  for (const owner of owners) {
    for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
      reqs.push({
        method: 'getTokenAccountsByOwner',
        params: [owner, { programId }, { encoding: 'jsonParsed' }],
      });
    }
  }
  reqs.push({ method: 'getBalance', params: [CLOAK_SOL_POOL] });
  const results = await rpcBatch(rpcUrls, reqs);

  const holdings: Array<{ mint: string; amount: number; address: string }> = [];
  owners.forEach((owner, i) => {
    for (const r of [results[i * 2], results[i * 2 + 1]]) {
      for (const acc of (r?.value || []) as any[]) {
        const info = acc?.account?.data?.parsed?.info;
        const mint = info?.mint;
        const amount = parseFloat(info?.tokenAmount?.uiAmountString || '0');
        if (mint && amount > 0) {
          holdings.push({ mint, amount, address: acc.pubkey || owner });
        }
      }
    }
  });
  const lamports = Number(results[results.length - 1]?.value);
  if (!Number.isFinite(lamports)) {
    throw new Error('Cloak SOL pool read failed');
  }
  if (lamports > 0) {
    holdings.push({
      mint: SOL_MINT,
      amount: lamports / 1e9,
      address: CLOAK_SOL_POOL,
    });
  }

  const prices = await getLlamaPrices(holdings.map((h) => h.mint));
  if (solPrice && solPrice > 0) {
    prices[SOL_MINT] = { price: solPrice, symbol: 'SOL' };
  }

  let tvl = 0;
  const bySymbol = new Map<string, Pool>();
  for (const h of holdings) {
    const p = prices[h.mint];
    if (!p) continue;
    const usd = h.amount * p.price;
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

  const pools = [...bySymbol.values()]
    .filter((p) => p.usd >= 1)
    .sort((a, b) => b.usd - a.usd);

  if (!(tvl > 0)) throw new Error('Cloak on-chain read returned $0');

  return { pools, tvl };
}
