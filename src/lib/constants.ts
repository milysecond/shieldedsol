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
  /** Privacy Cash ZEC (Solana wrapped) */
  ZEC: 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS',
} as const;

/** Arcium on-chain staking program (operator stake accounts) */
export const ARCIUM_STAKING_PROGRAM =
  'ArcStnN9zZZVB5WjgPhLHjYpY7Gb29mzb96ySsb1kxgq';

/** Privacy Cash mainnet program */
export const PRIVACY_CASH_PROGRAM =
  '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD';

/** Umbra privacy layer V1 (Arcium MPC pools) */
export const UMBRA_PROGRAM = 'UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh';

/** Cloak shield-pool program (docs.cloak.ag) */
export const CLOAK_PROGRAM = 'zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW';
/** Cloak SOL pool PDA ["pool", wSOL mint] */
export const CLOAK_SOL_POOL = 'XJ63J8R5Bgb7eEg6UehcF96yLXUV5Sgs2fnhTHKuTH8';
/** Cloak USDC vault authority PDA ["vault_authority", USDC mint] */
export const CLOAK_USDC_VAULT_AUTHORITY =
  'HS4QMJB2TKvRHMWhLrq6nV8SrEVezp4oUVozo3PaS6BY';
/** Cloak USDT vault authority PDA ["vault_authority", USDT mint] */
export const CLOAK_USDT_VAULT_AUTHORITY =
  'BbgLH695kwN1UCzEdVnjS6Jk7vZNhpY8Ah7HHKkjjBz8';

/** Nimbus shielded-pool program (docs.nimbusprivacy.xyz) — powers Umbra v2 */
export const NIMBUS_SHIELDED_POOL =
  'nimBUs55CbjkNfy8UvK48DqFTY7L2mdkmZMQC9mk6LK';
export const NIMBUS_USER_REGISTRY =
  'user69YjhU8d8noiQy9H3zsPnSiT38DK8qZfmrWSLjL';
/** Nimbus VaultAuthority — owner of every SPL / Token-2022 pool ATA */
export const NIMBUS_TOKEN_VAULT =
  '2sjnjABJHPEZS8oVdp8nztPBUVUAT7uJawc8eQTMHTfa';
/** Nimbus program-owned lamport vault */
export const NIMBUS_SOL_VAULT = 'BxDCkvgZYRcCAnpywVw5j14AhkXehYvsXoCRiaodUs8s';

/** Vanish Trade program (owner of tracked vault) */
export const VANISH_PROGRAM = 'vanshF62ku4jVVdf8DS47SXuJC1rq8qokGSANAomhey';

/** Mixoor program */
export const MIXOOR_PROGRAM = 'mixEcfx7w47hvRwb9Nj7UeSQkCz6vZMbRHixMyYMLMb';

/** Elusiv legacy program (sunset) */
export const ELUSIV_PROGRAM = '4CgyHKuP6yi1vbmcdsArngEKcETR4nZupqYEMk2hEoQd';

/** Light Protocol core programs (Helius acquisition stack) */
export const LIGHT_SYSTEM_PROGRAM =
  'SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7';
export const LIGHT_ACCOUNT_COMPRESSION =
  'compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq';
export const LIGHT_REGISTRY = 'Lighton6oQpVkeewmo2mcPTQQp7kYHr4fWpAgJyEmDX';
export const LIGHT_COMPRESSED_TOKEN =
  'cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m';

/** Operator stake account data length (bytes) */
export const ARCIUM_OPERATOR_ACCOUNT_SIZE = 652;

