import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { addProtocolSubmissionEmail } from '@/lib/email-templates';
import {
  PRIVACY_METHOD_LABELS,
  validateAddProtocol,
} from '@/lib/add-protocol';

export const runtime = 'nodejs';
export const maxDuration = 15;

const FROM = 'ShieldedSol <submissions@shieldedsol.com>';
const TO = 'shielded@milysec.com';
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 15 * 60 * 1000;

/** Per-isolate sliding window. Fine for Workers: a new isolate starts empty. */
const hitsByIp = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hitsByIp.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hitsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  hitsByIp.set(ip, recent);
  return false;
}

function jsonError(error: string, status: number, field?: string) {
  return NextResponse.json(field ? { error, field } : { error }, { status });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid request', 400);
  }

  // Honeypot: bots fill hidden fields. Pretend success so they move on.
  const honey = String(body?.company ?? body?.website_hp ?? '').trim();
  if (honey) {
    return NextResponse.json({ success: true, id: null });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return jsonError('Too many submissions. Please try again later.', 429);
  }

  const parsed = validateAddProtocol(body);
  if (!parsed.ok) {
    return jsonError(parsed.error, 400, parsed.field);
  }

  const apiKey =
    process.env.RESEND_API_KEY || process.env.RESEND_SHIELDEDSOL_API_KEY;
  if (!apiKey) {
    return jsonError('Email service not configured', 500);
  }

  const methodLabel =
    parsed.data.privacyMethod === 'other' && parsed.data.privacyMethodOther
      ? `Other — ${parsed.data.privacyMethodOther}`
      : PRIVACY_METHOD_LABELS[parsed.data.privacyMethod];

  const email = addProtocolSubmissionEmail({
    name: parsed.data.name,
    website: parsed.data.website,
    xHandle: parsed.data.xHandle,
    description: parsed.data.description,
    privacyMethodLabel: methodLabel,
    programIds: parsed.data.programIds,
    dataSource: parsed.data.dataSource,
    contactName: parsed.data.contactName,
    contactEmail: parsed.data.contactEmail,
    notes: parsed.data.notes,
  });

  const resend = new Resend(apiKey);
  const idempotencyKey = `add-protocol/${parsed.data.contactEmail}/${Date.now()}`;
  const result = await resend.emails.send(
    {
      from: FROM,
      to: TO,
      replyTo: parsed.data.contactEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    },
    { idempotencyKey }
  );

  if (result.error) {
    console.error('Add-protocol Resend error:', result.error);
    return jsonError('Failed to send submission', 502);
  }

  return NextResponse.json({
    success: true,
    id: result.data?.id || null,
  });
}
