import { hasTurso, tursoHealth } from '@/lib/db';
import { jsonOk, optionsOk } from '@/lib/api-v1';

export async function OPTIONS() {
  return optionsOk();
}

export async function GET() {
  const db = await tursoHealth();
  return jsonOk(
    {
      ok: true,
      version: 'v1',
      service: 'shieldedsol-api',
      time: new Date().toISOString(),
      turso: {
        configured: hasTurso(),
        ...db,
      },
      endpoints: [
        'GET /api/v1/protocols',
        'GET /api/v1/protocols/{id}',
        'GET /api/v1/history/tvl?range=7d',
        'GET /api/v1/history/protocol?protocol=Privacy%20Cash&range=7d',
        'GET /api/v1/health',
        'GET /api/v1/openapi.json',
      ],
    },
    { cache: 'no-store' }
  );
}
