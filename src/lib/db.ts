// Raw fetch client for Turso /v2/pipeline — works on CF Pages edge runtime
// (unlike @libsql/client which requires Node.js APIs)

interface TursoRow {
  [key: string]: string | number | null;
}

interface TursoResult {
  results: {
    type: string;
    response?: {
      type: string;
      result?: {
        cols: { name: string }[];
        rows: (string | number | null)[][];
      };
    };
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

async function executePipeline(
  statements: { sql: string; args?: (string | number | null)[] }[]
): Promise<TursoRow[][]> {
  const { url, token } = getTursoConfig();

  const requests = [
    ...statements.map((stmt) => ({
      type: 'execute' as const,
      stmt: {
        sql: stmt.sql,
        args: (stmt.args || []).map((a) => {
          if (a === null) return { type: 'null' as const, value: null };
          if (typeof a === 'number') return { type: 'float' as const, value: String(a) };
          // Check if string is a numeric value (from API responses)
          if (typeof a === 'string' && !isNaN(Number(a)) && a.trim() !== '') {
            return { type: 'float' as const, value: a };
          }
          return { type: 'text' as const, value: String(a) };
        }),
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

  return data.results
    .filter((r) => r.type === 'ok' && r.response?.type === 'execute')
    .map((r) => {
      const result = r.response!.result!;
      const cols = result.cols.map((c) => c.name);
      return result.rows.map((row) => {
        const obj: TursoRow = {};
        cols.forEach((col, i) => {
          obj[col] = row[i];
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

// Write operations
export async function saveTvlSnapshot(
  timestamp: string,
  protocolName: string,
  tvlUsd: number
) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) return;
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
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) return;
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
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) return;
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
    `SELECT protocol_name, tvl_usd, timestamp, MAX(timestamp) as latest_timestamp
     FROM tvl_snapshots GROUP BY protocol_name ORDER BY tvl_usd DESC`
  );
}
