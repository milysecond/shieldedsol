import { saveTvlSnapshot, savePoolBalance, saveTokenPrice } from '../../../db/client.js';

export async function onRequest({ request, env }) {
  globalThis.__TURSO_URL = env.TURSO_DATABASE_URL;
  globalThis.__TURSO_TOKEN = env.TURSO_AUTH_TOKEN;

  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const apiRes = await fetch('https://shieldedsol.com/api/protocols');
    const data = await apiRes.json();
    const timestamp = new Date().toISOString();

    for (const protocol of (data?.protocols || [])) {
      if (protocol.tvl > 0) {
        await saveTvlSnapshot(timestamp, protocol.name, protocol.tvl);
      }
    }

    return Response.json({ ok: true, collected: data?.protocols?.length || 0, timestamp });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
