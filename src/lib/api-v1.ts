import { NextResponse } from 'next/server';
import { slugifyProtocol, matchProtocolName } from '@/lib/slug';

export { slugifyProtocol, matchProtocolName };

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

export function jsonOk(
  data: unknown,
  init?: { status?: number; cache?: string; headers?: Record<string, string> }
) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      ...CORS,
      'Cache-Control':
        init?.cache ??
        'public, max-age=30, s-maxage=45, stale-while-revalidate=120',
      'X-ShieldedSol-API': 'v1',
      ...(init?.headers || {}),
    },
  });
}

export function jsonErr(
  error: string,
  status = 400,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    { ok: false, error, ...extra },
    {
      status,
      headers: {
        ...CORS,
        'Cache-Control': 'no-store',
        'X-ShieldedSol-API': 'v1',
      },
    }
  );
}

export function optionsOk() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
