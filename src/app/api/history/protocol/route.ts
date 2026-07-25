import { NextRequest, NextResponse } from 'next/server';
import { getTvlHistory } from '@/lib/db';

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
  const protocol = searchParams.get('protocol');
  const range = searchParams.get('range') || '24h';

  if (!protocol) {
    return NextResponse.json(
      { error: 'Protocol name is required' },
      { status: 400 }
    );
  }

  const now = new Date();
  const startDate = getStartDate(range);

  try {
    const tvlData = await getTvlHistory(
      protocol,
      startDate.toISOString(),
      now.toISOString()
    );

    return NextResponse.json(
      {
        protocol,
        range,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        dataPoints: tvlData.length,
        history: tvlData.map((row) => ({
          timestamp: row.timestamp,
          tvl: row.tvl_usd,
        })),
      },
      { headers: { 'Cache-Control': 'public, max-age=120' } }
    );
  } catch (error) {
    console.error('Error fetching protocol history:', error);
    // Soft-fail so UI charts don't break the page
    return NextResponse.json(
      {
        protocol,
        range,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        dataPoints: 0,
        history: [],
        source: 'empty',
      },
      { headers: { 'Cache-Control': 'public, max-age=30' } }
    );
  }
}
