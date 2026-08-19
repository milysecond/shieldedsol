import {
  MINTS,
  POOL_ADDRESSES,
  SOLANA_RPC,
  ARCIUM_STAKING_PROGRAM,
  ARCIUM_OPERATOR_ACCOUNT_SIZE,
} from './constants';

const RPC_URLS = [
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  SOLANA_RPC,
  'https://solana-rpc.publicnode.com',
  'https://solana-mainnet.publicnode.com',
  'https://api.mainnet-beta.solana.com',
].filter(Boolean) as string[];

const JUP_API_KEY =
  process.env.JUP_API_KEY || '3309da44-211b-4acb-9d31-c36fb54d9459';

const UMBRA_POOLS_URL = 'https://ownership.umbraprivacy.com/api/pools';
const ARCIUM_NODES_URL =
  'https://explorer.arcium.com/api/v1/nodes?network=mainnet';
const ARCIUM_CLUSTERS_URL =
  'https://explorer.arcium.com/api/v1/clusters?network=mainnet';

const UMBRA_DISPLAY_ASSETS = [
  'kmSOL',
  'wSOL',
  'USDC',
  'USDT',
  'UMBRA',
  'ZINC',
  'CASH',
  'ARX',
] as const;

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

interface UmbraPoolResponse {
  label?: string;
  address?: string;
  snapshot?: {
    totalUsdValue?: number;
    primaryHolding?: {
      amount?: number;
      usdValue?: number;
      symbol?: string;
    };
  };
}

async function fetchUmbra(): Promise<{ pools: Pool[]; tvl: number }> {
  const res = await fetch(UMBRA_POOLS_URL, {
    signal: AbortSignal.timeout(7000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Umbra pools HTTP ${res.status}`);
  const data = await res.json();

  const rawPools: UmbraPoolResponse[] = data?.pools || [];
  const mapped = rawPools
    .map((p) => {
      const asset = p.label || p.snapshot?.primaryHolding?.symbol || 'UNKNOWN';
      const usd =
        p.snapshot?.totalUsdValue ?? p.snapshot?.primaryHolding?.usdValue ?? 0;
      const balance = p.snapshot?.primaryHolding?.amount ?? 0;
      return {
        asset,
        address: p.address || null,
        balance: Number(balance) || 0,
        usd: Number(usd) || 0,
      } satisfies Pool;
    })
    .filter((p) => p.usd > 0 || p.balance > 0)
    .sort((a, b) => b.usd - a.usd);

  const preferred = new Set<string>(
    UMBRA_DISPLAY_ASSETS as unknown as string[]
  );
  const display: Pool[] = [];
  let otherUsd = 0;
  let otherBal = 0;

  for (const p of mapped) {
    if (preferred.has(p.asset)) display.push(p);
    else {
      otherUsd += p.usd;
      otherBal += p.balance;
    }
  }

  display.sort((a, b) => {
    const ia = UMBRA_DISPLAY_ASSETS.indexOf(
      a.asset as (typeof UMBRA_DISPLAY_ASSETS)[number]
    );
    const ib = UMBRA_DISPLAY_ASSETS.indexOf(
      b.asset as (typeof UMBRA_DISPLAY_ASSETS)[number]
    );
    if (ia === -1 && ib === -1) return b.usd - a.usd;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  if (otherUsd >= 1) {
    display.push({
      asset: 'OTHER',
      address: null,
      balance: otherBal,
      usd: otherUsd,
    });
  }

  const tvl =
    typeof data?.totals?.usd === 'number'
      ? data.totals.usd
      : mapped.reduce((s, p) => s + p.usd, 0);

  return { pools: display, tvl };
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
  ] = await Promise.allSettled([
    (async () => {
      const mintIds = [MINTS.SOL, MINTS.BONK, MINTS.ORE, MINTS.ARX].join(',');
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
        }
      );
      return {
        SOL,
        USDC: tokens.USDC || 0,
        USDT: tokens.USDT || 0,
        ORE: tokens.ORE || 0,
        stORE: tokens.stORE || 0,
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
  ]);

  let solPrice = 180;
  let bonkPrice = 0;
  let orePrice = 0;
  let arxPrice = 0;
  if (priceResult.status === 'fulfilled') {
    const priceData = priceResult.value;
    solPrice = priceData?.[MINTS.SOL]?.usdPrice || 180;
    bonkPrice = priceData?.[MINTS.BONK]?.usdPrice || 0;
    orePrice = priceData?.[MINTS.ORE]?.usdPrice || 0;
    arxPrice = priceData?.[MINTS.ARX]?.usdPrice || 0;
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
      : { SOL: 0, USDC: 0, USDT: 0, ORE: 0, stORE: 0 };

  let umbraPools: Pool[] = [];
  let umbraTvl = 0;
  if (umbraResult.status === 'fulfilled') {
    umbraPools = umbraResult.value.pools;
    umbraTvl = umbraResult.value.tvl;
  } else {
    console.error('Umbra fetch error:', umbraResult.reason);
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
      ],
      tvl:
        pcBalances.SOL * solPrice +
        pcBalances.USDC +
        pcBalances.USDT +
        (pcBalances.ORE + pcBalances.stORE) * orePrice,
    },
    {
      name: 'Umbra',
      status: 'live',
      url: 'https://app.umbraprivacy.com',
      linkText: 'app.umbraprivacy.com',
      kind: 'pool',
      pools: umbraPools,
      tvl: umbraTvl,
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
      status: 'upcoming',
      url: 'https://www.helius.dev/privacy',
      linkText: 'helius.dev/privacy',
      kind: 'pool',
      pools: [],
      tvl: 0,
      stats:
        'Private beta · confidential + anonymous rings · mainnet after audits',
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
