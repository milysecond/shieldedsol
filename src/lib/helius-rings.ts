/**
 * Helius Solana Privacy Rings — public, on-chain stats only.
 *
 * The permissionless (confidential) Ring has been live on Solana mainnet since
 * 9 Nov 2026 (https://www.helius.dev/blog/solana-privacy-rings). Amounts inside
 * the Ring are encrypted; we never try to read or decrypt private state. What
 * IS public is the custody of shielded assets and every public deposit /
 * withdrawal leg that moves value in or out of it.
 *
 * Custody layout (helius-labs/privacy-rings, program-libs/interface/src/lib.rs
 * and pda.rs, shielded-pool program `ring1GaLC…`):
 *  - Native SOL sits as lamports in ONE system-owned PDA, the "SOL interface":
 *    find_program_address([b"sol_interface", [0]], ring1…) = CiNmas62…
 *  - Each SPL / Token-2022 asset has ONE token account, the "SPL interface":
 *    find_program_address([b"spl_asset_vault", mint], ring1…), initialised with
 *    the program's CPI-authority PDA find_program_address([b"cpi_authority"])
 *    = CaM8DbtJ… as token owner. We enumerate token accounts owned by that
 *    authority and keep only those whose address re-derives to the canonical
 *    SPL-interface PDA for their mint (anything else is ignored).
 *
 * TVL = SOL-interface lamports + every SPL-interface balance, priced with
 *       coins.llama.fi (same source + confidence filter as Umbra); unpriced
 *       mints are excluded from USD and counted.
 *
 * Flows = for every successful transaction of the shielded-pool program
 *       (getSignaturesForAddress(ring1…)), the balance delta of the SOL
 *       interface (pre/postBalances) and of each SPL interface
 *       (pre/postTokenBalances). Positive delta = public deposit (inflow),
 *       negative = public withdrawal (outflow). Private transfers / merges move
 *       no public value and are counted only in txCount. USD values are at
 *       CURRENT prices (no historical pricing).
 *
 * The flow index is incremental: a cursor + raw per-mint totals are persisted
 * in Turso (table helius_rings_flow_index) — or in isolate memory when Turso is
 * not configured — and advanced in small budgets by the API and the cron.
 * Volumes/tx counts are only reported once the backfill back to the program's
 * first transaction has completed; until then they are null with
 * status "indexing" (never a partial number presented as all-time).
 */
import { PublicKey } from '@solana/web3.js';
import {
  HELIUS_RINGS_CPI_AUTHORITY,
  HELIUS_RINGS_PROGRAM,
  HELIUS_RINGS_SOL_INTERFACE,
} from './constants';
import { getRingsFlowState, hasTurso, saveRingsFlowState } from './db';
import type { Pool, ProtocolFlows } from './protocols';
import { getLlamaPrices } from './umbra';

export const HELIUS_RINGS_MAINNET_SINCE = '2026-11-09';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SPL_INTERFACE_SEED = new TextEncoder().encode('spl_asset_vault');

const MAX_ASSET_ROWS = 8;
/** getTransaction calls per JSON-RPC batch (larger batches get rate-limited) */
const TX_BATCH = 25;
const SIG_PAGE = 1000;
/**
 * First-ever shielded-pool program tx (slot 462234536, 2026-10-27 22:10:28
 * UTC, pre-launch deployment). Backfill counts as complete only once this
 * signature has been indexed — a short/empty signature page from a
 * non-archival RPC must not be mistaken for the start of history.
 */
const FIRST_PROGRAM_SIG =
  '5yq3D1wwynMNhidmLUZjg6CYSN4ymCoFuYRFkRmsnSpF8XcNggxCjCUHYh6b4ukffECGmBF52SzuiavQxoKUJX6F';
const BATCH_PAUSE_MS = 300;

type RpcResponse = { id?: number; result?: any; error?: unknown };

