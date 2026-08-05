import { fetchProtocolsData } from '@/lib/protocols';
import {
  jsonErr,
  jsonOk,
  matchProtocolName,
  optionsOk,
  slugifyProtocol,
} from '@/lib/api-v1';

export async function OPTIONS() {
  return optionsOk();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const data = await fetchProtocolsData();
    const name = matchProtocolName(data.protocols, id);
    if (!name) {
      return jsonErr('Protocol not found', 404, {
        id,
        available: data.protocols.map((p) => slugifyProtocol(p.name)),
      });
    }
    const p = data.protocols.find((x) => x.name === name)!;
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
      protocol: {
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
      },
    });
  } catch (err) {
    console.error('api/v1/protocols/[id]', err);
    return jsonErr('Failed to fetch protocol', 502);
  }
}
