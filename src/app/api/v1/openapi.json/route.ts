import { SITE_URL } from '@/lib/constants';
import { jsonOk, optionsOk } from '@/lib/api-v1';

export async function OPTIONS() {
  return optionsOk();
}

export async function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Shielded Sol API',
      version: '1.0.0',
      description:
        'Public API for Solana privacy protocol TVL — live balances and Turso-backed history.',
      contact: { url: SITE_URL },
    },
    servers: [{ url: SITE_URL }],
    paths: {
      '/api/v1/health': {
        get: {
          summary: 'Health + endpoint index',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/api/v1/protocols': {
        get: {
          summary: 'Live TVL for all tracked protocols',
          responses: { '200': { description: 'Protocol list + total TVL' } },
        },
      },
      '/api/v1/protocols/{id}': {
        get: {
          summary: 'Single protocol by name or slug',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              example: 'magicblock',
            },
          ],
          responses: {
            '200': { description: 'Protocol detail' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/api/v1/history/tvl': {
        get: {
          summary: 'Aggregate TVL history',
          parameters: [
            {
              name: 'range',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['1h', '6h', '24h', '7d', '30d', '90d'],
                default: '7d',
              },
            },
          ],
          responses: { '200': { description: 'History series' } },
        },
      },
      '/api/v1/history/protocol': {
        get: {
          summary: 'Per-protocol TVL history',
          parameters: [
            {
              name: 'protocol',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              example: 'Privacy Cash',
            },
            {
              name: 'range',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['1h', '6h', '24h', '7d', '30d', '90d'],
                default: '7d',
              },
            },
          ],
          responses: { '200': { description: 'Protocol history' } },
        },
      },
    },
  };

  return jsonOk(spec, {
    cache: 'public, max-age=300, s-maxage=600',
    headers: { 'Content-Type': 'application/json' },
  });
}
