import { NextRequest, NextResponse } from 'next/server';
import { getAllProtocolsTvlHistory } from '@/lib/db';

export const runtime = 'edge';

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
  return new Date(now.getTime() - (ms[range] || ms['24h']));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '24h';

  const now = new Date();
  const startDate = getStartDate(range);

  try {
    const data = await getAllProtocolsTvlHistory(
      startDate.toISOString(),
      now.toISOString()
    );

    const aggregated: Record<
      string,
      { timestamp: string; totalTvl: number; protocols: Record<string, number> }
    > = {};

    for (const row of data) {
      const ts = row.timestamp as string;
      if (!aggregated[ts]) {
        aggregated[ts] = { timestamp: ts, totalTvl: 0, protocols: {} };
      }
      aggregated[ts].totalTvl += row.tvl_usd as number;
      aggregated[ts].protocols[row.protocol_name as string] =
        row.tvl_usd as number;
    }

    const history = Object.values(aggregated).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    return NextResponse.json(
      {
        range,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        dataPoints: history.length,
        history,
      },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  } catch (error) {
    console.error('Error fetching TVL history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch TVL history' },
      { status: 500 }
    );
  }
}
