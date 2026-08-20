import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import BrandMark from '@/components/BrandMark';
import MadeByMilysec from '@/components/MadeByMilysec';

export const metadata: Metadata = {
  title: 'Brand',
  description: `${SITE_NAME} brand kit — logo, colors, usage. Bare shield mark only.`,
  alternates: { canonical: `${SITE_URL}/brand` },
};

const COLORS = [
  { name: 'Accent / Solana purple', hex: '#9945FF', varName: '--accent' },
  { name: 'Live green', hex: '#14F195', varName: '--live' },
  { name: 'Background', hex: '#0B0B0F', varName: '--bg' },
  { name: 'Surface', hex: '#12121A', varName: '--bg2' },
  { name: 'Text', hex: '#F4F4F5', varName: '--text' },
  { name: 'Muted', hex: '#A1A1AA', varName: '--text3' },
];

const ASSETS = [
  {
    name: 'Logo SVG',
    path: '/logo.svg',
    note: 'Primary mark — bare shield (no box)',
  },
  {
    name: 'Logo PNG',
    path: '/logo.png',
    note: '192×192 app / favicon PNG',
  },
  {
    name: 'Favicon SVG',
    path: '/favicon.svg',
    note: 'Browser tab',
  },
  {
    name: 'OG base',
    path: '/og-base.png',
    note: 'Open Graph base art',
  },
];

export default function BrandPage() {
  return (
    <main className="brand-page">
      <header className="brand-page-header">
        <BrandMark href="/" size={32} variant="page" />
        <h1>Brand</h1>
        <p className="brand-lead">
          Official {SITE_NAME} marks and colors. Use the bare shield only — no
          boxes, no fake monograms.
        </p>
      </header>

      <section className="brand-section">
        <h2>Logo</h2>
        <div className="brand-logo-grid">
          <div className="brand-logo-card on-dark">
            <img src="/logo.svg" alt="Shielded Sol logo on dark" width={120} height={120} />
            <span>On dark</span>
          </div>
          <div className="brand-logo-card on-light">
            <img src="/logo.svg" alt="Shielded Sol logo on light" width={120} height={120} />
            <span>On light</span>
          </div>
          <div className="brand-logo-card on-dark with-word">
            <BrandMark static withWordmark size={48} variant="page" />
            <span>Wordmark lockup</span>
          </div>
        </div>
        <ul className="brand-rules">
          <li>
            <strong>Do</strong> use the bare shield with purple glow / clear space
          </li>
          <li>
            <strong>Do</strong> link product chrome to {SITE_URL}
          </li>
          <li>
            <strong>Don&apos;t</strong> put the mark in a rounded square box
          </li>
          <li>
            <strong>Don&apos;t</strong> recolor the Solana “S” fill arbitrarily for
            partner decks without approval
          </li>
        </ul>
      </section>

      <section className="brand-section">
        <h2>Downloads</h2>
        <ul className="brand-assets">
          {ASSETS.map((a) => (
            <li key={a.path}>
              <a href={a.path} download target="_blank" rel="noopener noreferrer">
                {a.name}
              </a>
              <code>{a.path}</code>
              <span>{a.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="brand-section">
        <h2>Colors</h2>
        <div className="brand-swatches">
          {COLORS.map((c) => (
            <div key={c.hex} className="brand-swatch">
              <span
                className="brand-swatch-chip"
                style={{ background: c.hex }}
                aria-hidden
              />
              <div>
                <strong>{c.name}</strong>
                <code>{c.hex}</code>
                <span className="brand-swatch-var">{c.varName}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="brand-section">
        <h2>Voice</h2>
        <p>
          Calm fintech. Purple accent. Default unit SOL on dashboard. Privacy
          pool TVL first — no hype, no mixer slang. X handle{' '}
          <a
            href="https://x.com/shieldedsol"
            target="_blank"
            rel="noopener noreferrer me"
          >
            @shieldedsol
          </a>
          .
        </p>
      </section>

      <section className="brand-section">
        <h2>Credit</h2>
        <p>Product by Milysec · data from on-chain + public APIs.</p>
        <MadeByMilysec height={28} />
      </section>

      <footer className="brand-page-footer">
        <BrandMark href="/" size={22} variant="footer" />
        <nav>
          <a href="/">Dashboard</a>
          <a href="/developers">Developers</a>
          <a href="/lookout">Lookout</a>
          <a href="/history">History</a>
        </nav>
      </footer>
    </main>
  );
}
