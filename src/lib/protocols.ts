import {
  MINTS,
  POOL_ADDRESSES,
  SOLANA_RPC,
  ARCIUM_STAKING_PROGRAM,
  ARCIUM_OPERATOR_ACCOUNT_SIZE,
  PROTOCOL_PROGRAMS,
} from './constants';
import { fetchUmbraOnchain, fetchUmbraFromLlama } from './umbra';
import { fetchHeliusRings } from './helius-rings';

export const RPC_URLS = [
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  SOLANA_RPC,
  'https://solana-rpc.publicnode.com',
  'https://solana-mainnet.publicnode.com',
  'https://api.mainnet-beta.solana.com',
].filter(Boolean) as string[];

const JUP_API_KEY =
  process.env.JUP_API_KEY || '3309da44-211b-4acb-9d31-c36fb54d9459';

const ARCIUM_NODES_URL =
  'https://explorer.arcium.com/api/v1/nodes?network=mainnet';
const ARCIUM_CLUSTERS_URL =
  'https://explorer.arcium.com/api/v1/clusters?network=mainnet';

/** In-isolate cache so warm requests stay fast */
let cache: { at: number; data: ProtocolsResponse } | null = null;
const CACHE_TTL_MS = 45_000;

async function rpcCall(method: string, params: unknown[], timeoutMs = 4000) {
  const body = JSON.stringify({ method, jsonrpc: '2.0', params, id: '1' });
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.error) return data;
      }
    } catch {
      // try next RPC
    }
  }
  return null;
}

async function getBalance(address: string): Promise<number> {
  const data = await rpcCall('getBalance', [address]);
  return (data?.result?.value || 0) / 1e9;
}

/** SPL token account UI amount (e.g. WSOL vault ATA) */
async function getTokenAccountBalance(address: string): Promise<number> {
  const data = await rpcCall('getTokenAccountBalance', [address]);
  const ui = data?.result?.value?.uiAmount;
  if (typeof ui === 'number' && !Number.isNaN(ui)) return ui;
  const s = data?.result?.value?.uiAmountString;
  return s ? parseFloat(s) || 0 : 0;
}

async function getTokenSupply(mint: string): Promise<number> {
  const data = await rpcCall('getTokenSupply', [mint]);
  return data?.result?.value?.uiAmount || 0;
}

