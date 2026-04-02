import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Receiver (your) wallet address
const RECEIVER_WALLET = new PublicKey('CF4mr4WgZHHVt1tN3qQgYvqm5DonVDcy8LFn1atGYq9t');

// Mainnet connection (use a dedicated RPC for reliability/throughput)
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

/**
 * POST /api/check-sol-payment
 * Body: { transactionSignature: string, minSol?: number }
 *
 * Validates that a confirmed transaction sent >= minSol SOL to RECEIVER_WALLET.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
  }

  const { transactionSignature, minSol } = req.body || {};
  const minLamports = Math.floor((Number(minSol || 0) || 0) * LAMPORTS_PER_SOL);

  if (!transactionSignature || typeof transactionSignature !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing transactionSignature' });
  }

  try {
    const tx = await connection.getParsedTransaction(transactionSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx) {
      return res.status(404).json({ ok: false, error: 'Transaction not found (not confirmed yet)' });
    }

    if (tx.meta?.err) {
      return res.status(400).json({ ok: false, error: 'Transaction failed', metaErr: tx.meta.err });
    }

    // Sum lamports transferred to receiver across all system transfers in this tx.
    let receivedLamports = 0;

    const instructions = tx.transaction.message.instructions || [];
    for (const ix of instructions) {
      // Parsed system transfer
      if (
        ix?.program === 'system' &&
        ix?.parsed?.type === 'transfer' &&
        ix?.parsed?.info?.destination === RECEIVER_WALLET.toBase58()
      ) {
        receivedLamports += Number(ix.parsed.info.lamports || 0);
      }
    }

    if (minLamports > 0 && receivedLamports < minLamports) {
      return res.status(400).json({
        ok: false,
        error: 'Insufficient payment',
        receivedLamports,
        requiredLamports: minLamports,
      });
    }

    if (receivedLamports <= 0) {
      return res.status(400).json({
        ok: false,
        error: 'No SOL transfer to receiver wallet found in transaction',
      });
    }

    return res.status(200).json({
      ok: true,
      receiver: RECEIVER_WALLET.toBase58(),
      signature: transactionSignature,
      receivedLamports,
      receivedSol: receivedLamports / LAMPORTS_PER_SOL,
      slot: tx.slot,
      blockTime: tx.blockTime,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Validation error', details: error?.message || String(error) });
  }
}