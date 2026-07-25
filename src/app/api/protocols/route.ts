import { NextResponse } from 'next/server';
import { fetchProtocolsData } from '@/lib/protocols';
import {
  saveTvlSnapshot,
  savePoolBalance,
  saveTokenPrice,
} from '@/lib/db';

export const runtime = 'edge';

export async function GET() {
  try {
    const data = await fetchProtocolsData();

    // Persist snapshots only on fresh (non-cache) hits
    if (!data.cached) {
      const timestamp = data.updatedAt || new Date().toISOString();
      try {
        const pricePromises = [
          saveTokenPrice(timestamp, 'SOL', data.solPrice),
          saveTokenPrice(timestamp, 'BONK', data.bonkPrice),
          saveTokenPrice(timestamp, 'ORE', data.orePrice),
        ];

        const tvlPromises = data.protocols.map((protocol) =>
          saveTvlSnapshot(timestamp, protocol.name, protocol.tvl)
        );

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

        Promise.all([...pricePromises, ...tvlPromises, ...poolPromises]).catch(
          (err) => console.error('Error saving to Turso:', err)
        );
      } catch (err) {
        console.error('Error preparing Turso data:', err);
      }
    }

    return NextResponse.json(data, {
      headers: {
        // Browser + CF: keep fresh-ish without hammering upstreams
        'Cache-Control':
          'public, max-age=30, s-maxage=45, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    console.error('protocols API failed:', err);
    return NextResponse.json(
      {
        error: 'Failed to fetch protocol data',
        message: err instanceof Error ? err.message : 'unknown',
      },
      {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
