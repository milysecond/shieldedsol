import { NextRequest, NextResponse } from 'next/server';
import { fetchProtocolsData, RPC_URLS } from '@/lib/protocols';
import { syncHeliusRingsFlows } from '@/lib/helius-rings';
import {
  saveTvlSnapshot,
  savePoolBalance,
  saveTokenPrice,
} from '@/lib/db';

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Advance the Helius Rings public flow index with a bigger budget than
    // the request path gets (backfill + new txs). Failure is non-fatal.
    let ringsFlowTxs: number | null = null;
    try {
      const st = await syncHeliusRingsFlows(RPC_URLS, {
        maxTx: 2000,
        timeMs: 20_000,
      });
      ringsFlowTxs = st.txCount;
    } catch (err) {
      console.error('Helius Rings flow sync failed:', err);
    }

    const data = await fetchProtocolsData();
    const timestamp = new Date().toISOString();

    // Save token prices
    await Promise.all([
      saveTokenPrice(timestamp, 'SOL', data.solPrice),
      saveTokenPrice(timestamp, 'BONK', data.bonkPrice),
      saveTokenPrice(timestamp, 'ORE', data.orePrice),
    ]);

    // Protocols whose live read failed are skipped (gap in history),
    // rather than recording a fake $0.
    const recordable = data.protocols.filter((p) => !p.error);

    // Save TVL snapshots
    await Promise.all(
      recordable.map((protocol) =>
        saveTvlSnapshot(timestamp, protocol.name, protocol.tvl)
      )
    );

    // Save pool balances
    const poolPromises: Promise<void>[] = [];
    recordable.forEach((protocol) => {
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
      heliusRingsFlowTxsIndexed: ringsFlowTxs,
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
