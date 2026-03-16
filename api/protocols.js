import { saveTvlSnapshot, savePoolBalance, saveTokenPrice } from '../db/client.js';

export const config = {
  maxDuration: 30,
};

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export default async function handler(req, res) {
  // Token mints for price fetching
  const mints = {
    SOL: 'So11111111111111111111111111111111111111112',
    BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    ORE: 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp'
  };

  let solPrice = 180;
  let bonkPrice = 0;
  let orePrice = 0;


  // Fetch prices from Jupiter API
  try {
    const mintIds = Object.values(mints).join(',');
    const priceRes = await fetch(`https://api.jup.ag/price/v3?ids=${mintIds}`, {
      headers: { 'x-api-key': process.env.JUP_API_KEY || '64a543a0-30cf-440e-a9e4-7463a8523e7f' }
    });
    const priceData = await priceRes.json();
    solPrice = priceData?.[mints.SOL]?.usdPrice || 180;
    bonkPrice = priceData?.[mints.BONK]?.usdPrice || 0;
    orePrice = priceData?.[mints.ORE]?.usdPrice || 0;

  } catch (e) {
    console.error('Jupiter price fetch error:', e);
  }

  // Fetch Turbine ZSOL supply
  let turbineZsol = 0;
  try {
    const turbineRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'getTokenSupply',
        jsonrpc: '2.0',
        params: ['zso1EF4k8HNteye34aD8w2Fm6pYVWMDgkgWCUrMLip1'],
        id: '1'
      })
    });
    const turbineData = await turbineRes.json();
    turbineZsol = turbineData?.result?.value?.uiAmount || 0;
  } catch (e) {
    console.error('Turbine fetch error:', e);
  }

  // Vanish Trade pool address
  const vanishPoolAddress = '8MjKXQgj97NPVNhj9gJrQNP7BibGCGkFMVJ2qZsC58E';

  // Fetch Vanish Trade SOL balance
  let vanishSol = 0;
  try {
    const vanishRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'getBalance', jsonrpc: '2.0', params: [vanishPoolAddress], id: '1' })
    });
    const vanishData = await vanishRes.json();
    vanishSol = (vanishData?.result?.value || 0) / 1e9;
  } catch (e) {
    console.error('Vanish Trade fetch error:', e);
  }

  // Mixoor pool address (single address for SOL + tokens)
  const mixoorPoolAddress = 'CS31stgBRPvPMBvRAYgsRTbogNkRdUNTsoyQQLcYp7ZD';
  const mixoorMints = {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USD1: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYYiQzvEmuB'
  };

  // Fetch Mixoor balances
  const mixoorBalances = { SOL: 0, USDC: 0, USD1: 0 };
  try {
    // Fetch native SOL balance
    const solRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'getBalance', jsonrpc: '2.0', params: [mixoorPoolAddress], id: '1' })
    });
    const solData = await solRes.json();
    mixoorBalances.SOL = (solData?.result?.value || 0) / 1e9;

    // Fetch all token accounts
    const tokenRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'getTokenAccountsByOwner',
        jsonrpc: '2.0',
        params: [mixoorPoolAddress, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }],
        id: '1'
      })
    });
    const tokenData = await tokenRes.json();
    const accounts = tokenData?.result?.value || [];

    accounts.forEach(acc => {
      const info = acc?.account?.data?.parsed?.info;
      const mint = info?.mint;
      const balance = parseFloat(info?.tokenAmount?.uiAmountString || '0');

      if (mint === mixoorMints.USDC) mixoorBalances.USDC = balance;
      else if (mint === mixoorMints.USD1) mixoorBalances.USD1 = balance;
    });
  } catch (e) {
    console.error('Mixoor fetch error:', e);
  }

  // Elusiv pool address
  const elusivPoolAddress = 'HszJz1zLnYpK5e8TvsRDPSDrxc19qFuhWrFQG6xY2aMX';
  const elusivMints = {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
  };

  // Fetch Elusiv balances
  const elusivBalances = { SOL: 0, USDC: 0, USDT: 0, BONK: 0 };
  try {
    // Fetch native SOL balance
    const solRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'getBalance', jsonrpc: '2.0', params: [elusivPoolAddress], id: '1' })
    });
    const solData = await solRes.json();
    elusivBalances.SOL = (solData?.result?.value || 0) / 1e9;

    // Fetch all token accounts
    const tokenRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'getTokenAccountsByOwner',
        jsonrpc: '2.0',
        params: [elusivPoolAddress, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }],
        id: '1'
      })
    });
    const tokenData = await tokenRes.json();
    const accounts = tokenData?.result?.value || [];

    // Map balances by mint
    accounts.forEach(acc => {
      const info = acc?.account?.data?.parsed?.info;
      const mint = info?.mint;
      const balance = parseFloat(info?.tokenAmount?.uiAmountString || '0');

      if (mint === elusivMints.USDC) elusivBalances.USDC = balance;
      else if (mint === elusivMints.USDT) elusivBalances.USDT = balance;
      else if (mint === elusivMints.BONK) elusivBalances.BONK = balance;
    });
  } catch (e) {
    console.error('Elusiv fetch error:', e);
  }

  // Privacy Cash pool addresses
  const privacyCashSolAddress = '4AV2Qzp3N4c9RfzyEbNZs2wqWfW4EwKnnxFAZCndvfGh';
  const privacyCashTokenAddress = '2vV7xhCMWRrcLiwGoTaTRgvx98ku98TRJKPXhsS8jvBV';
  const privacyCashMints = {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    ORE: 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp',
    stORE: 'sTorERYB6xAZ1SSbwpK3zoK2EEwbBrc7TZAzg1uCGiH'
  };

  // Fetch Privacy Cash balances
  const privacyCashBalances = { SOL: 0, USDC: 0, USDT: 0, ORE: 0, stORE: 0 };
  try {
    // Fetch native SOL balance from SOL pool address
    const solRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'getBalance', jsonrpc: '2.0', params: [privacyCashSolAddress], id: '1' })
    });
    const solData = await solRes.json();
    privacyCashBalances.SOL = (solData?.result?.value || 0) / 1e9;

    // Fetch all token accounts from token pool address
    const tokenRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'getTokenAccountsByOwner',
        jsonrpc: '2.0',
        params: [privacyCashTokenAddress, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }],
        id: '1'
      })
    });
    const tokenData = await tokenRes.json();
    const accounts = tokenData?.result?.value || [];

    // Map balances by mint
    accounts.forEach(acc => {
      const info = acc?.account?.data?.parsed?.info;
      const mint = info?.mint;
      const balance = parseFloat(info?.tokenAmount?.uiAmountString || '0');

      if (mint === privacyCashMints.USDC) privacyCashBalances.USDC = balance;
      else if (mint === privacyCashMints.USDT) privacyCashBalances.USDT = balance;
      else if (mint === privacyCashMints.ORE) privacyCashBalances.ORE = balance;
      else if (mint === privacyCashMints.stORE) privacyCashBalances.stORE = balance;
    });
  } catch (e) {
    console.error('Privacy Cash fetch error:', e);
  }

  const protocols = [
    {
      name: 'Privacy Cash',
      status: 'live',
      url: 'https://privacycash.org',
      pools: [
        {
          asset: 'SOL',
          address: privacyCashSolAddress,
          balance: privacyCashBalances.SOL,
          usd: privacyCashBalances.SOL * solPrice
        },
        {
          asset: 'USDC',
          address: privacyCashTokenAddress,
          balance: privacyCashBalances.USDC,
          usd: privacyCashBalances.USDC
        },
        {
          asset: 'USDT',
          address: privacyCashTokenAddress,
          balance: privacyCashBalances.USDT,
          usd: privacyCashBalances.USDT
        },
        {
          asset: 'ORE',
          address: privacyCashTokenAddress,
          balance: privacyCashBalances.ORE + privacyCashBalances.stORE,
          usd: (privacyCashBalances.ORE + privacyCashBalances.stORE) * orePrice
        }
      ],
      tvl: (privacyCashBalances.SOL * solPrice) + privacyCashBalances.USDC + privacyCashBalances.USDT + ((privacyCashBalances.ORE + privacyCashBalances.stORE) * orePrice)
    },

    {
      name: 'Umbra',
      status: 'upcoming',
      url: 'https://umbraprivacy.com',
      pools: [
        { asset: 'SOL', address: null, balance: 0, usd: 0 },
        { asset: 'USDC', address: null, balance: 0, usd: 0 }
      ],
      tvl: 0
    },
    {
      name: 'Light Protocol',
      status: 'live',
      url: 'https://lightprotocol.com',
      pools: [
        { asset: 'SOL', address: null, balance: 0, usd: 0 }
      ],
      tvl: 0
    },
    {
      name: 'Turbine',
      status: 'live',
      url: 'https://turbine.cash',
      pools: [
        {
          asset: 'ZSOL',
          address: 'zso1EF4k8HNteye34aD8w2Fm6pYVWMDgkgWCUrMLip1',
          balance: turbineZsol,
          usd: turbineZsol * solPrice
        }
      ],
      tvl: turbineZsol * solPrice
    },
    {
      name: 'Vanish Trade',
      status: 'live',
      url: 'https://www.vanish.trade/@shielded',
      pools: [
        {
          asset: 'SOL',
          address: vanishPoolAddress,
          balance: vanishSol,
          usd: vanishSol * solPrice
        }
      ],
      tvl: vanishSol * solPrice
    },
    {
      name: 'Mixoor',
      status: 'live',
      url: 'https://mixoor.fun',
      pools: [
        {
          asset: 'SOL',
          address: mixoorPoolAddress,
          balance: mixoorBalances.SOL,
          usd: mixoorBalances.SOL * solPrice
        },
        {
          asset: 'USDC',
          address: mixoorPoolAddress,
          balance: mixoorBalances.USDC,
          usd: mixoorBalances.USDC
        },
        {
          asset: 'USD1',
          address: mixoorPoolAddress,
          balance: mixoorBalances.USD1,
          usd: mixoorBalances.USD1
        }
      ],
      tvl: (mixoorBalances.SOL * solPrice) + mixoorBalances.USDC + mixoorBalances.USD1
    },
    {
      name: 'Elusiv',
      status: 'sunset',
      url: 'https://elusiv.io',
      pools: [
        {
          asset: 'SOL',
          address: elusivPoolAddress,
          balance: elusivBalances.SOL,
          usd: elusivBalances.SOL * solPrice
        },
        {
          asset: 'USDC',
          address: elusivPoolAddress,
          balance: elusivBalances.USDC,
          usd: elusivBalances.USDC
        },
        {
          asset: 'USDT',
          address: elusivPoolAddress,
          balance: elusivBalances.USDT,
          usd: elusivBalances.USDT
        },
        {
          asset: 'BONK',
          address: elusivPoolAddress,
          balance: elusivBalances.BONK,
          usd: elusivBalances.BONK * bonkPrice
        }
      ],
      tvl: (elusivBalances.SOL * solPrice) + elusivBalances.USDC + elusivBalances.USDT + (elusivBalances.BONK * bonkPrice)
    }
  ];

  const totalTvl = protocols.reduce((sum, p) => sum + p.tvl, 0);

  // Save data to Turso (async, don't wait)
  const timestamp = new Date().toISOString();
  try {
    // Save token prices
    const pricePromises = [
      saveTokenPrice(timestamp, 'SOL', solPrice),
      saveTokenPrice(timestamp, 'BONK', bonkPrice),
      saveTokenPrice(timestamp, 'ORE', orePrice),

    ];

    // Save TVL snapshots for each protocol
    const tvlPromises = protocols.map(protocol =>
      saveTvlSnapshot(timestamp, protocol.name, protocol.tvl)
    );

    // Save pool balances for each protocol
    const poolPromises = [];
    protocols.forEach(protocol => {
      protocol.pools.forEach(pool => {
        poolPromises.push(
          savePoolBalance(
            timestamp,
            protocol.name,
            pool.asset,
            pool.address,
            pool.balance,
            pool.usd
          )
        );
      });
    });

    // Execute all database writes in parallel without blocking the response
    Promise.all([...pricePromises, ...tvlPromises, ...poolPromises]).catch(err => {
      console.error('Error saving to Turso:', err);
    });
  } catch (err) {
    console.error('Error preparing Turso data:', err);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json({
    solPrice,
    bonkPrice,
    orePrice,

    totalTvl,
    protocols,
    updatedAt: new Date().toISOString()
  });
}
