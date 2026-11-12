import type { Metadata } from 'next';
import AddProtocolForm from '@/components/AddProtocolForm';
import { SITE_NAME, SITE_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Add a protocol',
  description: `Suggest a Solana privacy protocol to list on ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL}/add` },
};

export default function AddProtocolPage() {
  return <AddProtocolForm />;
}
