import { NextRequest } from 'next/server';
import { getAllProtocolsTvlHistory } from '@/lib/db';
import { jsonErr, jsonOk, optionsOk } from '@/lib/api-v1';

function getStartDate(range: string): Date {
  const now = new Date();
  const ms: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };
  return new Date(now.getTime() - (ms[range] || ms['7d']));
}

export async function OPTIONS() {
  return optionsOk();
}

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get('range') || '7d';
  const now = new Date();
  const startDate = getStartDate(range);

  try {
    const data = await getAllProtocolsTvlHistory(
      startDate.toISOString(),
      now.toISOString()
    );

    const aggregated: Record<
      string,
      { timestamp: string; totalTvlUsd: number; protocols: Record<string, number> }
    > = {};

    for (const row of data) {
      const ts = String(row.timestamp || '');
      if (!ts) continue;
      if (!aggregated[ts]) {
        aggregated[ts] = { timestamp: ts, totalTvlUsd: 0, protocols: {} };
      }
      const v = Number(row.tvl_usd) || 0;
      aggregated[ts].totalTvlUsd += v;
      aggregated[ts].protocols[String(row.protocol_name)] = v;
    }

    const history = Object.values(aggregated).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    return jsonOk(
      {
        ok: true,
        version: 'v1',
        range,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        dataPoints: history.length,
        source: history.length ? 'turso' : 'empty',
        history,
      },
      { cache: 'public, max-age=60, s-maxage=120' }
    );
  } catch (err) {
    console.error('api/v1/history/tvl', err);
    return jsonErr('Failed to fetch TVL history', 502, {
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}
