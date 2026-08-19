import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Dashboard from '@/components/Dashboard';
import { SITE_NAME, SITE_URL, PROTOCOL_DEFINITIONS } from '@/lib/constants';
import { slugifyProtocol } from '@/lib/slug';

type Props = { params: Promise<{ slug: string }> };

function resolveName(slug: string): string | null {
  const key = slug.trim().toLowerCase();
  const hit = PROTOCOL_DEFINITIONS.find(
    (p) =>
      slugifyProtocol(p.name) === key || p.name.toLowerCase() === key
  );
  return hit?.name || null;
}

export async function generateStaticParams() {
  return PROTOCOL_DEFINITIONS.map((p) => ({
    slug: slugifyProtocol(p.name),
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const name = resolveName(slug);
  if (!name) {
    return { title: 'Protocol not found' };
  }
  const title = `${name} — Solana privacy TVL`;
  const description = `Live ${name} privacy pool TVL on ${SITE_NAME}. Track balances, composition, and history.`;
  const url = `${SITE_URL}/p/${slugifyProtocol(name)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${name} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      type: 'website',
      images: [{ url: `${SITE_URL}/api/og?v=20260820c`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@shieldedsol',
      title: `${name} | ${SITE_NAME}`,
      description,
      images: [`${SITE_URL}/api/og?v=20260820c`],
    },
  };
}

export default async function ProtocolDeepLinkPage({ params }: Props) {
  const { slug } = await params;
  const name = resolveName(slug);
  // Allow unknown slugs to still load dashboard (live list may include extras)
  if (!name && !slug) notFound();
  return <Dashboard initialProtocolSlug={slug} />;
}
