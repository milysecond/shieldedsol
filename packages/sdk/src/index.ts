export type Range = '1h' | '6h' | '24h' | '7d' | '30d' | '90d';

export type Pool = {
  asset: string;
  address: string | null;
  balance: number;
  usd: number;
};

export type Protocol = {
  id: string;
  name: string;
  status: string;
  kind: string;
  url: string;
  linkText: string | null;
  tvlUsd: number;
  stats: string | null;
  pools: Pool[];
};

export type ProtocolsResponse = {
  ok: true;
  version: string;
  updatedAt: string;
  cached: boolean;
  prices: { sol: number; bonk: number; ore: number };
  totalTvlUsd: number;
  protocolCount: number;
  protocols: Protocol[];
};

export type ProtocolResponse = {
  ok: true;
  version: string;
  updatedAt: string;
  cached: boolean;
  prices: { sol: number; bonk: number; ore: number };
  protocol: Protocol;
};

export type TvlHistoryPoint = {
  timestamp: string;
  totalTvlUsd: number;
  protocols: Record<string, number>;
};

export type TvlHistoryResponse = {
  ok: true;
  version: string;
  range: string;
  startDate: string;
  endDate: string;
  dataPoints: number;
  source: string;
  history: TvlHistoryPoint[];
};

export type ProtocolHistoryResponse = {
  ok: true;
  version: string;
  protocol: string;
  range: string;
  startDate: string;
  endDate: string;
  dataPoints: number;
  history: { timestamp: string; tvlUsd: number }[];
};

export type HealthResponse = {
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

export type ShieldedSolClientOptions = {
  /** API origin, default https://www.shieldedsol.com */
  baseUrl?: string;
  /** Optional fetch implementation */
  fetch?: typeof fetch;
  /** Optional default headers */
  headers?: Record<string, string>;
};

export class ShieldedSolError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ShieldedSolError';
    this.status = status;
    this.body = body;
  }
}

export class ShieldedSolClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;

  constructor(opts: ShieldedSolClientOptions = {}) {
    this.baseUrl = (opts.baseUrl || 'https://www.shieldedsol.com').replace(
      /\/$/,
      ''
    );
    this.fetchImpl = opts.fetch || fetch.bind(globalThis);
    this.headers = {
      Accept: 'application/json',
      ...(opts.headers || {}),
    };
  }

  private async get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    const url = new URL(path, this.baseUrl + '/');
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== '') url.searchParams.set(k, v);
      }
    }
    const res = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: this.headers,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ShieldedSolError(
        (body as { error?: string })?.error || `HTTP ${res.status}`,
        res.status,
        body
      );
    }
    return body as T;
  }

  health() {
    return this.get<HealthResponse>('/api/v1/health');
  }

  listProtocols() {
    return this.get<ProtocolsResponse>('/api/v1/protocols');
  }

  getProtocol(id: string) {
    return this.get<ProtocolResponse>(
      `/api/v1/protocols/${encodeURIComponent(id)}`
    );
  }

  tvlHistory(range: Range = '7d') {
    return this.get<TvlHistoryResponse>('/api/v1/history/tvl', { range });
  }

  protocolHistory(protocol: string, range: Range = '7d') {
    return this.get<ProtocolHistoryResponse>('/api/v1/history/protocol', {
      protocol,
      range,
    });
  }
}

export function createClient(opts?: ShieldedSolClientOptions) {
  return new ShieldedSolClient(opts);
}

export default ShieldedSolClient;
