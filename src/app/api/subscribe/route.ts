import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import {
  adminNewSubscriberEmail,
  welcomeSubscriberEmail,
} from '@/lib/email-templates';

export const runtime = 'nodejs';
export const maxDuration = 15;

const FROM = 'Shielded Sol <noreply@shieldedsol.com>';

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const email = body?.email?.toString().trim().toLowerCase();

  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254
  ) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Email service not configured' },
      { status: 500 }
    );
  }

  try {
    const resend = new Resend(apiKey);
    const audienceId = process.env.RESEND_AUDIENCE_ID;
    const notifyTo = process.env.NOTIFY_EMAIL || 'gm@metasal.xyz';

    // Audience contact (idempotent-ish — Resend may error on dupe)
    if (audienceId) {
      try {
        await resend.contacts.create({
          email,
          audienceId,
          unsubscribed: false,
        });
      } catch (err) {
        console.warn('Resend contact create:', err);
      }
    }

    const welcome = welcomeSubscriberEmail(email);
    const admin = adminNewSubscriberEmail(email);

    // Welcome email to subscriber (always, with logo HTML)
    const welcomeResult = await resend.emails.send({
      from: FROM,
      to: email,
      subject: welcome.subject,
      html: welcome.html,
      text: welcome.text,
    });

    // Admin notify
    await resend.emails.send({
      from: FROM,
      to: notifyTo,
      subject: admin.subject,
      html: admin.html,
      text: admin.text,
    });

    if (welcomeResult.error) {
      console.error('Welcome email error:', welcomeResult.error);
      return NextResponse.json(
        { error: 'Failed to send confirmation' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      id: welcomeResult.data?.id || null,
    });
  } catch (error) {
    console.error('Resend error:', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}
