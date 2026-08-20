import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import {
  LOOKOUT_ITEMS,
  LOOKOUT_STATUS_LABEL,
  type LookoutStatus,
} from '@/lib/lookout';
import MadeByMilysec from '@/components/MadeByMilysec';
import BrandMark from '@/components/BrandMark';

export const metadata: Metadata = {
  title: 'Things to Look Out For',
  description:
    'Solana privacy rails, hybrids, and infra not yet scored in Shielded Sol live pool TVL — Houdini, Solflare PAL, GoDark, Hinkal, and more.',
  alternates: { canonical: `${SITE_URL}/lookout` },
};

const STATUS_HINT: Record<LookoutStatus, string> = {
  rail: 'Wallet / router — not a pool',
  hybrid: 'On-chain settlement, vault IDs not public',
  watch: 'Watchlist — thin or unverified Solana TVL',
  infra: 'Primitive / tooling — not deposit TVL',
  waitlist: 'Pre-product / no mainnet pool',
};

export default function LookoutPage() {
  return (
    <main className="lookout-page">
      <header className="lookout-header">
        <BrandMark href="/" size={28} variant="header" />
        <h1>Things to Look Out For</h1>
        <p className="lookout-lead">
          Privacy-related projects on or around Solana that are{' '}
          <strong>not</strong> counted in live pool TVL — wrong model, no
          public vaults, multi-chain noise, or still shipping.
        </p>
      </header>

      <section className="lookout-note">
        <p>
          Live tracker stays Solana-native pools with readable balances. This
          page is the radar for everything else we researched.
        </p>
      </section>

      <div className="lookout-list">
        {LOOKOUT_ITEMS.map((item) => (
          <article key={item.name} className="lookout-card">
            <div className="lookout-card-top">
              <h2>{item.name}</h2>
              <span
                className={`lookout-badge status-${item.status}`}
                title={STATUS_HINT[item.status]}
              >
                {LOOKOUT_STATUS_LABEL[item.status]}
              </span>
            </div>
            <p className="lookout-blurb">{item.blurb}</p>
            <p className="lookout-why">
              <span className="lookout-why-label">Why not tracked</span>
              {item.whyNotTracked}
            </p>
            <div className="lookout-links">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="lookout-link"
              >
                {item.linkText} ↗
              </a>
              {item.x ? (
                <a
                  href={`https://x.com/${item.x}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lookout-link"
                >
                  @{item.x}
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <footer className="lookout-footer">
        <BrandMark href="/" size={20} variant="footer" />
        <a href="/">dashboard</a>
        <a href="/history">history</a>
        <a href="/brand">brand</a>
        <a href="/developers">developers</a>
        <MadeByMilysec height={24} />
      </footer>
    </main>
  );
}
