import { Connection, PublicKey } from '@solana/web3.js';

const RECEIVER_WALLET = new PublicKey('CF4mr4WgZHHVt1tN3qQgYvqm5DonVDcy8LFn1atGYq9t');
const USDC_MINT = new PublicKey(process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
  }

  const { transactionSignature, minUsdc } = req.body || {};
  const minBaseUnits = Math.floor((Number(minUsdc || 0) || 0) * 1_000_000);

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

    let receivedBaseUnits = 0;

    for (const ix of tx.transaction.message.instructions || []) {
      if (ix?.program !== 'spl-token') continue;

      const parsed = ix.parsed;
      if (!parsed) continue;
      const type = parsed.type;
      if (type !== 'transfer' && type !== 'transferChecked') continue;

      const info = parsed.info || {};
      const destinationOwner = info.destinationOwner ? String(info.destinationOwner) : null;
      const mint = info.mint ? String(info.mint) : null;

      const amountRaw = info.tokenAmount?.amount ?? info.amount;
      const amount = Number(amountRaw || 0);

      if (!destinationOwner || destinationOwner !== RECEIVER_WALLET.toBase58()) continue;
      if (mint && mint !== USDC_MINT.toBase58()) continue;

      receivedBaseUnits += amount;
    }

    if (receivedBaseUnits <= 0) {
      return res.status(400).json({ ok: false, error: 'No USDC transfer to receiver found in transaction' });
    }

    if (minBaseUnits > 0 && receivedBaseUnits < minBaseUnits) {
      return res.status(400).json({
        ok: false,
        error: 'Insufficient payment',
        receivedBaseUnits,
        requiredBaseUnits: minBaseUnits,
      });
    }

    return res.status(200).json({
      ok: true,
      receiver: RECEIVER_WALLET.toBase58(),
      mint: USDC_MINT.toBase58(),
      signature: transactionSignature,
      receivedBaseUnits,
      receivedUsdc: receivedBaseUnits / 1_000_000,
      slot: tx.slot,
      blockTime: tx.blockTime,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Validation error', details: e?.message || String(e) });
  }
}