async function getTokenAccountsByOwner(
  owner: string,
  mintMap: Record<string, string>
): Promise<Record<string, number>> {
  const data = await rpcCall('getTokenAccountsByOwner', [
    owner,
    { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
    { encoding: 'jsonParsed' },
  ]);
  const accounts = data?.result?.value || [];
  const balances: Record<string, number> = {};

  const mintToLabel: Record<string, string> = {};
  for (const [label, mint] of Object.entries(mintMap)) {
    mintToLabel[mint] = label;
  }

  for (const acc of accounts) {
    const info = acc?.account?.data?.parsed?.info;
    const mint = info?.mint;
    const balance = parseFloat(info?.tokenAmount?.uiAmountString || '0');
    const label = mintToLabel[mint];
    if (label) balances[label] = balance;
  }

  return balances;
}

export interface Pool {
  asset: string;
  address: string | null;
  balance: number;
  usd: number;
}

/**
 * Public deposit / withdraw flows (currently Helius Rings only). Measured from
 * public vault balance deltas — never from decrypted private state.
 */
export interface ProtocolFlows {
  /** complete = all-time totals; indexing = backfill running, figures null */
  status: 'complete' | 'indexing' | 'unavailable';
  /** ISO time of the first indexed program tx */
  since: string | null;
  /** ISO time of the newest indexed program tx */
  asOf: string | null;
  depositVolumeUsd: number | null;
  withdrawVolumeUsd: number | null;
  /** successful program txs (deposits, withdrawals, private transfers, admin) */
  txCount: number | null;
  /** txs with a public inflow to a Ring vault */
  depositTxCount: number | null;
  /** txs with a public outflow from a Ring vault */
  withdrawTxCount: number | null;
  failedTxCount: number | null;
  /** assets with flows that have no price (excluded from USD totals) */
  unpricedAssets: number;
  assets: {
    asset: string;
    mint: string;
    deposited: number;
    withdrawn: number;
    depositedUsd: number | null;
    withdrawnUsd: number | null;
  }[];
  method: string;
  note?: string;
}

export interface Protocol {
  name: string;
  status: string;
  url: string;
  linkText?: string;
  pools: Pool[];
  tvl: number;
  /** Optional non-TVL subtitle (e.g. Arcium network stats) */
  stats?: string;
  /** infra = compute network without pool TVL */
  kind?: 'pool' | 'infra';
  /** On-chain program IDs (ProgramWatch) */
  programs?: { id: string; label: string }[];
  /** Set when live data could not be fetched; tvl is NOT a real reading */
  error?: string;
  /** True when tvl is a last-good / fallback value rather than a fresh read */
  stale?: boolean;
  /** Public deposit/withdraw volumes + tx counts, where measurable */
  flows?: ProtocolFlows;
}

export interface ProtocolsResponse {
  solPrice: number;
  bonkPrice: number;
  orePrice: number;
  totalTvl: number;
  protocols: Protocol[];
  updatedAt: string;
  cached?: boolean;
}

/** Last successful Umbra on-chain read (per isolate) */
let umbraLastGood: {
  at: number;
  value: { pools: Pool[]; tvl: number; stats: string };
} | null = null;
const UMBRA_LAST_GOOD_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function fmtCompactUsd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

/**
 * Umbra TVL from chain state (V1 pools + V2 vaults; see ./umbra.ts).
 * Never resolves to a silent $0: on failure it serves the last good read,
 * then DefiLlama's Umbra TVL, and otherwise rejects so the row is flagged.
 */
async function fetchUmbra(): Promise<{
  pools: Pool[];
  tvl: number;
  stats: string;
  stale?: boolean;
}> {
  try {
    const r = await Promise.race([
      fetchUmbraOnchain(RPC_URLS),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Umbra on-chain timeout')), 6500)
      ),
    ]);
    const parts = ['V1 + V2 shielded pools · on-chain'];
    if (r.umbraTokenUsd >= 1) {
      parts.push(`excl. ${fmtCompactUsd(r.umbraTokenUsd)} UMBRA deposits`);
    }
    const value = { pools: r.pools, tvl: r.tvl, stats: parts.join(' · ') };
    umbraLastGood = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error('Umbra on-chain read failed:', err);
    if (
      umbraLastGood &&
      Date.now() - umbraLastGood.at < UMBRA_LAST_GOOD_MAX_AGE_MS
    ) {
      const asOf = new Date(umbraLastGood.at).toISOString().slice(11, 16);
      return {
        ...umbraLastGood.value,
        stats: `${umbraLastGood.value.stats} · stale (last read ${asOf} UTC)`,
        stale: true,
      };
    }
    const tvl = await fetchUmbraFromLlama();
    return {
      pools: [],
      tvl,
      stats: 'On-chain read failed · showing DefiLlama Umbra TVL',
      stale: true,
    };
  }
}

/** Last successful Helius Rings read (per isolate) */
let ringsLastGood: {
  at: number;
  value: { pools: Pool[]; tvl: number; stats: string; flows: ProtocolFlows };
} | null = null;

/**
 * Helius Rings TVL + public flows from chain state (see ./helius-rings.ts).
 * On failure: last good read (6h, flagged stale), otherwise reject so the
 * row is flagged with an error rather than showing a fake $0.
 */
async function fetchRings(): Promise<{
  pools: Pool[];
  tvl: number;
  stats: string;
  flows: ProtocolFlows;
  stale?: boolean;
}> {
  try {
    const r = await Promise.race([
      fetchHeliusRings(RPC_URLS),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Helius Rings timeout')), 8000)
      ),
    ]);
    const value = { pools: r.pools, tvl: r.tvl, stats: r.stats, flows: r.flows };
    ringsLastGood = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error('Helius Rings on-chain read failed:', err);
    if (
      ringsLastGood &&
      Date.now() - ringsLastGood.at < UMBRA_LAST_GOOD_MAX_AGE_MS
    ) {
      const asOf = new Date(ringsLastGood.at).toISOString().slice(11, 16);
      return {
        ...ringsLastGood.value,
        stats: `${ringsLastGood.value.stats} · stale (last read ${asOf} UTC)`,
        stale: true,
      };
    }
    throw err;
  }
}

