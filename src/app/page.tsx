import type { Metadata } from 'next';
import Dashboard from '@/components/Dashboard';
import { SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
};

export default function HomePage() {
  return <Dashboard />;
}
