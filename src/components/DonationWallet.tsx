'use client';

import { useCallback, useState } from 'react';
import { DONATION_WALLET, solAddressUrl } from '@/lib/constants';

export default function DonationWallet() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DONATION_WALLET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, []);

  const short = `${DONATION_WALLET.slice(0, 6)}…${DONATION_WALLET.slice(-6)}`;

  return (
    <div className="donation-section">
      <div className="donation-title">Support Shielded Sol</div>
      <div className="donation-card">
        <p className="donation-label">Donation wallet (SOL / SPL)</p>
        <button
          type="button"
          className={`donation-address${copied ? ' copied' : ''}`}
          onClick={copy}
          title={DONATION_WALLET}
        >
          <span className="donation-full">{DONATION_WALLET}</span>
          <span className="donation-short">{short}</span>
          <span className="donation-copy">{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <div className="donation-actions">
          <a
            className="donation-link"
            href={solAddressUrl(DONATION_WALLET)}
            target="_blank"
            rel="noopener noreferrer"
          >
            sol.new ↗
          </a>
          <a className="donation-link" href={`solana:${DONATION_WALLET}`}>
            Open wallet
          </a>
        </div>
      </div>
    </div>
  );
}
