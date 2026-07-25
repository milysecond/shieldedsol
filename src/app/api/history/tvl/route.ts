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

/** Fallback chart from DeFiLlama Privacy Cash (+ Umbra ownership is not historical public) */
async function llamaFallback(
  startDate: Date,
  endDate: Date
): Promise<
  { timestamp: string; totalTvl: number; protocols: Record<string, number> }[]
> {
  try {
    const res = await fetch('https://api.llama.fi/protocol/privacy-cash', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tvlArr: { date: number; totalLiquidityUSD: number }[] =
      data?.tvl || [];
    const start = startDate.getTime() / 1000;
    const end = endDate.getTime() / 1000;
    return tvlArr
      .filter((p) => p.date >= start && p.date <= end)
      .map((p) => ({
        timestamp: new Date(p.date * 1000).toISOString(),
        totalTvl: p.totalLiquidityUSD,
        protocols: { 'Privacy Cash': p.totalLiquidityUSD },
      }));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '24h';

  const now = new Date();
  const startDate = getStartDate(range);

  let history: {
    timestamp: string;
    totalTvl: number;
    protocols: Record<string, number>;
  }[] = [];
  let source: 'turso' | 'defillama' | 'empty' = 'empty';

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
      const v = Number(row.tvl_usd) || 0;
      aggregated[ts].totalTvl += v;
      aggregated[ts].protocols[row.protocol_name as string] = v;
    }

    history = Object.values(aggregated).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );
    if (history.length) source = 'turso';
  } catch (error) {
    console.error('Turso TVL history failed:', error);
  }

  if (!history.length) {
    history = await llamaFallback(startDate, now);
    if (history.length) source = 'defillama';
  }

  // Always 200 — UI treats empty history as "no chart yet", never hard-fail
  return NextResponse.json(
    {
      range,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      dataPoints: history.length,
      history,
      source,
    },
    { headers: { 'Cache-Control': 'public, max-age=120, s-maxage=120' } }
  );
}