/** One JSON-RPC batch POST; returns per-entry results (null on entry error). */
async function rpcBatchLoose(
  urls: string[],
  reqs: { method: string; params: unknown[] }[],
  timeoutMs: number
): Promise<(any | null)[]> {
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
      if (!Array.isArray(data)) throw new Error('batch not supported');
      const byId = new Map(data.map((d) => [d.id, d]));
      const out = reqs.map((_, i) => {
        const d = byId.get(i);
        return d && !d.error && d.result !== undefined ? d.result : null;
      });
      // A batch where nothing came back is a failed RPC — try the next one
      if (out.every((x) => x === null)) throw new Error('empty batch');
      return out;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Helius Rings RPC batch failed: ${String(lastErr)}`);
}

async function rpcBatchStrict(
  urls: string[],
  reqs: { method: string; params: unknown[] }[],
  timeoutMs = 4000
): Promise<any[]> {
  let lastErr: unknown = null;
  for (const url of urls) {
    try {
      const out = await rpcBatchLoose([url], reqs, timeoutMs);
      if (out.some((x) => x === null)) throw new Error('batch entry failed');
      return out;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Helius Rings RPC batch failed: ${String(lastErr)}`);
}

const pdaCache = new Map<string, string>();
/** Canonical SPL-interface PDA for a mint: [b"spl_asset_vault", mint] */
export function splInterfaceAddress(mint: string): string {
  let v = pdaCache.get(mint);
  if (!v) {
    v = PublicKey.findProgramAddressSync(
      [SPL_INTERFACE_SEED, new PublicKey(mint).toBytes()],
      new PublicKey(HELIUS_RINGS_PROGRAM)
    )[0].toBase58();
    pdaCache.set(mint, v);
  }
  return v;
}

interface VaultHolding {
  mint: string;
  /** UI amount */
  amount: number;
  address: string;
}

