import { NextRequest } from 'next/server';
import { getTvlHistory } from '@/lib/db';
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
  const protocol = request.nextUrl.searchParams.get('protocol');
  const range = request.nextUrl.searchParams.get('range') || '7d';
  if (!protocol) {
    return jsonErr('Query param protocol is required', 400);
  }

  const now = new Date();
  const startDate = getStartDate(range);

  try {
    const rows = await getTvlHistory(
      protocol,
      startDate.toISOString(),
      now.toISOString()
    );
    const history = rows.map((row) => ({
      timestamp: String(row.timestamp),
      tvlUsd: Number(row.tvl_usd) || 0,
    }));

    return jsonOk(
      {
        ok: true,
        version: 'v1',
        protocol,
        range,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        dataPoints: history.length,
        history,
      },
      { cache: 'public, max-age=60, s-maxage=120' }
    );
  } catch (err) {
    console.error('api/v1/history/protocol', err);
    return jsonErr('Failed to fetch protocol history', 502);
  }
}
