import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const email = body?.email?.toString().trim().toLowerCase();

  if (!email || !email.includes('@') || email.length > 254) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
  }

  try {
    const resend = new Resend(apiKey);
    const audienceId = process.env.RESEND_AUDIENCE_ID;

    if (audienceId) {
      await resend.contacts.create({ email, audienceId, unsubscribed: false });
    } else {
      await resend.emails.send({
        from: 'Shielded Sol <noreply@shieldedsol.com>',
        to: process.env.NOTIFY_EMAIL || 'gm@metasal.xyz',
        subject: `New subscriber: ${email}`,
        text: `New Shielded Sol subscriber: ${email}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Resend error:', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}