export const POOL_ADDRESSES = {
  PRIVACY_CASH_SOL: '4AV2Qzp3N4c9RfzyEbNZs2wqWfW4EwKnnxFAZCndvfGh',
  PRIVACY_CASH_TOKEN: '2vV7xhCMWRrcLiwGoTaTRgvx98ku98TRJKPXhsS8jvBV',
  /** Privacy Cash ZEC ATA under token owner */
  PRIVACY_CASH_ZEC: '6PY3Y1zyff8K82Db1PtXPf77nUNx1PVqtpf6fVsVuL12',
  VANISH_TRADE: '8MjKXQgj97NPVNhj9gJrQNP7BibGCGkFMVJ2qZsC58E',
  MIXOOR: 'CS31stgBRPvPMBvRAYgsRTbogNkRdUNTsoyQQLcYp7ZD',
  ELUSIV: 'HszJz1zLnYpK5e8TvsRDPSDrxc19qFuhWrFQG6xY2aMX',
  /** MagicBlock ephemeral SPL global vault ATAs */
  MAGICBLOCK_SOL: 'BhaYZFDmbfNWaebASH9J7xw23GLVnQmLyHJqXivvwM3p',
  MAGICBLOCK_USDC: 'EgUQeWLDL8QyduApWvAPZcEitcNKQKdnNuvLm16Db8Dy',
  /** Voidify treasuries (DefiLlama adapter) */
  VOIDIFY_CLASSIC_SOL: 'CkNY5wS3zfU4rSGoGhmu555NxA7ch8bZ3srZZroNjHzm',
  VOIDIFY_NOVA_SOL: 'EMCwkeGAxsMAPWU2gXW3H8mde2kzCm228kthwEznrPsZ',
  VOIDIFY_NOVA_USDC: 'CBWMnizg2pQCqDXa1ZSdp8TH2FsfUMv9cp9RAPzatbzK',
} as const;

/** Voidify on-chain programs */
export const VOIDIFY_CORE_PROGRAM =
  '4WJnXP7mFxFY45SYvfyGDwEBdcwafVqdgbYYSHpoded4';
export const VOIDIFY_USER_VOID_PROGRAM =
  'voiDecqpJdvgeCG9CerdEZY7WwY1mrQM1n3jDnWMzPi';

/** MagicBlock private payments / shield */
export const MAGICBLOCK_URL = 'https://one.magicblock.app';
export const MAGICBLOCK_PROGRAM =
  'SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2';

/** Helius Solana Privacy Rings — permissionless confidential Ring live on mainnet since 9 Nov 2026 */
export const HELIUS_RINGS_URL = 'https://www.helius.dev/privacy';
/** Shielded-pool program (helius-labs/privacy-rings) */
export const HELIUS_RINGS_PROGRAM =
  'ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW';
/** User registry program */
export const HELIUS_RINGS_USER_REGISTRY =
  'regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ';
/** Native SOL custody PDA: [b"sol_interface", [0]] under the shielded pool */
export const HELIUS_RINGS_SOL_INTERFACE =
  'CiNmas621VuyofiDSrEPfTXHKrdZuB6jMKECyNiMpLXE';
/** CPI-authority PDA [b"cpi_authority"]; token owner of every SPL interface vault */
export const HELIUS_RINGS_CPI_AUTHORITY =
  'CaM8DbtJ2mSecgaHYo9xeT7VSKq7AnaqEUm5p7e5LW4a';

export const PROTOCOL_DEFINITIONS = [
  {
    name: 'Privacy Cash',
    status: 'live' as const,
    url: 'https://privacycash.org',
    pools: ['SOL', 'USDC', 'USDT', 'ORE', 'ZEC'],
  },
  {
    name: 'Umbra',
    status: 'live' as const,
    url: 'https://app.umbraprivacy.com',
    linkText: 'app.umbraprivacy.com',
    // V1 Arcium MPC pools + V2 Nimbus ZK shielded pool
    pools: ['kmSOL', 'wSOL', 'USDC', 'USDT', 'UMBRA', 'ZINC', 'CASH', 'ARX', 'OTHER'],
  },
  {
    name: 'Cloak',
    status: 'live' as const,
    url: 'https://cloak.ag',
    linkText: 'cloak.ag',
    pools: ['SOL', 'USDC', 'USDT'],
  },
  {
    name: 'Arcium',
    status: 'live' as const,
    url: 'https://stake.arcium.com',
    linkText: 'stake.arcium.com',
    pools: ['ARX'],
  },
  {
    name: 'MagicBlock',
    status: 'live' as const,
    url: 'https://one.magicblock.app',
    linkText: 'one.magicblock.app',
    pools: ['SOL', 'USDC'],
  },
  {
    name: 'Helius Rings',
    status: 'live' as const,
    url: HELIUS_RINGS_URL,
    linkText: 'helius.dev/privacy',
    // Dynamic: SOL interface + every SPL interface vault (see helius-rings.ts)
    pools: ['SOL', 'ORE', 'USDC', 'OTHER'],
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
    name: 'Voidify',
    status: 'live' as const,
    url: 'https://x.com/VoidifyPrivacy',
    linkText: '@VoidifyPrivacy',
    pools: ['SOL', 'USDC'],
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
    url: 'https://x.com/elusivprivacy',
    linkText: 'sunset · @elusivprivacy',
    pools: ['SOL', 'USDC', 'USDT', 'BONK'],
  },
];