/** Read SOL interface + every canonical SPL interface balance. */
async function readVaults(rpcUrls: string[]): Promise<VaultHolding[]> {
  const [bal, legacy, t22] = await rpcBatchStrict(rpcUrls, [
    { method: 'getBalance', params: [HELIUS_RINGS_SOL_INTERFACE] },
    {
      method: 'getTokenAccountsByOwner',
      params: [
        HELIUS_RINGS_CPI_AUTHORITY,
        { programId: TOKEN_PROGRAM },
        { encoding: 'jsonParsed' },
      ],
    },
    {
      method: 'getTokenAccountsByOwner',
      params: [
        HELIUS_RINGS_CPI_AUTHORITY,
        { programId: TOKEN_2022_PROGRAM },
        { encoding: 'jsonParsed' },
      ],
    },
  ]);
  const lamports = Number(bal?.value);
  if (!Number.isFinite(lamports)) throw new Error('SOL interface read failed');
  const out: VaultHolding[] = [
    {
      mint: SOL_MINT,
      amount: lamports / 1e9,
      address: HELIUS_RINGS_SOL_INTERFACE,
    },
  ];
  for (const r of [legacy, t22]) {
    for (const acc of (r?.value || []) as any[]) {
      const info = acc?.account?.data?.parsed?.info;
      const mint: string | undefined = info?.mint;
      const amount = parseFloat(info?.tokenAmount?.uiAmountString || '0');
      if (!mint || !acc?.pubkey) continue;
      if (splInterfaceAddress(mint) !== acc.pubkey) continue; // not a Ring vault
      if (amount > 0) out.push({ mint, amount, address: acc.pubkey });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Flow index                                                          */
/* ------------------------------------------------------------------ */

export interface RingsFlowState {
  v: 1;
  /** newest program signature already counted (forward cursor) */
  newestSig: string | null;
  newestBlockTime: number | null;
  /** oldest signature counted so far (backfill continues before it) */
  backfillBefore: string | null;
  backfillDone: boolean;
  oldestBlockTime: number | null;
  txCount: number;
  failedTxCount: number;
  depositTxCount: number;
  withdrawTxCount: number;
  /** raw base units per mint (SOL under the wSOL mint id), bigint strings */
  deposited: Record<string, string>;
  withdrawn: Record<string, string>;
  decimals: Record<string, number>;
  updatedAt: string | null;
}

function emptyState(): RingsFlowState {
  return {
    v: 1,
    newestSig: null,
    newestBlockTime: null,
    backfillBefore: null,
    backfillDone: false,
    oldestBlockTime: null,
    txCount: 0,
    failedTxCount: 0,
    depositTxCount: 0,
    withdrawTxCount: 0,
    deposited: {},
    withdrawn: {},
    decimals: { [SOL_MINT]: 9 },
    updatedAt: null,
  };
}

/** Used when Turso is not configured (local dev): per-isolate index */
let memoryState: { state: RingsFlowState; version: number } | null = null;

async function loadState(): Promise<{ state: RingsFlowState; version: number }> {
  if (!hasTurso()) return memoryState || { state: emptyState(), version: 0 };
  const row = await getRingsFlowState();
  if (!row?.state) return { state: emptyState(), version: row?.version || 0 };
  const parsed = JSON.parse(row.state) as RingsFlowState;
  if (parsed?.v !== 1) return { state: emptyState(), version: row.version };
  return { state: parsed, version: row.version };
}

async function persistState(state: RingsFlowState, prevVersion: number) {
  if (!hasTurso()) {
    memoryState = { state, version: prevVersion + 1 };
    return true;
  }
  return saveRingsFlowState(JSON.stringify(state), prevVersion);
}

function addRaw(map: Record<string, string>, mint: string, v: bigint) {
  map[mint] = (BigInt(map[mint] || '0') + v).toString();
}

/** Apply one confirmed program tx's public vault deltas to the state */
function applyTx(state: RingsFlowState, tx: any) {
  const meta = tx?.meta;
  const msg = tx?.transaction?.message;
  const keys: string[] = [
    ...((msg?.accountKeys || []) as unknown[]).map((k: any) =>
      typeof k === 'string' ? k : k?.pubkey
    ),
    ...(meta?.loadedAddresses?.writable || []),
    ...(meta?.loadedAddresses?.readonly || []),
  ];
  let inflow = false;
  let outflow = false;

  const solIdx = keys.indexOf(HELIUS_RINGS_SOL_INTERFACE);
  if (solIdx >= 0) {
    const d =
      BigInt(meta.postBalances[solIdx] ?? 0) -
      BigInt(meta.preBalances[solIdx] ?? 0);
    if (d > BigInt(0)) {
      addRaw(state.deposited, SOL_MINT, d);
      inflow = true;
    } else if (d < BigInt(0)) {
      addRaw(state.withdrawn, SOL_MINT, -d);
      outflow = true;
    }
  }

  type TB = {
    accountIndex: number;
    mint: string;
    owner?: string;
    uiTokenAmount: { amount: string; decimals: number };
  };
  const vaultBalances = (list: TB[] | undefined) => {
    const m = new Map<number, TB>();
    for (const b of list || []) {
      if (b.owner !== HELIUS_RINGS_CPI_AUTHORITY) continue;
      if (keys[b.accountIndex] !== splInterfaceAddress(b.mint)) continue;
      m.set(b.accountIndex, b);
    }
    return m;
  };
  const pre = vaultBalances(meta?.preTokenBalances);
  const post = vaultBalances(meta?.postTokenBalances);
  for (const idx of new Set([...pre.keys(), ...post.keys()])) {
    const b = (post.get(idx) || pre.get(idx))!;
    const d =
      BigInt(post.get(idx)?.uiTokenAmount.amount || '0') -
      BigInt(pre.get(idx)?.uiTokenAmount.amount || '0');
    state.decimals[b.mint] = b.uiTokenAmount.decimals;
    if (d > BigInt(0)) {
      addRaw(state.deposited, b.mint, d);
      inflow = true;
    } else if (d < BigInt(0)) {
      addRaw(state.withdrawn, b.mint, -d);
      outflow = true;
    }
  }

  state.txCount += 1;
  if (inflow) state.depositTxCount += 1;
  if (outflow) state.withdrawTxCount += 1;
}

type SigInfo = { signature: string; err: unknown; blockTime?: number | null };

async function getSignatures(
  rpcUrls: string[],
  opts: { before?: string; until?: string; limit: number }
): Promise<SigInfo[]> {
  const cfg: Record<string, unknown> = { limit: opts.limit };
  if (opts.before) cfg.before = opts.before;
  if (opts.until) cfg.until = opts.until;
  const [res] = await rpcBatchStrict(
    rpcUrls,
    [{ method: 'getSignaturesForAddress', params: [HELIUS_RINGS_PROGRAM, cfg] }],
    6000
  );
  return Array.isArray(res) ? (res as SigInfo[]) : [];
}

/**
 * Count `sigs` in the given order, stopping at the first tx we cannot fetch.
 * Returns how many were applied (a contiguous prefix).
 */
async function processInOrder(
  rpcUrls: string[],
  state: RingsFlowState,
  sigs: SigInfo[],
  budget: { tx: number; deadline: number },
  onApplied: (s: SigInfo) => void
): Promise<number> {
  let applied = 0;
  for (let i = 0; i < sigs.length; i += TX_BATCH) {
    if (budget.tx <= 0 || Date.now() > budget.deadline) break;
    const chunk = sigs.slice(i, i + Math.min(TX_BATCH, budget.tx));
    const need = chunk.filter((s) => !s.err);
    let txs: (any | null)[] = [];
    if (need.length) {
      // Gentle pacing: RPCs rate-limit bursts of getTransaction batches
      if (i > 0) await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
      try {
        txs = await rpcBatchLoose(
          rpcUrls,
          need.map((s) => ({
            method: 'getTransaction',
            params: [
              s.signature,
              { encoding: 'json', maxSupportedTransactionVersion: 1 },
            ],
          })),
          8000
        );
      } catch (err) {
        // e.g. HTTP 429 — keep what we have; the cursor resumes here next run
        console.error('Helius Rings tx batch failed:', err);
        return applied;
      }
    }
    const bySig = new Map(need.map((s, k) => [s.signature, txs[k]]));
    for (const s of chunk) {
      if (s.err) {
        state.failedTxCount += 1;
      } else {
        const tx = bySig.get(s.signature);
        if (!tx || tx.meta?.err) {
          if (tx?.meta?.err) {
            state.failedTxCount += 1;
          } else {
            return applied; // not fetched — retry from here next time
          }
        } else {
          applyTx(state, tx);
        }
      }
      onApplied(s);
      applied += 1;
      budget.tx -= 1;
    }
  }
  return applied;
}

/**
 * Advance the flow index by at most `maxTx` transactions / `timeMs`.
 * Forward (new txs since the cursor) first, then backfill toward the
 * program's first transaction.
 */
export async function syncHeliusRingsFlows(
  rpcUrls: string[],
  opts: { maxTx: number; timeMs: number }
): Promise<RingsFlowState> {
  const { state, version } = await loadState();
  const budget = { tx: opts.maxTx, deadline: Date.now() + opts.timeMs };
  const before = JSON.stringify(state);

  let firstPage: SigInfo[] | null = null;
  if (!state.newestSig) {
    firstPage = await getSignatures(rpcUrls, { limit: SIG_PAGE });
    if (firstPage.length) {
      state.newestSig = firstPage[0].signature;
      state.newestBlockTime = firstPage[0].blockTime ?? null;
    }
  } else {
    // Forward: everything newer than newestSig, applied oldest-first
    const newer: SigInfo[] = [];
    let reachedCursor = false;
    let pageBefore: string | undefined;
    for (let p = 0; p < 20; p++) {
      let page: SigInfo[];
      try {
        page = await getSignatures(rpcUrls, {
          until: state.newestSig,
          before: pageBefore,
          limit: SIG_PAGE,
        });
      } catch (err) {
        console.error('Helius Rings signature page failed:', err);
        break; // skip forward this run; reachedCursor stays false
      }
      newer.push(...page);
      if (page.length < SIG_PAGE) {
        reachedCursor = true;
        break;
      }
      pageBefore = page[page.length - 1].signature;
    }
    if (reachedCursor && newer.length) {
      newer.reverse();
      await processInOrder(rpcUrls, state, newer, budget, (s) => {
        state.newestSig = s.signature;
        state.newestBlockTime = s.blockTime ?? state.newestBlockTime;
      });
    }
  }

  // Backfill: newest → oldest, before the backfill cursor
  while (!state.backfillDone && budget.tx > 0 && Date.now() < budget.deadline) {
    let page: SigInfo[];
    try {
      page =
        firstPage ||
        (await getSignatures(rpcUrls, {
          before: state.backfillBefore || undefined,
          limit: SIG_PAGE,
        }));
    } catch (err) {
      console.error('Helius Rings signature page failed:', err);
      break; // persist progress so far
    }
    firstPage = null;
    // Empty page before reaching the first program tx = truncated history on
    // this RPC; stop and retry next run rather than declaring completion.
    if (!page.length) break;
    const n = await processInOrder(rpcUrls, state, page, budget, (s) => {
      state.backfillBefore = s.signature;
      state.oldestBlockTime = s.blockTime ?? state.oldestBlockTime;
      if (s.signature === FIRST_PROGRAM_SIG) state.backfillDone = true;
    });
    if (n < page.length || page.length < SIG_PAGE) break;
  }

  if (JSON.stringify(state) !== before) {
    // Fresh index with nothing counted yet: don't persist a cursor that
    // would make us skip the first page.
    if (!(version === 0 && state.txCount + state.failedTxCount === 0)) {
      state.updatedAt = new Date().toISOString();
      await persistState(state, version);
    }
  }
  return state;
}

/* ------------------------------------------------------------------ */
/* Public read                                                         */
/* ------------------------------------------------------------------ */

export interface HeliusRingsResult {
  pools: Pool[];
  tvl: number;
  stats: string;
  flows: ProtocolFlows;
  unpriced: number;
}

let lastSyncAt = 0;
const REQUEST_SYNC_EVERY_MS = 60_000;

function toUi(raw: string | undefined, decimals: number): number {
  if (!raw) return 0;
  return Number(BigInt(raw)) / 10 ** decimals;
}

const FLOW_METHOD =
  'Sum of public balance deltas on the Ring SOL interface + SPL interface vaults across every successful shielded-pool program tx; USD at current prices';

function buildFlows(
  state: RingsFlowState | null,
  prices: Record<string, { price: number; symbol: string }>,
  reason?: string
): ProtocolFlows {
  if (!state || !state.backfillDone) {
    return {
      status: state ? 'indexing' : 'unavailable',
      since: null,
      asOf: null,
      depositVolumeUsd: null,
      withdrawVolumeUsd: null,
      txCount: null,
      depositTxCount: null,
      withdrawTxCount: null,
      failedTxCount: null,
      unpricedAssets: 0,
      assets: [],
      method: FLOW_METHOD,
      note: state
        ? `Backfilling public flow history (${state.txCount} txs indexed so far); volumes are withheld until the index reaches the program's first transaction.`
        : reason || 'Flow index unavailable',
    };
  }
  const mints = new Set([
    ...Object.keys(state.deposited),
    ...Object.keys(state.withdrawn),
  ]);
  let dep = 0;
  let wd = 0;
  let unpriced = 0;
  const assets: ProtocolFlows['assets'] = [];
  for (const mint of mints) {
    const dec = state.decimals[mint] ?? (mint === SOL_MINT ? 9 : 0);
    const deposited = toUi(state.deposited[mint], dec);
    const withdrawn = toUi(state.withdrawn[mint], dec);
    const p = prices[mint];
    if (!p) unpriced += 1;
    const depositedUsd = p ? deposited * p.price : null;
    const withdrawnUsd = p ? withdrawn * p.price : null;
    dep += depositedUsd || 0;
    wd += withdrawnUsd || 0;
    const upper = p?.symbol?.toUpperCase();
    assets.push({
      asset: mint === SOL_MINT ? 'SOL' : upper || mint.slice(0, 4),
      mint,
      deposited,
      withdrawn,
      depositedUsd,
      withdrawnUsd,
    });
  }
  assets.sort((a, b) => (b.depositedUsd || 0) - (a.depositedUsd || 0));
  const iso = (t: number | null) =>
    t ? new Date(t * 1000).toISOString() : null;
  return {
    status: 'complete',
    since: iso(state.oldestBlockTime),
    asOf: iso(state.newestBlockTime),
    depositVolumeUsd: dep,
    withdrawVolumeUsd: wd,
    txCount: state.txCount,
    depositTxCount: state.depositTxCount,
    withdrawTxCount: state.withdrawTxCount,
    failedTxCount: state.failedTxCount,
    unpricedAssets: unpriced,
    // Keep payload small: priced assets with ≥ $1 of flow, plus SOL
    assets: assets
      .filter(
        (a) =>
          a.mint === SOL_MINT ||
          (a.depositedUsd || 0) >= 1 ||
          (a.withdrawnUsd || 0) >= 1
      )
      .slice(0, 12),
    method: FLOW_METHOD,
  };
}

/**
 * TVL (fresh on every call) + public flows (incremental index, advanced by at
 * most a small budget per call so the request path stays fast).
 */
export async function fetchHeliusRings(
  rpcUrls: string[],
  opts: { syncMaxTx?: number; syncTimeMs?: number } = {}
): Promise<HeliusRingsResult> {
  const doSync = Date.now() - lastSyncAt > REQUEST_SYNC_EVERY_MS;
  const [vaults, flowRes] = await Promise.all([
    readVaults(rpcUrls),
    (async () => {
      try {
        if (doSync) {
          lastSyncAt = Date.now();
          return {
            state: await syncHeliusRingsFlows(rpcUrls, {
              maxTx: opts.syncMaxTx ?? 100,
              timeMs: opts.syncTimeMs ?? 4000,
            }),
          };
        }
        return { state: (await loadState()).state };
      } catch (err) {
        console.error('Helius Rings flow index error:', err);
        try {
          return {
            state: (await loadState()).state,
          };
        } catch {
          return { state: null, reason: 'Flow index read failed' };
        }
      }
    })(),
  ]);
  const state = flowRes.state;

  const flowMints = state
    ? [...Object.keys(state.deposited), ...Object.keys(state.withdrawn)]
    : [];
  const prices = await getLlamaPrices([
    ...vaults.map((v) => v.mint),
    ...flowMints,
  ]);
  if (prices[SOL_MINT]) prices[SOL_MINT].symbol = 'SOL';

  let tvl = 0;
  const unpricedMints = new Set<string>();
  const bySymbol = new Map<string, Pool>();
  for (const h of vaults) {
    const p = prices[h.mint];
    if (!p) {
      unpricedMints.add(h.mint);
      continue;
    }
    const usd = h.amount * p.price;
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

  const flows = buildFlows(state, prices, (flowRes as { reason?: string }).reason);
  const parts = [
    'Mainnet since 9 Nov 2026',
    'permissionless confidential Ring',
    'public vaults on-chain',
  ];
  if (flows.status === 'complete') {
    parts.push(
      `${flows.depositTxCount} deposit · ${flows.withdrawTxCount} withdraw txs`
    );
  }
  return {
    pools,
    tvl,
    stats: parts.join(' · '),
    flows,
    unpriced: unpricedMints.size,
  };
}
