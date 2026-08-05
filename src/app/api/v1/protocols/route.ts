import { fetchProtocolsData } from '@/lib/protocols';
import { jsonErr, jsonOk, optionsOk, slugifyProtocol } from '@/lib/api-v1';

export async function OPTIONS() {
  return optionsOk();
}

export async function GET() {
  try {
    const data = await fetchProtocolsData();
    const protocols = data.protocols.map((p) => ({
      id: slugifyProtocol(p.name),
      name: p.name,
      status: p.status,
      kind: p.kind || 'pool',
      url: p.url,
      linkText: p.linkText || null,
      tvlUsd: p.tvl,
      stats: p.stats || null,
      pools: p.pools.map((pool) => ({
        asset: pool.asset,
        address: pool.address,
        balance: pool.balance,
        usd: pool.usd,
      })),
    }));

    return jsonOk({
      ok: true,
      version: 'v1',
      updatedAt: data.updatedAt,
      cached: !!data.cached,
      prices: {
        sol: data.solPrice,
        bonk: data.bonkPrice,
        ore: data.orePrice,
      },
      totalTvlUsd: data.totalTvl,
      protocolCount: protocols.length,
      protocols,
    });
  } catch (err) {
    console.error('api/v1/protocols', err);
    return jsonErr(
      'Failed to fetch protocols',
      502,
      { message: err instanceof Error ? err.message : 'unknown' }
    );
  }
}
