import { NextRequest, NextResponse } from 'next/server';
import { fetchProtocolsData } from '@/lib/protocols';
import {
  saveTvlSnapshot,
  savePoolBalance,
  saveTokenPrice,
} from '@/lib/db';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await fetchProtocolsData();
    const timestamp = new Date().toISOString();

    // Save token prices
    await Promise.all([
      saveTokenPrice(timestamp, 'SOL', data.solPrice),
      saveTokenPrice(timestamp, 'BONK', data.bonkPrice),
      saveTokenPrice(timestamp, 'ORE', data.orePrice),
    ]);

    // Save TVL snapshots
    await Promise.all(
      data.protocols.map((protocol) =>
        saveTvlSnapshot(timestamp, protocol.name, protocol.tvl)
      )
    );

    // Save pool balances
    const poolPromises: Promise<void>[] = [];
    data.protocols.forEach((protocol) => {
      protocol.pools.forEach((pool) => {
        poolPromises.push(
          savePoolBalance(
            timestamp,
            protocol.name,
            pool.asset,
            pool.address,
            pool.balance,
            pool.usd
          )
        );
      });
    });
    await Promise.all(poolPromises);

    return NextResponse.json({
      success: true,
      timestamp,
      totalTvl: data.totalTvl,
      protocolCount: data.protocols.filter(
        (p) => p.status === 'live' && p.tvl > 0
      ).length,
    });
  } catch (error) {
    console.error('Cron collect-daily error:', error);
    return NextResponse.json(
      {
        error: 'Failed to collect daily data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
