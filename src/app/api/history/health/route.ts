import { NextResponse } from 'next/server';
import { tursoHealth, hasTurso } from '@/lib/db';

export async function GET() {
  const health = await tursoHealth();
  return NextResponse.json(
    {
      configured: hasTurso(),
      ...health,
    },
    {
      status: health.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
