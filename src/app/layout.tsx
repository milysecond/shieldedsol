import type { Metadata } from 'next';
import Script from 'next/script';
import { SITE_URL, SITE_NAME, GA_ID } from '@/lib/constants';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - Real-Time Solana Privacy Pool Tracker`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'Track Solana privacy protocol TVL in real-time. Monitor Privacy Cash, Umbra, and other privacy pools with live balances, historical charts, and TVL alerts.',
  openGraph: {
    title: `${SITE_NAME} - Real-Time Solana Privacy Pool Tracker`,
    description:
      'Track Solana privacy protocol TVL in real-time. Monitor Privacy Cash, Umbra, and other privacy pools with live balances, historical charts, and TVL alerts.',
    url: SITE_URL,
    siteName: SITE_NAME,
    type: 'website',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'Shielded Sol — live Solana privacy pool TVL with SOL and USD totals',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@shieldedsol',
    title: `${SITE_NAME} - Real-Time Solana Privacy Pool Tracker`,
    description:
      'Track Solana privacy protocol TVL in real-time. Monitor Privacy Cash, Umbra, and other privacy pools with live balances, historical charts, and TVL alerts.',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'Shielded Sol — live Solana privacy pool TVL',
      },
    ],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/logo.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/logo.png',
  },
  manifest: '/manifest.json',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'ShieldedSol',
    'theme-color': '#9945FF',
    'telegram:channel': '@shieldedsol',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="canonical" href={`${SITE_URL}/`} />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: SITE_NAME,
                url: SITE_URL,
                description: 'Track Solana privacy protocol TVL in real-time',
                image: `${SITE_URL}/logo.png`,
              },
              {
                '@context': 'https://schema.org',
                '@type': 'WebApplication',
                name: SITE_NAME,
                url: SITE_URL,
                description:
                  'Real-time Solana privacy pool TVL tracker. Monitor Privacy Cash, Umbra and other privacy protocols with live balances, historical charts, and alerts.',
                applicationCategory: 'FinanceApplication',
                operatingSystem: 'Web',
                offers: {
                  '@type': 'Offer',
                  price: '0',
                  priceCurrency: 'USD',
                },
              },
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: SITE_NAME,
                url: SITE_URL,
                logo: `${SITE_URL}/logo.png`,
                sameAs: ['https://x.com/shieldedsol'],
              },
            ]),
          }}
        />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
