import { NextRequest, NextResponse } from 'next/server';
import { getPoolHistory } from '@/lib/db';

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
  const protocol = searchParams.get('protocol');
  const asset = searchParams.get('asset');
  const range = searchParams.get('range') || '24h';

  if (!protocol || !asset) {
    return NextResponse.json(
      { error: 'Protocol and asset are required' },
      { status: 400 }
    );
  }

  const now = new Date();
  const startDate = getStartDate(range);

  try {
    const poolData = await getPoolHistory(
      protocol,
      asset,
      startDate.toISOString(),
      now.toISOString()
    );

    return NextResponse.json(
      {
        protocol,
        asset,
        range,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        dataPoints: poolData.length,
        history: poolData.map((row) => ({
          timestamp: row.timestamp,
          balance: row.balance,
          usdValue: row.usd_value,
        })),
      },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  } catch (error) {
    console.error('Error fetching pool history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pool history' },
      { status: 500 }
    );
  }
}
