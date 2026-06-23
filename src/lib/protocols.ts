import { MINTS, POOL_ADDRESSES } from './constants';

const RPC_URLS = [
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  'https://solana-mainnet.publicnode.com',
  'https://rpc.ankr.com/solana',
  'https://api.mainnet-beta.solana.com',
].filter(Boolean) as string[];

async function rpcCall(method: string, params: unknown[]) {
  const body = JSON.stringify({ method, jsonrpc: '2.0', params, id: '1' });
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
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
  pools: Pool[];
  tvl: number;
}

export interface ProtocolsResponse {
  solPrice: number;
  bonkPrice: number;
  orePrice: number;
  totalTvl: number;
  protocols: Protocol[];
  updatedAt: string;
}

export async function fetchProtocolsData(): Promise<ProtocolsResponse> {
  // Fetch prices from Jupiter API
  let solPrice = 180;
  let bonkPrice = 0;
  let orePrice = 0;

  try {
    const mintIds = [MINTS.SOL, MINTS.BONK, MINTS.ORE].join(',');
    const priceRes = await fetch(`https://api.jup.ag/price/v3?ids=${mintIds}`, {
      headers: {
        'x-api-key':
          process.env.JUP_API_KEY || '64a543a0-30cf-440e-a9e4-7463a8523e7f',
      },
    });
    const priceData = await priceRes.json();
    solPrice = priceData?.[MINTS.SOL]?.usdPrice || 180;
    bonkPrice = priceData?.[MINTS.BONK]?.usdPrice || 0;
    orePrice = priceData?.[MINTS.ORE]?.usdPrice || 0;
  } catch (e) {
    console.error('Jupiter price fetch error:', e);
  }

  // Fetch Turbine ZSOL supply
  let turbineZsol = 0;
  try {
    turbineZsol = await getTokenSupply(MINTS.ZSOL);
  } catch (e) {
    console.error('Turbine fetch error:', e);
  }

  // Fetch Vanish Trade SOL balance
  let vanishSol = 0;
  try {
    vanishSol = await getBalance(POOL_ADDRESSES.VANISH_TRADE);
  } catch (e) {
    console.error('Vanish Trade fetch error:', e);
  }

  // Fetch Mixoor balances
  const mixoorBalances = { SOL: 0, USDC: 0, USD1: 0 };
  try {
    mixoorBalances.SOL = await getBalance(POOL_ADDRESSES.MIXOOR);
    const tokens = await getTokenAccountsByOwner(POOL_ADDRESSES.MIXOOR, {
      USDC: MINTS.USDC,
      USD1: MINTS.USD1,
    });
    mixoorBalances.USDC = tokens.USDC || 0;
    mixoorBalances.USD1 = tokens.USD1 || 0;
  } catch (e) {
    console.error('Mixoor fetch error:', e);
  }

  // Fetch Elusiv balances
  const elusivBalances = { SOL: 0, USDC: 0, USDT: 0, BONK: 0 };
  try {
    elusivBalances.SOL = await getBalance(POOL_ADDRESSES.ELUSIV);
    const tokens = await getTokenAccountsByOwner(POOL_ADDRESSES.ELUSIV, {
      USDC: MINTS.USDC,
      USDT: MINTS.USDT,
      BONK: MINTS.BONK,
    });
    elusivBalances.USDC = tokens.USDC || 0;
    elusivBalances.USDT = tokens.USDT || 0;
    elusivBalances.BONK = tokens.BONK || 0;
  } catch (e) {
    console.error('Elusiv fetch error:', e);
  }

  // Fetch Privacy Cash balances
  const pcBalances = { SOL: 0, USDC: 0, USDT: 0, ORE: 0, stORE: 0 };
  try {
    pcBalances.SOL = await getBalance(POOL_ADDRESSES.PRIVACY_CASH_SOL);
    const tokens = await getTokenAccountsByOwner(
      POOL_ADDRESSES.PRIVACY_CASH_TOKEN,
      {
        USDC: MINTS.USDC,
        USDT: MINTS.USDT,
        ORE: MINTS.ORE,
        stORE: MINTS.stORE,
      }
    );
    pcBalances.USDC = tokens.USDC || 0;
    pcBalances.USDT = tokens.USDT || 0;
    pcBalances.ORE = tokens.ORE || 0;
    pcBalances.stORE = tokens.stORE || 0;
  } catch (e) {
    console.error('Privacy Cash fetch error:', e);
  }

  // Fetch Umbra TVL from DeFiLlama (Umbra is the privacy DeFi app built on Arcium MPC network)
  let umbraTvl = 0;
  try {
    const llamaRes = await fetch('https://api.llama.fi/protocol/umbra', {
      signal: AbortSignal.timeout(5000),
    });
    const llamaData = await llamaRes.json();
    const tvlArr: Array<{ totalLiquidityUSD: number }> = llamaData?.tvl || [];
    if (tvlArr.length > 0) {
      umbraTvl = tvlArr[tvlArr.length - 1]?.totalLiquidityUSD || 0;
    }
  } catch (e) {
    console.error('DeFiLlama Umbra fetch error:', e);
  }

  const protocols: Protocol[] = [
    {
      name: 'Privacy Cash',
      status: 'live',
      url: 'https://privacycash.org',
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
      url: 'https://app.arcium.com',
      pools: [{ asset: 'USD', address: null, balance: umbraTvl, usd: umbraTvl }],
      tvl: umbraTvl,
    },
    {
      name: 'Arcium',
      status: 'live',
      url: 'https://arcium.com',
      pools: [],
      tvl: 0,
    },
    {
      name: 'Light Protocol',
      status: 'live',
      url: 'https://lightprotocol.com',
      pools: [{ asset: 'SOL', address: null, balance: 0, usd: 0 }],
      tvl: 0,
    },
    {
      name: 'Turbine',
      status: 'live',
      url: 'https://turbine.cash',
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
      name: 'Mixoor',
      status: 'live',
      url: 'https://mixoor.fun',
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
      url: 'https://elusiv.io',
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

  const totalTvl = protocols.reduce((sum, p) => sum + p.tvl, 0);

  return {
    solPrice,
    bonkPrice,
    orePrice,
    totalTvl,
    protocols,
    updatedAt: new Date().toISOString(),
  };
}