// Shared Solana RPC (Helius)
export const SOLANA_RPC = 'https://viviyan-bkj12u-fast-mainnet.helius-rpc.com';

/** Public donation address for Shielded Sol */
export const DONATION_WALLET =
  'shLDydVFjPS6zyYo1WJ6JAVeqHf2PAxa2jiLDb8Tudt';

/** X handles for share/tweet tags (no @ prefix) — verified 2026-08 */
export const PROTOCOL_X_HANDLES: Record<string, string> = {
  'Privacy Cash': 'theprivacycash',
  Umbra: 'UmbraPrivacy',
  Cloak: 'cloak_ag',
  Arcium: 'Arcium',
  MagicBlock: 'magicblock',
  'Helius Rings': 'Helius',
  'Light Protocol': 'Helius',
  'Vanish Trade': 'vanishTrade',
  Mixoor: 'Mixoordotfun',
  Turbine: 'turbinecash',
  Voidify: 'VoidifyPrivacy',
  Elusiv: 'elusivprivacy',
};

export function solAddressUrl(address: string): string {
  return `https://orbmarkets.io/address/${address}`;
}

export function solTxUrl(signature: string): string {
  return `https://orbmarkets.io/tx/${signature}`;
}

/** ProgramWatch — Solana program explorer */
export function programWatchUrl(programId: string): string {
  return `https://programwatch.dev/${programId}`;
}

export type ProtocolProgram = {
  id: string;
  label: string;
};

/**
 * On-chain program IDs per protocol (verified executable accounts).
 * Linked in UI via programwatch.dev/{id}
 */
export const PROTOCOL_PROGRAMS: Record<string, ProtocolProgram[]> = {
  'Privacy Cash': [
    { id: PRIVACY_CASH_PROGRAM, label: 'Privacy Cash' },
  ],
  Umbra: [
    { id: UMBRA_PROGRAM, label: 'Umbra V1' },
    { id: NIMBUS_SHIELDED_POOL, label: 'Nimbus (Umbra V2)' },
    { id: NIMBUS_USER_REGISTRY, label: 'Nimbus user registry' },
  ],
  Cloak: [{ id: CLOAK_PROGRAM, label: 'Shield pool' }],
  Arcium: [{ id: ARCIUM_STAKING_PROGRAM, label: 'Arcium staking' }],
  MagicBlock: [{ id: MAGICBLOCK_PROGRAM, label: 'MagicBlock SPL' }],
  Voidify: [
    { id: VOIDIFY_CORE_PROGRAM, label: 'Voidify core' },
    { id: VOIDIFY_USER_VOID_PROGRAM, label: 'User VOID' },
  ],
  'Vanish Trade': [{ id: VANISH_PROGRAM, label: 'Vanish' }],
  Mixoor: [{ id: MIXOOR_PROGRAM, label: 'Mixoor' }],
  Elusiv: [{ id: ELUSIV_PROGRAM, label: 'Elusiv' }],
  'Light Protocol': [
    { id: LIGHT_SYSTEM_PROGRAM, label: 'System' },
    { id: LIGHT_ACCOUNT_COMPRESSION, label: 'Compression' },
    { id: LIGHT_REGISTRY, label: 'Registry' },
    { id: LIGHT_COMPRESSED_TOKEN, label: 'cToken' },
  ],
  'Helius Rings': [
    { id: HELIUS_RINGS_PROGRAM, label: 'Shielded pool' },
    { id: HELIUS_RINGS_USER_REGISTRY, label: 'User registry' },
  ],
  // Turbine: zSOL mint tracked; no stable public program ID yet
};
