import { NextResponse } from 'next/server';
import { fetchProtocolsData } from '@/lib/protocols';
import {
  saveTvlSnapshot,
  savePoolBalance,
  saveTokenPrice,
} from '@/lib/db';

export const runtime = 'edge';

export async function GET() {
  const data = await fetchProtocolsData();

  // Save data to Turso in background (don't block response)
  const timestamp = new Date().toISOString();
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

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, max-age=60',
    },
  });
}
