import { getAllProtocolsTvlHistory } from '../../../db/client.js';

export async function onRequest({ request, env }) {
  globalThis.__TURSO_URL = env.TURSO_DATABASE_URL;
  globalThis.__TURSO_TOKEN = env.TURSO_AUTH_TOKEN;

  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '24h';

  const now = new Date();
  let startDate;
  switch (range) {
    case '1h': startDate = new Date(now - 60 * 60 * 1000); break;
    case '24h': startDate = new Date(now - 24 * 60 * 60 * 1000); break;
    case '7d': startDate = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
    case '30d': startDate = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
    default: startDate = new Date(now - 24 * 60 * 60 * 1000);
  }

  try {
    const rows = await getAllProtocolsTvlHistory(startDate.toISOString(), now.toISOString());
    return Response.json({ data: rows });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
