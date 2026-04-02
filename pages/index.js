import React, { useMemo, useState } from 'react';
import styles from '../styles/Home.module.css';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const RECEIVER = new PublicKey('CF4mr4WgZHHVt1tN3qQgYvqm5DonVDcy8LFn1atGYq9t');

// NOTE: Pricing is configurable here until you confirm exact amounts.
const DEFAULT_SOL_PRICE = 0.1; // SOL
const DEFAULT_USDC_PRICE = 1; // USDC

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [status, setStatus] = useState('');
  const [lastSig, setLastSig] = useState('');
  const [randomNumber, setRandomNumber] = useState(null);

  const paySol = async () => {
    try {
      setStatus('Building SOL transaction...');
      if (!publicKey) throw new Error('Connect Phantom first');

      const lamports = Math.floor(DEFAULT_SOL_PRICE * LAMPORTS_PER_SOL);
      if (lamports <= 0) throw new Error('Invalid SOL amount');

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: RECEIVER,
          lamports,
        })
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
        body: JSON.stringify({ transactionSignature: sig, minSol: DEFAULT_SOL_PRICE }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) throw new Error(json.error || 'SOL verification failed');

      const n = Math.floor(Math.random() * 1000);
      setRandomNumber(n);
      setStatus('✅ SOL payment verified. Action unlocked.');
    } catch (e) {
      setStatus(`❌ ${e.message || String(e)}`);
    }
  };

  const payUsdc = async () => {
    // USDC client transfer requires SPL token instructions.
    // We'll add it once you confirm prices and whether the receiver uses an ATA.
    setStatus('USDC payment UI pending: confirm USDC price + receiver token account/ATA preference.');
  };

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Pump.fun Payments (Phantom)</h1>
        <p className={styles.description}>Receiver: {RECEIVER.toBase58()}</p>

        <div style={{ marginBottom: 16 }}>
          <WalletMultiButton />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className={styles.button} onClick={paySol} disabled={!publicKey}>
            Pay {DEFAULT_SOL_PRICE} SOL
          </button>
          <button className={styles.button} onClick={payUsdc} disabled={!publicKey}>
            Pay {DEFAULT_USDC_PRICE} USDC
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