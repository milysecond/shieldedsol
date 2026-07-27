// Raw fetch client for Turso /v2/pipeline — works on CF Workers / edge
// (unlike @libsql/client which requires Node.js APIs)

interface TursoRow {
  [key: string]: string | number | null;
}

interface TursoCell {
  type?: string;
  value?: string | number | null;
  base64?: string;
}

interface TursoResult {
  results: {
    type: string;
    response?: {
      type: string;
      result?: {
        cols: { name: string }[];
        rows: (TursoCell | string | number | null)[][];
      };
    };
    error?: { message?: string };
  }[];
}

function getTursoConfig() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
  }
  // Convert libsql:// to https:// if needed
  const httpUrl = url.replace('libsql://', 'https://');
  return { url: httpUrl, token };
}

function unwrapCell(cell: TursoCell | string | number | null): string | number | null {
  if (cell == null) return null;
  if (typeof cell !== 'object') return cell;
  const t = cell.type;
  const v = cell.value;
  if (v == null && cell.base64 == null) return null;
  if (t === 'null') return null;
  if (t === 'integer' || t === 'float') {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  // text / blob / default
  return v == null ? null : String(v);
}

type TursoArg =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'text'; value: string };

function toArg(a: string | number | null): TursoArg {
  if (a === null) return { type: 'null' };
  if (typeof a === 'number') {
    if (!Number.isFinite(a)) return { type: 'null' };
    // Whole numbers as integer strings; floats as JSON numbers (Turso rejects string f64)
    if (Number.isInteger(a) && Math.abs(a) <= Number.MAX_SAFE_INTEGER) {
      return { type: 'integer', value: String(Math.trunc(a)) };
    }
    return { type: 'float', value: a };
  }
  return { type: 'text', value: String(a) };
}

async function executePipeline(
  statements: { sql: string; args?: (string | number | null)[] }[]
): Promise<TursoRow[][]> {
  const { url, token } = getTursoConfig();

  const requests = [
    ...statements.map((stmt) => ({
      type: 'execute' as const,
      stmt: {
        sql: stmt.sql,
        args: (stmt.args || []).map(toArg),
      },
    })),
    { type: 'close' as const },
  ];

  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Turso pipeline error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as TursoResult;

  // Surface first SQL error if present
  for (const r of data.results || []) {
    if (r.type === 'error') {
      throw new Error(r.error?.message || 'Turso execute error');
    }
  }

  return data.results
    .filter((r) => r.type === 'ok' && r.response?.type === 'execute')
    .map((r) => {
      const result = r.response!.result!;
      const cols = result.cols.map((c) => c.name);
      return (result.rows || []).map((row) => {
        const obj: TursoRow = {};
        cols.forEach((col, i) => {
          obj[col] = unwrapCell(row[i] as TursoCell);
        });
        return obj;
      });
    });
}

async function execute(
  sql: string,
  args: (string | number | null)[] = []
): Promise<TursoRow[]> {
  const results = await executePipeline([{ sql, args }]);
  return results[0] || [];
}

export function hasTurso(): boolean {
  return !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

// Write operations
export async function saveTvlSnapshot(
  timestamp: string,
  protocolName: string,
  tvlUsd: number
) {
  if (!hasTurso()) return;
  await execute(
    'INSERT INTO tvl_snapshots (timestamp, protocol_name, tvl_usd) VALUES (?, ?, ?)',
    [timestamp, protocolName, tvlUsd]
  );
}

export async function savePoolBalance(
  timestamp: string,
  protocolName: string,
  asset: string,
  address: string | null,
  balance: number,
  usdValue: number
) {
  if (!hasTurso()) return;
  await execute(
    'INSERT INTO pool_balances (timestamp, protocol_name, asset, address, balance, usd_value) VALUES (?, ?, ?, ?, ?, ?)',
    [timestamp, protocolName, asset, address, balance, usdValue]
  );
}

export async function saveTokenPrice(
  timestamp: string,
  symbol: string,
  usdPrice: number
) {
  if (!hasTurso()) return;
  await execute(
    'INSERT INTO token_prices (timestamp, symbol, usd_price) VALUES (?, ?, ?)',
    [timestamp, symbol, usdPrice]
  );
}

// Read operations
export async function getTvlHistory(
  protocolName: string,
  startDate: string,
  endDate: string
) {
  return execute(
    `SELECT timestamp, tvl_usd FROM tvl_snapshots
     WHERE protocol_name = ? AND timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp ASC`,
    [protocolName, startDate, endDate]
  );
}

export async function getAllProtocolsTvlHistory(
  startDate: string,
  endDate: string
) {
  return execute(
    `SELECT timestamp, protocol_name, tvl_usd FROM tvl_snapshots
     WHERE timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp ASC`,
    [startDate, endDate]
  );
}

export async function getPoolHistory(
  protocolName: string,
  asset: string,
  startDate: string,
  endDate: string
) {
  return execute(
    `SELECT timestamp, balance, usd_value FROM pool_balances
     WHERE protocol_name = ? AND asset = ? AND timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp ASC`,
    [protocolName, asset, startDate, endDate]
  );
}

export async function getLatestTvlByProtocol() {
  return execute(
    `SELECT t.protocol_name, t.tvl_usd, t.timestamp
     FROM tvl_snapshots t
     INNER JOIN (
       SELECT protocol_name, MAX(timestamp) AS mx
       FROM tvl_snapshots
       GROUP BY protocol_name
     ) m ON m.protocol_name = t.protocol_name AND m.mx = t.timestamp
     ORDER BY t.tvl_usd DESC`
  );
}

/** Health probe for ops */
export async function tursoHealth(): Promise<{
  ok: boolean;
  rows?: number;
  latest?: string | null;
  error?: string;
}> {
  try {
    if (!hasTurso()) return { ok: false, error: 'missing env' };
    const rows = await execute(
      `SELECT COUNT(*) AS c, MAX(timestamp) AS latest FROM tvl_snapshots`
    );
    const c = Number(rows[0]?.c || 0);
    const latest = (rows[0]?.latest as string) || null;
    return { ok: true, rows: c, latest };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
