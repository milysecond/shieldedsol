import { Resend } from 'resend';

export const config = {
  maxDuration: 10,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    const resend = new Resend(apiKey);

    if (audienceId) {
      await resend.contacts.create({
        email: email.toLowerCase().trim(),
        audienceId,
        unsubscribed: false,
      });
    } else {
      // Fallback: send notification email to site owner
      await resend.emails.send({
        from: 'Shielded Sol <noreply@shieldedsol.com>',
        to: process.env.NOTIFY_EMAIL || 'gm@metasal.xyz',
        subject: 'New subscriber: ' + email,
        text: `New email subscriber: ${email}`,
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Resend error:', error);
    return res.status(500).json({ error: 'Failed to subscribe' });
  }
}