async function fetchJson(url: string, ms: number) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** Fast path only — avoid flaky /stats which often times out ~8–15s */
async function fetchArciumNetworkMeta(): Promise<string> {
  try {
    const [nodesJson, clustersJson] = await Promise.all([
      fetchJson(ARCIUM_NODES_URL, 3000).catch(() => null),
      fetchJson(ARCIUM_CLUSTERS_URL, 3000).catch(() => null),
    ]);
    const nodes = Array.isArray(nodesJson?.data)
      ? nodesJson.data
      : Array.isArray(nodesJson)
        ? nodesJson
        : [];
    const clusters = Array.isArray(clustersJson?.data)
      ? clustersJson.data
      : Array.isArray(clustersJson)
        ? clustersJson
        : [];

    const parts: string[] = [];
    if (nodes.length) parts.push(`${nodes.length} nodes`);
    if (clusters.length) parts.push(`${clusters.length} clusters`);
    if (!parts.length) return 'Confidential compute · operator stake';
    parts.push('operator stake');
    return parts.join(' · ');
  } catch {
    return 'Confidential compute · operator stake';
  }
}

/**
 * Read total ARX staked to operators from Arcium staking program accounts.
 * Operator accounts are fixed-size (652 bytes). Stake amount is max(u64@8, u64@16)
 * in base units (9 decimals) — matches stake.arcium.com operator table totals.
 */
async function fetchArciumStakedArx(): Promise<{
  stakedArx: number;
  operators: number;
}> {
  // Heavy call — short timeout, first healthy RPC only path is enough
  const data = await rpcCall(
    'getProgramAccounts',
    [
      ARCIUM_STAKING_PROGRAM,
      {
        encoding: 'base64',
        filters: [{ dataSize: ARCIUM_OPERATOR_ACCOUNT_SIZE }],
        commitment: 'confirmed',
      },
    ],
    6000
  );

  const accounts: Array<{ account?: { data?: [string, string] } }> =
    data?.result || [];
  let stakedArx = 0;
  let operators = 0;

  for (const acc of accounts) {
    const b64 = acc?.account?.data?.[0];
    if (!b64) continue;
    // Edge-safe base64 decode
    const binary = atob(b64);
    if (binary.length < 24) continue;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u8 = Number(view.getBigUint64(8, true));
    const u16 = Number(view.getBigUint64(16, true));
    const raw = Math.max(u8, u16);
    // Sanity: 0 – 50M ARX per operator account
    if (raw <= 0 || raw > 50_000_000 * 1e9) continue;
    stakedArx += raw / 1e9;
    operators += 1;
  }

  return { stakedArx, operators };
}

