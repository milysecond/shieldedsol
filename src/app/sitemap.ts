import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants';

// Pin lastModified so sitemap.xml is stable across requests.
const LAST_MODIFIED = '2026-11-13';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'hourly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/history`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/lookout`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.75,
    },
    {
      url: `${SITE_URL}/brand`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    // Protocol deeplinks
    ...[
      'privacy-cash',
      'umbra',
      'cloak',
      'arcium',
      'magicblock',
      'helius-rings',
      'light-protocol',
      'turbine',
      'vanish-trade',
      'voidify',
      'mixoor',
      'elusiv',
    ].map((slug) => ({
      url: `${SITE_URL}/p/${slug}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'hourly' as const,
      priority: 0.65,
    })),
    {
      url: `${SITE_URL}/add`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/developers`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];
}
