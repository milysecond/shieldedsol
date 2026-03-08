import { createClient } from '@libsql/client';

let client = null;

export function getDbClient() {
  if (!client) {
    const url = globalThis.__TURSO_URL || "";
    const authToken = globalThis.__TURSO_TOKEN || "";

    if (!url || !authToken) {
      throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    }

    client = createClient({
      url,
      authToken,
    });
  }

  return client;
}

export async function saveTvlSnapshot(timestamp, protocolName, tvlUsd) {
  const db = getDbClient();
  await db.execute({
    sql: 'INSERT INTO tvl_snapshots (timestamp, protocol_name, tvl_usd) VALUES (?, ?, ?)',
    args: [timestamp, protocolName, tvlUsd],
  });
}

export async function savePoolBalance(timestamp, protocolName, asset, address, balance, usdValue) {
  const db = getDbClient();
  await db.execute({
    sql: 'INSERT INTO pool_balances (timestamp, protocol_name, asset, address, balance, usd_value) VALUES (?, ?, ?, ?, ?, ?)',
    args: [timestamp, protocolName, asset, address, balance, usdValue],
  });
}

export async function saveTokenPrice(timestamp, symbol, usdPrice) {
  const db = getDbClient();
  await db.execute({
    sql: 'INSERT INTO token_prices (timestamp, symbol, usd_price) VALUES (?, ?, ?)',
    args: [timestamp, symbol, usdPrice],
  });
}

export async function getTvlHistory(protocolName, startDate, endDate) {
  const db = getDbClient();
  const result = await db.execute({
    sql: `
      SELECT timestamp, tvl_usd
      FROM tvl_snapshots
      WHERE protocol_name = ?
        AND timestamp >= ?
        AND timestamp <= ?
      ORDER BY timestamp ASC
    `,
    args: [protocolName, startDate, endDate],
  });
  return result.rows;
}

export async function getAllProtocolsTvlHistory(startDate, endDate) {
  const db = getDbClient();
  const result = await db.execute({
    sql: `
      SELECT timestamp, protocol_name, tvl_usd
      FROM tvl_snapshots
      WHERE timestamp >= ?
        AND timestamp <= ?
      ORDER BY timestamp ASC
    `,
    args: [startDate, endDate],
  });
  return result.rows;
}

export async function getPoolHistory(protocolName, asset, startDate, endDate) {
  const db = getDbClient();
  const result = await db.execute({
    sql: `
      SELECT timestamp, balance, usd_value
      FROM pool_balances
      WHERE protocol_name = ?
        AND asset = ?
        AND timestamp >= ?
        AND timestamp <= ?
      ORDER BY timestamp ASC
    `,
    args: [protocolName, asset, startDate, endDate],
  });
  return result.rows;
}

export async function getLatestTvlByProtocol() {
  const db = getDbClient();
  const result = await db.execute(`
    SELECT
      protocol_name,
      tvl_usd,
      timestamp,
      MAX(timestamp) as latest_timestamp
    FROM tvl_snapshots
    GROUP BY protocol_name
    ORDER BY tvl_usd DESC
  `);
  return result.rows;
}