async function buildProtocolsData(): Promise<ProtocolsResponse> {
  const [
    priceResult,
    turbineResult,
    vanishResult,
    mixoorResult,
    elusivResult,
    pcResult,
    umbraResult,
    arciumStakeResult,
    arciumMetaResult,
    magicblockSolResult,
    magicblockUsdcResult,
    voidifyResult,
    ringsResult,
  ] = await Promise.allSettled([
    (async () => {
      const mintIds = [MINTS.SOL, MINTS.BONK, MINTS.ORE, MINTS.ARX, MINTS.ZEC].join(',');
      const priceRes = await fetch(
        `https://api.jup.ag/price/v3?ids=${mintIds}`,
        {
          headers: { 'x-api-key': JUP_API_KEY },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (!priceRes.ok) throw new Error(`Jupiter HTTP ${priceRes.status}`);
      return priceRes.json();
    })(),
    getTokenSupply(MINTS.ZSOL),
    getBalance(POOL_ADDRESSES.VANISH_TRADE),
    (async () => {
      const SOL = await getBalance(POOL_ADDRESSES.MIXOOR);
      const tokens = await getTokenAccountsByOwner(POOL_ADDRESSES.MIXOOR, {
        USDC: MINTS.USDC,
        USD1: MINTS.USD1,
      });
      return { SOL, USDC: tokens.USDC || 0, USD1: tokens.USD1 || 0 };
    })(),
    (async () => {
      const SOL = await getBalance(POOL_ADDRESSES.ELUSIV);
      const tokens = await getTokenAccountsByOwner(POOL_ADDRESSES.ELUSIV, {
        USDC: MINTS.USDC,
        USDT: MINTS.USDT,
        BONK: MINTS.BONK,
      });
      return {
        SOL,
        USDC: tokens.USDC || 0,
        USDT: tokens.USDT || 0,
        BONK: tokens.BONK || 0,
      };
    })(),
    (async () => {
      const SOL = await getBalance(POOL_ADDRESSES.PRIVACY_CASH_SOL);
      const tokens = await getTokenAccountsByOwner(
        POOL_ADDRESSES.PRIVACY_CASH_TOKEN,
        {
          USDC: MINTS.USDC,
          USDT: MINTS.USDT,
          ORE: MINTS.ORE,
          stORE: MINTS.stORE,
          ZEC: MINTS.ZEC,
        }
      );
      return {
        SOL,
        USDC: tokens.USDC || 0,
        USDT: tokens.USDT || 0,
        ORE: tokens.ORE || 0,
        stORE: tokens.stORE || 0,
        ZEC: tokens.ZEC || 0,
      };
    })(),
    fetchUmbra(),
    fetchArciumStakedArx(),
    fetchArciumNetworkMeta(),
    getTokenAccountBalance(POOL_ADDRESSES.MAGICBLOCK_SOL),
    getTokenAccountBalance(POOL_ADDRESSES.MAGICBLOCK_USDC),
    (async () => {
      const [classicSol, novaSol, novaUsdc] = await Promise.all([
        getBalance(POOL_ADDRESSES.VOIDIFY_CLASSIC_SOL),
        getBalance(POOL_ADDRESSES.VOIDIFY_NOVA_SOL),
        getTokenAccountBalance(POOL_ADDRESSES.VOIDIFY_NOVA_USDC),
      ]);
      return { classicSol, novaSol, novaUsdc };
    })(),
    fetchRings(),
  ]);

  let solPrice = 180;
  let bonkPrice = 0;
  let orePrice = 0;
  let arxPrice = 0;
  let zecPrice = 0;
  if (priceResult.status === 'fulfilled') {
    const priceData = priceResult.value;
    solPrice = priceData?.[MINTS.SOL]?.usdPrice || 180;
    bonkPrice = priceData?.[MINTS.BONK]?.usdPrice || 0;
    orePrice = priceData?.[MINTS.ORE]?.usdPrice || 0;
    arxPrice = priceData?.[MINTS.ARX]?.usdPrice || 0;
    zecPrice = priceData?.[MINTS.ZEC]?.usdPrice || 0;
  } else {
    console.error('Jupiter price fetch error:', priceResult.reason);
  }

  // Llama fallback for ARX if Jupiter misses it
  if (!arxPrice) {
    try {
      const coin = await fetchJson(
        `https://coins.llama.fi/prices/current/solana:${MINTS.ARX}`,
        4000
      );
      arxPrice =
        coin?.coins?.[`solana:${MINTS.ARX}`]?.price ||
        coin?.coins?.['solana:ARXwZkNAtzPfdcoqQiduJn8EPv9fKiDfGn2KyggyDrFs']
          ?.price ||
        0;
    } catch {
      /* keep 0 */
    }
  }

  const turbineZsol =
    turbineResult.status === 'fulfilled' ? turbineResult.value : 0;
  const vanishSol =
    vanishResult.status === 'fulfilled' ? vanishResult.value : 0;
  const magicblockSol =
    magicblockSolResult.status === 'fulfilled'
      ? magicblockSolResult.value
      : 0;
  const magicblockUsdc =
    magicblockUsdcResult.status === 'fulfilled'
      ? magicblockUsdcResult.value
      : 0;
  if (magicblockSolResult.status === 'rejected') {
    console.error('MagicBlock SOL vault error:', magicblockSolResult.reason);
  }
  if (magicblockUsdcResult.status === 'rejected') {
    console.error('MagicBlock USDC vault error:', magicblockUsdcResult.reason);
  }
  const voidifyBalances =
    voidifyResult.status === 'fulfilled'
      ? voidifyResult.value
      : { classicSol: 0, novaSol: 0, novaUsdc: 0 };
  if (voidifyResult.status === 'rejected') {
    console.error('Voidify vault error:', voidifyResult.reason);
  }
  const voidifySol = voidifyBalances.classicSol + voidifyBalances.novaSol;
  const voidifyUsdc = voidifyBalances.novaUsdc;
  const voidifyTvl = voidifySol * solPrice + voidifyUsdc;
  const mixoorBalances =
    mixoorResult.status === 'fulfilled'
      ? mixoorResult.value
      : { SOL: 0, USDC: 0, USD1: 0 };
  const elusivBalances =
    elusivResult.status === 'fulfilled'
      ? elusivResult.value
      : { SOL: 0, USDC: 0, USDT: 0, BONK: 0 };
  const pcBalances =
    pcResult.status === 'fulfilled'
      ? pcResult.value
      : { SOL: 0, USDC: 0, USDT: 0, ORE: 0, stORE: 0, ZEC: 0 };

  let umbraPools: Pool[] = [];
  let umbraTvl = 0;
  let umbraStats: string | undefined;
  let umbraStale = false;
  let umbraError: string | undefined;
  if (umbraResult.status === 'fulfilled') {
    umbraPools = umbraResult.value.pools;
    umbraTvl = umbraResult.value.tvl;
    umbraStats = umbraResult.value.stats;
    umbraStale = !!umbraResult.value.stale;
  } else {
    console.error('Umbra fetch error:', umbraResult.reason);
    umbraError = 'Umbra TVL unavailable (upstream read failed)';
    umbraStats = 'Data temporarily unavailable — TVL not shown';
  }

  let ringsPools: Pool[] = [];
  let ringsTvl = 0;
  let ringsStats =
    'Mainnet since 9 Nov 2026 · permissionless confidential Ring';
  let ringsFlows: ProtocolFlows | undefined;
  let ringsStale = false;
  let ringsError: string | undefined;
  if (ringsResult.status === 'fulfilled') {
    ringsPools = ringsResult.value.pools;
    ringsTvl = ringsResult.value.tvl;
    ringsStats = ringsResult.value.stats;
    ringsFlows = ringsResult.value.flows;
    ringsStale = !!ringsResult.value.stale;
  } else {
    console.error('Helius Rings fetch error:', ringsResult.reason);
    ringsError = 'Helius Rings TVL unavailable (on-chain read failed)';
    ringsStats = `${ringsStats} · data temporarily unavailable — TVL not shown`;
  }

  const stakedArx =
    arciumStakeResult.status === 'fulfilled'
      ? arciumStakeResult.value.stakedArx
      : 0;
  const arciumOperators =
    arciumStakeResult.status === 'fulfilled'
      ? arciumStakeResult.value.operators
      : 0;
  if (arciumStakeResult.status === 'rejected') {
    console.error('Arcium stake fetch error:', arciumStakeResult.reason);
  }
  const arciumMeta =
    arciumMetaResult.status === 'fulfilled'
      ? arciumMetaResult.value
      : 'Confidential compute · operator stake';
  const arciumUsd = stakedArx * arxPrice;
  const arciumStats = [
    arciumMeta,
    arciumOperators > 0 ? `${arciumOperators} operator accounts` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const arciumPools: Pool[] =
    stakedArx > 0
      ? [
          {
            asset: 'ARX',
            address: ARCIUM_STAKING_PROGRAM,
            balance: stakedArx,
            usd: arciumUsd,
          },
        ]
      : [];
  const arciumKind: 'pool' | 'infra' = stakedArx > 0 ? 'pool' : 'infra';

  const protocols: Protocol[] = [
    {
      name: 'Privacy Cash',
      status: 'live',
      url: 'https://privacycash.org',
      linkText: 'privacycash.org',
      kind: 'pool',
      pools: [
        {
          asset: 'SOL',
          address: POOL_ADDRESSES.PRIVACY_CASH_SOL,
          balance: pcBalances.SOL,
          usd: pcBalances.SOL * solPrice,
        },
        {
          asset: 'USDC',
          address: POOL_ADDRESSES.PRIVACY_CASH_TOKEN,
          balance: pcBalances.USDC,
          usd: pcBalances.USDC,
        },
        {
          asset: 'USDT',
          address: POOL_ADDRESSES.PRIVACY_CASH_TOKEN,
          balance: pcBalances.USDT,
          usd: pcBalances.USDT,
        },
        {
          asset: 'ORE',
          address: POOL_ADDRESSES.PRIVACY_CASH_TOKEN,
          balance: pcBalances.ORE + pcBalances.stORE,
          usd: (pcBalances.ORE + pcBalances.stORE) * orePrice,
        },
        {
          asset: 'ZEC',
          address: POOL_ADDRESSES.PRIVACY_CASH_ZEC,
          balance: pcBalances.ZEC,
          usd: pcBalances.ZEC * zecPrice,
        },
      ],
      tvl:
        pcBalances.SOL * solPrice +
        pcBalances.USDC +
        pcBalances.USDT +
        (pcBalances.ORE + pcBalances.stORE) * orePrice +
        pcBalances.ZEC * zecPrice,
    },
    {
      name: 'Umbra',
      status: 'live',
      url: 'https://app.umbraprivacy.com',
      linkText: 'app.umbraprivacy.com',
      kind: 'pool',
      pools: umbraPools,
      tvl: umbraTvl,
      stats: umbraStats,
      ...(umbraStale ? { stale: true } : {}),
      ...(umbraError ? { error: umbraError } : {}),
    },
    {
      name: 'Arcium',
      status: 'live',
      url: 'https://stake.arcium.com',
      linkText: 'stake.arcium.com',
      kind: arciumKind,
      pools: arciumPools,
      tvl: arciumUsd,
      stats: arciumStats || 'Confidential compute · operator stake',
    },
    {
      name: 'MagicBlock',
      status: 'live',
      url: 'https://one.magicblock.app',
      linkText: 'one.magicblock.app',
      kind: 'pool',
      pools: [
        {
          asset: 'SOL',
          address: POOL_ADDRESSES.MAGICBLOCK_SOL,
          balance: magicblockSol,
          usd: magicblockSol * solPrice,
        },
        {
          asset: 'USDC',
          address: POOL_ADDRESSES.MAGICBLOCK_USDC,
          balance: magicblockUsdc,
          usd: magicblockUsdc,
        },
      ],
      tvl: magicblockSol * solPrice + magicblockUsdc,
      stats: 'Private SOL + USDC vaults on MagicBlock One',
    },
    {
      name: 'Helius Rings',
      status: 'live',
      url: 'https://www.helius.dev/privacy',
      linkText: 'helius.dev/privacy',
      kind: 'pool',
      pools: ringsPools,
      tvl: ringsTvl,
      stats: ringsStats,
      ...(ringsFlows ? { flows: ringsFlows } : {}),
      ...(ringsStale ? { stale: true } : {}),
      ...(ringsError ? { error: ringsError } : {}),
    },
    {
      name: 'Light Protocol',
      status: 'live',
      url: 'https://lightprotocol.com',
      linkText: 'lightprotocol.com',
      kind: 'infra',
      pools: [],
      tvl: 0,
      stats: 'Acquired by Helius (2026) · ZK compression · feeds Rings',
    },
    {
      name: 'Turbine',
      status: 'live',
      url: 'https://turbine.cash',
      linkText: 'turbine.cash',
      kind: 'pool',
      pools: [
        {
          asset: 'ZSOL',
          address: MINTS.ZSOL,
          balance: turbineZsol,
          usd: turbineZsol * solPrice,
        },
      ],
      tvl: turbineZsol * solPrice,
    },
    {
      name: 'Vanish Trade',
      status: 'live',
      url: 'https://www.vanish.trade/@shielded',
      linkText: 'vanish.trade',
      kind: 'pool',
      pools: [
        {
          asset: 'SOL',
          address: POOL_ADDRESSES.VANISH_TRADE,
          balance: vanishSol,
          usd: vanishSol * solPrice,
        },
      ],
      tvl: vanishSol * solPrice,
    },
    {
      name: 'Voidify',
      status: 'live',
      url: 'https://x.com/VoidifyPrivacy',
      linkText: '@VoidifyPrivacy',
      kind: 'pool',
      pools: [
        {
          asset: 'SOL',
          address: POOL_ADDRESSES.VOIDIFY_CLASSIC_SOL,
          balance: voidifyBalances.classicSol,
          usd: voidifyBalances.classicSol * solPrice,
        },
        {
          asset: 'SOL',
          address: POOL_ADDRESSES.VOIDIFY_NOVA_SOL,
          balance: voidifyBalances.novaSol,
          usd: voidifyBalances.novaSol * solPrice,
        },
        {
          asset: 'USDC',
          address: POOL_ADDRESSES.VOIDIFY_NOVA_USDC,
          balance: voidifyUsdc,
          usd: voidifyUsdc,
        },
      ],
      tvl: voidifyTvl,
      stats: 'ZK mixer · classic + nova treasuries',
    },
    {
      name: 'Mixoor',
      status: 'live',
      url: 'https://mixoor.fun',
      linkText: 'mixoor.fun',
      kind: 'pool',
      pools: [
        {
          asset: 'SOL',
          address: POOL_ADDRESSES.MIXOOR,
          balance: mixoorBalances.SOL,
          usd: mixoorBalances.SOL * solPrice,
        },
        {
          asset: 'USDC',
          address: POOL_ADDRESSES.MIXOOR,
          balance: mixoorBalances.USDC,
          usd: mixoorBalances.USDC,
        },
        {
          asset: 'USD1',
          address: POOL_ADDRESSES.MIXOOR,
          balance: mixoorBalances.USD1,
          usd: mixoorBalances.USD1,
        },
      ],
      tvl:
        mixoorBalances.SOL * solPrice +
        mixoorBalances.USDC +
        mixoorBalances.USD1,
    },
    {
      name: 'Elusiv',
      status: 'sunset',
      url: 'https://x.com/elusivprivacy',
      linkText: 'sunset · @elusivprivacy',
      kind: 'pool',
      pools: [
        {
          asset: 'SOL',
          address: POOL_ADDRESSES.ELUSIV,
          balance: elusivBalances.SOL,
          usd: elusivBalances.SOL * solPrice,
        },
        {
          asset: 'USDC',
          address: POOL_ADDRESSES.ELUSIV,
          balance: elusivBalances.USDC,
          usd: elusivBalances.USDC,
        },
        {
          asset: 'USDT',
          address: POOL_ADDRESSES.ELUSIV,
          balance: elusivBalances.USDT,
          usd: elusivBalances.USDT,
        },
        {
          asset: 'BONK',
          address: POOL_ADDRESSES.ELUSIV,
          balance: elusivBalances.BONK,
          usd: elusivBalances.BONK * bonkPrice,
        },
      ],
      tvl:
        elusivBalances.SOL * solPrice +
        elusivBalances.USDC +
        elusivBalances.USDT +
        elusivBalances.BONK * bonkPrice,
    },
  ];

  // live pools by TVL → upcoming → infra → sunset
  const rank = (p: Protocol) => {
    if (p.status === 'sunset') return 3;
    if (p.kind === 'infra') return 2;
    if (p.status === 'upcoming') return 1;
    return 0;
  };
  protocols.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return b.tvl - a.tvl;
  });

  // Attach verified program IDs for ProgramWatch links
  for (const p of protocols) {
    const progs = PROTOCOL_PROGRAMS[p.name];
    if (progs?.length) p.programs = progs;
  }

  // Total = live pool TVL only (exclude sunset residual + infra/upcoming zeros)
  const totalTvl = protocols.reduce((sum, p) => {
    if (p.status !== 'live' || p.kind === 'infra') return sum;
    return sum + (p.tvl || 0);
  }, 0);

  return {
    solPrice,
    bonkPrice,
    orePrice,
    totalTvl,
    protocols,
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchProtocolsData(): Promise<ProtocolsResponse> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.data, cached: true };
  }

  try {
    const data = await Promise.race([
      buildProtocolsData(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('protocols build timeout')), 12_000);
      }),
    ]);
    cache = { at: Date.now(), data };
    return { ...data, cached: false };
  } catch (err) {
    console.error('fetchProtocolsData failed:', err);
    // Serve last good payload rather than hard-failing the UI
    if (cache?.data) {
      return { ...cache.data, cached: true };
    }
    // Minimal empty shell so client can still render
    return {
      solPrice: 0,
      bonkPrice: 0,
      orePrice: 0,
      totalTvl: 0,
      protocols: [],
      updatedAt: new Date().toISOString(),
      cached: false,
    };
  }
}
