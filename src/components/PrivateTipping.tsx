'use client';

import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { VersionedTransaction, Connection } from '@solana/web3.js';
import { MAGICBLOCK_API, USDC_MINT, SOLANA_CLUSTER, SOLANA_RPC } from '@/lib/constants';
import WalletProvider from './WalletProvider';

type Status = { type: 'idle' } | { type: 'pending'; message: string } | { type: 'success'; message: string } | { type: 'error'; message: string };

function PrivateTippingInner() {
  const { publicKey, signTransaction, connected } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>({ type: 'idle' });

  const handleSend = useCallback(async () => {
    if (!publicKey || !signTransaction || !recipient || !amount) return;

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setStatus({ type: 'error', message: 'Enter a valid amount' });
      return;
    }

    const baseUnits = Math.round(amountNum * 1_000_000); // USDC has 6 decimals

    try {
      // Check health
      setStatus({ type: 'pending', message: 'Checking MagicBlock API...' });
      const healthRes = await fetch(`${MAGICBLOCK_API}/health`);
      const healthData = await healthRes.json();
      if (healthData.status !== 'ok') {
        setStatus({ type: 'error', message: 'MagicBlock API is currently unavailable' });
        return;
      }

      // Check if mint is initialized
      setStatus({ type: 'pending', message: 'Checking mint status...' });
      const mintCheckRes = await fetch(
        `${MAGICBLOCK_API}/v1/spl/is-mint-initialized?mint=${USDC_MINT}&cluster=${SOLANA_CLUSTER}`
      );
      const mintCheckData = await mintCheckRes.json();

      if (!mintCheckData.initialized) {
        // Initialize mint
        setStatus({ type: 'pending', message: 'Initializing mint transfer queue...' });
        const initRes = await fetch(`${MAGICBLOCK_API}/v1/spl/initialize-mint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payer: publicKey.toBase58(),
            mint: USDC_MINT,
            cluster: SOLANA_CLUSTER,
          }),
        });
        const initData = await initRes.json();

        if (initData.error) {
          setStatus({ type: 'error', message: initData.error.message || 'Failed to initialize mint' });
          return;
        }

        // Sign and submit the init transaction
        const initTxBytes = Buffer.from(initData.transactionBase64, 'base64');
        const initTx = VersionedTransaction.deserialize(initTxBytes);
        const signedInitTx = await signTransaction(initTx as any);
        const connection = new Connection(SOLANA_RPC, 'confirmed');
        await connection.sendRawTransaction(signedInitTx.serialize());
      }

      // Build private transfer
      setStatus({ type: 'pending', message: 'Building private transfer...' });
      const transferRes = await fetch(`${MAGICBLOCK_API}/v1/spl/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: publicKey.toBase58(),
          to: recipient,
          mint: USDC_MINT,
          amount: baseUnits,
          visibility: 'private',
          fromBalance: 'base',
          toBalance: 'base',
          cluster: SOLANA_CLUSTER,
          initIfMissing: true,
          initAtasIfMissing: true,
          initVaultIfMissing: true,
        }),
      });

      const transferData = await transferRes.json();

      if (transferData.error) {
        setStatus({ type: 'error', message: transferData.error.message || 'Transfer failed' });
        return;
      }

      // Sign and submit
      setStatus({ type: 'pending', message: 'Waiting for wallet signature...' });
      const txBytes = Buffer.from(transferData.transactionBase64, 'base64');
      const tx = VersionedTransaction.deserialize(txBytes);
      const signedTx = await signTransaction(tx as any);

      setStatus({ type: 'pending', message: 'Submitting transaction...' });
      const sendTo = transferData.sendTo || 'base';

      if (sendTo === 'base') {
        const connection = new Connection(SOLANA_RPC, 'confirmed');
        const sig = await connection.sendRawTransaction(signedTx.serialize());
        setStatus({
          type: 'success',
          message: `Private transfer sent! Sig: ${sig.slice(0, 8)}...${sig.slice(-8)}`,
        });
      } else {
        setStatus({ type: 'error', message: 'Ephemeral submission requires TEE auth (not supported in browser)' });
      }

      setRecipient('');
      setAmount('');
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: err?.message || 'Transaction failed',
      });
    }
  }, [publicKey, signTransaction, recipient, amount]);

  return (
    <div className="tipping-section">
      <div className="tipping-title">Private Tip (USDC)</div>
      <div className="tipping-card">
        {!connected ? (
          <WalletMultiButton />
        ) : (
          <>
            <div className="tipping-label">Recipient address</div>
            <input
              className="tipping-input"
              placeholder="Solana wallet address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <div className="tipping-label">Amount (USDC)</div>
            <div className="tipping-row">
              <input
                className="tipping-input"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>
            <button
              className="tipping-btn"
              onClick={handleSend}
              disabled={!recipient || !amount || status.type === 'pending'}
            >
              {status.type === 'pending' ? 'Processing...' : 'Send Private Tip'}
            </button>
            {status.type !== 'idle' && (
              <div className={`tipping-status ${status.type}`}>
                {status.message}
              </div>
            )}
            <div className="tipping-note">
              Powered by MagicBlock Private Ephemeral Rollups. Transfers are routed through TEE for privacy.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PrivateTipping() {
  return (
    <WalletProvider>
      <PrivateTippingInner />
    </WalletProvider>
  );
}
