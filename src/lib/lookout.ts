/**
 * Watchlist — not scored in live TVL (no Solana pool TVL yet, UX rails,
 * multi-chain noise, or vault IDs not public).
 */
export type LookoutStatus =
  | 'watch'
  | 'rail'
  | 'hybrid'
  | 'infra'
  | 'waitlist';

export type LookoutItem = {
  name: string;
  status: LookoutStatus;
  blurb: string;
  whyNotTracked: string;
  url: string;
  linkText: string;
  x?: string;
};

export const LOOKOUT_ITEMS: LookoutItem[] = [
  {
    name: 'Houdini Swap',
    status: 'rail',
    blurb:
      'Cross-chain private send/swap router. Solflare Private Send uses Houdini under the hood.',
    whyNotTracked:
      'Not a Solana shielded pool — privacy via multi-leg routing / CEX partners, not on-chain pool TVL.',
    url: 'https://houdiniswap.com',
    linkText: 'houdiniswap.com',
    x: 'HoudiniSwap',
  },
  {
    name: 'Solflare Private Send',
    status: 'rail',
    blurb:
      'Wallet Privacy Aggregator (PAL). Optional private send in Solflare.',
    whyNotTracked:
      'UX layer over providers (launch partner: Houdini). Does not hold its own pool — do not double-count TVL.',
    url: 'https://www.solflare.com/blog/introducing-solflare-privacy-aggregator-private-send/',
    linkText: 'solflare.com blog',
    x: 'solflare',
  },
  {
    name: 'GoDark',
    status: 'hybrid',
    blurb:
      'Dark-pool perps on Solana. Docs describe aggregate program vaults + shielded note commitments (Light).',
    whyNotTracked:
      'Settlement is Solana, but public docs expose no program ID or vault addresses yet — not scannable.',
    url: 'https://docs.godarkdex.com/docs/shielded-pool',
    linkText: 'docs.godarkdex.com',
  },
  {
    name: 'Hinkal',
    status: 'watch',
    blurb:
      'Institutional confidential DeFi. Live on Solana among other chains.',
    whyNotTracked:
      'Solana TVL is noise (~$100s on Llama). Almost all value is Ethereum/Base/etc.',
    url: 'https://hinkal.io',
    linkText: 'hinkal.io',
    x: 'hinkal_protocol',
  },
  {
    name: 'zkRune',
    status: 'infra',
    blurb:
      'Client-side ZK proofs; integrating with Helius Rings for RWA/compliance use cases.',
    whyNotTracked: 'Tooling / proofs layer — not a user deposit pool.',
    url: 'https://www.zkrune.com',
    linkText: 'zkrune.com',
    x: 'rune_zk',
  },
  {
    name: 'Lumenless',
    status: 'waitlist',
    blurb: 'Privacy app layer on Arcium — private payments/trading narrative.',
    whyNotTracked: 'Waitlist / pre-product — no mainnet pool TVL to read.',
    url: 'https://www.lumenless.com',
    linkText: 'lumenless.com',
    x: 'lumenless',
  },
  {
    name: 'Token-2022 Confidential Balances',
    status: 'infra',
    blurb:
      'Native Solana token extensions for encrypted balances and confidential transfers.',
    whyNotTracked:
      'Protocol primitive across many mints — not a single protocol row. Track as ecosystem infra, not pool TVL.',
    url: 'https://solana.com/docs/tokens/extensions/confidential-transfer',
    linkText: 'solana.com docs',
  },
  {
    name: 'ShadowWire (Radr)',
    status: 'watch',
    blurb:
      'Older bulletproofs / private transfer stack from Radr Labs (radr.fun).',
    whyNotTracked:
      'Needs fresh mainnet verification; lab/X links partially dead. Revisit if pools resurface.',
    url: 'https://radr.fun',
    linkText: 'radr.fun',
  },
];

export const LOOKOUT_STATUS_LABEL: Record<LookoutStatus, string> = {
  watch: 'WATCH',
  rail: 'RAIL',
  hybrid: 'HYBRID',
  infra: 'INFRA',
  waitlist: 'SOON',
};
