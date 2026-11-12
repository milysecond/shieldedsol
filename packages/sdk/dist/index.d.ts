type Range = '1h' | '6h' | '24h' | '7d' | '30d' | '90d';
type Pool = {
    asset: string;
    address: string | null;
    balance: number;
    usd: number;
};
/**
 * Public deposit / withdraw flows measured from on-chain vault balance deltas
 * (never from decrypted private state). Currently reported for Helius Rings.
 */
type ProtocolFlows = {
    /** complete = all-time totals; indexing = history backfill in progress (figures null) */
    status: 'complete' | 'indexing' | 'unavailable';
    /** ISO time of the first indexed program tx */
    since: string | null;
    /** ISO time of the newest indexed program tx */
    asOf: string | null;
    /** All-time public deposits, USD at current prices */
    depositVolumeUsd: number | null;
    /** All-time public withdrawals, USD at current prices */
    withdrawVolumeUsd: number | null;
    /** Successful program txs (deposits, withdrawals, private transfers, admin) */
    txCount: number | null;
    depositTxCount: number | null;
    withdrawTxCount: number | null;
    failedTxCount: number | null;
    /** Assets with flows but no price (excluded from USD totals) */
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
};
type Protocol = {
    id: string;
    name: string;
    status: string;
    kind: string;
    url: string;
    linkText: string | null;
    tvlUsd: number;
    stats: string | null;
    pools: Pool[];
    /** Public deposit/withdraw volumes + tx counts; null where not measured */
    flows: ProtocolFlows | null;
};
type ProtocolsResponse = {
    ok: true;
    version: string;
    updatedAt: string;
    cached: boolean;
    prices: {
        sol: number;
        bonk: number;
        ore: number;
    };
    totalTvlUsd: number;
    protocolCount: number;
    protocols: Protocol[];
};
type ProtocolResponse = {
    ok: true;
    version: string;
    updatedAt: string;
    cached: boolean;
    prices: {
        sol: number;
        bonk: number;
        ore: number;
    };
    protocol: Protocol;
};
type TvlHistoryPoint = {
    timestamp: string;
    totalTvlUsd: number;
    protocols: Record<string, number>;
};
type TvlHistoryResponse = {
    ok: true;
    version: string;
    range: string;
    startDate: string;
    endDate: string;
    dataPoints: number;
    source: string;
    history: TvlHistoryPoint[];
};
type ProtocolHistoryResponse = {
    ok: true;
    version: string;
    protocol: string;
    range: string;
    startDate: string;
    endDate: string;
    dataPoints: number;
    history: {
        timestamp: string;
        tvlUsd: number;
    }[];
};
type HealthResponse = {
    ok: true;
    version: string;
    service: string;
    time: string;
    turso: {
        configured: boolean;
        ok: boolean;
        rows?: number;
        latest?: string | null;
        error?: string;
    };
    endpoints: string[];
};
type ShieldedSolClientOptions = {
    /** API origin, default https://www.shieldedsol.com */
    baseUrl?: string;
    /** Optional fetch implementation */
    fetch?: typeof fetch;
    /** Optional default headers */
    headers?: Record<string, string>;
};
declare class ShieldedSolError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body?: unknown);
}
declare class ShieldedSolClient {
    readonly baseUrl: string;
    private readonly fetchImpl;
    private readonly headers;
    constructor(opts?: ShieldedSolClientOptions);
    private get;
    health(): Promise<HealthResponse>;
    listProtocols(): Promise<ProtocolsResponse>;
    getProtocol(id: string): Promise<ProtocolResponse>;
    tvlHistory(range?: Range): Promise<TvlHistoryResponse>;
    protocolHistory(protocol: string, range?: Range): Promise<ProtocolHistoryResponse>;
}
declare function createClient(opts?: ShieldedSolClientOptions): ShieldedSolClient;

export { type HealthResponse, type Pool, type Protocol, type ProtocolFlows, type ProtocolHistoryResponse, type ProtocolResponse, type ProtocolsResponse, type Range, ShieldedSolClient, type ShieldedSolClientOptions, ShieldedSolError, type TvlHistoryPoint, type TvlHistoryResponse, createClient, ShieldedSolClient as default };
