// pages/index.tsx
// Home page: Solana payments (SOL + USDC) with a link to the Trading Bot.
import React, { useState } from 'react';
import styles from '../styles/Home.module.css';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';

const RECEIVER = new PublicKey('CF4mr4WgZHHVt1tN3qQgYvqm5DonVDcy8LFn1atGYq9t');

const SOL_PRICE = 0.01;
const USDC_PRICE = 1;
const USDC_DECIMALS = 6;
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [status, setStatus] = useState('');
  const [lastSig, setLastSig] = useState('');
  const [randomNumber, setRandomNumber] = useState<number | null>(null);

  const paySol = async () => {
    try {
      setStatus('Building SOL transaction...');
      if (!publicKey) throw new Error('Connect Phantom first');

      const lamports = Math.floor(SOL_PRICE * LAMPORTS_PER_SOL);
      if (lamports <= 0) throw new Error('Invalid SOL amount');

      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: RECEIVER, lamports }),
      );

      setStatus('Sending SOL transaction (Phantom will prompt)...');
      const sig = await sendTransaction(tx, connection);
      setLastSig(sig);

      setStatus('Confirming transaction...');
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');

      setStatus('Verifying on server...');
      const resp = await fetch('/api/check-sol-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionSignature: sig, minSol: SOL_PRICE }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) throw new Error(json.error || 'SOL verification failed');

      setRandomNumber(Math.floor(Math.random() * 1000));
      setStatus('✅ SOL payment verified. Action unlocked.');
    } catch (e: unknown) {
      setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const payUsdc = async () => {
    try {
      setStatus('Building USDC transfer...');
      if (!publicKey) throw new Error('Connect Phantom first');

      const senderAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const receiverAta = await getAssociatedTokenAddress(USDC_MINT, RECEIVER);

      const tx = new Transaction();

      const receiverAtaInfo = await connection.getAccountInfo(receiverAta);
      if (!receiverAtaInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(publicKey, receiverAta, RECEIVER, USDC_MINT),
        );
      }

      const amountBaseUnits = USDC_PRICE * 10 ** USDC_DECIMALS;
      tx.add(
        createTransferCheckedInstruction(
          senderAta,
          USDC_MINT,
          receiverAta,
          publicKey,
          amountBaseUnits,
          USDC_DECIMALS,
        ),
      );

      setStatus('Sending USDC transaction (Phantom will prompt)...');
      const sig = await sendTransaction(tx, connection);
      setLastSig(sig);

      setStatus('Confirming transaction...');
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');

      setStatus('Verifying on server...');
      const resp = await fetch('/api/check-usdc-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionSignature: sig, minUsdc: USDC_PRICE }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) throw new Error(json.error || 'USDC verification failed');

      setRandomNumber(Math.floor(Math.random() * 1000));
      setStatus('✅ USDC payment verified. Action unlocked.');
    } catch (e: unknown) {
      setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Pump.fun Payments (Phantom)</h1>
        <p className={styles.description}>Receiver: {RECEIVER.toBase58()}</p>

        <div style={{ marginBottom: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="/trading-bot"
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #1a1d2e, #2d3748)',
              color: '#e2e8f0',
              padding: '12px 24px',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            🤖 Open Trading Bot →
          </a>
          <a
            href="/tokens"
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #1a2e1a, #2d4830)',
              color: '#9ae6b4',
              padding: '12px 24px',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            🔍 Token Discovery →
          </a>
        </div>

        <div style={{ marginBottom: 16 }}>
          <WalletMultiButton />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className={styles.button} onClick={paySol} disabled={!publicKey}>
            Pay {SOL_PRICE} SOL
          </button>
          <button className={styles.button} onClick={payUsdc} disabled={!publicKey}>
            Pay {USDC_PRICE} USDC
          </button>
        </div>

        {lastSig ? (
          <p style={{ marginTop: 16, wordBreak: 'break-all' }}>Last signature: {lastSig}</p>
        ) : null}

        {status ? <p style={{ marginTop: 16 }}>{status}</p> : null}

        {randomNumber !== null ? (
          <p style={{ marginTop: 16 }}>Random number: {randomNumber}</p>
        ) : null}
      </main>
    </div>
  );
}