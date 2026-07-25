export const SITE_URL = 'https://www.shieldedsol.com';
export const SITE_NAME = 'Shielded Sol';
export const GA_ID = 'G-LZJ54S2SJY';

export const MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  ORE: 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp',
  stORE: 'sTorERYB6xAZ1SSbwpK3zoK2EEwbBrc7TZAzg1uCGiH',
  USD1: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYYiQzvEmuB',
  ZSOL: 'zso1EF4k8HNteye34aD8w2Fm6pYVWMDgkgWCUrMLip1',
  /** Arcium network token */
  ARX: 'ARXwZkNAtzPfdcoqQiduJn8EPv9fKiDfGn2KyggyDrFs',
} as const;

/** Arcium on-chain staking program (operator stake accounts) */
export const ARCIUM_STAKING_PROGRAM =
  'ArcStnN9zZZVB5WjgPhLHjYpY7Gb29mzb96ySsb1kxgq';

/** Operator stake account data length (bytes) */
export const ARCIUM_OPERATOR_ACCOUNT_SIZE = 652;

export const POOL_ADDRESSES = {
  PRIVACY_CASH_SOL: '4AV2Qzp3N4c9RfzyEbNZs2wqWfW4EwKnnxFAZCndvfGh',
  PRIVACY_CASH_TOKEN: '2vV7xhCMWRrcLiwGoTaTRgvx98ku98TRJKPXhsS8jvBV',
  VANISH_TRADE: '8MjKXQgj97NPVNhj9gJrQNP7BibGCGkFMVJ2qZsC58E',
  MIXOOR: 'CS31stgBRPvPMBvRAYgsRTbogNkRdUNTsoyQQLcYp7ZD',
  ELUSIV: 'HszJz1zLnYpK5e8TvsRDPSDrxc19qFuhWrFQG6xY2aMX',
} as const;

export const PROTOCOL_DEFINITIONS = [
  {
    name: 'Privacy Cash',
    status: 'live' as const,
    url: 'https://privacycash.org',
    pools: ['SOL', 'USDC', 'USDT', 'ORE'],
  },
  {
    name: 'Umbra',
    status: 'live' as const,
    url: 'https://app.umbraprivacy.com',
    linkText: 'app.umbraprivacy.com',
    // Dynamic pool list comes from ownership.umbraprivacy.com
    pools: ['kmSOL', 'wSOL', 'USDC', 'USDT', 'UMBRA', 'ZINC', 'CASH', 'ARX', 'OTHER'],
  },
  {
    name: 'Arcium',
    status: 'live' as const,
    url: 'https://stake.arcium.com',
    linkText: 'stake.arcium.com',
    pools: ['ARX'],
  },
  {
    name: 'Light Protocol',
    status: 'live' as const,
    url: 'https://lightprotocol.com',
    pools: ['SOL'],
  },
  {
    name: 'Turbine',
    status: 'live' as const,
    url: 'https://turbine.cash',
    pools: ['ZSOL'],
  },
  {
    name: 'Vanish Trade',
    status: 'live' as const,
    url: 'https://www.vanish.trade/@shielded',
    linkText: 'vanish.trade',
    pools: ['SOL'],
  },
  {
    name: 'Mixoor',
    status: 'live' as const,
    url: 'https://mixoor.fun',
    pools: ['SOL', 'USDC', 'USD1'],
  },
  {
    name: 'Elusiv',
    status: 'sunset' as const,
    url: 'https://elusiv.io',
    pools: ['SOL', 'USDC', 'USDT', 'BONK'],
  },
];

// MagicBlock Payments
export const MAGICBLOCK_API = 'https://payments.magicblock.app';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_CLUSTER = 'mainnet';
export const SOLANA_RPC = 'https://viviyan-bkj12u-fast-mainnet.helius-rpc.com';
