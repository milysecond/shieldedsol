import type { Metadata } from 'next';
import HistoryView from '@/components/HistoryView';
import { SITE_NAME, SITE_URL } from '@/lib/constants';

const TITLE = 'TVL History';
const DESCRIPTION =
  'Explore historical Solana privacy protocol TVL on Shielded Sol — charts, protocol breakdowns, averages, and all-time highs.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/history` },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/history`,
    siteName: SITE_NAME,
    type: 'website',
    images: [
      {
        url: `${SITE_URL}/api/og?v=20261112a`,
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
    creator: '@shieldedsol',
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}/api/og?v=20261112a`,
        width: 1200,
        height: 630,
        alt: 'Shielded Sol — live Solana privacy pool TVL',
      },
    ],
  },
};

export default function HistoryPage() {
  return <HistoryView />;
}
