import { SITE_NAME, SITE_URL } from '@/lib/constants';

const LOGO_URL = `${SITE_URL}/logo.png`;
const PURPLE = '#9945FF';
const BG = '#0a0a0a';
const TEXT = '#ededed';
const MUTED = '#a3a3a3';

function baseLayout(opts: {
  preheader: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
}): string {
  const cta =
    opts.ctaLabel && opts.ctaHref
      ? `<tr>
          <td align="center" style="padding:8px 0 28px;">
            <a href="${opts.ctaHref}"
               style="display:inline-block;background:${PURPLE};color:#fff;text-decoration:none;font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">
              ${opts.ctaLabel}
            </a>
          </td>
        </tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${opts.title}</title>
  <!--[if mso]><style>table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${opts.preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#111111;border:1px solid #262626;border-radius:16px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:32px 28px 12px;background:radial-gradient(ellipse at top, rgba(153,69,255,0.22), transparent 70%);">
              <img src="${LOGO_URL}" width="72" height="72" alt="${SITE_NAME}"
                   style="display:block;width:72px;height:72px;border:0;outline:none;" />
              <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:${TEXT};margin-top:14px;letter-spacing:-0.02em;">
                ${SITE_NAME}
              </div>
              <div style="font-family:JetBrains Mono,ui-monospace,monospace;font-size:12px;color:${PURPLE};margin-top:6px;">
                Solana privacy pool TVL
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:${TEXT};">
              ${opts.bodyHtml}
            </td>
          </tr>
          ${cta}
          <tr>
            <td style="padding:0 28px 28px;font-family:JetBrains Mono,ui-monospace,monospace;font-size:11px;color:${MUTED};text-align:center;">
              <a href="${SITE_URL}" style="color:${PURPLE};text-decoration:none;">shieldedsol.com</a>
              &nbsp;·&nbsp;
              <a href="https://x.com/shieldedsol" style="color:${MUTED};text-decoration:none;">@shieldedsol</a>
              <div style="margin-top:10px;color:#525252;">Made by Milysec</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function welcomeSubscriberEmail(email: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `You're in — ${SITE_NAME} TVL alerts`;
  const html = baseLayout({
    preheader: 'Subscribed to Solana privacy pool TVL alerts.',
    title: subject,
    bodyHtml: `
      <p style="margin:0 0 14px;">Hey — thanks for subscribing.</p>
      <p style="margin:0 0 14px;color:${MUTED};">
        We'll email when Solana privacy pool TVL moves in a meaningful way.
        Track live balances anytime on the dashboard.
      </p>
      <p style="margin:0;color:${MUTED};font-size:13px;">
        Confirmed for <strong style="color:${TEXT};">${email}</strong>
      </p>
    `,
    ctaLabel: 'Open dashboard',
    ctaHref: SITE_URL,
  });
  const text = [
    `You're subscribed to ${SITE_NAME} TVL alerts.`,
    '',
    'Track live: ' + SITE_URL,
    'X: https://x.com/shieldedsol',
    '',
    `Confirmed for ${email}`,
  ].join('\n');
  return { subject, html, text };
}

export function adminNewSubscriberEmail(email: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `New subscriber: ${email}`;
  const html = baseLayout({
    preheader: `New Shielded Sol subscriber ${email}`,
    title: subject,
    bodyHtml: `
      <p style="margin:0 0 14px;">New dashboard subscriber</p>
      <p style="margin:0;font-family:JetBrains Mono,ui-monospace,monospace;font-size:14px;color:${PURPLE};word-break:break-all;">
        ${email}
      </p>
    `,
    ctaLabel: 'Open site',
    ctaHref: SITE_URL,
  });
  const text = `New Shielded Sol subscriber: ${email}\n${SITE_URL}`;
  return { subject, html, text };
}
